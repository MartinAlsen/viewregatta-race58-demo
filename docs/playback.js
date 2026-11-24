// A film and its interactive excerpt share playback focus within this browser.
(() => {
  const film = document.querySelector('video');
  if (!film) return;
  const key = 'viewregatta.race58.playback';
  const id = crypto.randomUUID();
  let channel;
  try { channel = new BroadcastChannel(key); } catch { /* Storage events work without BroadcastChannel. */ }
  let latest = { at: 0, id: '' };

  function receive(claim) {
    if (!claim || typeof claim.id !== 'string' || !Number.isFinite(claim.at)) return;
    if (claim.at < latest.at || (claim.at === latest.at && claim.id <= latest.id)) return;
    latest = claim;
    if (claim.id !== id && !film.paused) film.pause();
  }

  film.addEventListener('play', () => {
    if (film.paused) return;
    const claim = { at: Math.max(Date.now(), latest.at + 1), id };
    latest = claim;
    try { localStorage.setItem(key, JSON.stringify(claim)); } catch { /* Storage can be disabled. */ }
    channel?.postMessage(claim);
  });
  if (channel) channel.onmessage = event => receive(event.data);
  window.addEventListener('storage', event => {
    if (event.key === key && event.newValue) {
      try { receive(JSON.parse(event.newValue)); } catch { /* Ignore invalid saved data. */ }
    }
  });
  window.addEventListener('pagehide', () => film.pause());
})();
