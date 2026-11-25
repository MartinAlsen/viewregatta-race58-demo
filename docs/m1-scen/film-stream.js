// Start with the least expensive rendition at the desired display resolution.
export function initialReplayLevel(levels, {wide, saveData, slowNetwork}) {
  if (!levels.length) return -1;
  const target = saveData || slowNetwork ? 360 : wide ? 1080 : 720;
  const available = levels.map(level => level.height).filter(height => height > 0);
  if (!available.length) return 0;
  const height = Math.max(...available.filter(value => value <= target));
  const desired = Number.isFinite(height) ? height : Math.min(...available);
  return levels.reduce((best, level, i) =>
    level.height === desired && (best < 0 || level.bitrate < levels[best].bitrate) ? i : best, -1);
}

// Use the same media element and clock for the director, audio and free camera.
export function setupFilmStream(film, quality, notice) {
  if (!film.dataset.hls) return;
  const {hls: adaptive, hd, original, originalHls, fallback, hlsModule} = film.dataset;
  const native = Boolean(film.canPlayType('application/vnd.apple.mpegurl'));
  const connection = navigator.connection;
  const saveData = connection?.saveData === true;
  const slowNetwork = ['slow-2g', '2g'].includes(connection?.effectiveType);
  const wide = !matchMedia('(pointer:coarse)').matches && Math.max(innerWidth,film.clientWidth) * devicePixelRatio >= 960;
  let backup = false;
  film.preload = saveData ? 'metadata' : 'auto';
  let engine, generation = 0, pendingTime = null, lastTime = 0, mode = 'auto';
  let recovering = false, intendedPlay = false;

  function selectedLevel(hls) {
    if (mode === 'auto') return -1;
    const levels=hls.levels;
    if (mode==='original') return levels.length-1;
    const candidates=originalHls && !backup && levels.length>1 ? levels.slice(0,-1) : levels;
    const height=Math.max(...candidates.map(level=>level.height));
    return candidates.map(level=>level.height).lastIndexOf(height);
  }
  function describe() {
    const label = quality.querySelector('option[value="auto"]');
    const master = originalHls && !backup && engine && engine.currentLevel>=0 && engine.currentLevel===engine.levels.length-1;
    label.textContent = mode === 'auto' && film.videoHeight ? 'Auto · ' + (master ? 'Original' : film.videoHeight+'p') : 'Auto';
  }
  function nativeSource(url, time, playing) {
    pendingTime = time > 0 ? time : null;
    film.src = pendingTime ? url + '#t=' + time : url;
    if (playing) film.play().catch(() => {});
  }
  function fail() {
    if (!backup && !recovering && (mode === 'auto' || mode === 'hd') && film.dataset.backupHls) {
      selecting = select(mode, true);
      return;
    }
    if (recovering) {
      notice.textContent = 'Filmen kunde inte laddas. Välj en annan bildkvalitet.';
      return;
    }
    recovering = true;
    generation++;
    const time = pendingTime ?? (film.currentTime || lastTime);
    const playing = intendedPlay;
    engine?.destroy(); engine = null;
    const useOriginal = mode === 'original' || mode === 'hd';
    mode = useOriginal ? 'original' : 'mobile';
    quality.value = mode;
    notice.textContent = useOriginal ? 'Laddar originalfilmen.' : 'Laddar den bandbreddssnåla versionen.';
    nativeSource(useOriginal ? original : fallback, time, playing);
  }
  async function select(modeWanted, useBackup = false) {
    const version = ++generation;
    const time = pendingTime ?? film.currentTime;
    const playing = useBackup ? intendedPlay : !film.paused && !film.ended;
    intendedPlay = playing;
    mode = modeWanted; recovering = false; notice.textContent = '';
    const sameOrigin = backup === useBackup;
    backup = useBackup;
    if (sameOrigin && engine && engine.levels.length && (mode === 'auto' || mode === 'hd' || (mode === 'original' && originalHls))) {
      engine.nextLevel = selectedLevel(engine);
      describe();
      return;
    }
    engine?.destroy(); engine = null;
    describe();
    const playlist = backup ? film.dataset.backupHls : adaptive;
    const source = {auto: playlist, hd:backup ? film.dataset.backupHd || playlist : hd, original:originalHls || original, mobile: fallback}[mode];
    // WebKit's native HLS honours iPhone playback gestures and power management.
    if ((mode === 'original' && !originalHls) || mode === 'mobile' || (native && navigator.vendor === 'Apple Computer, Inc.')) {
      nativeSource(source, time, playing);
      return;
    }
    try {
      const {default: Hls} = await import(new URL(hlsModule, document.baseURI));
      if (version !== generation) return;
      if (!Hls.isSupported()) {
        if (native) nativeSource(source, time, playing);
        else fail();
        return;
      }
      engine = new Hls({lowLatencyMode: false, maxBufferLength: 36, maxMaxBufferLength: 60,
        backBufferLength: 20, testBandwidth:false, abrEwmaDefaultEstimate: saveData || slowNetwork ? 650000 : wide ? 5500000 : 3000000,
        startPosition: time || 0, autoStartLoad:false});
      const current = engine;
      current.on(Hls.Events.ERROR, (_, error) => {
        if (error.fatal && current === engine) fail();
      });
      current.on(Hls.Events.MEDIA_ATTACHED, () => {
        current.loadSource(new URL(playlist, document.baseURI).href);
        if (playing) film.play().catch(() => {});
      });
      current.on(Hls.Events.MANIFEST_PARSED, () => {
        current.startLevel = mode === 'auto' ? initialReplayLevel(current.levels,{wide,saveData,slowNetwork}) : selectedLevel(current);
        if (mode !== 'auto') current.loadLevel = current.startLevel;
        if (!saveData || playing || !film.paused || intendedPlay || pending) current.startLoad(time || 0);
      });
      current.on(Hls.Events.LEVEL_SWITCHED,describe);
      pendingTime = time || null;
      current.attachMedia(film);
    } catch {
      if (version === generation) fail();
    }
  }
  film.addEventListener('play', () => {
    intendedPlay = true;
    if (saveData && engine?.levels.length && !engine.loadingEnabled) engine.startLoad(pendingTime ?? film.currentTime);
  });
  film.addEventListener('pause', () => { if (!film.error) intendedPlay = false; });
  film.addEventListener('loadedmetadata', () => {
    if (pendingTime !== null && Number.isFinite(film.duration)) {
      const t = Math.min(pendingTime, film.duration);
      pendingTime = null;
      if (Math.abs(t - film.currentTime) > .1) film.currentTime = t;
    }
    describe();
  });
  film.addEventListener('resize', describe);
  film.addEventListener('timeupdate', () => { if (film.currentTime > 0) lastTime = film.currentTime; });
  film.addEventListener('error', () => { if (!engine && film.error) fail(); });
  film.addEventListener('waiting', () => { if (!film.paused) notice.textContent = 'Buffrar film …'; });
  film.addEventListener('playing', () => { if (notice.textContent === 'Buffrar film …') notice.textContent = ''; describe(); });
  let selecting = select('auto'), startRequest = 0, pending = false;
  function cancel() {
    pending = false; startRequest++;
    if (notice.textContent === 'Förladdar film …') notice.textContent = '';
  }
  quality.onchange = () => { cancel(); selecting = select(quality.value); };

  window.addEventListener('pagehide', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  function ahead() {
    const t = film.currentTime;
    for (let i=0; i<film.buffered.length; i++) {
      if (film.buffered.start(i)<=t+.04 && film.buffered.end(i)>t) return film.buffered.end(i)-t;
    }
    return 0;
  }
  async function play() {
    // Native WebKit must receive play inside the original user gesture. WebKit
    // then chooses its startup buffer, including when network data saving is on.
    if ((native && navigator.vendor === 'Apple Computer, Inc.') || mode==='mobile' || (mode==='original' && !originalHls))
      return film.play();
    const id = ++startRequest, until = performance.now()+6500;
    pending = true;
    try {
      await selecting;
      if (id !== startRequest) return;
      if (engine?.levels.length && saveData) engine.startLoad(pendingTime ?? film.currentTime);
      while (engine && id === startRequest && performance.now()<until && ahead()<Math.min(9, (film.duration || Infinity)-film.currentTime)) {
        const rate=engine.levels[engine.currentLevel]?.bitrate;
        if (ahead()>=4 && rate>0 && engine.bandwidthEstimate>rate*1.5) break;
        notice.textContent = 'Förladdar film …';
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if (id === startRequest) {
        pending=false; notice.textContent='';
        return await film.play();
      }
    } finally { if (id===startRequest) pending=false; }
  }
  return {play, cancel, get pending(){return pending;}};
}
