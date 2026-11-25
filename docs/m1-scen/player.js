import {setupInsetPicture} from './tactical-picture.js?v=b6f0c77c0ed5';
import {setupFilmStream} from './film-stream.js?v=8e28416acbb9';
const get=id=>document.getElementById(id);
const film=get('film'),free=get('free'),back=get('back'),take=get('take');
let canvas=free.querySelector('canvas');
const focus=get('focus'),hint=get('hint'),seek=get('seek'),pointers=new Map(),limit=(x,a,b)=>Math.max(a,Math.min(b,x));
let world,loading,active=false,requested=false,visible=false,moved=false,anchor=0,elapsed=0,frames=0,previous=0,pinch=0;
let yaw=0,pitch=0,zoom=1,stamp=0,hasStamp=false,seq=0,lastWarm=0;
function clock(_,m){stamp=m.mediaTime;hasStamp=true;film.requestVideoFrameCallback(clock);}
if(film.requestVideoFrameCallback)film.requestVideoFrameCallback(clock);
film.addEventListener('seeking',()=>{hasStamp=false;});
const position=()=>hasStamp&&!film.seeking&&Math.abs(stamp-film.currentTime)<.12?stamp:film.currentTime;
const pose=()=>({yaw,pitch,zoom,moved,focus:Number(focus.value)});
film.controls=false;get('transport').hidden=false;
function evidence(text){if(get('credits').textContent!==text)get('credits').textContent=text;}
function controls(on){
  take.hidden=on;free.hidden=!on;get('options').hidden=!on&&!expanded;showOptions(on&&!expanded&&innerWidth>=760);
  for(const el of [back,get('focusLabel'),get('closer'),get('wider')])el.hidden=!on;
  placeScreenControl();
}
const cameraStatus=document.createElement('output');
cameraStatus.id='cameraStatus';cameraStatus.hidden=true;cameraStatus.setAttribute('role','status');
get('stage').append(cameraStatus);
let noticeTimer, handoverTimer, controller;
function extendHandover(){
  clearTimeout(handoverTimer);
  if(requested)handoverTimer=setTimeout(()=>stop('Kameraladdningen har stannat. Tryck på Ta över kameran för ett nytt försök.',true),90000);
}
function cameraNotice(text,timeout=0){
  clearTimeout(noticeTimer);
  cameraStatus.textContent=text;cameraStatus.hidden=!text;
  if(timeout)noticeTimer=setTimeout(()=>{cameraStatus.hidden=true;},timeout);
}
function stop(message='Du följer filmens regi.',showReason=false){
  clearTimeout(handoverTimer);cameraNotice(showReason ? message : '',showReason ? 12000 : 0);
  if(!world && controller){controller.abort();controller=null;loading=null;}
  requested=active=visible=false;seq++;controls(false);canvas.hidden=true;get('credits').hidden=true;get('room').hidden=true;get('rate').hidden=true;
  take.textContent='Ta över kameran';take.disabled=false;world?.follow();pointers.clear();hint.textContent=message;
}
const programmeUrl=new URL(document.querySelector('main').dataset.programme,document.baseURI);

