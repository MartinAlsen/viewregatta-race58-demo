(() => {
  const film = document.querySelector('video');
  const select = document.querySelector('#rendition');
  const notice = document.querySelector('#notice');
  const supportsHls = Boolean(film.canPlayType('application/vnd.apple.mpegurl'));
  const sources = {
    hd: 'watch/1080p/film.m3u8',
    original: document.querySelector('#original-film').href,
    adaptive: supportsHls ? 'watch/race58.m3u8' : 'watch/race58-mobile.mp4',
  };
  if (!supportsHls) {
    select.querySelector('[value="hd"]').remove();
    select.querySelector('[value="adaptive"]').textContent = 'Mobile · 360p';
  }

  const wideDesktop = matchMedia('(min-width: 960px) and (any-pointer: fine)').matches;
  const saveData = navigator.connection?.saveData === true;
  select.value = wideDesktop && !saveData ? (supportsHls ? 'hd' : 'original') : 'adaptive';

  function chapterTime() {
    const match = /^#t=(\d+(?:\.\d+)?)$/.exec(location.hash);
    return match ? Number(match[1]) : null;
  }
  let pendingTime = chapterTime();
  function seek(time) {
    if (time === null) return;
    if (film.readyState < 1 || !Number.isFinite(film.duration)) {
      pendingTime = time;
      return;
    }
    pendingTime = null;
    film.currentTime = Math.min(time, film.duration);
  }
  function setSource(mode, time, playing) {
    select.value = mode;
    pendingTime = time;
    film.src = sources[mode];
    if (playing) film.play().catch(() => {});
  }
  select.addEventListener('change', () => {
    notice.textContent = '';
    setSource(select.value, pendingTime ?? film.currentTime, !film.paused && !film.ended);
  });
  film.addEventListener('loadedmetadata', () => seek(pendingTime));
  film.addEventListener('error', () => {
    if (select.value !== 'adaptive') {
      const next = select.value === 'original' && supportsHls ? 'hd' : 'adaptive';
      notice.textContent = next === 'hd' ? 'Using the 1080p stream. You can also download the original below.' : 'Using the mobile stream.';
      setSource(next, pendingTime ?? film.currentTime, !film.paused && !film.ended);
    } else {
      notice.textContent = 'Playback unavailable. Use the download link below.';
    }
  });
  window.addEventListener('hashchange', () => seek(chapterTime()));
  document.querySelector('nav').addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    seek(chapterTime());
    film.play().catch(() => {});
  });
  document.querySelector('#quality').hidden = false;
  setSource(select.value, pendingTime, false);
})();
