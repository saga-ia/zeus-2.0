const { EventEmitter } = require('node:events');

const STATES = ['initializing', 'qr', 'authenticated', 'ready', 'disconnected', 'auth_failure'];

class StateMachine extends EventEmitter {
  constructor() {
    super();
    this.current = 'initializing';
    this.since = Date.now();
    this.qr = null;
    this.meNumber = null;
    this.meName = null;
    this.lastError = null;
  }

  transition(to, extra = {}) {
    if (!STATES.includes(to)) throw new Error(`invalid state ${to}`);
    const from = this.current;
    this.current = to;
    this.since = Date.now();
    Object.assign(this, extra);
    this.emit('change', { from, to, extra });
  }
}

module.exports = { StateMachine, STATES };