let clockStart=Number(document.querySelector('main').dataset.start);
const maskRects=JSON.parse(document.querySelector('main').dataset.insets);
let previousMask=-1;
function applyInsets(mask){
  if(mask===previousMask)return;
  previousMask=mask;
  const polygon=['0 0','100% 0','100% 88.888889%','0 88.888889%','0 0'];
  for(const [bit,x,y,w,h] of maskRects){
    if(!(mask&bit))continue;
    const point=(a,b)=>a/19.2+'% '+b/10.8+'%';
    polygon.push(point(x,y),point(x,y+h),point(x+w,y+h),point(x+w,y),point(x,y),'0 0');
  }
  canvas.style.clipPath='polygon(evenodd,'+polygon.join(',')+')';
}
film.addEventListener('loadedmetadata',()=>{if(Number.isFinite(film.duration))seek.max=film.duration;});
film.addEventListener('loadedmetadata',()=>{
  const match=/^#t=(\d+(?:\.\d+)?)$/.exec(location.hash);
  if(match && Number.isFinite(film.duration))film.currentTime=Math.min(Number(match[1]),film.duration);
},{once:true});
const stream = setupFilmStream(film, get('quality'), get('streamStatus'));
const insetSpecs = [JSON.parse(film.dataset.tactics || 'null'), ...JSON.parse(film.dataset.lines || '[]')];
const insets = insetSpecs.filter(Boolean).map(spec=>setupInsetPicture(film,spec));
const updateInsets = t => { for(const update of insets) update(t); };
function load(){
  if(world)return Promise.resolve(world);
  if(loading)return loading;
  const attempt=controller=new AbortController();
  loading=import('./runtime/world.js?v=268336ab47bd').then(m=>m.loadWorld(canvas,()=>{
    if(controller!==attempt)return;
    world=null;stop('Telefonen avbröt 3D-visningen. Du kan försöka igen.',true);
    const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;previousMask=-1;
  },programmeUrl,{signal:attempt.signal,position,progress:text=>{if(requested && !attempt.signal.aborted){extendHandover();cameraNotice(text);}}})).then(w=>{
    if(attempt.signal.aborted)return;
    world=w;
    const targetLabel=focus.options[1]?.textContent||'Aktuellt banmärke';
    focus.replaceChildren(new Option('Regins blickpunkt','0'),new Option(targetLabel,String(w.boats.length+1)),
      ...w.boats.map((boat,i)=>new Option(boat.label,String(i+1))));
    return w;
  }).catch(e=>{if(controller===attempt)loading=null;throw e;});
  return loading;
}
function takeOver(){
  clearTimeout(handoverTimer);cameraNotice('Fri kamera · dra för att vrida',3300);
  requested=false;revealControls();active=true;anchor=position();yaw=pitch=0;zoom=1;moved=false;focus.value='0';world.start(anchor);
  elapsed=frames=previous=0;controls(true);take.disabled=false;free.focus({preventScroll:true});
  hint.textContent='Dra för att vrida. Nyp eller scrolla för att zooma.';
}
async function enter(){
  if(requested){stop();return;}
  const version=++seq;requested=true;take.textContent='Avbryt';revealControls();
  cameraNotice('Laddar fri kamera …');hint.textContent='Förbereder den fria kameran.';
  extendHandover();
  try{await load();if(version===seq&&world?.ready)takeOver();}catch(e){if(version===seq){console.error(e.message);stop('3D-scenen kunde inte laddas. Försök igen.',true);}}
}
function adjust(dx,dy,factor=1){
  if(!active)return;yaw=(yaw+dx+3*Math.PI)%(2*Math.PI)-Math.PI;pitch=limit(pitch+dy,-1.4,.48);const minimum=world.minimumZoom(Number(focus.value));
  zoom=limit(Math.max(zoom,minimum)*factor,minimum,2.9);moved=true;
}
function tick(now){
  requestAnimationFrame(tick);if(document.hidden)return;
  const t=position(),sec=Math.floor(clockStart+film.currentTime);seek.value=film.currentTime;updateInsets(t);
  get('time').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  get('play').textContent=stream?.pending?'Avbryt':film.ended?'Spela igen':film.paused?'Spela':'Pausa';
  if(!world || (!active && !requested) || (!active && now-lastWarm<22))return;
  try{
    const result=world.draw(t,active?pose():{yaw:0,pitch:0,zoom:1,focus:0},now,active);lastWarm=now;
    if(result.picturePending){
      canvas.hidden=true;get('credits').hidden=true;get('room').hidden=true;
      if(cameraStatus.hidden || cameraStatus.textContent!=='Laddar kamerabilden …')cameraNotice('Laddar kamerabilden …');
      return;
    }
    if(active && cameraStatus.textContent==='Laddar kamerabilden …')cameraNotice('');
    applyInsets(result.mask);
    if(!active){if(result.ready&&requested)takeOver();return;}
    visible=moved||Math.abs(t-anchor)>.035;canvas.hidden=!visible;
    get('credits').hidden=!visible;get('room').hidden=!visible||!result.room;
    evidence([...new Set(['Google Maps',...result.credits.filter(x=>x!=='Google')])].join(' · '));
    if(visible){
      if(previous>0){elapsed+=now-previous;frames++;}
      previous=now;
      if(elapsed>=1500){get('rate').hidden=false;get('rate').textContent=Math.round(1000*frames/elapsed)+' bilder/s';elapsed=frames=0;}
    }
  }catch(e){console.error(e.message,e.stack);world=null;stop('3D-vyn avbröts. Du kan försöka igen.',true);}
}
take.onclick=enter;back.onclick=()=>{stop();take.focus({preventScroll:true});};
focus.onchange=()=>{moved=true;if(expanded)hideControls();};
function play(){if(stream?.pending){stream.cancel();return;}if(film.paused)(stream ? stream.play() : film.play()).catch(()=>{hint.textContent='Tryck på Spela för att starta.';});else film.pause();}
get('play').onclick=play;film.onclick=()=>{if(!expanded)play();};seek.oninput=()=>{stream?.cancel();film.currentTime=Number(seek.value);};
film.addEventListener('seeked',()=>{if(film.paused)stamp=film.currentTime;});
film.addEventListener('ended',()=>{if(active)stop('Rundningen är slut. Du kan spela igen.');if(expanded)revealControls();});
for(const event of ['timeupdate','seeked','loadeddata'])film.addEventListener(event,()=>updateInsets(position()));
const dist=()=>{const a=[...pointers.values()];return a.length===2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0;};
free.onpointerdown=e=>{free.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=dist();};
free.onpointermove=e=>{
  const p=pointers.get(e.pointerId);if(!p)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(pointers.size===2){const d=dist();if(d>5&&pinch>5)adjust(0,0,pinch/d);pinch=d;}
  else if(dx||dy)adjust(-dx*4/free.clientWidth,-dy*2/free.clientHeight);
};
free.onpointerup=free.onpointercancel=free.onlostpointercapture=e=>{pointers.delete(e.pointerId);pinch=dist();};
free.addEventListener('wheel',e=>{e.preventDefault();adjust(0,0,Math.exp(limit(e.deltaY,-180,180)*.0018));},{passive:false});
get('closer').onclick=()=>adjust(0,0,.8);get('wider').onclick=()=>adjust(0,0,1.25);
document.addEventListener('keydown',e=>{
  if(!active)return;if(e.key==='Escape'){back.click();return;}
  if(e.target!==free)return;
  const steps={ArrowLeft:[.10,0],ArrowRight:[-.10,0],ArrowUp:[0,-.08],ArrowDown:[0,.08],'+':[0,0,.85],'-':[0,0,1.18]};
  if(steps[e.key]){e.preventDefault();adjust(...steps[e.key]);}
});
window.addEventListener('pagehide',()=>stop());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||requested))stop();});
requestAnimationFrame(tick);

