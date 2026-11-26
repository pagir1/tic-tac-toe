// Momo Rush — pure game logic, no DOM.
// Browser: global `MomoRush`. Node: module.exports (for testing).
//
// Customers queue with orders (filling + cooking style + quantity, sometimes achar).
// The player serves the FIRST customer: tap the filling once per momo, add achar
// if asked, then tap the cooking style to serve. Customers who run out of patience
// leave and cost a life. Every 5 orders served raises the level.

(function (root) {
  const FILLINGS = {
    veg: { icon: "🥬", label: "Veg" },
    chicken: { icon: "🍗", label: "Chicken" },
    buff: { icon: "🐃", label: "Buff" },
  };
  const STYLES = {
    steam: { icon: "♨️", label: "Steam" },
    fry: { icon: "🔥", label: "Fry" },
    jhol: { icon: "🍲", label: "Jhol" },
  };
  const AVATARS = ["👵", "👴", "🧑", "👩", "🧔", "👨‍🦱", "👩‍🦱", "🧑‍🎓", "👲", "🧕", "👱", "🧒"];
  const START_LIVES = 3;
  const MAX_QUEUE = 4;
  const SERVES_PER_LEVEL = 5;
  const MISTAKE_PENALTY = 1.5; // seconds of patience lost on a wrong tap

  const keys = Object.keys;
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

  // ---------- difficulty curve ----------
  const levelFor = (served) => 1 + Math.floor(served / SERVES_PER_LEVEL);
  const maxQty = (level) => (level >= 4 ? 3 : level >= 2 ? 2 : 1);
  const acharChance = (level) => (level >= 3 ? Math.min(0.5, 0.2 + (level - 3) * 0.1) : 0);
  // Seconds a customer waits, plus extra time per extra momo.
  // Levels 1-5 ease in; from level 6 it gets much faster each level.
  const patienceFor = (level, qty) => {
    if (level <= 5) return 16 - (level - 1) * 1.3 + (qty - 1) * 2.5;          // 16s -> 10.8s
    if (level <= 10) return 10.8 - (level - 5) * 1.1 + (qty - 1) * 1.8;       // L6 9.7s ... L10 5.3s
    return Math.max(3.5, 5.3 - (level - 10) * 0.3) + (qty - 1) * 1.5;         // keeps tightening, floor 3.5s
  };
  // Seconds between new customers.
  const spawnGap = (level) => {
    if (level <= 5) return 6 - (level - 1) * 0.5;                              // 6s -> 4s
    if (level <= 10) return 4 - (level - 5) * 0.45;                            // L6 3.55s ... L10 1.75s
    return Math.max(0.9, 1.75 - (level - 10) * 0.15);                          // keeps tightening, floor 0.9s
  };

  function makeOrder(level, rng, id) {
    const qty = 1 + Math.floor(rng() * maxQty(level));
    const patience = patienceFor(level, qty);
    return {
      id,
      avatar: pick(AVATARS, rng),
      filling: pick(keys(FILLINGS), rng),
      style: pick(keys(STYLES), rng),
      qty,
      achar: rng() < acharChance(level),
      patience,
      max: patience,
    };
  }

  // points = 10 per momo + achar bonus + speed bonus, times the combo multiplier
  function pointsFor(order, combo) {
    const base = order.qty * 10 + (order.achar ? 5 : 0);
    const speed = Math.round(10 * Math.max(0, order.patience / order.max));
    const mult = Math.min(5, 1 + Math.floor(combo / 3)); // x2 after 3 perfect orders, up to x5
    return { points: (base + speed) * mult, mult };
  }

  class Game {
    constructor(rng = Math.random) {
      this.rng = rng;
      this.nextId = 1;
      this.score = 0;
      this.lives = START_LIVES;
      this.combo = 0;       // perfect orders in a row
      this.bestCombo = 0;
      this.served = 0;      // orders
      this.momos = 0;       // momos served
      this.level = 1;
      this.time = 0;
      this.over = false;
      this.queue = [this.newOrder()];
      this.spawnIn = spawnGap(1);
      this.resetPlate();
    }

    newOrder() { return makeOrder(this.level, this.rng, this.nextId++); }
    resetPlate() { this.plate = { made: 0, achar: false, clean: true }; }
    get active() { return this.queue[0] || null; }

    // Advance time by dt seconds. Returns a list of events for the UI.
    tick(dt) {
      if (this.over) return [];
      const events = [];
      this.time += dt;

      for (const o of this.queue) o.patience -= dt;
      const gone = this.queue.filter((o) => o.patience <= 0);
      for (const o of gone) {
        const wasActive = o === this.active;
        this.queue.splice(this.queue.indexOf(o), 1);
        if (wasActive) this.resetPlate();
        this.lives--;
        this.combo = 0;
        events.push({ type: "timeout", id: o.id, lives: this.lives });
      }
      if (this.lives <= 0) {
        this.lives = 0;
        this.over = true;
        events.push({ type: "over" });
        return events;
      }

      this.spawnIn -= dt;
      if (this.queue.length === 0) this.spawnIn = Math.min(this.spawnIn, 0.4);
      if (this.spawnIn <= 0) {
        if (this.queue.length < MAX_QUEUE) {
          const o = this.newOrder();
          this.queue.push(o);
          events.push({ type: "spawn", id: o.id });
        }
        this.spawnIn = spawnGap(this.level);
      }
      return events;
    }

    mistake(reason) {
      this.combo = 0;
      this.plate.clean = false;
      if (this.active) this.active.patience = Math.max(0.05, this.active.patience - MISTAKE_PENALTY);
      return [{ type: "mistake", reason }];
    }

    // kind: "filling" | "style" | "achar"
    tap(kind, value) {
      if (this.over) return [];
      const o = this.active;
      if (!o) return this.mistake("No customer yet");

      if (kind === "filling") {
        if (value !== o.filling) return this.mistake(`Wrong! Tap ${FILLINGS[o.filling].icon} ${FILLINGS[o.filling].label}`);
        if (this.plate.made >= o.qty) return this.mistake("Enough momos! Now cook them");
        this.plate.made++;
        return [{ type: "add", made: this.plate.made, qty: o.qty }];
      }

      if (kind === "achar") {
        if (!o.achar) return this.mistake("No achar on this order");
        if (this.plate.achar) return this.mistake("Achar already added");
        this.plate.achar = true;
        return [{ type: "achar" }];
      }

      if (kind === "style") {
        if (this.plate.made < o.qty) return this.mistake(`Make ${o.qty - this.plate.made} more first`);
        if (o.achar && !this.plate.achar) return this.mistake("Add achar first 🌶️");
        if (value !== o.style) return this.mistake(`Wrong! Tap ${STYLES[o.style].icon} ${STYLES[o.style].label}`);

        const perfect = this.plate.clean;
        if (perfect) this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const { points, mult } = pointsFor(o, this.combo);
        this.score += points;
        this.served++;
        this.momos += o.qty;
        this.queue.shift();
        this.resetPlate();

        const events = [{ type: "serve", id: o.id, points, mult, perfect }];
        const lvl = levelFor(this.served);
        if (lvl > this.level) {
          this.level = lvl;
          events.push({ type: "levelup", level: lvl });
        }
        if (this.queue.length === 0) this.spawnIn = Math.min(this.spawnIn, 0.6);
        return events;
      }
      return [];
    }
  }

  const api = {
    FILLINGS, STYLES, START_LIVES, MAX_QUEUE, SERVES_PER_LEVEL, MISTAKE_PENALTY,
    levelFor, maxQty, acharChance, patienceFor, spawnGap, makeOrder, pointsFor, Game,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MomoRush = api;
})(typeof window !== "undefined" ? window : globalThis);
