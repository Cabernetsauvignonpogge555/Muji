const { bootstrap } = require('./_bootstrap.js');

(async () => {
  const { config, bgm, notifier } = bootstrap();
  if (config.get('bgm.auto_start')) {
    try { await bgm.start(); } catch (err) {
      console.error('[Muji] BGM auto-start failed:', err.message);
    }
  }
  await notifier.notify('session_start');
})();
