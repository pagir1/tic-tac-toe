// Momo Rush — UI layer. All rules live in momo-logic.js (global MomoRush).

const MR_STORAGE_KEY = "momorush-state";

(function () {
  const MR = window.MomoRush;
  const { FILLINGS, STYLES } = MR;
  const $ = (id) => document.getElementById(id);
  const view = $("momo-rush");
  const queueEl = $("mr-queue");
  const slotsEl = $("mr-slots");
  const plateEl = $("mr-plate");
  const hintEl = $("mr-hint");
  const recipeEl = $("mr-recipe");
  const controlsEl = view.querySelector(".mr-controls");
  const fxEl = $("mr-fx");
  const bannerEl = $("mr-banner");
  const modals = { start: $("mr-start"), paused: $("mr-paused"), over: $("mr-over") };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const saved = { best: 0, played: 0, served: 0, muted: false, tutorialDone: false };
  const TUTORIAL_ORDERS = 3; // first-time players get arrows for this many orders
  let tutorial = false;
  const coachEl = $("mr-coach");
  const coachStepsEl = $("mr-coach-steps");
  const gameEl = view.querySelector(".game");
  let coachTarget = null;
  let game = null;
  let running = false;
  let lastFrame = 0;
  let tickets = new Map(); // order id -> element
  let hintTimer, bannerTimer;
  let plateFor = null; // order id the plate is set up for

  // ---------- storage ----------
  function load() {
    try { Object.assign(saved, JSON.parse(localStorage.getItem(MR_STORAGE_KEY)) || {}); }
    catch { /* storage unavailable */ }
  }
  function save() {
    try { localStorage.setItem(MR_STORAGE_KEY, JSON.stringify(saved)); }
    catch { /* storage unavailable */ }
  }

  const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* n/a */ } };

  // ---------- sound: tiny synth, no audio files ----------
  let audio = null;
  function tone(freq, dur = 0.08, type = "sine", vol = 0.15, delay = 0, slideTo = null) {
    if (saved.muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const t = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* audio unavailable */ }
  }
  const sfx = {
    add: () => tone(520, 0.07, "triangle", 0.12, 0, 780),
    achar: () => tone(300, 0.12, "sawtooth", 0.06, 0, 900),
    serve: (combo) => { const b = 660 + Math.min(combo, 8) * 40; tone(b, 0.1, "triangle"); tone(b * 1.5, 0.16, "triangle", 0.15, 0.08); },
    mistake: () => tone(150, 0.18, "square", 0.08, 0, 110),
    leave: () => { tone(440, 0.15, "sine", 0.12, 0, 330); tone(330, 0.25, "sine", 0.12, 0.14, 220); },
    level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, "triangle", 0.13, i * 0.09)),
    count: (go) => tone(go ? 880 : 440, go ? 0.25 : 0.1, "square", 0.07),
    over: () => [392, 330, 262].forEach((f, i) => tone(f, 0.22, "triangle", 0.13, i * 0.16)),
  };
  function renderSound() {
    const b = $("mr-sound");
    b.textContent = saved.muted ? "🔇" : "🔊";
    b.setAttribute("aria-label", saved.muted ? "Sound off" : "Sound on");
    b.setAttribute("aria-pressed", String(!saved.muted));
  }
  const onScreen = () => !view.hidden && !document.hidden;

  // ---------- modals ----------
  function show(name) {
    for (const [k, m] of Object.entries(modals)) m.hidden = k !== name;
    if (name) modals[name].querySelector(".primary").focus();
  }

  // ---------- game flow ----------
  function start() {
    game = new MR.Game();
    tutorial = !saved.tutorialDone;
    gameEl.classList.toggle("tutorial", tutorial);
    queueEl.textContent = "";
    tickets = new Map();
    renderPlate();
    renderHud();
    syncTickets();
    updateHint();
    show(null);
    countdown();
  }

  // 3-2-1-Go before the clock starts
  let countdownToken = 0;
  function countdown() {
    const el = $("mr-countdown");
    const token = ++countdownToken;
    const steps = reduceMotion ? ["Go!"] : ["3", "2", "1", "Go!"];
    let i = 0;
    const next = () => {
      if (token !== countdownToken || !game) return;
      if (i === steps.length) { el.hidden = true; resume(); return; }
      el.textContent = steps[i];
      el.hidden = false;
      restartAnim(el, "pop");
      sfx.count(steps[i] === "Go!");
      i++;
      setTimeout(next, steps[i - 1] === "Go!" ? 450 : 650);
    };
    next();
  }

  function resume() {
    if (!game || game.over) return;
    show(null);
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function pause() {
    if (!running) {
      // paused during the countdown: cancel it and show the pause menu
      if (game && !game.over && !$("mr-countdown").hidden) { countdownToken++; $("mr-countdown").hidden = true; show("paused"); }
      return;
    }
    running = false;
    show("paused");
  }

  function finish() {
    running = false;
    const isBest = game.score > saved.best;
    saved.best = Math.max(saved.best, game.score);
    saved.played++;
    saved.served += game.momos;
    save();
    $("mr-final-score").textContent = game.score;
    $("mr-final-momos").textContent = game.momos;
    $("mr-final-level").textContent = game.level;
    $("mr-final-combo").textContent = game.bestCombo;
    $("mr-best-over").textContent = saved.best;
    $("mr-best-start").textContent = saved.best;
    $("mr-newbest").hidden = !(isBest && game.score > 0);
    buzz([40, 80, 40]);
    sfx.over();
    setTimeout(() => {
      show("over");
      if (isBest && game.score > 0) confetti();
    }, 500);
  }

  function frame(now) {
    if (!running) return;
    if (!onScreen()) { pause(); return; }
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    // first-time players: the clock doesn't run during their very first order
    const learning = tutorial && game.served === 0;
    handle(game.tick(learning ? 0 : dt));
    if (!running) return;
    updateBars();
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function onTap(kind, value, btn) {
    if (!running || !game) return;
    const events = game.tap(kind, value);
    handle(events, btn);
  }

  function handle(events, btn) {
    for (const e of events) {
      switch (e.type) {
        case "add":
          addMomo();
          buzz(8);
          sfx.add();
          break;
        case "achar":
          $("mr-achar-dish").hidden = false;
          buzz(8);
          sfx.achar();
          break;
        case "serve":
          if (tutorial && game.served >= TUTORIAL_ORDERS) endTutorial();
          serveFx(e);
          buzz(e.perfect ? [15, 30, 15] : 15);
          sfx.serve(game.combo);
          break;
        case "mistake":
          mistakeFx(e.reason, btn);
          break;
        case "timeout":
          leaveFx(e.id);
          break;
        case "levelup":
          banner(levelMessage(e.level));
          restartAnim(view.querySelector(".mr-kitchen"), "flash");
          sfx.level();
          break;
        case "over":
          finish();
          break;
      }
    }
    if (events.length) {
      syncTickets();
      renderHud();
      if (!events.some((e) => e.type === "mistake")) updateHint();
      // new customer at the front (after a serve, a walk-out, or arriving to an empty shop)
      if ((game.active?.id ?? null) !== plateFor) renderPlate();
    }
  }

  function levelMessage(level) {
    if (level === 2) return "Level 2 · Bigger orders: up to 2 momos";
    if (level === 3) return "Level 3 · 🌶️ Achar orders start!";
    if (level === 4) return "Level 4 · Up to 3 momos per order";
    return `Level ${level} · Customers are hungrier!`;
  }

  // ---------- rendering ----------
  function renderHud() {
    $("mr-score").textContent = game.score;
    $("mr-level").textContent = game.level;
    const mult = MR.pointsFor({ qty: 0, achar: false, patience: 0, max: 1 }, game.combo + 1).mult;
    $("mr-combo").textContent = mult > 1 ? `🔥×${mult}` : `×${mult}`;
    $("mr-combo").parentElement.classList.toggle("hot", mult > 1);
    const lives = $("mr-lives");
    lives.textContent = "❤️".repeat(game.lives) + "🤍".repeat(MR.START_LIVES - game.lives);
    lives.setAttribute("aria-label", `${game.lives} lives`);
    $("mr-achar-btn").hidden = game.level < 3;
    $("mr-fillings").classList.toggle("four", game.level >= 3);
  }

  function orderText(o) {
    return `${o.qty}× ${FILLINGS[o.filling].label}, ${STYLES[o.style].label}${o.achar ? ", with achar" : ""}`;
  }

  function syncTickets() {
    for (const o of game.queue) {
      if (tickets.has(o.id)) continue;
      const t = document.createElement("div");
      t.className = "mr-ticket";
      t.setAttribute("role", "group");
      t.setAttribute("aria-label", orderText(o));
      t.innerHTML = `
        <span class="mr-avatar">${o.avatar}</span>
        <span class="mr-order">
          <span class="mr-qty">${o.qty}×</span><span class="mr-ico">${FILLINGS[o.filling].icon}</span>
          <span class="mr-ico">${STYLES[o.style].icon}</span>${o.achar ? '<span class="mr-ico">🌶️</span>' : ""}
        </span>
        <span class="mr-words">${FILLINGS[o.filling].label} · ${STYLES[o.style].label}</span>
        <span class="mr-bar"><i></i></span>`;
      queueEl.appendChild(t);
      tickets.set(o.id, t);
    }
    const activeId = game.active?.id;
    for (const [id, t] of tickets) t.classList.toggle("active", id === activeId);
    updateBars();
  }

  function updateBars() {
    for (const o of game.queue) {
      const t = tickets.get(o.id);
      if (!t) continue;
      const f = Math.max(0, o.patience / o.max);
      const bar = t.querySelector(".mr-bar i");
      bar.style.transform = `scaleX(${f})`;
      t.dataset.mood = f > 0.5 ? "happy" : f > 0.25 ? "waiting" : "angry";
    }
  }

  function removeTicket(id, cls) {
    const t = tickets.get(id);
    if (!t) return;
    tickets.delete(id);
    t.classList.remove("active");
    t.classList.add(cls);
    setTimeout(() => t.remove(), reduceMotion ? 0 : 380);
  }

  function renderPlate() {
    slotsEl.textContent = "";
    $("mr-achar-dish").hidden = true;
    const o = game?.active;
    plateFor = o ? o.id : null;
    const qty = o ? o.qty : 1;
    plateEl.dataset.steam = 0;
    for (let i = 0; i < qty; i++) {
      const s = document.createElement("span");
      s.className = "mr-slot";
      slotsEl.appendChild(s);
    }
  }

  function addMomo() {
    const slot = slotsEl.querySelector(".mr-slot:not(.filled)");
    if (!slot) return;
    slot.classList.add("filled");
    slot.textContent = "🥟";
    plateEl.dataset.steam = slotsEl.querySelectorAll(".filled").length;
  }

  // Shows the player exactly what to do next:
  // - the recipe strip above the buttons (step 1 filling with dots, [achar], step 2 cook)
  // - the target button filled solid with a "×N taps left" badge, other buttons faded
  // - on levels 1-2 also a bouncing "👇 TAP" tag
  function updateHint() {
    clearTimeout(hintTimer);
    hintEl.classList.remove("bad");
    view.querySelectorAll(".mr-btn").forEach((b) => {
      b.classList.remove("next", "coach");
      b.querySelector(".tap-count")?.remove();
    });
    const o = game?.active;
    if (!o) {
      hintEl.textContent = "Waiting for customers…";
      recipeEl.innerHTML = '<span class="mr-recipe-wait">Waiting for the next customer…</span>';
      hideCoach();
      controlsEl.classList.remove("guiding");
      return;
    }

    const F = FILLINGS[o.filling], St = STYLES[o.style];
    const left = o.qty - game.plate.made;
    const stage = left > 0 ? "fill" : o.achar && !game.plate.achar ? "achar" : "cook";
    const order = ["fill", ...(o.achar ? ["achar"] : []), "cook"];

    // recipe strip
    const dots = "●".repeat(game.plate.made) + "○".repeat(left);
    const bodies = {
      fill: `${F.icon} ${F.label} <span class="mr-dots" aria-label="${game.plate.made} of ${o.qty} made">${dots}</span>`,
      achar: "🌶️ Achar",
      cook: `${St.icon} ${St.label}`,
    };
    recipeEl.innerHTML = order.map((key, i) => {
      const state = key === stage ? "current" : i < order.indexOf(stage) ? "done" : "";
      return `<span class="mr-step ${state}"><b class="mr-num">${state === "done" ? "✓" : i + 1}</b>${bodies[key]}</span>`;
    }).join('<span class="mr-arrow" aria-hidden="true">→</span>');

    // hint line + target button
    let target;
    if (stage === "fill") {
      hintEl.textContent = `Tap ${F.icon} ${F.label}${left > 1 ? ` ${left} times` : ""}`;
      target = `[data-kind="filling"][data-value="${o.filling}"]`;
    } else if (stage === "achar") {
      hintEl.textContent = "Tap 🌶️ Achar";
      target = `[data-kind="achar"]`;
    } else {
      hintEl.textContent = `Tap ${St.icon} ${St.label} to cook & serve`;
      target = `[data-kind="style"][data-value="${o.style}"]`;
    }
    const btn = view.querySelector(`.mr-btn${target}`);
    if (btn) {
      btn.classList.add("next");
      if (game.level <= 2) btn.classList.add("coach"); // training wheels
      if (stage === "fill") {
        const badge = document.createElement("span");
        badge.className = "tap-count";
        badge.textContent = `×${left}`;
        badge.setAttribute("aria-hidden", "true");
        btn.appendChild(badge);
      }
    }
    controlsEl.classList.add("guiding");

    // first-time tutorial: bubble with an arrow right above the button to tap
    if (tutorial && btn) {
      coachEl.textContent =
        stage === "fill" ? `Tap ${F.icon} ${F.label} here${left > 1 ? ` (${left} times)` : ""}`
        : stage === "achar" ? "Tap 🌶️ Achar here"
        : `Now tap ${St.icon} ${St.label} to cook & serve`;
      coachTarget = btn;
      coachEl.hidden = false;
      placeCoach();
      coachStepsEl.textContent = game.served === 0
        ? "👆 Follow these steps · no rush on your first order"
        : "👆 Follow these steps";
      coachStepsEl.hidden = false;
    } else {
      hideCoach();
    }
  }

  function placeCoach() {
    if (!coachTarget) return;
    const host = gameEl.getBoundingClientRect();
    const b = coachTarget.getBoundingClientRect();
    const w = coachEl.offsetWidth;
    const center = b.left + b.width / 2 - host.left;
    const left = Math.max(4, Math.min(center - w / 2, host.width - w - 4));
    coachEl.style.left = `${left}px`;
    coachEl.style.top = `${b.bottom - host.top + 14}px`; // below the button, arrow points up
    coachEl.style.setProperty("--arrow-x", `${center - left}px`);
  }

  function hideCoach() {
    coachEl.hidden = true;
    coachStepsEl.hidden = true;
    coachTarget = null;
  }

  function endTutorial() {
    tutorial = false;
    gameEl.classList.remove("tutorial");
    saved.tutorialDone = true;
    save();
    $("mr-tutorial-again").hidden = false;
    hideCoach();
    banner("You've got it! Now be quick 🔥");
  }

  // ---------- effects ----------
  function floatText(text, cls) {
    const n = document.createElement("span");
    n.className = `mr-float ${cls}`;
    n.textContent = text;
    fxEl.appendChild(n);
    setTimeout(() => n.remove(), 900);
  }

  function serveFx(e) {
    removeTicket(e.id, "served");
    // the plate is reset for the next customer right away, so animate a copy
    const ghost = slotsEl.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.classList.add("mr-ghost");
    fxEl.appendChild(ghost);
    setTimeout(() => ghost.remove(), 600);
    floatText(`+${e.points}${e.mult > 1 ? `  ×${e.mult}` : ""}`, e.perfect ? "good" : "ok");
  }

  function mistakeFx(reason, btn) {
    buzz(60);
    sfx.mistake();
    hintEl.textContent = reason;
    hintEl.classList.add("bad");
    restartAnim(plateEl, "shake");
    if (btn) restartAnim(btn, "wrong");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(updateHint, 1100);
  }

  function leaveFx(id) {
    removeTicket(id, "left");
    floatText("💔 Customer left", "bad");
    restartAnim($("mr-lives"), "shake");
    buzz([80, 40, 80]);
    sfx.leave();
  }

  function restartAnim(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function confetti() {
    if (reduceMotion) return;
    const box = $("mr-confetti");
    box.textContent = "";
    const colors = ["#dc143c", "#003893", "#f59e0b", "#16a34a", "#ec4899", "#0ea5e9"];
    for (let i = 0; i < 40; i++) {
      const c = document.createElement("i");
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = `${Math.random() * 0.5}s`;
      c.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
      c.style.setProperty("--spin", `${Math.random() * 720 - 360}deg`);
      box.appendChild(c);
    }
    setTimeout(() => (box.textContent = ""), 3200);
  }

  function banner(text) {
    bannerEl.textContent = text;
    bannerEl.hidden = false;
    restartAnim(bannerEl, "in");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (bannerEl.hidden = true), 2200);
  }

  // ---------- wiring ----------
  view.querySelectorAll(".mr-btn").forEach((btn) =>
    btn.addEventListener("click", () => onTap(btn.dataset.kind, btn.dataset.value, btn)));

  // Desktop shortcuts: 1/2/3 fillings, 4 or A achar, Q/W/E cooking
  const KEYS = { 1: ["filling", "veg"], 2: ["filling", "chicken"], 3: ["filling", "buff"],
    4: ["achar"], a: ["achar"], q: ["style", "steam"], w: ["style", "fry"], e: ["style", "jhol"] };
  document.addEventListener("keydown", (ev) => {
    if (view.hidden) return;
    if (ev.key === "Escape" || ev.key === "p") { togglePause(); return; }
    const k = KEYS[ev.key.toLowerCase()];
    if (!k || !running) return;
    const btn = view.querySelector(`.mr-btn[data-kind="${k[0]}"]${k[1] ? `[data-value="${k[1]}"]` : ""}`);
    if (btn && !btn.hidden) { ev.preventDefault(); onTap(k[0], k[1], btn); }
  });

  const goHome = () => view.querySelector(".back").click();
  $("mr-sound").addEventListener("click", () => {
    saved.muted = !saved.muted;
    save();
    renderSound();
    if (!saved.muted) sfx.add();
  });
  // Pause while playing or counting down; from the pause menu, resume with a countdown
  function togglePause() {
    if (!game || game.over) return;
    if (!modals.paused.hidden) { show(null); countdown(); }
    else pause();
  }
  $("mr-pause").addEventListener("click", togglePause);
  $("mr-go").addEventListener("click", start);
  $("mr-tutorial-again").addEventListener("click", () => {
    saved.tutorialDone = false;
    save();
    start();
  });
  window.addEventListener("resize", () => { if (!coachEl.hidden) placeCoach(); });
  // resuming after a pause gets a short countdown too, so it isn't a surprise
  $("mr-resume").addEventListener("click", () => { show(null); countdown(); });
  $("mr-restart").addEventListener("click", start);
  $("mr-again").addEventListener("click", start);
  $("mr-quit").addEventListener("click", () => { running = false; countdownToken++; game = null; show("start"); goHome(); });
  $("mr-home").addEventListener("click", () => { game = null; show("start"); goHome(); });

  // Pause when leaving the screen or switching apps
  // (deferred: home.js switches the views in its own hashchange handler)
  window.addEventListener("hashchange", () => setTimeout(() => { if (view.hidden && running) pause(); }, 0));
  document.addEventListener("visibilitychange", () => { if (document.hidden && running) pause(); });

  load();
  renderSound();
  $("mr-tutorial-again").hidden = !saved.tutorialDone;
  $("mr-best-start").textContent = saved.best;
  renderPlate();
})();
