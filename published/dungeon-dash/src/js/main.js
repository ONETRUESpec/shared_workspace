/* Dungeon Dash — boot, game loop and hot-reload hooks. Loaded last. */
(function (DD) {
  'use strict';

  const STEP = 1 / 60; // fixed battle step
  const MAX_STEPS = 240; // per frame, so ×3 speed after a stall can't freeze the tab
  const OFFLINE_MIN_MS = 60 * 1000;

  let acc = 0;
  let last = 0;
  let hiddenAt = 0;

  function frame(ts) {
    const dt = Math.min(0.25, Math.max(0, (ts - last) / 1000));
    last = ts;
    try {
      const speed = DD.state.s.settings.speed || 1;
      acc += dt * speed;
      let steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        DD.battle.update(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps >= MAX_STEPS) acc = 0;
      DD.state.tick(dt);
      DD.render.draw(dt);
      DD.ui.frame(dt);
    } catch (err) {
      console.error('[DD.main] frame failed', err);
    }
    requestAnimationFrame(frame);
  }

  function showOffline() {
    const summary = DD.state.collectOffline(Date.now());
    if (summary) DD.ui.showOffline(summary);
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      DD.state.save();
    } else if (hiddenAt && Date.now() - hiddenAt >= OFFLINE_MIN_MS) {
      hiddenAt = 0;
      showOffline();
    } else {
      hiddenAt = 0;
    }
  }

  function start(hotData) {
    const fromHot = hotData && typeof hotData.save === 'string' && DD.state.deserialize(hotData.save);
    if (!fromHot) DD.state.load();

    DD.sprites.init();
    DD.ui.init(document.getElementById('app'));
    DD.render.init(document.getElementById('battle-canvas'));
    DD.audio.init();
    DD.battle.init();

    if (!fromHot) showOffline();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', () => DD.state.save());

    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.snapshot === 'function') {
      hot.snapshot(() => ({ save: DD.state.serialize() }));
    }

    requestAnimationFrame((t) => {
      last = t;
      requestAnimationFrame(frame);
    });
  }

  function boot() {
    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.ready === 'function') hot.ready(start);
    else start((hot && hot.data) || {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.DD);
