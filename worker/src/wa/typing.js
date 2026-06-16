const { config } = require('../config');

function typingMsFor(text) {
  const len = typeof text === 'string' ? text.length : 0;
  return Math.min(1500 + len * config.typingPerCharMs, config.typingMaxMs);
}

async function simulate(chat, ms) {
  if (!chat || !ms) return;
  try {
    await chat.sendStateTyping();
  } catch {
    /* ignore */
  }
  await sleep(ms);
  try {
    await chat.clearState();
  } catch {
    /* ignore */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { typingMsFor, simulate, sleep };
