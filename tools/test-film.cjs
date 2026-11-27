const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../docs/public-player/film.js'), 'utf8');

function player({query='', desktop=true, saveData=false, adaptive=true}={}) {
  const urls = {hd:'/event/heat/film.mp4', mobile:'/event/heat/mobile.mp4', auto:'/event/heat/auto.m3u8', original:'/masters/heat.mp4'};
  const listeners = {};
  const select = {addEventListener: (k,f)=>{listeners[k]=f;}};
  const video = {
    querySelector: k => {
      const src=k.includes('"hd"')?urls.hd:k.includes('"mobile"')?urls.mobile:adaptive&&urls.auto;
      return src ? {src}: null;
    },
    paused:true, ended:false, currentTime:0, duration:180, src:urls.hd,
    canPlayType:()=> 'maybe', load:()=>{}, play(){this.paused=false;return Promise.resolve();},
    addEventListener:(k,f)=>{listeners[k]=f;},
  };
  vm.runInNewContext(script,{
    URLSearchParams, matchMedia:()=>({matches:desktop}), navigator:{connection:{saveData}},
    location:{search:query}, document:{
      querySelector:k=>k==='video'?video:{href:urls.original},
      getElementById:k=>k==='quality'?select:{},
    },
  });
  return {urls,video,select,emit:k=>listeners[k]?.()};
}
test('the economical HD starts directly and stays selected during buffering',()=>{
  for (const config of [{},{desktop:false,query:'?visning=hd'}]){
    const p=player(config);assert.equal(p.video.src,p.urls.hd);
    assert.equal(p.video.preload,'auto');p.video.currentTime=4;p.emit('waiting');
    assert.equal(p.video.src,p.urls.hd);assert.equal(p.video.currentTime,4);
  }
});
test('mobile and data-saving playback use available adaptive or compact media',()=>{
  assert.equal(player({desktop:false}).video.src,'/event/heat/auto.m3u8');
  const p=player({saveData:true,adaptive:false});assert.equal(p.video.src,p.urls.mobile);
  assert.equal(p.video.preload,'metadata');
});
test('explicit original and error recovery retain the viewing position',()=>{
  const p=player();p.video.currentTime=41;p.emit('timeupdate');p.video.paused=false;p.emit('play');
  p.select.value='original';p.emit('change');assert.equal(p.video.src,p.urls.original);
  p.video.currentTime=0;p.emit('loadedmetadata');assert.equal(p.video.currentTime,41);
  p.emit('error');assert.equal(p.video.src,p.urls.hd);
  p.video.currentTime=0;p.emit('loadedmetadata');assert.equal(p.video.currentTime,41);
});
