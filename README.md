# Minesweeper: Afterglow

The Minesweeper you remember, with a little sixth sense. A simple ivory interface, soft orange details, and an optional Windows XP inspired Retro skin with beveled squares, red counters and the smiley restart button.

**[Play Minesweeper](https://nipunkakkar.github.io/minesweeper-afterglow/)** · [All the games](https://nipunkakkar.github.io/)

## Play

Run `npm run dev` and open **http://127.0.0.1:5077/**. No dependency installation, build, account, API key or internet connection is required. Keep the terminal running while you play. A local server is needed for the JavaScript modules; opening `index.html` directly with a `file:` URL is not supported by browsers.

## The little surprises

- **Sonar:** three pulses per game. Pick a square to count all the mines in its surrounding 3 × 3 area without uncovering any cells. Each pulse adds 10 seconds. Edge scans cover fewer cells and include flagged mines.
- **A blooming finish:** clear the field and the mines turn into flowers, with a little petal celebration.
- **Two eras:** switch between the light modern board and Retro at any time without restarting.
- **Sounds that fit:** crisp uncover notes, a sparkling flood fill, flag clicks, echoing sonar, a layered bomb explosion and a victory chime. All sounds are synthesized locally with Web Audio. A bomb also produces a brief shake, expanding blast and flying sparks.
- **Personal bests:** separate records for each difficulty and for sonar-assisted and unassisted games, saved in this browser. The game works if storage is unavailable.

## Rules and controls

Uncover all the safe squares. Each number counts the mines in the surrounding eight squares. The first click and all its surrounding squares are safe. Boards are random; some positions may require a guess. This is not a guaranteed no-guess generator.

- Click/tap to uncover; right-click, hold for half a second or select Flag mode to flag.
- Click an open number when its adjacent flags match it to clear the remaining surrounding squares. Incorrect flags can trigger a mine.
- Arrow keys move around the board; Enter uncovers; F or Space flags. Home/End move to the edges of a row.
- S readies/cancels sonar; Escape cancels it. P pauses/resumes.
- The smiley starts a new game. Switching difficulty also starts a new game.
- Sound starts on your first interaction and can be muted. The sound preference, skin and difficulty are remembered.
- Switching tabs automatically pauses and hides the board. Choose Resume to continue. Instructions pause an active game and resume it when closed.

Beginner: 9 × 9 / 10 mines. Intermediate: 16 × 16 / 40 mines. Expert: 30 × 16 / 99 mines. Large boards scroll horizontally on smaller screens. Keyboard navigation scrolls the focused square into view. Reduced-motion preferences are respected.

## Checks

Requires a current Node.js release (22 or later recommended).

```sh
npm test
npm run check
```

The rules tests cover first-click safety, placement and counts across all difficulties, flood fill, flags, number clearing, incorrect-flag losses, sonar limits and edge clipping, terminal states, invalid input and complete wins.

## Static hosting

Publish the project root on any static host, including GitHub Pages. All runtime assets are local and use relative paths. `.nojekyll` is included. There are no third-party runtime dependencies or remote requests. The navigation links point back to Nipun’s existing games collection.
