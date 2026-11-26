// Home screen: screen switching, the weekly champion, game cards with crowns,
// the weekly leaderboard, streak, "continue playing", and the guest banner.
// Data comes from window.NG (online.js); popups from window.NGUI (account.js).
// Relies on WIN_LINES from script.js and MR_STORAGE_KEY from momo.js.

const views = [...document.querySelectorAll(".view")];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let openedFromHome = false;

const LIVE_GAMES = ["tic-tac-toe", "bagh-chal"];
const GAME_INFO = {
  "tic-tac-toe": { name: "Tic Tac Toe", sub: "Beat the computer", cls: "t-ttt", icon: "❌" },
  "bagh-chal": { name: "Bagh Chal", sub: "Tigers vs goats", cls: "t-bagh", icon: "🐅" },
  "momo-rush": { name: "Momo Rush", sub: "Fold fast, serve hot", cls: "t-momo", icon: "🥟" },
};
const $ = (id) => document.getElementById(id);

// ---------- screen switching (#home, #tic-tac-toe, ...) ----------

function showView(id) {
  const target = document.getElementById(id) || document.getElementById("home");
  for (const v of views) v.hidden = v !== target;
  target.classList.remove("entering");
  void target.offsetWidth; // restart the entrance animation
  target.classList.add("entering");
  window.scrollTo(0, 0);
  document.documentElement.classList.toggle("on-home", target.id === "home");
  if (target.id === "home") {
    renderHome();
    NG.refresh(); // fresh top scores every time the player comes back
  } else if (GAME_INFO[target.id]) {
    NGUI.Activity.openedGame(target.id);
  }
}

function route() {
  showView(location.hash.slice(1) || "home");
}
window.addEventListener("hashchange", route);

function openGame(id) {
  NGUI.withName(() => {
    openedFromHome = true;
    location.hash = id;
  });
}

function goHome() {
  // Use real history when we came from home, so the phone's back gesture stays in sync
  if (openedFromHome) { openedFromHome = false; history.back(); }
  else location.hash = "home";
}
document.querySelectorAll(".back").forEach((btn) => btn.addEventListener("click", goHome));

document.querySelectorAll(".ng-card[data-game]").forEach((card) =>
  card.addEventListener("click", () => openGame(card.dataset.game)));

document.querySelectorAll(".ng-soon-card").forEach((tile) => {
  tile.addEventListener("click", () => {
    try { navigator.vibrate?.(10); } catch { /* not allowed */ }
    NGUI.toast(`${tile.dataset.name} is coming soon. Try Bagh Chal!`);
  });
});

// ---------- header, banner, greeting, streak ----------

$("ng-avatar").addEventListener("click", () => NGUI.openProfile());
$("ng-banner-link").addEventListener("click", () => NGUI.openSignIn());
$("ng-banner-close").addEventListener("click", () => {
  NGUI.hideBannerToday();
  $("ng-banner").hidden = true;
});

function renderPlayer() {
  const name = NG.displayName();
  $("ng-avatar-letter").textContent = NGUI.initial(name);
  $("ng-avatar").setAttribute("aria-label", name ? `Your profile: ${name}` : "Your profile");
  $("ng-hello-pre").textContent = name ? "Namaste, " : "Namaste";
  $("ng-hello-name").textContent = name;

  const days = NG.guestDaysLeft();
  $("ng-banner").hidden = !days || NGUI.bannerHiddenToday();
  if (days) $("ng-banner-days").textContent = NGUI.plural(days, "day");

  const streak = NGUI.Activity.streak();
  $("ng-streak").hidden = streak < 1;
  $("ng-streak-text").textContent = NGUI.plural(streak, "day");

  const last = NGUI.Activity.lastGame();
  const info = GAME_INFO[last];
  $("ng-continue").hidden = !info;
  if (info) {
    $("ng-continue-row").className = `ng-continue-row ${info.cls}`;
    $("ng-continue-icon").innerHTML = document.querySelector(`.ng-card[data-game="${last}"] .ng-card-icon`)?.innerHTML || info.icon;
    $("ng-continue-icon").querySelector("#mini-board")?.removeAttribute("id");
    $("ng-continue-name").textContent = info.name;
    $("ng-continue-sub").textContent = info.sub;
    $("ng-continue-row").onclick = () => openGame(last);
  }

  let mr = { best: 0 };
  try { mr = { ...mr, ...JSON.parse(localStorage.getItem(MR_STORAGE_KEY)) }; } catch { /* n/a */ }
  $("ng-momo-best").textContent = mr.best ? `🏆 Your best: ${mr.best}` : "🏆 Set your first best score";
}

// ---------- champion, game cards, leaderboard ----------

function setText(el, text, cls) {
  el.textContent = text;
  if (cls !== undefined) el.className = cls;
}
const pts = (n) => `${Number(n || 0).toLocaleString()} pts`;

