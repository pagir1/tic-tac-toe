// Account UI: guest name popup, "Save your scores" sign-in, profile menu,
// points on the result screens, confetti, and the on-device play streak.
// Data and logins come from window.NG (online.js). Exposes window.NGUI and
// window.ngReportResult (called by the games when a round ends).

(function () {
  const NG = window.NG;
  const $ = (id) => document.getElementById(id);
  const ACT_KEY = "ng-activity";
  const BANNER_KEY = "ng-banner-hidden";
  const GAME_NAMES = { "tic-tac-toe": "Tic Tac Toe", "bagh-chal": "Bagh Chal", "momo-rush": "Momo Rush" };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- activity: streak, days played, last game (this device) ----------

  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const shiftDay = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dayKey(d); };

  function activity() {
    try { return { days: [], lastGame: null, ...JSON.parse(localStorage.getItem(ACT_KEY)) }; }
    catch { return { days: [], lastGame: null }; }
  }
  function saveActivity(a) {
    try { localStorage.setItem(ACT_KEY, JSON.stringify(a)); } catch { /* n/a */ }
  }

  const Activity = {
    // a finished round of any game counts as playing today
    markPlayed(game) {
      const a = activity();
      const today = dayKey();
      if (!a.days.includes(today)) a.days = [...a.days, today].slice(-21);
      if (game) a.lastGame = game;
      saveActivity(a);
    },
    openedGame(game) {
      const a = activity();
      a.lastGame = game;
      saveActivity(a);
    },
    lastGame: () => activity().lastGame,
    // consecutive days ending today (or yesterday, so the chip doesn't vanish in the morning)
    streak() {
      const days = new Set(activity().days);
      let start = days.has(dayKey()) ? 0 : days.has(shiftDay(-1)) ? -1 : null;
      if (start === null) return 0;
      let n = 0;
      while (days.has(shiftDay(start - n))) n++;
      return n;
    },
    playedToday: () => activity().days.includes(dayKey()),
    // Monday..Sunday of this week: true / false / null (future)
    week() {
      const days = new Set(activity().days);
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const k = dayKey(d);
        return k > dayKey(now) ? null : days.has(k);
      });
    },
  };

  // ---------- helpers ----------

  const initial = (name) => (name ? Array.from(name.trim())[0].toUpperCase() : "👤");
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  function maskEmail(email) {
    const [user, domain] = String(email).split("@");
    if (!domain) return "";
    return `${Array.from(user)[0] || ""}***@${domain}`;
  }
  function toast(text) {
    const el = $("toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.hidden = true), 3200);
  }

  // ---------- modals (same look as the game modals) ----------

  const stack = [];
  function openModal(m, focusEl) {
    if (!m.hidden) return;
    stack.push({ m, back: document.activeElement });
    m.hidden = false;
    setTimeout(() => (focusEl || m.querySelector("input, button:not(.ng-x)"))?.focus(), 30);
  }
  function closeModal(m) {
    if (m.hidden) return;
    m.hidden = true;
    const i = stack.findIndex((s) => s.m === m);
    const entry = i >= 0 ? stack.splice(i, 1)[0] : null;
    if (entry?.back && document.contains(entry.back)) entry.back.focus?.();
  }
  document.querySelectorAll(".ng-modal").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-close]")) closeModal(m);
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && stack.length) closeModal(stack[stack.length - 1].m);
  });

  // ---------- name popup ----------

  const nameModal = $("ng-name");
  const nameInput = $("ng-name-input");
  const nameMsg = $("ng-name-msg");
  let nameMode = "guest"; // guest | rename | needed
  let afterName = null;

  const suggestBtn = $("ng-name-suggest");
  function showNameError(r) {
    nameMsg.textContent = r?.error || "";
    suggestBtn.hidden = !r?.suggestion;
    if (r?.suggestion) {
      suggestBtn.querySelector("b").textContent = r.suggestion;
      suggestBtn.dataset.name = r.suggestion;
    }
  }
  suggestBtn.addEventListener("click", () => {
    nameInput.value = suggestBtn.dataset.name;
    showNameError(null);
    nameInput.focus();
  });

  function askName(mode = "guest", then = null, hint = null) {
    nameMode = mode;
    afterName = then;
    $("ng-name-title").textContent = mode === "rename" ? "Change your name" : "What should we call you?";
    $("ng-name-go").textContent = mode === "guest" ? "Let's play" : "Save";
    $("ng-name-signin").hidden = mode !== "guest";
    nameInput.value = mode === "rename" ? NG.displayName() : "";
    showNameError(hint);
    openModal(nameModal, nameInput);
  }

  nameInput.addEventListener("input", () => showNameError(null));
  $("ng-name-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const problem = NG.nameProblem(nameInput.value);
    if (problem) { showNameError({ error: problem }); nameInput.focus(); return; }
    const btn = $("ng-name-go");
    btn.disabled = true;
    const r = nameMode === "guest" && !NG.user ? await NG.startGuest(nameInput.value) : await NG.changeName(nameInput.value);
    btn.disabled = false;
    if (r.error) { showNameError(r); nameInput.focus(); return; }
    closeModal(nameModal);
    const then = afterName;
    afterName = null;
    then?.();
  });
  $("ng-name-signin").addEventListener("click", () => {
    closeModal(nameModal);
    openSignIn();
  });

  // Run fn once the player has a name (first "Play" on this device asks for one)
  function withName(fn) {
    if (NG.displayName()) return fn();
    askName("guest", fn);
  }

  // ---------- sign in / save scores ----------

  const signModal = $("ng-signin");
  const signMsg = $("ng-signin-msg");
  let codeChannel = "email";

  function showStep(step) {
    for (const s of ["choose", "email", "code"]) $(`ng-step-${s}`).hidden = s !== step;
    signMsg.textContent = "";
    signMsg.className = "ng-msg";
    const focus = { choose: $("ng-google"), email: $("ng-email-input"), code: $("ng-code-input") }[step];
    setTimeout(() => focus?.focus(), 30);
  }

  function openSignIn() {
    const guest = NG.isGuest();
    $("ng-signin-title").textContent = guest ? "Save your scores forever" : "Sign in";
    $("ng-signin-sub").textContent = guest
      ? "Keep your name and scores, and play on any device."
      : "Welcome back. Your scores are waiting.";
    $("ng-google").hidden = !NG.signIn.google;
    $("ng-use-email").hidden = !NG.signIn.email;
    $("ng-use-phone").hidden = !NG.signIn.phone;
    showStep("choose");
    openModal(signModal, $("ng-google"));
    if (NG.status === "offline") setSignMsg("Scores are offline right now, so sign-in isn't available.", true);
  }

  function setSignMsg(text, isError) {
    signMsg.textContent = text || "";
    signMsg.className = isError ? "ng-msg error" : "ng-msg";
  }

  async function busy(btn, work) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.classList.add("busy");
    try { return await work(); }
    finally { btn.disabled = false; btn.classList.remove("busy"); btn.textContent = label; }
  }

  $("ng-google").addEventListener("click", (e) => busy(e.currentTarget, async () => {
    setSignMsg("Opening Google…");
    const r = await NG.google();
    if (r.error) setSignMsg(r.error, true);
  }));
  $("ng-use-email").addEventListener("click", () => {
    codeChannel = "email";
    $("ng-email-label").textContent = "Your email";
    const input = $("ng-email-input");
    input.type = "email"; input.inputMode = "email"; input.autocomplete = "email"; input.placeholder = "you@example.com";
    showStep("email");
  });
  $("ng-use-phone").addEventListener("click", () => {
    codeChannel = "phone";
    $("ng-email-label").textContent = "Your phone number (with country code)";
    const input = $("ng-email-input");
    input.type = "tel"; input.inputMode = "tel"; input.autocomplete = "tel"; input.placeholder = "+977 98…";
    showStep("email");
  });
  signModal.querySelectorAll("[data-step]").forEach((b) =>
    b.addEventListener("click", () => showStep(b.dataset.step)));

  $("ng-step-email").addEventListener("submit", (e) => {
    e.preventDefault();
    busy($("ng-send-code"), async () => {
      setSignMsg("Sending…");
      const value = $("ng-email-input").value;
      const r = await NG.sendCode(codeChannel === "phone" ? { phone: value } : { email: value });
      if (r.error) return setSignMsg(r.error, true);
      $("ng-code-to").textContent = value.trim();
      $("ng-code-input").value = "";
      showStep("code");
      if (r.existing) setSignMsg("You already have an account. Enter the code to sign in, and we'll move your guest scores into it.");
    });
  });
  $("ng-code-input").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
    if (e.target.value.length === 6) $("ng-step-code").requestSubmit();
  });
  $("ng-step-code").addEventListener("submit", (e) => {
    e.preventDefault();
    busy($("ng-verify"), async () => {
      setSignMsg("Checking…");
      const r = await NG.verifyCode($("ng-code-input").value);
      if (r.error) return setSignMsg(r.error, true);
      closeModal(signModal);
      showNotice();
      if (NG.needsName) askName("needed", null, NG.nameHint);
    });
  });

  function showNotice() {
    if (!NG.notice) return;
    toast(NG.notice.text);
    NG.notice = null;
  }

  // ---------- profile menu ----------

  const profModal = $("ng-profile");

  function renderProfile() {
    const name = NG.displayName();
    $("ng-prof-letter").textContent = initial(name);
    $("ng-prof-name").textContent = name || "Not signed in";
    $("ng-prof-rename").hidden = !name;
    const guest = NG.isGuest();
    const saved = NG.isSaved();
    let status;
    if (saved) status = `Saved ✓ ${maskEmail(NG.email())}`.trim();
    else if (guest) status = `Guest · deleted in ${plural(NG.guestDaysLeft(), "day")}`;
    else if (name) status = NG.status === "offline" ? "Playing offline on this device" : "Guest";
    else status = "Pick a name the first time you play.";
    $("ng-prof-status").textContent = status;
    $("ng-prof-status").className = `ng-prof-status ${saved ? "saved" : guest ? "guest" : ""}`;

    const best = NG.snapshot?.best_week;
    $("ng-prof-best").hidden = !best;
    $("ng-prof-best").textContent = best ? `🏆 Best week ever: ${best} pts` : "";

    $("ng-prof-share").hidden = !(NG.snapshot?.me?.points > 0);
    $("ng-prof-save").hidden = !guest;
    $("ng-prof-signin").hidden = guest || saved;
    $("ng-prof-signout").hidden = !saved;
    $("ng-prof-delete").hidden = !(guest || saved || name);
    $("ng-confirm").hidden = true;
    $("ng-prof-actions").hidden = false;
    $("ng-prof-msg").textContent = "";

    // streak week
    const streak = Activity.streak();
    $("ng-week-title").textContent = streak
      ? `🔥 ${plural(streak, "day")} in a row`
      : "🔥 Play today to start a streak";
    const labels = ["M", "T", "W", "T", "F", "S", "S"];
    $("ng-week").innerHTML = "";
    Activity.week().forEach((v, i) => {
      const li = document.createElement("li");
      li.className = v ? "on" : v === false ? "off" : "future";
      li.innerHTML = `<small>${labels[i]}</small><i>${v ? "✓" : ""}</i>`;
      $("ng-week").appendChild(li);
    });
  }

  function openProfile() {
    renderProfile();
    openModal(profModal);
  }

  $("ng-prof-share").addEventListener("click", () => challenge(weeklyTotal()));
  $("ng-prof-rename").addEventListener("click", () => { closeModal(profModal); askName("rename"); });
  $("ng-prof-save").addEventListener("click", () => { closeModal(profModal); openSignIn(); });
  $("ng-prof-signin").addEventListener("click", () => { closeModal(profModal); openSignIn(); });
  $("ng-prof-signout").addEventListener("click", (e) => busy(e.currentTarget, async () => {
    await NG.signOut();
    closeModal(profModal);
    toast("Signed out");
  }));
  $("ng-prof-delete").addEventListener("click", () => {
    $("ng-prof-actions").hidden = true;
    $("ng-confirm").hidden = false;
    $("ng-confirm-no").focus();
  });
  $("ng-confirm-no").addEventListener("click", () => {
    $("ng-confirm").hidden = true;
    $("ng-prof-actions").hidden = false;
  });
  $("ng-confirm-yes").addEventListener("click", (e) => busy(e.currentTarget, async () => {
    const r = await NG.deleteAccount();
    if (r.error) { $("ng-prof-msg").textContent = r.error; return; }
    closeModal(profModal);
    toast("Your account and scores were deleted.");
  }));

  // ---------- result screens ----------

  function confetti() {
    if (reduceMotion) return;
    const box = $("ng-confetti");
    box.innerHTML = "";
    const colors = ["#fbbf24", "#f43f5e", "#60a5fa", "#34d399", "#f472b6", "#fde68a"];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement("i");
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = `${Math.random() * 0.4}s`;
      p.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
      p.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
      p.style.setProperty("--spin", `${Math.random() * 720}deg`);
      box.appendChild(p);
    }
    clearTimeout(confetti.t);
    confetti.t = setTimeout(() => (box.innerHTML = ""), 3200);
  }

  function line(cls, text) {
    const p = document.createElement("p");
    p.className = cls;
    p.textContent = text;
    return p;
  }
  function linkLine(text, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ng-link ng-result-link";
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  const ERRORS = {
    daily_limit: "Daily points limit reached. Come back tomorrow!",
    too_soon: "That was quick! Wait a few seconds between games for points to count.",
    offline: "Scores offline. This result wasn't saved.",
    failed: "Couldn't save this result. Try again later.",
  };

  // ---------- "Challenge a friend 📤" ----------

  const SITE_URL = "https://pagir1.github.io/tic-tac-toe/";
  const challengeText = (pts) => `I have ${pts} pts on Nepaligames 👑 Can you beat me? ${SITE_URL}`;
  // this week's total across all games (same number as the leaderboard)
  const weeklyTotal = (atLeast = 0) => Math.max(NG.snapshot?.me?.points || 0, atLeast);

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { /* n/a */ }
      ta.remove();
      return ok;
    }
  }

  // Phones: the share sheet. Computers: copy the text.
  async function challenge(pts) {
    const text = challengeText(pts);
    const phone = window.matchMedia("(pointer: coarse)").matches;
    if (phone && navigator.share) {
      try { await navigator.share({ text }); return; }
      catch (e) { if (e.name === "AbortError") return; } // closed the share sheet
    }
    toast(await copyText(text) ? "Link copied!" : "Couldn't copy. Long-press to copy the link instead.");
  }

  function challengeButton(getPoints) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ng-share";
    b.textContent = "Challenge a friend 📤";
    b.addEventListener("click", () => challenge(getPoints()));
    return b;
  }

  // Called by the games when a round ends.
  // { game, mode: "cpu" | "pvp" | "solo", points, side, note, container, win }
  async function reportResult({ game, mode, points = 0, side = null, note = "", container = null, win = false }) {
    Activity.markPlayed(game);
    if (mode !== "cpu" || !container) return;
    container.innerHTML = "";
    container.hidden = false;
    const gameName = GAME_NAMES[game] || "this game";

    container.appendChild(line(`ng-result-pts ${points ? "" : "zero"}`, points ? `+${points} pts` : "No points this time"));
    if (note) container.appendChild(line("ng-result-note", note));
    const status = line("ng-result-status", points ? "Saving…" : "");
    container.appendChild(status);

    if (!points) {
      const me = NG.snapshot?.games?.[game]?.me;
      status.textContent = me ? `Your week: ${me.points} pts · #${me.rank} in ${gameName}` : "";
      return;
    }
    if (!NG.displayName()) {
      status.textContent = "";
      container.appendChild(linkLine("Add your name to keep these points →", () =>
        askName("guest", async () => {
          status.textContent = "Saving…";
          showSaved(await NG.submitScore(game, points, side));
        })));
      return;
    }
    showSaved(await NG.submitScore(game, points, side));

    function showSaved(r) {
      container.querySelector(".ng-result-link")?.remove();
      if (r.error === "name_taken") {
        status.textContent = "";
        container.appendChild(linkLine("That name is taken. Pick another to keep these points →", () =>
          askName("needed", async () => {
            status.textContent = "Saving…";
            showSaved(await NG.submitScore(game, points, side));
          }, { error: r.text, suggestion: r.suggestion })));
        return;
      }
      if (r.error) {
        status.textContent = ERRORS[r.error] || ERRORS.failed;
        status.classList.add(r.error === "daily_limit" ? "warn" : "muted");
        return;
      }
      status.textContent = `Your week: ${r.weekly} pts · #${r.rank} in ${gameName}`;
      if (r.new_champion) {
        container.insertBefore(line("ng-result-crown", "👑 You're the new champion!"), container.firstChild);
        confetti();
        try { navigator.vibrate?.([40, 60, 40, 60, 80]); } catch { /* n/a */ }
      }
      if (win) container.appendChild(challengeButton(() => weeklyTotal(r.weekly)));
      if (NG.isGuest()) {
        container.appendChild(linkLine("Save your scores so they don't disappear →", () => {
          container.closest(".modal")?.setAttribute("hidden", "");
          openSignIn();
        }));
      }
    }
  }

  // ---------- after a Google redirect ----------
  NG.onChange((what) => {
    if (what === "auth") {
      showNotice();
      if (NG.needsName && nameModal.hidden) askName("needed", null, NG.nameHint);
    }
  });

  window.ngReportResult = reportResult;
  window.NGUI = {
    Activity, askName, withName, openSignIn, openProfile, toast, initial, plural,
    openModal, closeModal, challengeText,
    bannerHiddenToday: () => { try { return localStorage.getItem(BANNER_KEY) === dayKey(); } catch { return false; } },
    hideBannerToday: () => { try { localStorage.setItem(BANNER_KEY, dayKey()); } catch { /* n/a */ } },
  };
})();
