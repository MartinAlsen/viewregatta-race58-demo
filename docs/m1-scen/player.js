const get=id=>document.getElementById(id);
const film=get('film'),free=get('free'),canvas=free.querySelector('canvas'),back=get('back'),take=get('take');
const focus=get('focus'),hint=get('hint'),seek=get('seek'),pointers=new Map(),limit=(x,a,b)=>Math.max(a,Math.min(b,x));
let world,loading,active=false,requested=false,ready=false,visible=false,moved=false,anchor=0,elapsed=0,frames=0,previous=0,pinch=0;
let yaw=0,pitch=0,zoom=1,stamp=0,hasStamp=false,seq=0,lastWarm=0,warmAt=0;
function clock(_,m){stamp=m.mediaTime;hasStamp=true;film.requestVideoFrameCallback(clock);}
if(film.requestVideoFrameCallback)film.requestVideoFrameCallback(clock);
const position=()=>hasStamp&&!film.seeking?stamp:film.currentTime;
const pose=()=>({yaw,pitch,zoom,moved,focus:Number(focus.value)});
film.controls=false;get('transport').hidden=false;
function evidence(text){if(get('credits').textContent!==text)get('credits').textContent=text;}
function controls(on){
  take.hidden=on;free.hidden=!on;get('options').hidden=!on;showOptions(on&&!expanded&&innerWidth>=760);
  for(const el of [back,get('focusLabel'),get('closer'),get('wider')])el.hidden=!on;
}
function stop(message='Du följer filmens regi.'){
  requested=active=visible=false;seq++;controls(false);canvas.hidden=true;get('credits').hidden=true;get('room').hidden=true;get('rate').hidden=true;
  take.disabled=false;world?.follow();pointers.clear();hint.textContent=message;
}
function load(){
  return loading??=import('./runtime/world.js?v=968d80c353a2').then(m=>m.loadWorld(canvas,()=>{
    stop('Telefonen avbröt 3D-visningen. Filmen fortsätter.');world=null;loading=null;
  })).then(w=>{world=w;warmAt=performance.now();}).catch(e=>{loading=null;throw e;});
}
function takeOver(){
  requested=false;active=true;ready=true;anchor=position();yaw=pitch=0;zoom=1;moved=false;focus.value='0';world.start(anchor);
  elapsed=frames=previous=0;controls(true);take.disabled=false;free.focus({preventScroll:true});
  hint.textContent='Dra för att vrida. Nyp eller scrolla för att zooma.';
}
async function enter(){
  const version=++seq;requested=true;take.disabled=true;hint.textContent='Laddar båtarna och Stockholm …';
  try{await load();if(version===seq&&world.ready)takeOver();}catch(e){console.error(e.message,e.stack);if(version===seq)stop('3D-scenen kunde inte laddas. Filmen går att spela.');}
}
function adjust(dx,dy,factor=1){
  if(!active)return;yaw=(yaw+dx+3*Math.PI)%(2*Math.PI)-Math.PI;pitch=limit(pitch+dy,-1.4,.48);zoom=limit(zoom*factor,.19,2.9);moved=true;
}
function tick(now){
  requestAnimationFrame(tick);if(document.hidden)return;
  const t=position(),sec=Math.floor(303+film.currentTime);seek.value=film.currentTime;
  get('time').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  get('play').textContent=film.ended?'Spela igen':film.paused?'Spela':'Pausa';
  if(!world || (!active&&now-lastWarm<(ready?200:22)))return;
  if(!active&&!requested&&ready&&film.paused&&now-warmAt>45000)return;
  try{
    const result=world.draw(t,active?pose():{yaw:0,pitch:0,zoom:1,focus:0},now,active);lastWarm=now;
    if(!active){ready=result.ready;if(ready&&requested)takeOver();else if(requested&&now-warmAt>75000){stop('Stockholmsbilden tar för lång tid att ladda. Försök igen.');warmAt=now;}return;}
    visible=moved||Math.abs(t-anchor)>.035;canvas.hidden=!visible;
    get('credits').hidden=!visible;get('room').hidden=!visible||!result.room;
    evidence([...new Set(['Google Maps',...result.credits.filter(x=>x!=='Google')])].join(' · '));
    if(visible){
      if(previous>0){elapsed+=now-previous;frames++;}
      previous=now;
      if(elapsed>=1500){get('rate').hidden=false;get('rate').textContent=Math.round(1000*frames/elapsed)+' bilder/s';elapsed=frames=0;}
    }
  }catch(e){console.error(e.message,e.stack);stop('3D-vyn avbröts. Du följer filmens regi.');world=null;loading=null;}
}
take.onclick=enter;back.onclick=()=>{stop();take.focus({preventScroll:true});};
focus.onchange=()=>{moved=true;};
function play(){if(film.paused)film.play().catch(()=>{hint.textContent='Tryck på Spela för att starta.';});else film.pause();}
get('play').onclick=play;film.onclick=()=>{if(!expanded)play();};seek.oninput=()=>{film.currentTime=Number(seek.value);};
film.addEventListener('seeked',()=>{if(film.paused)stamp=film.currentTime;});
film.addEventListener('ended',()=>{if(active)stop('Rundningen är slut. Du kan spela igen.');if(expanded)revealControls();});
function prewarm(){if(!document.hidden&&!navigator.connection?.saveData)load().catch(()=>{});}
film.addEventListener('loadedmetadata',prewarm,{once:true});
film.addEventListener('playing',prewarm,{once:true});
if(film.readyState>=1)prewarm();
film.addEventListener('seeked',()=>{warmAt=performance.now();});
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
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop();});
requestAnimationFrame(tick);

