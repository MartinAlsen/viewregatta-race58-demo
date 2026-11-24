const get=id=>document.getElementById(id);
const film=get('film'),free=get('free'),canvas=free.querySelector('canvas'),ctx=canvas.getContext('2d');
const hint=get('hint'),seek=get('seek'),focus=get('focus'),take=get('take'),back=get('back');
const limit=(v,a,b)=>Math.min(b,Math.max(a,v));
const raceStart=303, frames=[], pointers=new Map();
let ws=null,active=false,moved=false,id=0,presented=0,displayed=-1,rx=0,ping=0,rtt=.12;
let yaw=0,pitch=0,zoom=1,watchdog,lastSent=0,lastDraw=0,pinch=0,vframe=false;
film.controls=false;get('transport').hidden=false;
function mediaClock(_,meta){presented=meta.mediaTime;vframe=true;film.requestVideoFrameCallback(mediaClock);}
if(film.requestVideoFrameCallback)film.requestVideoFrameCallback(mediaClock);
function position(){return raceStart+(vframe&&!film.seeking?presented:film.currentTime);}
function clearFrames(){for(const item of frames)item.bitmap.close?.();frames.length=0;displayed=-1;canvas.hidden=true;}
function invalidate(){id++;clearFrames();}
function controls(enabled){
  take.hidden=enabled;
  for(const el of [free,back,get('focusLabel'),get('closer'),get('wider')])el.hidden=!enabled;
}
function stop(message='Du följer filmens regi.'){
  active=false;controls(false);take.disabled=false;invalidate();pointers.clear();
  clearTimeout(watchdog);
  if(ws){const old=ws;ws=null;old.onclose=old.onerror=null;old.close();}
  hint.textContent=message;
}
function send(){
  if(!active||ws?.readyState!==WebSocket.OPEN||film.seeking)return;
  lastSent=performance.now();
  ws.send(JSON.stringify({id,t:limit(position(),303,354.96),yaw,pitch,zoom,focus:Number(focus.value),
    wide:free.clientWidth>=850,moving:!film.paused&&!film.ended,lead:limit(rtt+.12,.15,1.35)}));
}
function adjust(dy,dp,factor=1){
  if(!active)return;
  yaw=((yaw+dy+3*Math.PI)%(2*Math.PI))-Math.PI;pitch=limit(pitch+dp,-1.4,.48);zoom=limit(zoom*factor,.19,2.9);
  moved=true;send();
}
function enter(){
  take.disabled=true;hint.textContent='Ansluter till filmens 3D-scen …';
  ws=new WebSocket('wss://eye-intention-refugees-consultants.trycloudflare.com/m1');ws.binaryType='arraybuffer';
  watchdog=setTimeout(()=>stop('Kunde inte ansluta till 3D-scenen. Filmen går att spela. Försök igen.'),12000);
  ws.onerror=ws.onclose=()=>stop('Kontakten med 3D-scenen bröts. Du följer nu filmens regi.');
  ws.onmessage=async({data})=>{
    if(typeof data==='string'){
      const packet=JSON.parse(data);
      if(packet.ready){
        clearTimeout(watchdog);rx=performance.now();active=true;moved=false;yaw=pitch=0;zoom=1;focus.value='0';
        invalidate();controls(true);free.focus({preventScroll:true});hint.textContent='Dra för att vrida. Nyp eller scrolla för att zooma.';send();
        ping=performance.now();ws.send('{"ping":true}');
      }else if(packet.pong)rtt=limit((performance.now()-ping)/1000,.01,1);
      return;
    }
    const h=new DataView(data),version=h.getUint32(0),t=h.getUint32(4)/25;
    rx=performance.now();
    if(version!==id||!active||!moved)return;
    const blob=new Blob([data.slice(12)],{type:'image/jpeg'});
    let bitmap;
    try{
      if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(blob);
      else{const url=URL.createObjectURL(blob);try{bitmap=new Image();bitmap.src=url;await bitmap.decode();}finally{URL.revokeObjectURL(url);}}
    }catch{return;}
    if(version!==id||!active||t<displayed){bitmap.close?.();return;}
    frames.push({t,bitmap});frames.sort((a,b)=>a.t-b.t);
    while(frames.length>45)frames.shift().bitmap.close?.();
  };
}
function tick(now){
  const t=position();seek.value=film.currentTime;
  const s=Math.floor(raceStart+film.currentTime);get('time').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  get('play').textContent=film.ended?'Spela igen':film.paused?'Spela':'Pausa';
  if(active){
    if(now-lastSent>370)send();
    if(now-rx>8000){stop('3D-bilden svarar inte. Du följer nu filmens regi.');}
    else if(moved&&!film.seeking){
      // Both the audio clock and the displayed movie frame come from this one video.
      let next;while(frames.length&&frames[0].t<=t+.021){next?.bitmap.close?.();next=frames.shift();}
      if(next){
        if(Math.abs(t-next.t)<.24&&next.t>=displayed){if(canvas.width!==next.bitmap.width){canvas.width=next.bitmap.width;canvas.height=next.bitmap.height;}ctx.drawImage(next.bitmap,0,0);canvas.hidden=false;displayed=next.t;lastDraw=now;}
        next.bitmap.close?.();
      }
      if(!film.paused&&now-lastDraw>700)canvas.hidden=true;
    }
  }
  requestAnimationFrame(tick);
}
take.onclick=enter;back.onclick=()=>{stop();take.focus({preventScroll:true});};
focus.onchange=()=>{moved=true;send();};
function play(){if(film.paused)film.play().catch(()=>{hint.textContent='Tryck på Spela för att starta.';});else film.pause();}
get('play').onclick=film.onclick=play;seek.oninput=()=>{film.currentTime=Number(seek.value);};
for(const e of ['seeking','seeked','play','pause'])film.addEventListener(e,()=>{if(active){invalidate();if(!film.seeking){if(film.paused)presented=film.currentTime;send();}}});
film.addEventListener('ended',()=>{if(active)stop('Rundningen är slut. Du kan spela igen.');});
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
