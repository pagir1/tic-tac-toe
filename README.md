# Nepaligamesus

A mobile-first browser game hub built with plain HTML, CSS and JavaScript. No build step and no dependencies.

**Play it:** https://pagir1.github.io/tic-tac-toe/

The home screen shows a grid of game tiles with a live clock, a Nepali greeting, your saved stats and a self-playing demo board. **Tic Tac Toe**, **Bagh Chal** and **Momo Rush** are playable now; Langur Burja, Kite Fight, Ludo and Carrom are marked *coming soon*.

## Tic Tac Toe features

- **2 Players** on the same device, or **vs Computer**
- Computer difficulty: **Easy** (random), **Medium** (mostly smart), **Hard** (unbeatable minimax)
- Players alternate who goes first each round
- Scoreboard for X, O and draws, saved in the browser between visits
- Winning line highlight, light and dark mode, keyboard and screen-reader friendly

## Bagh Chal features

- Traditional Nepali Tigers vs Goats on a 5x5 board of points (diagonals only through points where row + col is even)
- 4 tigers vs 20 goats, with a placement phase then a movement phase
- Tigers win with 5 captures; goats win by trapping every tiger
- **2 Players**, or **vs Computer** playing either side
- Move hints (red rings show captures), animated moves, undo, draw, restart, how-to-play guide
- Tiger / Goat / Draw scores saved in the browser and shown on the home screen

## Momo Rush features

- Fast arcade game: customers queue with momo orders (filling, how many, cooking style, sometimes achar)
- Tap the filling once per momo, add achar if asked, then tap the cooking style to serve
- Patience bars, 3 lives, combos up to x5, a new level every 5 orders (bigger orders, less patience)
- Best score, games played and momos served saved in the browser and shown on the home screen
- Pause, keyboard shortcuts on computers (1/2/3 fillings, A achar, Q/W/E cooking)
- Buttons sit right under the customer orders; a steps strip (① filling → ② cook) shows what to do next, and the button to tap is lit up with a taps-left badge (plus a 👇 TAP tag on levels 1–2)
- Bamboo steamer with rising steam, customer moods, 3-2-1 countdown, level-up flash, confetti for a new best
- Sound effects made in the browser (no audio files) with a mute button

## How to play

1. Open `index.html` in any modern browser (double-click it, or drag it into a browser window).
2. On the home screen, tap the **Tic Tac Toe** tile.
3. Pick a **Mode** (and **Difficulty** when playing the computer).
4. Tap a square to place your mark. Get three in a row to win.
5. **New Round** clears the board; **Reset Scores** sets the scoreboard back to zero. **‹ Games** returns to the home screen.

## Files

| File         | Purpose                                     |
|--------------|---------------------------------------------|
| `index.html` | Home screen and each game's screen          |
| `home.css`   | Home screen look and animations             |
| `home.js`    | Screen switching, clock, stats, demo board  |
| `style.css`  | Base theme and Tic Tac Toe styling          |
| `script.js`  | Tic Tac Toe rules, computer opponent, scores |
| `baghchal-logic.js` | Bagh Chal rules only (board, moves, wins, computer player); no page code |
| `baghchal.js` | Bagh Chal screen: SVG board, taps, animation, undo, saved scores |
| `baghchal.css` | Bagh Chal board, pieces and pop-up styles |
| `momo-logic.js` | Momo Rush rules only (orders, scoring, levels, lives); no page code |
| `momo.js` | Momo Rush screen: game loop, customers, plate, effects, saved best score |
| `momo.css` | Momo Rush kitchen, buttons and animation styles |

## Hosting

The site is hosted on GitHub Pages from the `main` branch (root folder).
Every push to `main` redeploys it automatically within a minute or two.

---

© 2026 NepaliGamesUS. All rights reserved.
