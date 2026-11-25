// A muted crop from the programme master can retain small map labels on low-resolution streams.
export function showSourceDetail(spec, stageWidth, pixelRatio) {
  // A half-scale broadcast still has enough pixels for a sharper source-camera crop.
  return Boolean(spec.largeScreenDetail && stageWidth * pixelRatio >= spec.frameSize[0] / 2);
}

export function setupInsetPicture(film, spec) {
  if (!spec) return () => {};
  const {url, start, end, segmentSec, firstPts = 0, lead = 2, rect, frameSize} = spec;
  const box = document.createElement('video');
  box.id = spec.id || 'tacticalPicture';
  box.playsInline = box.muted = box.defaultMuted = true;
  box.disablePictureInPicture = true;
  box.setAttribute('aria-hidden','true');
  box.setAttribute('disableRemotePlayback','');
  box.preload = 'none';
  const [x,y,w,h] = rect, [width,height] = frameSize;
  Object.assign(box.style, {position:'absolute',inset:'auto',left:100*x/width+'%',top:100*y/height+'%',
    width:100*w/width+'%',height:100*h/height+'%',pointerEvents:'none',visibility:'hidden',zIndex:'1'});
  film.parentElement.append(box);
  const clips = new Map();
  let downloading, activeIndex = -1;
  let pendingPlay = false, disabled = false, target = 0, retryAfter = 0;
  let decoded = NaN;
  function discard() {
    if (downloading) downloading.controller.abort();
    downloading = null;
    for (const blob of clips.values()) URL.revokeObjectURL(blob);
    clips.clear();
    if (activeIndex !== -1) { box.removeAttribute('src'); box.load(); activeIndex = -1; }
  }
  function bufferedAhead() {
    for (let i=0; i<film.buffered.length; i++) {
      if (film.buffered.start(i)<=film.currentTime+.05 && film.buffered.end(i)>=film.currentTime)
        return film.buffered.end(i)-film.currentTime;
    }
    return 0;
  }
  async function fetchClip(index) {
    const task = {index, controller:new AbortController()};
    downloading = task;
    try {
      const filename = String(index).padStart(3,'0')+'.mp4';
      const response = await fetch(new URL(filename, new URL(url,document.baseURI)), {signal:task.controller.signal, priority:'low'});
      if (!response.ok) throw Error('Map clip unavailable');
      const blob = await response.blob();
      if (downloading===task) clips.set(index,URL.createObjectURL(blob));
    } catch { if (!task.controller.signal.aborted) retryAfter=performance.now()+5000; }
    finally { if (downloading===task) downloading=null; }
  }
  function frame(_, data) {
    decoded = data.mediaTime;
    box.requestVideoFrameCallback(frame);
  }
  if (box.requestVideoFrameCallback) box.requestVideoFrameCallback(frame);
  function hide() { box.style.visibility = 'hidden'; }
  function stop() { hide(); if (!box.paused) box.pause(); }
  box.addEventListener('error', () => { disabled = true; stop(); });
  film.addEventListener('seeking', () => { stop(); decoded = NaN; });
  film.addEventListener('waiting', stop);
  film.addEventListener('pause', () => box.pause());
  window.addEventListener('pagehide', () => { stop(); discard(); });
  return t => {
    const largePicture = showSourceDetail(spec, film.clientWidth, devicePixelRatio);
    if (disabled || document.hidden || !film.videoHeight || (!largePicture && film.videoHeight >= frameSize[1]) ||
        t < start - lead || t >= end) {
      if (activeIndex !== -1 || downloading || clips.size) { stop(); discard(); }
      return;
    }
    const elapsed = Math.max(0,t-start), index = Math.floor(elapsed/segmentSec);
    target = elapsed-index*segmentSec + (index===0 ? firstPts : 0);
    if (downloading && (downloading.index<index || downloading.index>index+1)) {
      downloading.controller.abort(); downloading=null;
    }
    for (const [key,blob] of clips) if (key<index || key>index+1) {
      clips.delete(key); URL.revokeObjectURL(blob);
    }
    // Fetch at most one short map clip ahead, only after the film has a reserve.
    if (!downloading && (film.paused || bufferedAhead()>=(spec.minBuffer || 6)) && performance.now()>=retryAfter) {
      if (!clips.has(index)) fetchClip(index);
      else if (target>=segmentSec/2 && start+(index+1)*segmentSec<end && !clips.has(index+1)) fetchClip(index+1);
    }
    if (!clips.has(index)) { stop(); return; }
    if (activeIndex!==index) {
      activeIndex=index; hide(); decoded=NaN;
      box.dataset.clockOffset = start+index*segmentSec-(index===0 ? firstPts : 0);
      box.src=clips.get(index); box.preload='auto'; box.load();
    }
    if (box.readyState < 1 || film.seeking) { hide(); return; }
    const drift = target - box.currentTime;
    if (!box.seeking && Math.abs(drift) > (film.paused ? .06 : .20)) {
      hide(); decoded = NaN; box.currentTime = target; return;
    }
    const moving = t >= start && !film.paused && !film.ended && film.readyState >= 3;
    if (moving && box.paused && !pendingPlay && performance.now() >= retryAfter) {
      pendingPlay = true;
      box.play().catch(() => { retryAfter = performance.now()+1200; }).finally(() => { pendingPlay = false; });
    } else if (!moving && !box.paused) box.pause();
    const correction = Math.abs(drift) > .035 ? Math.min(1.05,Math.max(.95,1+drift)) : 1;
    const rate = film.playbackRate * correction;
    if (Math.abs(box.playbackRate-rate) > .01) box.playbackRate = rate;
    const shown = Number.isFinite(decoded) ? decoded : box.currentTime;
    box.style.visibility = t >= start && !box.seeking && box.readyState >= 2 && Math.abs(shown-target) < .15 ? 'visible' : 'hidden';
  };
}
