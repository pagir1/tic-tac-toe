# nepaligames.

*Your little piece of Nepal 🇳🇵*: a mobile-first game hub with weekly champions, built with plain HTML, CSS and JavaScript. No build step. Scores and accounts run on [Supabase](https://supabase.com).

**Play it:** https://pagir1.github.io/tic-tac-toe/

**Bagh Chal**, **Tic Tac Toe** and **Momo Rush** are playable now. Langur Burja, Ludo and Carrom are marked *coming soon*.

## Home screen

- Dark, card-based design: the **nepaligames.** logo, your profile letter, and "Namaste, [name]! 🙏"
- **🔥 Streak** chip counting the days in a row you've played (on this device)
- **This week's champion**: the player with the most points across all games, with a **Beat them →** button that opens the game where you're closest to the crown (or **Defend your crown →** if it's you)
- **Continue playing**: one tap back into your last game
- **Game cards** with a gold **👑 champion · points** line, **You: [points] · #[rank]**, and how many points you need to take the crown
- **Weekly leaderboard**: top 5 players with 🥇🥈🥉, plus a highlighted "You" row if you're further down. Resets every Monday (Nepal time)
- Loads quickly with light placeholders, refreshes whenever you come back to the home screen, and shows **Scores offline** when the internet or Supabase can't be reached (the games still work)

## Players and accounts

- **Guests** play straight away with just a name. Guest scores are deleted after 4 days, and a thin banner counts the days down
- **Saved players** sign in with **Google** or a **6-digit email code** (no passwords) and keep their name and scores on any device. When a guest signs in, their name and points carry over; if that Google account or email already has a player, the guest's points move into it
- **Names** are 2–16 letters (English or Nepali/Devanagari), numbers and spaces, with a bad-word filter in English and Nepali. Names are unique (not case-sensitive); if one is taken you get a suggestion like "Pawan7"
- **Stays signed in** on the same browser until you tap **Sign out**, also with no internet and in the installed app. Expired logins refresh silently
- **Profile menu**: change name, guest or saved status, this week's streak (M–S), your best week ever, Save my scores, Sign out, Delete my account
- Inside WhatsApp, Messenger, Facebook or Instagram (whose built-in browsers forget sign-ins), a small closable tip suggests opening the site in Chrome or Safari
- [Privacy page](https://pagir1.github.io/tic-tac-toe/privacy.html): we only save your name, email and scores

## Points

Only games **vs Computer** count; 2-player games give no points.

| Game | Win | Draw |
|------|-----|------|
| Tic Tac Toe (Medium or Hard; Easy gives no points) | 10 | 3 |
| Bagh Chal as Goats | 15 | 3 (after 40+ moves) |
| Bagh Chal as Tigers | 10 | 3 (after 40+ moves) |

The result screen shows **+points**, your weekly total and rank, and **👑 You're the new champion!** with confetti when you take the crown.

The server only accepts these point values, saves at most one result per player every 15 seconds, and allows up to 300 points per player per game per day ("Daily points limit reached. Come back tomorrow!").

## App and sharing

- **Installable app**: add Nepaligames to your home screen. It opens full screen without the browser bar and has its own icon. An **Install** card on the home screen opens the real install prompt on Android and Chrome, or shows the Share → Add to Home Screen steps on iPhone. It hides once installed, or for 7 days after closing it
- **Works offline**: game files are saved on the phone, so games open with no internet. Installed apps get the newest version automatically the next time they open online
- **Challenge a friend 📤** after a win and in the profile menu: opens the phone's share sheet (or copies the link on computers) with "I have [X] pts on Nepaligames 👑 Can you beat me?"
- **Link previews** for WhatsApp, Messenger and Viber: "Nepaligames: Can you take the crown? 👑" with a preview image

## Tic Tac Toe

- **2 Players** on the same device, or **vs Computer**
- Computer difficulty: **Easy** (random), **Medium** (mostly smart), **Hard** (unbeatable minimax)
- Players alternate who goes first each round
- Scoreboard for X, O and draws, saved in the browser between visits
- Result popup after games against the computer, with your points
- Winning line highlight, light and dark mode, keyboard and screen-reader friendly

## Bagh Chal

- Traditional Nepali Tigers vs Goats on a 5x5 board of points (diagonals only through points where row + col is even)
- 4 tigers vs 20 goats, with a placement phase then a movement phase
- Tigers win with 5 captures; goats win by trapping every tiger
- **2 Players**, or **vs Computer** playing either side
- Big board centred on phone screens, with live counters right above it: goats left to place (a 20-mark bar) and goats captured (5 slots that fill up). They turn amber, then red, as goats run short or captures pile up
- Move hints (red rings show captures), animated moves, undo, draw, restart, how-to-play guide
- Tiger / Goat / Draw series scores saved in the browser

## Momo Rush

- Fast arcade game: customers queue with momo orders (filling, how many, cooking style, sometimes achar)
- Tap the filling once per momo, add achar if asked, then tap the cooking style to serve
- Patience bars, 3 lives, combos up to x5, a new level every 5 orders (bigger orders, less patience); from level 6 it speeds up sharply
- Levels 1–2: big full-screen LEVEL announcement (the clock pauses briefly). Level 3 and up: the level number shows in the background behind the steamer and the top-bar Level box pops; the game never pauses
- Level progress bar (e.g. 3/5 orders to the next level)
- Best score saved in the browser and shown on the home screen card (Momo Rush has no leaderboard yet)
- Pause, keyboard shortcuts on computers (1/2/3 fillings, A achar, Q/W/E cooking)
- A steps strip (① filling → ② cook) shows what to do next, and the button to tap is lit up with a taps-left badge (plus a 👇 TAP tag on level 1)
- First-time tutorial for the first 3 orders, which can be replayed from the start screen
- Bamboo steamer with rising steam, customer moods, 3-2-1 countdown, level-up flash, confetti for a new best
- Sound effects made in the browser (no audio files) with a mute button

## Files

| File | Purpose |
|------|---------|
| `index.html` | Home screen, each game's screen, account popups, link-preview tags |
| `home.css` / `home.js` | Home screen: champion, game cards, leaderboard, streak, screen switching |
| `supabase-config.js` | Supabase project URL and **publishable** key (safe to be public) |
| `online.js` | Supabase connection: guest and saved logins, names, scores, leaderboards, "Scores offline" |
| `account.js` / `account.css` | Name popup, sign-in, profile menu, result-screen points, Challenge a friend, confetti |
| `install.js` | Offline support (service worker), the Install card, the in-app browser tip |
| `sw.js` | Service worker: saves game files for offline, always fetches the newest version when online |
| `manifest.webmanifest`, `icons/` | Installable app name, colours and icons |
| `og-image.jpg` | 1200x630 link-preview image |
| `privacy.html` | Privacy page |
| `style.css` / `script.js` | Base theme; Tic Tac Toe rules, computer opponent, scores |
| `baghchal-logic.js` | Bagh Chal rules only (board, moves, wins, computer player); no page code |
| `baghchal.js` / `baghchal.css` | Bagh Chal screen: SVG board, live counters, taps, animation, undo, scores |
| `momo-logic.js` | Momo Rush rules only (orders, scoring, levels, lives); no page code |
| `momo.js` / `momo.css` | Momo Rush screen: game loop, customers, plate, effects, best score |
| `supabase/setup.sql` | Database setup: tables, security rules, points rules, leaderboards, daily guest clean-up |
| `supabase/unique-names.sql` | Unique names and name suggestions (also included in `setup.sql`) |

## Supabase setup

1. Run `supabase/setup.sql` in the Supabase **SQL Editor**. It creates the `profiles` and `scores` tables, Row Level Security (anyone can read; players can only add their own scores and edit their own profile; nobody can change or delete scores from the browser), the points rules, the leaderboard functions, and a daily **pg_cron** job that deletes guests older than 4 days.
2. Under **Authentication → Sign In / Providers**, turn on **anonymous sign-ins**, **manual linking**, **Email** (6-digit codes; the email templates use `{{ .Token }}`) and **Google**. Codes are sent through custom SMTP (Brevo).
3. Under **Authentication → URL Configuration**, set the Site URL to `https://pagir1.github.io/tic-tac-toe/` and add the redirect URL `https://pagir1.github.io/tic-tac-toe/**`.
4. Put the project URL and **publishable** key in `supabase-config.js`.

Never put the `service_role` / secret key, passwords, or Google client secrets in this repository. `.gitignore` blocks the usual secret files.

## Running it locally

Serve the folder over HTTP, then open http://localhost:5173/:

```
python -m http.server 5173
```

Opening `index.html` directly from disk (`file://`) runs the games, but sign-in, the installable app and offline support need a web server. To test Google sign-in locally, temporarily add `http://localhost:5173/**` to the Supabase redirect URLs, and remove it afterwards.

## Hosting

The site is hosted on GitHub Pages from the `main` branch (root folder).
Every push to `main` redeploys it automatically within a minute or two.

---

© 2026 NepaliGamesUS. All rights reserved.
