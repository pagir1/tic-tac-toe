// Home screen: screen switching, live clock + greeting, saved stats,
// a self-playing mini board on the Tic Tac Toe tile, and "coming soon" toasts.
// Relies on WIN_LINES and STORAGE_KEY from script.js, BC_STORAGE_KEY from baghchal.js,
// MR_STORAGE_KEY from momo.js.

const views = [...document.querySelectorAll(".view")];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastStats = null;
let openedFromHome = false;

// ---------- screen switching (#home, #tic-tac-toe) ----------

function showView(id) {
  const target = document.getElementById(id) || document.getElementById("home");
  for (const v of views) v.hidden = v !== target;
  target.classList.remove("entering");
  void target.offsetWidth; // restart the entrance animation
  target.classList.add("entering");
  window.scrollTo(0, 0);
  if (target.id === "home") refreshStats();
}

function route() {
  showView(location.hash.slice(1) || "home");
}

window.addEventListener("hashchange", route);

// Any tile with data-game is playable and opens that game's view
const playableTiles = [...document.querySelectorAll(".tile[data-game]")];
playableTiles.forEach((tile) => {
  tile.addEventListener("click", () => {
    openedFromHome = true;
    location.hash = tile.dataset.game;
  });
});

function goHome() {
  // Use real history when we came from home, so the phone's back gesture stays in sync
  if (openedFromHome) { openedFromHome = false; history.back(); }
  else location.hash = "home";
}
document.querySelectorAll(".back").forEach((btn) => btn.addEventListener("click", goHome));

document.getElementById("stat-live").textContent =
  `${playableTiles.length}/${document.querySelectorAll(".tile").length}`;

// ---------- "coming soon" tiles ----------

const toastEl = document.getElementById("toast");
let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  toastEl.style.animation = "none";
  void toastEl.offsetWidth;
  toastEl.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2200);
}

document.querySelectorAll(".tile.soon").forEach((tile) => {
  tile.addEventListener("click", () => {
    try { navigator.vibrate?.(10); } catch { /* not allowed */ }
    toast(`${tile.dataset.name} is coming soon. Try Tic Tac Toe!`);
  });
});

// ---------- live clock + Nepali greeting ----------

const clockEl = document.getElementById("clock");
const greetingEl = document.getElementById("greeting");

function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return "Shubha prabhat";
  if (hour >= 12 && hour < 17) return "Namaste";
  if (hour >= 17 && hour < 21) return "Shubha sandhya";
  return "Shubha ratri";
}

function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  greetingEl.innerHTML = `${greetingFor(now.getHours())}! <span class="hl">Ready to play?</span>`;
}
tickClock();
setInterval(tickClock, 15000);

// ---------- stats from saved Tic Tac Toe scores ----------

function readScores(key, defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.scores) return { ...defaults, ...saved.scores };
  } catch { /* storage unavailable */ }
  return defaults;
}

function refreshStats() {
  const t = readScores(STORAGE_KEY, { X: 0, O: 0, draw: 0 });
  const b = readScores(BC_STORAGE_KEY, { tiger: 0, goat: 0, draw: 0 });

  let m = { best: 0, played: 0, served: 0 };
  try { m = { ...m, ...JSON.parse(localStorage.getItem(MR_STORAGE_KEY)) }; } catch { /* n/a */ }

  const stats = {
    rounds: t.X + t.O + t.draw + b.tiger + b.goat + b.draw + m.played,
    momobest: m.best,
    xo: `${t.X}–${t.O}`,
    tg: `${b.tiger}–${b.goat}`,
    served: m.served,
  };
  for (const [key, value] of Object.entries(stats)) {
    const el = document.getElementById(`stat-${key}`);
    el.textContent = value;
    if (lastStats && lastStats[key] !== value) {
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
  }
  lastStats = stats;
}

// ---------- self-playing mini board ----------

const miniCells = [...document.querySelectorAll("#mini-board i")];

function miniWinner(b) {
  for (const line of WIN_LINES) {
    const [a, c, d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return line;
  }
  return null;
}

function playMiniGame() {
  const b = Array(9).fill(null);
  miniCells.forEach((c) => { c.textContent = ""; c.className = ""; });
  let turn = "X";

  const step = () => {
    const free = b.map((v, i) => (v ? null : i)).filter((i) => i !== null);
    // prefer a winning move or a block, else random, so demo games look smart
    const pick = smartPick(b, turn, free);
    b[pick] = turn;
    miniCells[pick].textContent = turn;
    miniCells[pick].className = "on";

    const line = miniWinner(b);
    if (line || free.length === 1) {
      if (line) line.forEach((i) => miniCells[i].classList.add("won"));
      setTimeout(playMiniGame, 2200);
      return;
    }
    turn = turn === "X" ? "O" : "X";
    setTimeout(step, 650);
  };
  setTimeout(step, 600);
}

function smartPick(b, turn, free) {
  const other = turn === "X" ? "O" : "X";
  for (const who of [turn, other]) {
    for (const i of free) {
      b[i] = who;
      const hit = miniWinner(b);
      b[i] = null;
      if (hit) return i;
    }
  }
  return free[Math.floor(Math.random() * free.length)];
}

function showStaticMiniBoard() {
  const demo = ["X", "", "O", "", "X", "", "O", "", "X"];
  miniCells.forEach((c, i) => (c.textContent = demo[i]));
  [0, 4, 8].forEach((i) => miniCells[i].classList.add("won"));
}

if (reduceMotion) showStaticMiniBoard();
else playMiniGame();

// ---------- start ----------
route();
