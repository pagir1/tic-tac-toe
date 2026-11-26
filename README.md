# Nepaligamesus

A mobile-first browser game hub built with plain HTML, CSS and JavaScript. No build step and no dependencies.

The home screen shows a grid of game tiles with a live clock, a Nepali greeting, your saved stats and a self-playing demo board. **Tic Tac Toe** is playable now; Bagh Chal, Memory Match, Four in a Row, Snake, Sudoku and Dots & Boxes are marked *coming soon*.

## Tic Tac Toe features

- **2 Players** on the same device, or **vs Computer**
- Computer difficulty: **Easy** (random), **Medium** (mostly smart), **Hard** (unbeatable minimax)
- Players alternate who goes first each round
- Scoreboard for X, O and draws, saved in the browser between visits
- Winning line highlight, light and dark mode, keyboard and screen-reader friendly

## How to play

1. Open `index.html` in any modern browser (double-click it, or drag it into a browser window).
2. On the home screen, tap the **Tic Tac Toe** tile.
3. Pick a **Mode** (and **Difficulty** when playing the computer).
4. Tap a square to place your mark. Get three in a row to win.
5. **New Round** clears the board; **Reset Scores** sets the scoreboard back to zero. **‹ Games** returns to the home screen.

## Files

| File         | Purpose                                     |
|--------------|---------------------------------------------|
| `index.html` | Home screen and Tic Tac Toe screen          |
| `home.css`   | Home screen look and animations             |
| `home.js`    | Screen switching, clock, stats, demo board  |
| `style.css`  | Base theme and Tic Tac Toe styling          |
| `script.js`  | Game rules, computer opponent, saved scores |

## Host it online (optional)

Because it is a static site, you can publish it for free with GitHub Pages:
**Settings → Pages → Source: Deploy from a branch → `main` / root**.
