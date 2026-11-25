// Use the same media element and clock for the director, audio and free camera.
export function setupFilmStream(film, quality, notice) {
  if (!film.dataset.hls) return;
  const {hls: adaptive, hd, original, originalHls, fallback, hlsModule} = film.dataset;
  const native = Boolean(film.canPlayType('application/vnd.apple.mpegurl'));
  const saveData = navigator.connection?.saveData === true;
  film.preload = saveData ? 'metadata' : 'auto';
  let engine, generation = 0, pendingTime = null, lastTime = 0, mode = 'auto';
  let recovering = false, intendedPlay = false;

  function selectedLevel(hls) {
    if (mode === 'auto') return -1;
    const heights=hls.levels.map(level=>level.height);
    return mode==='original' ? heights.length-1 : heights.indexOf(Math.max(...heights));
  }
  function describe() {
    const label = quality.querySelector('option[value="auto"]');
    const master = originalHls && engine && engine.currentLevel>=0 && engine.currentLevel===engine.levels.length-1;
    label.textContent = mode === 'auto' && film.videoHeight ? 'Auto · ' + (master ? 'Original' : film.videoHeight+'p') : 'Auto';
  }
  function nativeSource(url, time, playing) {
    pendingTime = time > 0 ? time : null;
    film.src = pendingTime ? url + '#t=' + time : url;
    if (playing) film.play().catch(() => {});
  }
  function fail() {
    if (recovering) {
      notice.textContent = 'Filmen kunde inte laddas. Välj en annan bildkvalitet.';
      return;
    }
    recovering = true;
    generation++;
    const time = pendingTime ?? (film.currentTime || lastTime);
    const playing = intendedPlay;
    engine?.destroy(); engine = null;
    const useOriginal = mode !== 'original';
    mode = useOriginal ? 'original' : 'mobile';
    quality.value = mode;
    notice.textContent = useOriginal ? 'Strömmen avbröts. Laddar originalfilmen.' : 'Originalet kunde inte laddas. Visar mobilversionen.';
    nativeSource(useOriginal ? original : fallback, time, playing);
  }
  async function select(modeWanted) {
    const version = ++generation;
    const time = pendingTime ?? film.currentTime;
    const playing = !film.paused && !film.ended;
    intendedPlay = playing;
    mode = modeWanted; recovering = false; notice.textContent = '';
    if (engine && engine.levels.length && (mode === 'auto' || mode === 'hd' || (mode === 'original' && originalHls))) {
      engine.nextLevel = selectedLevel(engine);
      describe();
      return;
    }
    engine?.destroy(); engine = null;
    describe();
    const source = {auto: adaptive, hd, original:originalHls || original, mobile: fallback}[mode];
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
        backBufferLength: 20, abrEwmaDefaultEstimate: saveData ? 700000 : Math.min(6500000,(navigator.connection?.downlink || 6.5)*1000000),
        startPosition: time || 0, autoStartLoad: !saveData || playing});
      const current = engine;
      current.on(Hls.Events.ERROR, (_, error) => {
        if (error.fatal && current === engine) fail();
      });
      current.on(Hls.Events.MEDIA_ATTACHED, () => {
        current.loadSource(new URL(adaptive, document.baseURI).href);
        if (playing) film.play().catch(() => {});
      });
      current.on(Hls.Events.MANIFEST_PARSED, () => {
        if (mode !== 'auto') current.loadLevel = selectedLevel(current);
        if (saveData && (playing || !film.paused || intendedPlay)) current.startLoad(time || 0);
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
    if (saveData && engine && !engine.loadingEnabled) engine.startLoad(pendingTime ?? film.currentTime);
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
    const id = ++startRequest, until = performance.now()+3000;
    pending = true;
    try {
      await selecting;
      if (id !== startRequest) return;
      if (engine && saveData) engine.startLoad(pendingTime ?? film.currentTime);
      while (engine && id === startRequest && performance.now()<until && ahead()<Math.min(8, (film.duration || Infinity)-film.currentTime)) {
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