const player=get('player'),screenButton=get('screen'),options=get('options'),cameraOptions=get('cameraOptions');
const shortLandscape=matchMedia('(orientation:landscape) and (max-height:540px)');
let hideTimer,expanded=false,automatic=false,downAt=null;
function showOptions(show){
  cameraOptions.hidden=!show;
  options.setAttribute('aria-expanded',String(show));
}
function revealControls(){
  player.classList.remove('hud-hidden');clearTimeout(hideTimer);
  if(expanded && cameraOptions.hidden)hideTimer=setTimeout(()=>{
    if(!player.matches(':has(#controls :focus-visible)'))player.classList.add('hud-hidden');
  },3200);
}
function expand(on,auto=false){
  expanded=on;automatic=on&&auto;
  player.classList.toggle('expanded',on);
  screenButton.textContent=on?'Stäng helskärm':'Helskärm';
  screenButton.setAttribute('aria-pressed',String(on));revealControls();
}
screenButton.onclick=async()=>{
  if(expanded){
    if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
    expand(false);return;
  }
  expand(true);
  if(player.requestFullscreen)await player.requestFullscreen().catch(()=>{});
};
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)expand(false);});
function rotateLayout(){if(shortLandscape.matches)expand(true,true);else if(automatic)expand(false);}
shortLandscape.addEventListener('change',rotateLayout);rotateLayout();
options.onclick=()=>{showOptions(cameraOptions.hidden);revealControls();};
const stage=get('stage');
stage.tabIndex=0;stage.setAttribute('aria-label','Bildyta. Tryck för att visa eller dölja kontroller i helskärm.');
stage.addEventListener('pointerdown',e=>{
  downAt=e.isPrimary?{x:e.clientX,y:e.clientY}:null;
});
stage.addEventListener('pointerup',e=>{
  if(expanded && downAt && e.isPrimary && Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y)<5){
    if(player.classList.contains('hud-hidden'))revealControls();
    else {clearTimeout(hideTimer);player.classList.add('hud-hidden');}
  }
  downAt=null;
});
stage.addEventListener('keydown',e=>{if(expanded && ['Enter',' '].includes(e.key)){e.preventDefault();revealControls();}});
player.addEventListener('focusin',revealControls);
get('controls').addEventListener('pointerdown',revealControls);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded){expand(false);}});
