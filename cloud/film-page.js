import {setupFilmStream} from './assets-v1/m1-scen/film-stream.js?v=8e28416acbb9';
const film=document.querySelector('video'),quality=document.querySelector('#rendition');
Object.assign(film.dataset,{hls:'stream-v2/master.m3u8',hd:'stream-v2/1080p/film.m3u8',originalHls:'stream-v2/original/film.m3u8',backupHls:'https://martinalsen.github.io/viewregatta-race58-demo/watch/race58-hd.m3u8',backupHd:'https://martinalsen.github.io/viewregatta-race58-demo/watch/1080p/film.m3u8',original:document.querySelector('#original-film').href,fallback:'director-v1/360p/film.mp4',hlsModule:'assets-v1/m1-scen/vendor/hls-light-1.7.4.mjs'});
quality.add(new Option('360p','mobile'));quality.value='auto';document.querySelector('#quality').hidden=false;
setupFilmStream(film,quality,document.querySelector('#notice'));let initial=true;
function chapter(){ const match=/^#t=(\d+(?:\.\d+)?)$/.exec(location.hash);if(match&&Number.isFinite(film.duration))film.currentTime=Math.min(+match[1],film.duration); }
film.addEventListener('loadedmetadata',()=>{if(initial){initial=false;chapter();}});window.addEventListener('hashchange',chapter);
document.querySelector('nav').addEventListener('click',e=>{const a=e.target.closest('a');if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState(null,'',a.hash);chapter();film.play().catch(()=>{});});
