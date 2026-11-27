// Online layer: Supabase logins (guest or saved), profiles and weekly scores.
// Everything here is optional. If Supabase can't be reached, games still work
// and the top-score spots show "Scores offline".
// Exposes window.NG. UI lives in account.js and home.js.

(function () {
  const cfg = window.NG_CONFIG || {};
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.min.js";
  const NAME_KEY = "ng-name";          // the name this device plays under
  const MERGE_KEY = "ng-merge";        // guest -> existing account hand-over in progress
  const RETURN_KEY = "ng-return";      // where to land after a Google redirect
  const SNAP_KEY = "ng-snapshot";      // last leaderboard, shown instantly on the next visit
  const PROFILE_KEY = "ng-profile";    // last known profile, so the name and status show instantly
  // where supabase-js keeps the login on this device (persistSession)
  const AUTH_KEY = cfg.url ? `sb-${new URL(cfg.url).hostname.split(".")[0]}-auth-token` : "";
  const GUEST_DAYS = 4;
  const DAY = 86400000;
  const TIMEOUT = 9000;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* n/a */ } },
    json(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  };

  // ---------- 1. Back from Google: put the player where they were, at once ----------
  const query = new URLSearchParams(location.search);
  const frag = location.hash.includes("=") ? new URLSearchParams(location.hash.slice(1)) : new URLSearchParams();
  const authReturn = {
    code: query.get("code"),
    error: query.get("error_code") || frag.get("error_code") || query.get("error") || frag.get("error"),
    errorText: query.get("error_description") || frag.get("error_description"),
  };
  if (authReturn.code || authReturn.error) {
    const back = store.json(RETURN_KEY);
    store.set(RETURN_KEY, null);
    const hash = back && Date.now() - back.at < 30 * 60000 ? back.hash : "";
    history.replaceState(null, "", location.pathname + (hash || ""));
  }

  // ---------- names: same rules as public.name_is_ok() in supabase/setup.sql ----------
  const BLOCK_ANYWHERE = ["fuck", "shit", "cunt", "bitch", "nigg", "fagg", "whore", "slut", "asshole",
    "bastard", "machikne", "gandu", "माचिक्ने", "गान्डु"];
  const BLOCK_WORDS = ["ass", "dick", "cock", "porn", "sex", "sexy", "rape", "nazi", "hitler", "muji",
    "randi", "rando", "lado", "puti", "chikne", "jhatu", "khate", "मुजी", "मूजी", "रण्डी", "राँडी",
    "लाडो", "पुती", "चिक्ने", "झाटु"];

  function cleanName(n) { return String(n || "").replace(/\s+/g, " ").trim(); }
  function nameProblem(raw) {
    const n = cleanName(raw);
    const len = Array.from(n).length;
    if (len < 2) return "Use at least 2 characters.";
    if (len > 16) return "Use 16 characters or fewer.";
    const low = n.toLowerCase();
    if (!/^[a-z0-9à-ɏऀ-ॿ ]+$/.test(low)) return "Letters, numbers and spaces only.";
    const squashed = low.replace(/[\s0-9]/g, "");
    if (BLOCK_ANYWHERE.some((w) => squashed.includes(w)) || BLOCK_WORDS.includes(squashed) ||
        low.split(" ").some((w) => BLOCK_WORDS.includes(w))) return "Please pick a different name.";
    return null;
  }

  // ---------- state + change events ----------
  const listeners = new Set();
  const NG = {
    status: "loading",            // loading | online | offline
    user: null,                   // Supabase user (guest users have is_anonymous = true)
    profile: null,                // { display_name, is_guest, ... }
    snapshot: store.json(SNAP_KEY)?.data || null,
    snapshotState: "loading",     // loading | ready | offline
    notice: null,                 // one-off message after a sign-in redirect
    signIn: { google: true, email: true, phone: false, ...(cfg.signIn || {}) },
    GUEST_DAYS,
    cleanName,
    nameProblem,
    onChange(fn) { listeners.add(fn); },
  };
  const emit = (what) => listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });

  // ---------- instant restore: who is this, before any network request ----------
  // supabase-js saved the login in localStorage; read it straight away so the name,
  // guest/saved status and "no name popup" are right from the first frame. Supabase then
  // checks it and refreshes it in the background (autoRefreshToken).
  const savedLogin = () => { const s = store.json(AUTH_KEY); return s?.user ? s : null; };
  NG.user = savedLogin()?.user || null;
  const cachedProfile = store.json(PROFILE_KEY);
  if (NG.user && cachedProfile?.user_id === NG.user.id) NG.profile = cachedProfile;
  function rememberProfile() {
    store.set(PROFILE_KEY, NG.profile && NG.user ? JSON.stringify({ ...NG.profile, user_id: NG.user.id }) : null);
  }
  // There's a saved login but we don't know its name yet: wait before asking for one.
  // "Settled" = the name has arrived from Supabase, or we know we can't reach it.
  let settled = false;
  NG.restoring = () => !settled && Boolean(NG.user) && !NG.displayName();

  // Ask the browser not to clear our storage when space runs low (no prompt in Chrome/Safari)
  if (navigator.storage?.persist && !/Firefox/i.test(navigator.userAgent)) {
    navigator.storage.persisted?.().then((already) => already || navigator.storage.persist()).catch(() => {});
  }

  NG.localName = () => store.get(NAME_KEY);
  NG.displayName = () => NG.profile?.display_name || NG.localName() || "";
  NG.isGuest = () => Boolean(NG.user?.is_anonymous);
  NG.isSaved = () => Boolean(NG.user && !NG.user.is_anonymous);
  NG.guestDaysLeft = () => {
    if (!NG.isGuest()) return null;
    const left = new Date(NG.user.created_at).getTime() + GUEST_DAYS * DAY - Date.now();
    return Math.max(1, Math.ceil(left / DAY));
  };
  NG.email = () => NG.user?.email || NG.user?.identities?.find((i) => i.identity_data?.email)?.identity_data.email || "";

  let sb = null;
  const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT))]);
  const isNetworkError = (e) => !e || !e.code || /fetch|network|timeout|Load failed/i.test(e.message || "");

  function goOffline() {
    NG.status = "offline";
    NG.snapshotState = "offline";
    settled = true; // keep the saved name and status; just no scores
    emit("status");
  }

  // ---------- 2. Load Supabase in the background (games never wait for it) ----------
  function loadLibrary() {
    if (window.supabase) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SUPABASE_JS;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { s.remove(); reject(new Error("library offline")); };
      document.head.appendChild(s);
    });
  }
  function boot() {
    if (!cfg.url || !cfg.anonKey) { goOffline(); return Promise.resolve(); }
    // the phone already knows there's no connection: say so at once instead of waiting
    if (navigator.onLine === false) { goOffline(); return Promise.resolve(); }
    return loadLibrary().then(start).catch((e) => { console.warn("Scores offline:", e); goOffline(); });
  }
  NG.ready = boot();
  // back online after opening offline: reconnect quietly
  window.addEventListener("online", () => {
    if (NG.status !== "offline") return;
    NG.status = "loading";
    NG.snapshotState = NG.snapshot ? "ready" : "loading";
    emit("status");
    NG.ready = boot();
  });

  let listening = false;
  async function start() {
    sb ||= window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    });
    if (authReturn.code) {
      const code = authReturn.code;
      authReturn.code = null; // a code can only be used once (matters if we reconnect later)
      const { error } = await withTimeout(sb.auth.exchangeCodeForSession(code));
      if (error && !authReturn.error) authReturn.error = error.code || "exchange_failed";
    }
    // Restore (and if needed refresh) the saved login. No internet is not a reason to log out.
    let session = null;
    let failure = null;
    try {
      const { data, error } = await withTimeout(sb.auth.getSession());
      session = data.session;
      failure = error;
    } catch (e) { failure = e; }
    if (!session && failure && isNetworkError(failure) && savedLogin()) {
      NG.user = savedLogin().user; // keep who they are; scores show "Scores offline"
      throw failure;
    }
    NG.user = session?.user || null;
    if (!NG.user) { NG.profile = null; rememberProfile(); }
    if (!listening) listening = true; else return afterLogin();
    sb.auth.onAuthStateChange((_evt, session) => {
      // keep this callback synchronous (Supabase advice); just mirror the user
      const next = session?.user || null;
      if (next?.id !== NG.user?.id || next?.is_anonymous !== NG.user?.is_anonymous) {
        NG.user = next;
        emit("auth");
      }
    });
    return afterLogin();
  }

  async function afterLogin() {
    NG.status = "online";
    const redirecting = await finishRedirect();
    authReturn.error = null; // handled once; a later reconnect mustn't repeat it
    if (redirecting) return; // a second Google redirect is under way
    await loadProfile();
    settled = true;
    emit("auth");
    await NG.refresh();
  }

  // ---------- 3. After Google: linked, or hand the guest's scores to an existing account ----------
  async function finishRedirect() {
    const pending = store.json(MERGE_KEY);
    if (pending && Date.now() - pending.at > 60 * 60000) store.set(MERGE_KEY, null);
    const live = store.json(MERGE_KEY);

    if (authReturn.error) {
      if (live?.step === "link" && /identity_already_exists|already linked|already/i.test(`${authReturn.error} ${authReturn.errorText}`)) {
        // That Google account already has its own player: sign in to it, then move the guest's scores
        store.set(MERGE_KEY, JSON.stringify({ ...live, step: "signin", at: Date.now() }));
        rememberReturn(location.hash);
        await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectUrl() } });
        return true;
      }
      store.set(MERGE_KEY, null);
      NG.notice = { kind: "error", text: "Sign-in didn't finish. Please try again." };
      return false;
    }
    if (!live || !NG.user) return false;
    if (NG.user.id === live.guestId) {
      if (!NG.user.is_anonymous) {
        store.set(MERGE_KEY, null);
        NG.notice = { kind: "ok", text: "Saved ✓ Your scores are safe now." };
      }
      return false;
    }
    if (!NG.user.is_anonymous) {
      store.set(MERGE_KEY, null);
      await finishMerge(live.token);
    }
    return false;
  }

  async function finishMerge(token) {
    const { data, error } = await sb.rpc("finish_guest_merge", { p_token: token });
    NG.notice = error
      ? { kind: "error", text: "Signed in, but your guest scores couldn't be moved." }
      : { kind: "ok", text: data ? `Signed in ✓ ${data} guest score${data === 1 ? "" : "s"} moved to your account.` : "Signed in ✓" };
  }

  function redirectUrl() { return location.origin + location.pathname; }
  function rememberReturn(hash) {
    store.set(RETURN_KEY, JSON.stringify({ hash: hash ?? location.hash, at: Date.now() }));
  }

  // ---------- unique names ----------
  const TAKEN = "That name is taken, try another";
  const isTaken = (e) => e?.code === "23505" || /profiles_name_unique|duplicate key/i.test(e?.message || "");

  async function suggestFor(name) {
    try {
      const { data } = await withTimeout(sb.rpc("suggest_name", { p_name: name }));
      return data || null;
    } catch { return null; }
  }

  // { ok } when the name can be used, else { error, suggestion }
  NG.checkName = async function (raw) {
    const name = cleanName(raw);
    const problem = nameProblem(name);
    if (problem) return { error: problem };
    if (NG.status === "loading") await NG.ready;
    if (NG.status !== "online") return { ok: true }; // can't check offline; the server checks later
    try {
      const { data, error } = await withTimeout(sb.rpc("name_available", { p_name: name }));
      if (error || data !== false) return { ok: true };
    } catch { return { ok: true }; }
    return { error: TAKEN, suggestion: await suggestFor(name) };
  };

  // ---------- profiles ----------
  async function loadProfile() {
    NG.needsName = false;
    // keep showing the last known name while we check; drop it only if it's someone else's
    if (!NG.user || (NG.profile?.user_id && NG.profile.user_id !== NG.user.id)) NG.profile = null;
    if (!NG.user) return;
    const { data, error } = await withTimeout(
      sb.from("profiles").select("display_name, is_guest, created_at").eq("user_id", NG.user.id).maybeSingle());
    if (error) throw error;
    if (data) {
      NG.profile = data;
      store.set(NAME_KEY, data.display_name);
      rememberProfile();
      return;
    }
    // New login without a profile yet: use the device name, else the Google first name
    const meta = NG.user.user_metadata || {};
    const candidates = [NG.localName(), meta.display_name, (meta.full_name || meta.name || "").split(" ")[0]];
    const usable = [...new Set(candidates.map(cleanName).filter((n) => n && !nameProblem(n)))];
    for (const name of usable) {
      try { await saveProfile(name); return; }
      catch (e) { if (!isTaken(e)) throw e; }
    }
    // every name we could guess is taken (or there was none): ask, with a suggestion
    NG.needsName = true;
    NG.nameHint = usable[0] ? { error: TAKEN, suggestion: await suggestFor(usable[0]) } : null;
  }

  async function saveProfile(name) {
    const { data, error } = await sb.from("profiles")
      .upsert({ user_id: NG.user.id, display_name: name })
      .select("display_name, is_guest, created_at").single();
    if (error) throw error;
    NG.profile = data;
    NG.needsName = false;
    store.set(NAME_KEY, data.display_name);
    rememberProfile();
  }

  // "Let's play": remember the name and create an anonymous guest
  NG.startGuest = async function (raw) {
    const name = cleanName(raw);
    const check = await NG.checkName(name);
    if (check.error) return check;
    store.set(NAME_KEY, name);
    emit("auth");
    if (NG.status !== "online") return { offline: true };
    try {
      if (!NG.user) {
        const { data, error } = await withTimeout(sb.auth.signInAnonymously({ options: { data: { display_name: name } } }));
        if (error) throw error;
        NG.user = data.user;
      }
      await saveProfile(name);
      emit("auth");
      NG.refresh();
      return { ok: true };
    } catch (e) {
      if (isTaken(e)) { // someone took it a moment ago
        store.set(NAME_KEY, null);
        emit("auth");
        return { error: TAKEN, suggestion: await suggestFor(name) };
      }
      console.warn("Guest sign-in failed:", e);
      return { offline: true }; // the name is kept on this device; we'll try again later
    }
  };

  NG.changeName = async function (raw) {
    const name = cleanName(raw);
    const check = await NG.checkName(name);
    if (check.error) return check;
    if (NG.status === "online" && NG.user) {
      try { await saveProfile(name); }
      catch (e) {
        if (isTaken(e)) return { error: TAKEN, suggestion: await suggestFor(name) };
        if (/name_not_allowed/.test(e.message)) return { error: "Please pick a different name." };
        return { error: "Couldn't save right now. Try again in a moment." };
      }
    } else {
      store.set(NAME_KEY, name);
    }
    emit("auth");
    NG.refresh();
    return { ok: true };
  };

  // ---------- leaderboards ----------
  let refreshing = null;
  NG.refresh = function () {
    if (NG.status === "offline") { emit("snapshot"); return Promise.resolve(); }
    if (NG.status === "loading") return NG.ready;
    if (refreshing) return refreshing;
    refreshing = withTimeout(sb.rpc("home_snapshot"))
      .then(({ data, error }) => {
        if (error) throw error;
        NG.snapshot = data;
        NG.snapshotState = "ready";
        store.set(SNAP_KEY, JSON.stringify({ data, at: Date.now() }));
      })
      .catch((e) => { console.warn("Leaderboard offline:", e); NG.snapshotState = "offline"; })
      .finally(() => { refreshing = null; emit("snapshot"); });
    return refreshing;
  };

  // Save one vs-Computer result. Returns { weekly, rank, new_champion } or { error }.
  NG.submitScore = async function (game, points, side) {
    if (!points) return { skipped: true };
    if (NG.status === "loading") await NG.ready;
    if (NG.status !== "online") return { error: "offline" };
    if (!NG.user) {
      const name = NG.localName();
      if (!name) return { error: "no_name" };
      const r = await NG.startGuest(name);
      if (r.error === TAKEN) { // picked offline, and someone else has it now
        store.set(NAME_KEY, null);
        emit("auth");
        return { error: "name_taken", suggestion: r.suggestion, text: TAKEN };
      }
      if (!NG.user) return { error: r.error ? "no_name" : "offline" };
    }
    try {
      const { data, error } = await withTimeout(
        sb.rpc("submit_score", { p_game: game, p_points: points, p_side: side || null }));
      if (error) {
        const m = error.message || "";
        if (m.includes("daily_limit")) return { error: "daily_limit" };
        if (m.includes("too_soon")) return { error: "too_soon" };
        return { error: isNetworkError(error) ? "offline" : "failed" };
      }
      NG.refresh();
      return data;
    } catch {
      return { error: "offline" };
    }
  };

  // ---------- "Save your scores": Google ----------
  NG.google = async function () {
    if (NG.status !== "online") return { error: "Scores are offline right now. Try again later." };
    rememberReturn();
    const options = { redirectTo: redirectUrl() };
    if (NG.isGuest()) {
      const { data: token, error } = await sb.rpc("start_guest_merge");
      if (error) return { error: "Couldn't start sign-in. Try again." };
      store.set(MERGE_KEY, JSON.stringify({ token, guestId: NG.user.id, step: "link", at: Date.now() }));
      const r = await sb.auth.linkIdentity({ provider: "google", options });
      if (r.error) { store.set(MERGE_KEY, null); return { error: r.error.message }; }
    } else {
      const r = await sb.auth.signInWithOAuth({ provider: "google", options });
      if (r.error) return { error: r.error.message };
    }
    return { redirecting: true };
  };

  // ---------- "Save your scores": one-time codes (email now; phone later via config) ----------
  // target is { email } or { phone }
  let pendingCode = null;
  NG.sendCode = async function (target) {
    if (NG.status !== "online") return { error: "Scores are offline right now. Try again later." };
    const channel = target.phone ? "phone" : "email";
    if (channel === "phone" && !NG.signIn.phone) return { error: "Phone sign-in isn't available yet." };
    const value = channel === "email" ? String(target.email || "").trim().toLowerCase() : String(target.phone || "").replace(/[^\d+]/g, "");
    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: "That email doesn't look right." };
    const who = { [channel]: value };

    if (NG.isGuest()) {
      // Attach the email to this guest, so name and scores carry over
      const { error } = await sb.auth.updateUser(who);
      if (!error) {
        pendingCode = { who, type: channel === "email" ? "email_change" : "phone_change" };
        return { sent: true };
      }
      if (!/exist|already|registered/i.test(`${error.code} ${error.message}`)) return { error: friendly(error) };
      // Already has an account: sign in to it and move the guest's scores across
      const { data: token, error: tErr } = await sb.rpc("start_guest_merge");
      if (tErr) return { error: "Couldn't start sign-in. Try again." };
      const r = await sb.auth.signInWithOtp({ ...who, options: { shouldCreateUser: false } });
      if (r.error) return { error: friendly(r.error) };
      pendingCode = { who, type: channel === "email" ? "email" : "sms", mergeToken: token };
      return { sent: true, existing: true };
    }
    const { error } = await sb.auth.signInWithOtp({ ...who, options: { shouldCreateUser: true } });
    if (error) return { error: friendly(error) };
    pendingCode = { who, type: channel === "email" ? "email" : "sms" };
    return { sent: true };
  };

  NG.verifyCode = async function (code) {
    if (!pendingCode) return { error: "Ask for a new code first." };
    const token = String(code || "").replace(/\D/g, "");
    if (token.length !== 6) return { error: "Enter the 6-digit code." };
    const { data, error } = await sb.auth.verifyOtp({ ...pendingCode.who, token, type: pendingCode.type });
    if (error) return { error: "That code didn't work. Check it, or ask for a new one." };
    NG.user = data.user || data.session?.user || NG.user;
    if (pendingCode.mergeToken) await finishMerge(pendingCode.mergeToken);
    else NG.notice = { kind: "ok", text: "Saved ✓ Your scores are safe now." };
    pendingCode = null;
    await loadProfile().catch(() => {});
    emit("auth");
    NG.refresh();
    return { ok: true };
  };

  function friendly(error) {
    const m = `${error.code || ""} ${error.message || ""}`;
    if (/rate|too many|security purposes/i.test(m)) return "Too many tries. Wait a minute and try again.";
    if (/not found|signups not allowed|otp_disabled/i.test(m)) return "No account found for that email.";
    return "Something went wrong. Please try again.";
  }

  // ---------- sign out / delete ----------
  function forgetDevice() {
    store.set(NAME_KEY, null);
    store.set(MERGE_KEY, null);
    store.set(PROFILE_KEY, null);
    NG.user = null;
    NG.profile = null;
  }

  NG.signOut = async function () {
    if (sb) await sb.auth.signOut().catch(() => {});
    forgetDevice();
    emit("auth");
    NG.refresh();
  };

  NG.deleteAccount = async function () {
    if (NG.status !== "online" || !NG.user) {
      forgetDevice();
      emit("auth");
      return { ok: true };
    }
    const { error } = await sb.rpc("delete_my_account");
    if (error) return { error: "Couldn't delete right now. Try again." };
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
    forgetDevice();
    emit("auth");
    NG.refresh();
    return { ok: true };
  };

  window.NG = NG;
})();
