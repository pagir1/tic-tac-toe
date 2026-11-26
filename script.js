const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
];
const CPU = "O";
const HUMAN = "X";
const CPU_DELAY = 350;
const STORAGE_KEY = "ttt-state";

const gameEl = document.querySelector(".game");
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const modeEl = document.getElementById("mode");
const difficultyEl = document.getElementById("difficulty");
const scoreEls = {
  X: document.getElementById("score-x"),
  O: document.getElementById("score-o"),
  draw: document.getElementById("score-draw"),
};

let board, current, gameOver, cpuTimer;
let starter = "O"; // flipped to X on the first round
const scores = { X: 0, O: 0, draw: 0 };

// Build the 9 cells once
const cells = Array.from({ length: 9 }, (_, i) => {
  const btn = document.createElement("button");
  btn.className = "cell";
  btn.setAttribute("aria-label", `Cell ${i + 1}, empty`);
  btn.addEventListener("click", () => handleMove(i));
  boardEl.appendChild(btn);
  return btn;
});

const isCpuMode = () => modeEl.value === "cpu";

// ---------- persistence ----------

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    Object.assign(scores, saved.scores);
    if (saved.mode) modeEl.value = saved.mode;
    if (saved.difficulty) difficultyEl.value = saved.difficulty;
  } catch { /* ignore corrupt or unavailable storage */ }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      scores, mode: modeEl.value, difficulty: difficultyEl.value,
    }));
  } catch { /* storage may be unavailable */ }
}

function renderScores() {
  for (const k of Object.keys(scores)) scoreEls[k].textContent = scores[k];
}

// ---------- game flow ----------

function newRound() {
  clearTimeout(cpuTimer); // cancel a pending computer move from the old round
  board = Array(9).fill(null);
  starter = starter === "X" ? "O" : "X"; // alternate who opens
  current = starter;
  gameOver = false;
  gameEl.classList.toggle("cpu-mode", isCpuMode());
  cells.forEach((c, i) => {
    c.textContent = "";
    c.className = "cell";
    c.disabled = false;
    c.setAttribute("aria-label", `Cell ${i + 1}, empty`);
  });
  setStatus();
  maybeCpuTurn();
}

function setStatus(text) {
  if (text) return (statusEl.textContent = text);
  if (isCpuMode()) {
    statusEl.textContent = current === CPU ? "Computer is thinking…" : "Your turn (X)";
  } else {
    statusEl.textContent = `${current}'s turn`;
  }
}

function getWinner(b) {
  for (const line of WIN_LINES) {
    const [a, c, d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line };
  }
  return b.every(Boolean) ? { player: "draw" } : null;
}

function handleMove(i) {
  if (gameOver || board[i]) return;
  if (isCpuMode() && current === CPU) return; // wait for computer
  place(i);
  maybeCpuTurn();
}

function maybeCpuTurn() {
  if (gameOver || !isCpuMode() || current !== CPU) return;
  boardEl.classList.add("busy");
  cells.forEach((c) => (c.disabled = true));
  cpuTimer = setTimeout(() => {
    boardEl.classList.remove("busy");
    cells.forEach((c, i) => (c.disabled = Boolean(board[i])));
    place(cpuMove());
  }, CPU_DELAY);
}

function place(i) {
  board[i] = current;
  cells[i].textContent = current;
  cells[i].classList.add(current.toLowerCase());
  cells[i].disabled = true;
  cells[i].setAttribute("aria-label", `Cell ${i + 1}, ${current}`);

  const result = getWinner(board);
  if (result) return endRound(result);

  current = current === "X" ? "O" : "X";
  setStatus();
}

function endRound({ player, line }) {
  gameOver = true;
  cells.forEach((c) => (c.disabled = true));
  scores[player]++;
  renderScores();
  saveState();

  if (player === "draw") {
    setStatus("It's a draw!");
  } else {
    line.forEach((i) => cells[i].classList.add("win"));
    if (isCpuMode()) setStatus(player === CPU ? "Computer wins!" : "You win! 🎉");
    else setStatus(`${player} wins!`);
  }
}

// ---------- computer opponent ----------

function emptyCells(b) {
  return b.reduce((acc, v, i) => (v ? acc : [...acc, i]), []);
}

function randomMove() {
  const free = emptyCells(board);
  return free[Math.floor(Math.random() * free.length)];
}

// Easy: random. Medium: best move 60% of the time. Hard: unbeatable minimax.
function cpuMove() {
  const level = difficultyEl.value;
  if (level === "easy") return randomMove();
  if (level === "medium" && Math.random() < 0.4) return randomMove();
  return bestMove();
}

function bestMove() {
  let best = -Infinity;
  let moves = [];
  for (const i of emptyCells(board)) {
    board[i] = CPU;
    const score = minimax(board, 0, false);
    board[i] = null;
    if (score > best) { best = score; moves = [i]; }
    else if (score === best) moves.push(i);
  }
  // pick randomly among equally good moves so games vary
  return moves[Math.floor(Math.random() * moves.length)];
}

function minimax(b, depth, isMax) {
  const result = getWinner(b);
  if (result) {
    if (result.player === CPU) return 10 - depth;
    if (result.player === HUMAN) return depth - 10;
    return 0;
  }
  let best = isMax ? -Infinity : Infinity;
  for (const i of emptyCells(b)) {
    b[i] = isMax ? CPU : HUMAN;
    const score = minimax(b, depth + 1, !isMax);
    b[i] = null;
    best = isMax ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

// ---------- wiring ----------

document.getElementById("restart").addEventListener("click", newRound);
document.getElementById("reset").addEventListener("click", () => {
  Object.keys(scores).forEach((k) => (scores[k] = 0));
  renderScores();
  saveState();
  starter = "O"; // next round starts with X
  newRound();
});
modeEl.addEventListener("change", () => {
  saveState();
  starter = "O";
  newRound();
});
difficultyEl.addEventListener("change", saveState);

loadState();
renderScores();
newRound();
