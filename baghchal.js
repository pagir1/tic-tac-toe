// Bagh Chal — UI layer. All rules live in baghchal-logic.js (global BaghChal).
// Same patterns as Tic Tac Toe: 2 players or vs computer, scores in localStorage.

const BC_STORAGE_KEY = "baghchal-state";

(function () {
  const BC = window.BaghChal;
  const { TIGER, GOAT, GOATS_TOTAL, CAPTURES_TO_WIN } = BC;
  const CPU_DELAY = 400;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ICON = { T: "🐅", G: "🐐" };
  const NAME = { T: "Tiger", G: "Goat" };

  const $ = (id) => document.getElementById(id);
  const gameEl = document.querySelector("#bagh-chal .game");
  const svg = $("bc-board");
  const modeEl = $("bc-mode");
  const sideEl = $("bc-side");
  const statusEl = $("bc-status");
  const overModal = $("bc-over");
  const helpModal = $("bc-help");

  const scores = { tiger: 0, goat: 0, draw: 0 };
  let state, history, selected, cpuTimer;
  let pieceIds, pieceEls, nextId; // UI-only identity so pieces can animate

  // Point i -> SVG coordinates (viewBox 0..100, 10 units of padding)
  const px = (i) => 10 + BC.colOf(i) * 20;
  const py = (i) => 10 + BC.rowOf(i) * 20;

  // ---------- storage ----------

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(BC_STORAGE_KEY));
      if (!saved) return;
      Object.assign(scores, saved.scores);
      if (saved.mode) modeEl.value = saved.mode;
      if (saved.side) sideEl.value = saved.side;
    } catch { /* storage unavailable */ }
  }
  function save() {
    try {
      localStorage.setItem(BC_STORAGE_KEY, JSON.stringify({
        scores, mode: modeEl.value, side: sideEl.value,
      }));
    } catch { /* storage unavailable */ }
  }

  // ---------- board drawing ----------

  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };

  el("rect", { class: "bc-bg", x: 2, y: 2, width: 96, height: 96, rx: 6 }, svg);
  const linesLayer = el("g", { class: "bc-lines" }, svg);
  const hintsLayer = el("g", { class: "bc-hints" }, svg);
  const piecesLayer = el("g", { class: "bc-pieces" }, svg);
  const hitsLayer = el("g", { class: "bc-hits" }, svg);

  for (const [a, b] of BC.LINES) {
    el("line", { x1: px(a), y1: py(a), x2: px(b), y2: py(b) }, linesLayer);
  }
  const dots = [];
  const hits = [];
  for (let i = 0; i < BC.POINTS; i++) {
    dots.push(el("circle", { class: "bc-point", cx: px(i), cy: py(i), r: 1.6 }, linesLayer));
    const hit = el("circle", {
      class: "bc-hit", cx: px(i), cy: py(i), r: 9.5, tabindex: 0, role: "button",
    }, hitsLayer);
    hit.addEventListener("click", () => onPoint(i));
    hit.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPoint(i); }
    });
    hits.push(hit);
  }

  function makePiece(type, at, entering) {
    const outer = el("g", { class: `bc-piece ${type === TIGER ? "tiger" : "goat"}` }, piecesLayer);
    outer.style.transform = `translate(${px(at)}px, ${py(at)}px)`;
    const inner = el("g", { class: entering ? "bc-piece-body enter" : "bc-piece-body" }, outer);
    el("circle", { class: "bc-ring", r: 8.2 }, inner);
    el("circle", { class: "bc-disc", r: 7 }, inner);
    const t = el("text", { class: "bc-emoji", "text-anchor": "middle", "dominant-baseline": "central", y: 0.6 }, inner);
    t.textContent = ICON[type];
    return outer;
  }

  function rebuildPieces() {
    piecesLayer.textContent = "";
    pieceIds = Array(BC.POINTS).fill(null);
    pieceEls = new Map();
    nextId = 1;
    state.board.forEach((v, i) => {
      if (!v) return;
      const id = nextId++;
      pieceIds[i] = id;
      pieceEls.set(id, makePiece(v, i, false));
    });
  }

  // Move piece elements to match a move, with animation
  function animateMove(move, mover) {
    if (move.type === "place") {
      const id = nextId++;
      pieceIds[move.to] = id;
      pieceEls.set(id, makePiece(GOAT, move.to, true));
      return;
    }
    const id = pieceIds[move.from];
    pieceIds[move.from] = null;
    pieceIds[move.to] = id;
    const node = pieceEls.get(id);
    piecesLayer.appendChild(node); // moving piece draws on top
    node.style.transform = `translate(${px(move.to)}px, ${py(move.to)}px)`;
    if (move.type === "jump") {
      const gid = pieceIds[move.over];
      pieceIds[move.over] = null;
      const goatNode = pieceEls.get(gid);
      pieceEls.delete(gid);
      goatNode.classList.add("captured");
      setTimeout(() => goatNode.remove(), 450);
    }
  }

  // ---------- rendering ----------

  const isCpu = () => modeEl.value === "cpu";
  const humanSide = () => sideEl.value;
  const isCpuTurn = () => isCpu() && state.turn !== humanSide();
  const canAct = () => !state.over && !isCpuTurn();

  function render() {
    gameEl.classList.toggle("cpu-mode", isCpu());
    const placing = state.toPlace > 0;

    $("bc-phase").textContent = placing ? "Placement" : "Movement";
    $("bc-to-place").textContent = `${state.toPlace}/${GOATS_TOTAL}`;
    $("bc-captured").textContent = `${state.captured}/${CAPTURES_TO_WIN}`;
    for (const k of Object.keys(scores)) $(`bc-score-${k}`).textContent = scores[k];

    statusEl.textContent = statusText();

    // hints
    hintsLayer.textContent = "";
    const legal = canAct() ? BC.legalMoves(state) : [];
    if (canAct() && state.turn === GOAT && placing) {
      legal.forEach((m) => el("circle", { class: "bc-hint place", cx: px(m.to), cy: py(m.to), r: 2.6 }, hintsLayer));
    } else if (selected !== null) {
      legal.filter((m) => m.from === selected).forEach((m) => {
        const cls = m.type === "jump" ? "bc-hint capture" : "bc-hint step";
        el("circle", { class: cls, cx: px(m.to), cy: py(m.to), r: m.type === "jump" ? 6.5 : 3 }, hintsLayer);
        if (m.type === "jump") {
          el("circle", { class: "bc-hint threatened", cx: px(m.over), cy: py(m.over), r: 9 }, hintsLayer);
        }
      });
    }

    // piece states
    const movable = new Set(legal.map((m) => m.from).filter((f) => f !== undefined));
    pieceIds.forEach((id, i) => {
      if (!id) return;
      const node = pieceEls.get(id);
      node.classList.toggle("selected", i === selected);
      node.classList.toggle("movable", movable.has(i) && i !== selected);
    });

    // accessible labels on points
    hits.forEach((h, i) => {
      const v = state.board[i];
      h.setAttribute("aria-label",
        `Row ${BC.rowOf(i) + 1}, column ${BC.colOf(i) + 1}: ${v ? NAME[v] : "empty"}`);
    });

    $("bc-undo").disabled = state.over || history.length === 0;
    $("bc-draw").disabled = Boolean(state.over);
  }

  function statusText() {
    if (state.over) {
      if (state.over.winner === "draw") return "Draw agreed";
      return `${state.over.winner === "tiger" ? "🐅 Tigers" : "🐐 Goats"} win!`;
    }
    const side = state.turn;
    if (isCpuTurn()) return `Computer (${NAME[side]}s) is thinking…`;
    const who = isCpu() ? "Your turn" : `${ICON[side]} ${NAME[side]}'s turn`;
    if (side === GOAT) return state.toPlace > 0 ? `${who}: place a goat` : `${who}: move a goat`;
    return `${who}: move or capture`;
  }

  // ---------- input ----------

  function onPoint(i) {
    if (!canAct()) return;
    const v = state.board[i];

    if (state.turn === GOAT && state.toPlace > 0) {
      if (!v) play({ type: "place", to: i });
      return;
    }
    if (selected !== null) {
      if (i === selected) { selected = null; return render(); }
      const move = BC.movesFrom(state, selected).find((m) => m.to === i);
      if (move) return play(move);
    }
    selected = v === state.turn && BC.movesFrom(state, i).length ? i : null;
    render();
  }

  function play(move) {
    history.push(state);
    const mover = state.turn;
    state = BC.applyMove(state, move);
    selected = null;
    animateMove(move, mover);
    try { navigator.vibrate?.(move.type === "jump" ? [20, 40, 20] : 12); } catch { /* n/a */ }
    render();
    if (state.over) finish();
    else maybeCpu();
  }

  function maybeCpu() {
    clearTimeout(cpuTimer);
    if (state.over || !isCpuTurn()) return;
    cpuTimer = setTimeout(() => {
      const move = state.turn === TIGER ? BC.tigerAI(state) : BC.goatAI(state);
      play(move);
    }, CPU_DELAY);
  }

  // ---------- game flow ----------

  function restart() {
    clearTimeout(cpuTimer);
    hideModal(overModal);
    state = BC.newGame();
    history = [];
    selected = null;
    rebuildPieces();
    render();
    maybeCpu();
  }

  function undo() {
    if (state.over || !history.length) return;
    clearTimeout(cpuTimer);
    state = history.pop();
    // vs computer: go back to the player's own turn
    while (isCpu() && state.turn !== humanSide() && history.length) state = history.pop();
    selected = null;
    rebuildPieces();
    render();
    maybeCpu();
  }

  function finish() {
    clearTimeout(cpuTimer);
    const { winner, reason } = state.over;
    scores[winner]++;
    save();
    render();
    try { if (winner !== "draw") navigator.vibrate?.([30, 60, 30]); } catch { /* n/a */ }

    let title, icon = winner === "tiger" ? "🐅" : winner === "goat" ? "🐐" : "🤝";
    if (winner === "draw") title = "It's a draw";
    else if (isCpu()) title = winner === (humanSide() === TIGER ? "tiger" : "goat") ? "You win! 🎉" : "Computer wins";
    else title = winner === "tiger" ? "Tigers win!" : "Goats win!";
    $("bc-over-icon").textContent = icon;
    $("bc-over-title").textContent = title;
    $("bc-over-reason").textContent = reason;
    setTimeout(() => showModal(overModal, $("bc-again")), winner === "draw" ? 0 : 650);
  }

  function offerDraw() {
    if (state.over) return;
    state = { ...state, over: { winner: "draw", reason: "Both players agreed to end the game." } };
    selected = null;
    finish();
  }

  // ---------- modals ----------

  let lastFocus = null;
  function showModal(m, focusEl) {
    lastFocus = document.activeElement;
    m.hidden = false;
    (focusEl || m.querySelector("button")).focus();
  }
  function hideModal(m) {
    if (m.hidden) return;
    m.hidden = true;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  [overModal, helpModal].forEach((m) =>
    m.addEventListener("click", (e) => { if (e.target === m && m === helpModal) hideModal(m); }));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideModal(helpModal);
  });

  // ---------- wiring ----------

  $("bc-restart").addEventListener("click", restart);
  $("bc-undo").addEventListener("click", undo);
  $("bc-draw").addEventListener("click", offerDraw);
  $("bc-again").addEventListener("click", restart);
  $("bc-home").addEventListener("click", () => {
    hideModal(overModal);
    restart();
    document.querySelector("#bagh-chal .back").click();
  });
  $("bc-rules").addEventListener("click", () => showModal(helpModal, $("bc-help-close")));
  $("bc-help-close").addEventListener("click", () => hideModal(helpModal));
  modeEl.addEventListener("change", () => { save(); restart(); });
  sideEl.addEventListener("change", () => { save(); restart(); });

  load();
  restart();
})();
