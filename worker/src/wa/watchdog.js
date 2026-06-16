const logger = require('../logger');
const { config } = require('../config');

function attachWatchdog({ state, recreate }) {
  let timer = null;

  function tick() {
    if (state.current === 'authenticated') {
      const stuckMs = Date.now() - state.since;
      if (stuckMs > config.authWatchdogMs) {
        logger.warn({ stuckMs }, 'watchdog: stuck in authenticated, recreating client');
        recreate('watchdog_stuck_authenticated');
      }
    }
  }

  function start() {
    stop();
    timer = setInterval(tick, 15000);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop };
}

module.exports = { attachWatchdog };