function renderScores() {
  const state = NG.snapshot && NG.snapshotState !== "offline" ? "ready" : NG.snapshotState;
  const snap = NG.snapshot;

  // ----- hero: this week's champion across all games
  const hero = $("ng-hero");
  const heroBtn = $("ng-hero-btn");
  const top = snap?.top?.[0];
  hero.dataset.state = state === "ready" ? (top ? (top.is_me ? "me" : "other") : "empty") : state;
  heroBtn.hidden = true;
  if (state === "loading") {
    $("ng-hero-name").innerHTML = '<span class="skel wide"></span>';
    $("ng-hero-pts").innerHTML = '<span class="skel"></span>';
  } else if (state === "offline") {
    setText($("ng-hero-name"), "Scores offline");
    setText($("ng-hero-pts"), "You can still play every game.");
  } else if (!top) {
    setText($("ng-hero-name"), "No champion yet");
    setText($("ng-hero-pts"), "This week's crown is up for grabs. Be the first!");
    heroBtn.hidden = false;
    heroBtn.textContent = "Play now →";
    heroBtn.onclick = () => openGame(NGUI.Activity.lastGame() && LIVE_GAMES.includes(NGUI.Activity.lastGame()) ? NGUI.Activity.lastGame() : "bagh-chal");
  } else {
    setText($("ng-hero-name"), top.is_me ? `${top.name} (you!)` : top.name);
    setText($("ng-hero-pts"), top.is_me ? `👑 ${pts(top.points)} · That's you!` : `👑 ${pts(top.points)} this week`);
    heroBtn.hidden = false;
    if (top.is_me) {
      heroBtn.textContent = "Defend your crown →";
      const last = NGUI.Activity.lastGame();
      heroBtn.onclick = () => openGame(LIVE_GAMES.includes(last) ? last : "bagh-chal");
    } else {
      heroBtn.textContent = "Beat them →";
      heroBtn.onclick = () => openGame(closestGame(snap));
    }
  }

  // ----- game cards
  for (const game of LIVE_GAMES) {
    const card = document.querySelector(`.ng-card[data-board="${game}"]`);
    const crown = card.querySelector(".ng-crown");
    const you = card.querySelector(".ng-you");
    const nudge = card.querySelector(".ng-nudge");
    const g = snap?.games?.[game] || {};
    you.hidden = nudge.hidden = true;
    crown.className = "ng-crown";
    if (state === "loading") { crown.innerHTML = '<span class="skel"></span>'; continue; }
    if (state === "offline") { setText(crown, "Scores offline", "ng-crown muted"); continue; }
    if (!g.champion) { setText(crown, "No champion yet. Be the first! 👑", "ng-crown empty"); continue; }
    crown.textContent = "";
    const nm = document.createElement("span");
    nm.className = "ng-crown-name";
    nm.textContent = `👑 ${g.champion.name}`;
    const pt = document.createElement("span");
    pt.className = "ng-crown-pts";
    pt.textContent = ` · ${pts(g.champion.points)}`;
    crown.append(nm, pt);
    if (!NG.displayName()) continue;
    you.hidden = nudge.hidden = false;
    const mine = g.me?.points || 0;
    setText(you, g.me ? `You: ${pts(mine)} · #${g.me.rank}` : "You: 0 pts");
    if (g.champion.is_me) setText(nudge, "You're the champion! 👑", "ng-nudge champ");
    else setText(nudge, `${pts(g.champion.points - mine + 1)} to take the crown 👑`, "ng-nudge");
  }

  // ----- weekly leaderboard
  const board = $("ng-board");
  board.dataset.state = state;
  board.innerHTML = "";
  if (state === "loading") {
    for (let i = 0; i < 3; i++) board.insertAdjacentHTML("beforeend", '<li class="ng-row skel-row"><span class="skel"></span></li>');
    return;
  }
  if (state === "offline") { board.innerHTML = '<li class="ng-row empty">Scores offline</li>'; return; }
  const rows = snap.top || [];
  if (!rows.length) { board.innerHTML = '<li class="ng-row empty">No scores yet this week. Be the first!</li>'; return; }
  rows.forEach((r) => board.appendChild(row(r.rank, r.name, r.points, r.is_me)));
  if (snap.me && !rows.some((r) => r.is_me)) {
    const gap = document.createElement("li");
    gap.className = "ng-row-gap";
    gap.setAttribute("aria-hidden", "true");
    gap.textContent = "⋯";
    board.appendChild(gap);
    board.appendChild(row(snap.me.rank, NG.displayName() || "You", snap.me.points, true));
  }
}

function row(rank, name, points, isMe) {
  const li = document.createElement("li");
  li.className = `ng-row${isMe ? " me" : ""}`;
  const medal = ["🥇", "🥈", "🥉"][rank - 1];
  const r = document.createElement("span");
  r.className = medal ? "ng-rank medal" : "ng-rank";
  r.textContent = medal || rank;
  r.setAttribute("aria-label", `Rank ${rank}`);
  const who = document.createElement("span");
  who.className = "ng-who";
  const n = document.createElement("b");
  n.textContent = name;
  who.appendChild(n);
  if (isMe) {
    const s = document.createElement("small");
    s.textContent = "You";
    who.appendChild(s);
  }
  const p = document.createElement("span");
  p.className = "ng-pts";
  p.textContent = Number(points).toLocaleString();
  li.append(r, who, p);
  return li;
}

// Game where the player is closest to that game's champion (and not already it)
function closestGame(snap) {
  let best = null;
  for (const game of LIVE_GAMES) {
    const g = snap?.games?.[game];
    if (!g?.champion) return game; // an empty crown is the easiest one to take
    if (g.champion.is_me) continue;
    const gap = g.champion.points - (g.me?.points || 0);
    if (!best || gap < best.gap) best = { game, gap };
  }
  return best?.game || "bagh-chal";
}

function renderHome() {
  renderPlayer();
  renderScores();
}

NG.onChange(() => { if (!$("home").hidden) renderHome(); });

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
