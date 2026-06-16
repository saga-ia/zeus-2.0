// Time-bounded set for deduping: "have I seen this key in the last N ms?"
// Also used for outbound hash dedupe to avoid sending identical messages in a row.

class TimedSet {
  constructor(ttlMs) {
    this.ttl = ttlMs;
    this.map = new Map();
  }

  add(key) {
    this.prune();
    this.map.set(key, Date.now());
  }

  has(key) {
    this.prune();
    return this.map.has(key);
  }

  size() {
    this.prune();
    return this.map.size;
  }

  prune() {
    const cutoff = Date.now() - this.ttl;
    for (const [k, t] of this.map) {
      if (t < cutoff) this.map.delete(k);
    }
  }
}

module.exports = { TimedSet };
