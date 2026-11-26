// Bagh Chal (Tigers vs Goats) — pure game logic, no DOM.
// Works in the browser (global `BaghChal`) and in Node (module.exports) for testing.
//
// Board: 5x5 points, index = row * 5 + col.
// Every point links to its horizontal/vertical neighbours; only points where
// (row + col) is even also link diagonally. All movement uses ADJ / JUMPS.

(function (root) {
  const SIZE = 5;
  const POINTS = SIZE * SIZE;
  const GOATS_TOTAL = 20;
  const CAPTURES_TO_WIN = 5;
  const TIGER = "T";
  const GOAT = "G";

  const idx = (r, c) => r * SIZE + c;
  const rowOf = (i) => Math.floor(i / SIZE);
  const colOf = (i) => i % SIZE;
  const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  // ADJ[i] = [{ to, dr, dc }]
  const ADJ = Array.from({ length: POINTS }, (_, i) => {
    const r = rowOf(i), c = colOf(i);
    const dirs = (r + c) % 2 === 0 ? [...ORTHO, ...DIAG] : ORTHO;
    return dirs
      .filter(([dr, dc]) => inside(r + dr, c + dc))
      .map(([dr, dc]) => ({ to: idx(r + dr, c + dc), dr, dc }));
  });

  const linked = (a, b) => ADJ[a].some((n) => n.to === b);

  // JUMPS[i] = [{ over, to }]: two steps in the same direction, each along a real line
  const JUMPS = ADJ.map((neighbours, i) =>
    neighbours
      .map(({ to: mid, dr, dc }) => {
        const r = rowOf(mid) + dr, c = colOf(mid) + dc;
        if (!inside(r, c)) return null;
        const land = idx(r, c);
        return linked(mid, land) ? { over: mid, to: land } : null;
      })
      .filter(Boolean)
  );

  // Unique line segments, for drawing the board
  const LINES = [];
  ADJ.forEach((ns, a) => ns.forEach(({ to: b }) => { if (a < b) LINES.push([a, b]); }));

  function newGame() {
    const board = Array(POINTS).fill(null);
    for (const i of [idx(0, 0), idx(0, 4), idx(4, 0), idx(4, 4)]) board[i] = TIGER;
    return { board, turn: GOAT, toPlace: GOATS_TOTAL, captured: 0, over: null };
  }

  const phase = (s) => (s.toPlace > 0 ? "placement" : "movement");

  // Moves: { type: "place", to } | { type: "step", from, to } | { type: "jump", from, over, to }
  function legalMoves(s, side = s.turn) {
    const b = s.board;
    const moves = [];
    if (side === GOAT && s.toPlace > 0) {
      b.forEach((v, i) => { if (!v) moves.push({ type: "place", to: i }); });
      return moves; // goats on the board may not move during placement
    }
    b.forEach((v, from) => {
      if (v !== side) return;
      for (const { to } of ADJ[from]) if (!b[to]) moves.push({ type: "step", from, to });
      if (side === TIGER) {
        for (const { over, to } of JUMPS[from]) {
          if (b[over] === GOAT && !b[to]) moves.push({ type: "jump", from, over, to });
        }
      }
    });
    return moves;
  }

  const movesFrom = (s, from) =>
    legalMoves(s).filter((m) => m.from === from);

  const sameMove = (a, b) =>
    a.type === b.type && a.from === b.from && a.to === b.to;

  // Returns a NEW state; the input is not changed.
  function applyMove(s, move) {
    if (s.over) throw new Error("Game is over");
    if (!legalMoves(s).some((m) => sameMove(m, move))) throw new Error("Illegal move");

    const board = s.board.slice();
    let { toPlace, captured } = s;
    if (move.type === "place") {
      board[move.to] = GOAT;
      toPlace--;
    } else {
      board[move.to] = board[move.from];
      board[move.from] = null;
      if (move.type === "jump") { board[move.over] = null; captured++; }
    }
    const next = { board, turn: s.turn === GOAT ? TIGER : GOAT, toPlace, captured, over: null };
    next.over = checkEnd(next);
    return next;
  }

  // Win check for the position where `s.turn` is about to move
  function checkEnd(s) {
    if (s.captured >= CAPTURES_TO_WIN) return { winner: "tiger", reason: `${CAPTURES_TO_WIN} goats captured` };
    if (s.turn === TIGER && legalMoves(s, TIGER).length === 0) return { winner: "goat", reason: "All tigers are trapped" };
    if (s.turn === GOAT && legalMoves(s, GOAT).length === 0) return { winner: "tiger", reason: "Goats have no moves left" };
    return null;
  }

  // ---------- computer players ----------

  const isEdge = (i) => { const r = rowOf(i), c = colOf(i); return r === 0 || r === 4 || c === 0 || c === 4; };
  const isCorner = (i) => { const r = rowOf(i), c = colOf(i); return (r === 0 || r === 4) && (c === 0 || c === 4); };
  const pickBest = (scored) => {
    const top = Math.max(...scored.map((x) => x.score));
    const best = scored.filter((x) => x.score >= top - 1e-9);
    return best[Math.floor(Math.random() * best.length)].move;
  };
  // Tiger options in a position, regardless of whose turn it is
  const tigerView = (s) => ({ ...s, turn: TIGER });
  const countJumps = (s) => legalMoves(tigerView(s), TIGER).filter((m) => m.type === "jump").length;

  function tigerAI(s) {
    const moves = legalMoves(s, TIGER);
    const jumps = moves.filter((m) => m.type === "jump");
    if (jumps.length) return jumps[Math.floor(Math.random() * jumps.length)];
    const scored = moves.map((move) => {
      const after = applyMove(s, move);
      const t = tigerView(after);
      const threats = countJumps(after);
      const mobility = legalMoves(t, TIGER).length;
      return { move, score: threats * 10 + mobility + Math.random() * 0.5 };
    });
    return pickBest(scored);
  }

  function goatAI(s) {
    const moves = legalMoves(s, GOAT);
    const scored = moves.map((move) => {
      const after = applyMove(s, move);
      if (after.over && after.over.winner === "goat") return { move, score: 1e6 };
      const threats = countJumps(after);
      const tigerMobility = legalMoves(tigerView(after), TIGER).length;
      const dest = move.to;
      const friends = ADJ[dest].filter(({ to }) => after.board[to] === GOAT).length;
      const score =
        -100 * threats -
        2 * tigerMobility +
        (isEdge(dest) ? 3 : 0) +
        (isCorner(dest) ? 2 : 0) +
        1.5 * friends +
        Math.random() * 0.5;
      return { move, score };
    });
    return pickBest(scored);
  }

  const api = {
    SIZE, POINTS, GOATS_TOTAL, CAPTURES_TO_WIN, TIGER, GOAT,
    ADJ, JUMPS, LINES, idx, rowOf, colOf,
    newGame, phase, legalMoves, movesFrom, applyMove, checkEnd, tigerAI, goatAI,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BaghChal = api;
})(typeof window !== "undefined" ? window : globalThis);
