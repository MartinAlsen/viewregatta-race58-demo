(() => {
  const video = document.querySelector('video');
  const select = document.getElementById('quality');
  const hd = video.querySelector('[data-rendition="hd"]').src;
  const auto = video.querySelector('source[type="application/vnd.apple.mpegurl"]')?.src;
  const mobile = video.querySelector('[data-rendition="mobile"]')?.src || hd;
  const original = document.querySelector('a[download]')?.href;
  const hls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
  const requestedHD = new URLSearchParams(location.search).get('visning') === 'hd';
  const desktop = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const economical = navigator.connection?.saveData || ['slow-2g','2g'].includes(navigator.connection?.effectiveType);
  video.preload = economical ? 'metadata' : 'auto';
  select.value = requestedHD || (desktop && !economical) ? 'best' : 'auto';
  document.getElementById('quality-control').hidden = false;
  let savedTime = 0;
  let pending = false;
  let playing = false;
  let fallback = [];
  function sources() {
    if (select.value === 'original') return [...new Set([original, hd, mobile].filter(Boolean))];
    if (select.value === 'best') return [...new Set([hd, mobile])];
    return hls && auto ? [auto, mobile] : [mobile];
  }
  function load(src) {
    pending = true;
    video.src = src;
    video.load();
    if (playing) video.play().catch(() => {});
  }
  function change() {
    if (!pending) {
      savedTime = video.ended ? 0 : video.currentTime;
      playing = !video.paused && !video.ended;
    }
    fallback = sources();
    load(fallback.shift());
  }
  video.addEventListener('loadedmetadata', () => {
    if (!pending) return;
    if (savedTime > 0 && Number.isFinite(video.duration))
      video.currentTime = Math.min(savedTime, video.duration);
    pending = false;
  });
  video.addEventListener('timeupdate', () => {
    if (!pending && !video.error) savedTime = video.currentTime;
  });
  video.addEventListener('play', () => { playing = true; });
  video.addEventListener('pause', () => {
    if (!pending && !video.error) playing = false;
  });
  video.addEventListener('error', () => {
    if (!fallback.length) return;
    const next = fallback.shift();
    select.value = next === hd ? 'best' : 'auto';
    load(next);
  });
  select.addEventListener('change', change);
  fallback = sources();
  const first = fallback.shift();
  if (first !== hd) load(first);
})();