const player=get('player'),screenButton=get('screen'),options=get('options'),cameraOptions=get('cameraOptions');
// The parent shelf tracks browser chrome on iPhone. Inside an iframe the visual
// viewport can still represent the full layout viewport during a toolbar change.
function fitViewport(){
  const view=window.visualViewport;
  const w=view && view.scale===1 ? Math.min(innerWidth,view.width) : innerWidth;
  const h=view && view.scale===1 ? Math.min(innerHeight,view.height) : innerHeight;
  const fit=Math.min(w,h*16/9),cover=Math.max(w,h*16/9);
  for(const [key,value] of Object.entries({w,h,fit,cover,footer:(h-fit*9/16)/2+fit/16})) {
    player.style.setProperty('--view-'+key,value+'px');
  }
}
fitViewport();
window.addEventListener('resize',fitViewport);
window.visualViewport?.addEventListener('resize',fitViewport);
const shortLandscape=matchMedia('(orientation:landscape) and (max-height:540px)');
const hud=get('controls'), quality=get('quality');
const fill=document.createElement('button');
fill.id='fillPicture';fill.type='button';fill.textContent='Fyll skärmen';
fill.setAttribute('aria-pressed','false');
fill.title='Fyll hela skärmen genom att beskära bildens kanter';
cameraOptions.append(fill);
const primary=options.parentElement;
let hideTimer,expanded=false,automatic=false,downAt=null,keyboard=false,holding=false;
function showOptions(show){
  cameraOptions.hidden=!show;
  options.setAttribute('aria-expanded',String(show));
}
function hideControls(){
  if(!expanded)return;
  clearTimeout(hideTimer);
  showOptions(false);
  player.classList.add('hud-hidden');
}
function revealControls(){
  player.classList.remove('hud-hidden');
  clearTimeout(hideTimer);
  if(expanded && !film.paused && !requested && !holding)hideTimer=setTimeout(()=>{
    if(!keyboard || !hud.contains(document.activeElement))hideControls();
  },3200);
}
function setFill(on){
  player.classList.toggle('fill-picture',on);
  fill.setAttribute('aria-pressed',String(on));
  fill.textContent=on?'Visa hela bilden':'Fyll skärmen';
}
fill.onclick=()=>{setFill(!player.classList.contains('fill-picture'));hideControls();};
function expand(on,auto=false){
  expanded=on;automatic=on&&auto;
  player.classList.toggle('expanded',on);
  if(on){
    if(quality)cameraOptions.append(quality);
    cameraOptions.append(screenButton);
  }else{
    if(quality)primary.insertBefore(quality,options);
    primary.insertBefore(screenButton,options);
    setFill(false);
  }
  fill.hidden=!on;
  options.hidden=!on&&!active;
  options.textContent=on?'Val':'Kameraval';
  showOptions(!on&&active&&innerWidth>=760);
  placeScreenControl();revealControls();
}
function canExpandScene(){
  return Boolean((player.requestFullscreen && document.fullscreenEnabled)
    || (player.webkitRequestFullscreen && document.webkitFullscreenEnabled));
}
function canExpandFilm(){
  return !active && typeof film.webkitEnterFullscreen==='function' && film.readyState>=1;
}
function placeScreenControl(){
  const system=Boolean(document.fullscreenElement || document.webkitFullscreenElement || film.webkitDisplayingFullscreen);
  const available=canExpandScene() || canExpandFilm();
  const mainButton=expanded && shortLandscape.matches && (system || available);
  const title=system?'Stäng helskärm':available?'Helskärm':expanded?'Stäng storbild':'Storbild';
  screenButton.textContent=title;
  screenButton.title=!system && !canExpandScene() && canExpandFilm()?'Visa filmens regi i helskärm':title;
  screenButton.setAttribute('aria-label',screenButton.title);
  screenButton.setAttribute('aria-pressed',String(system || (!available && expanded)));
  screenButton.classList.toggle('compact-fullscreen',mainButton);
  if(!expanded || mainButton) primary.insertBefore(screenButton,options);
  else cameraOptions.append(screenButton);
}
screenButton.onclick=async()=>{
  if(document.fullscreenElement || document.webkitFullscreenElement){
    const exit=document.exitFullscreen || document.webkitExitFullscreen;
    await Promise.resolve(exit.call(document)).catch(()=>{});return;
  }
  if(canExpandScene()){
    try{
      const request=document.fullscreenEnabled && player.requestFullscreen || player.webkitRequestFullscreen;
      await request.call(player);return;
    }catch{/* Some iPhones only expose fullscreen for the film. */}
  }
  if(canExpandFilm()){
    try{film.webkitEnterFullscreen();if(film.paused)film.play().catch(()=>{});return;}catch{/* Keep the inline player available. */}
  }
  if(expanded && (canExpandScene()||canExpandFilm())){
    cameraNotice('Helskärm kunde inte öppnas i den här webbläsaren.',3000);return;
  }
  expand(!expanded);
};
function fullscreenLayout(){
  const system=Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  expand(system||shortLandscape.matches,!system&&shortLandscape.matches);
  fitViewport();
}
document.addEventListener('fullscreenchange',fullscreenLayout);
document.addEventListener('webkitfullscreenchange',fullscreenLayout);
film.addEventListener('loadedmetadata',placeScreenControl);
film.addEventListener('webkitendfullscreen',()=>{placeScreenControl();revealControls();});
function rotateLayout(){if(shortLandscape.matches)expand(true,true);else if(automatic)expand(false);}
fill.hidden=true;
shortLandscape.addEventListener('change',rotateLayout);rotateLayout();
options.onclick=()=>{showOptions(cameraOptions.hidden);revealControls();};
film.addEventListener('playing',revealControls);
film.addEventListener('pause',revealControls);
hud.addEventListener('change',()=>{if(expanded&&!cameraOptions.hidden)hideControls();});
const stage=get('stage');
stage.tabIndex=0;stage.setAttribute('aria-label','Bildyta. Tryck för att visa eller dölja kontroller i helskärm.');
stage.addEventListener('pointerdown',e=>{
  downAt=e.isPrimary?{x:e.clientX,y:e.clientY}:null;
});
stage.addEventListener('pointermove',e=>{
  if(downAt && Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y)>=5)downAt=null;
});
stage.addEventListener('pointercancel',()=>{downAt=null;});
stage.addEventListener('pointerup',e=>{
  if(expanded && downAt && e.isPrimary && Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y)<5){
    if(player.classList.contains('hud-hidden'))revealControls();
    else hideControls();
  }
  downAt=null;
});
stage.addEventListener('keydown',e=>{if(expanded && ['Enter',' '].includes(e.key)){e.preventDefault();revealControls();}});
player.addEventListener('focusin',()=>{if(keyboard)revealControls();});
document.addEventListener('pointerdown',()=>{keyboard=false;},true);
document.addEventListener('keydown',()=>{keyboard=true;},true);
hud.addEventListener('pointerdown',()=>{holding=true;revealControls();});
function releaseControl(){
  if(!holding)return;
  holding=false;revealControls();
}
window.addEventListener('pointerup',releaseControl);
window.addEventListener('pointercancel',releaseControl);
hud.addEventListener('focusout',()=>{if(keyboard)revealControls();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded){expand(false);}});
