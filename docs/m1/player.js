const $=id=>document.getElementById(id);
const film=$('film'),free=$('free'),take=$('take'),back=$('back'),hint=$('hint');
const play=$('play'),seek=$('seek'),focus=$('focus');
let view,load,active=false,frame=0,scrubbing=false;
film.controls=false;$('transport').hidden=false;
function format(t){const s=Math.floor(t+290);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function clock(){
  if(!scrubbing)seek.value=film.currentTime;
  $('time').textContent=format(film.currentTime);
  play.textContent=film.ended?'Spela igen':film.paused?'Spela':'Pausa';
}
function tick(){
  if(active)view.update(film.currentTime);
  clock();frame=requestAnimationFrame(tick);
}
function motion(){cancelAnimationFrame(frame);if(!document.hidden)tick();}
document.addEventListener('visibilitychange',motion);
for(const signal of ['timeupdate','play','pause','seeked','ended','loadedmetadata'])
  film.addEventListener(signal,clock);
function togglePlay(){if(film.paused||film.ended)film.play().catch(()=>{hint.textContent='Tryck på Spela för att starta filmen.';});else film.pause();}
play.onclick=togglePlay;
film.onclick=togglePlay;
seek.oninput=()=>{scrubbing=true;film.currentTime=Number(seek.value);$('time').textContent=format(Number(seek.value));};
seek.onchange=()=>{scrubbing=false;clock();};seek.onblur=()=>{scrubbing=false;};
function returnToFilm(){
  active=false;free.hidden=true;back.hidden=true;$('focusLabel').hidden=true;$('credit').hidden=true;
  take.hidden=false;hint.textContent='Du följer filmens regi.';take.focus({preventScroll:true});
}
function preload(){
  if(!load)load=import('./free.js').then(m=>m.freeView(free,()=>{
    returnToFilm();take.disabled=true;hint.textContent='3D-vyn stängdes. Du kan fortsätta se filmen.';
  })).catch(err=>{load=null;throw err;});
  return load;
}
take.onclick=async()=>{
  take.disabled=true;hint.textContent='Laddar båtar och kamera …';
  try{
    view=await preload();free.hidden=false;focus.value='fleet';view.enter(film.currentTime);active=true;
    take.hidden=true;back.hidden=false;$('focusLabel').hidden=false;$('credit').hidden=false;
    hint.textContent='Dra för att vrida. Nyp eller scrolla för att zooma. Kommentaren följer filmen.';
    back.focus({preventScroll:true});
  }catch(err){free.hidden=true;hint.textContent='3D-vyn kunde inte öppnas. Prova igen eller fortsätt se filmen.';console.error(err);}
  finally{take.disabled=false;}
};
back.onclick=returnToFilm;focus.onchange=()=>view.focus(focus.value);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)returnToFilm();});
motion();
film.addEventListener('playing',()=>{if(!navigator.connection?.saveData)preload().catch(()=>{});},{once:true});
