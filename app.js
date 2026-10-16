import { Minesweeper, PRESETS } from './game.js';

const $ = id => document.getElementById(id);
const board = $('board');
const FLAG = '<svg class="flag-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V3l13 5-13 5M3 21h10"/></svg>';
const MINE = '<svg class="mine-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1v22M1 12h22M4 4l16 16M4 20 20 4"/><circle cx="12" cy="12" r="6"/><circle cx="10" cy="10" r="1.5" fill="white" stroke="none"/></svg>';
const STORAGE_KEY = 'minesweeper-afterglow-v1';
let preferences;
try { preferences = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { preferences = {}; }
if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) preferences = {};
let records = preferences.records && typeof preferences.records === 'object' && !Array.isArray(preferences.records) ? preferences.records : {};
let level = Object.hasOwn(PRESETS, preferences.level) ? preferences.level : 'beginner';
let game, cells = [], focusIndex = 0, inputMode = 'reveal', sonarArmed = false, lastScan = null;
let paused = false, pauseReason = '', elapsedMs = 0, runningSince = null;
let soundOn = preferences.soundEnabled !== false, audioContext;
let longPress = null, suppressClickUntil = 0;

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, theme: document.documentElement.dataset.theme, soundEnabled: soundOn, records })); } catch { /* Private browsing can disable storage. */ }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('skin-classic').setAttribute('aria-pressed', String(theme === 'classic'));
  document.querySelector('meta[name="theme-color"]').content = '#faf8f2';
  persist();
  fitBoard();
}

function tone(kind, amount = 1) {
  if (!soundOn) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    if (kind === 'lost') { bombSound(); return; }
    const notes = { uncover: [720], flood: [523, 659, 784], flag: [480, 630], sonar: [1100, 825, 550], won: [523, 659, 784, 1047, 1319] }[kind] || [440];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const time = audioContext.currentTime + index * (kind === 'sonar' ? .16 : kind === 'flood' ? .045 : .075);
      const length = kind === 'sonar' ? .6 : kind === 'won' ? .55 : kind === 'uncover' ? .09 : .16;
      oscillator.type = ['sonar', 'flood', 'uncover'].includes(kind) ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, time);
      if (kind === 'uncover') oscillator.frequency.exponentialRampToValueAtTime(280, time + length);
      if (kind === 'sonar') oscillator.frequency.exponentialRampToValueAtTime(frequency * .94, time + length);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(kind === 'sonar' ? .09 : .065, time + .005);
      gain.gain.exponentialRampToValueAtTime(.001, time + length);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(time); oscillator.stop(time + length + .02);
    });
    if (kind === 'flood' && amount > 10) {
      const shimmer = audioContext.createOscillator(), gain = audioContext.createGain(), time = audioContext.currentTime;
      shimmer.type = 'sine'; shimmer.frequency.setValueAtTime(1568, time);
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.025, time + .08); gain.gain.exponentialRampToValueAtTime(.001, time + .35);
      shimmer.connect(gain); gain.connect(audioContext.destination); shimmer.start(time); shimmer.stop(time + .36);
    }
  } catch { /* The game remains playable without Web Audio. */ }
}

function bombSound() {
  const time = audioContext.currentTime;
  // A filtered burst, a falling low note, then tiny debris clicks: a short, rounded boom.
  const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * 1.25), audioContext.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const noise = audioContext.createBufferSource(), filter = audioContext.createBiquadFilter(), noiseGain = audioContext.createGain();
  noise.buffer = buffer; filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2800, time); filter.frequency.exponentialRampToValueAtTime(75, time + 1.1);
  noiseGain.gain.setValueAtTime(0, time); noiseGain.gain.linearRampToValueAtTime(.3, time + .008); noiseGain.gain.exponentialRampToValueAtTime(.001, time + 1.2);
  noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(audioContext.destination); noise.start(time); noise.stop(time + 1.25);
  const sub = audioContext.createOscillator(), subGain = audioContext.createGain();
  sub.type = 'sine'; sub.frequency.setValueAtTime(115, time); sub.frequency.exponentialRampToValueAtTime(28, time + .75);
  subGain.gain.setValueAtTime(0, time); subGain.gain.linearRampToValueAtTime(.24, time + .006); subGain.gain.exponentialRampToValueAtTime(.001, time + .95);
  sub.connect(subGain); subGain.connect(audioContext.destination); sub.start(time); sub.stop(time + 1);
  for (let i = 0; i < 4; i++) {
    const click = audioContext.createOscillator(), gain = audioContext.createGain(), start = time + .13 + i * .09;
    click.type = 'triangle'; click.frequency.setValueAtTime(180 + i * 75, start);
    gain.gain.setValueAtTime(.035 / (i + 1), start); gain.gain.exponentialRampToValueAtTime(.001, start + .04);
    click.connect(gain); gain.connect(audioContext.destination); click.start(start); click.stop(start + .05);
  }
}

function elapsed() { return elapsedMs + (runningSince === null ? 0 : performance.now() - runningSince); }
function stopClock() { elapsedMs = elapsed(); runningSince = null; }
function seconds() { return Math.floor(elapsed() / 1000); }
function updateTimer() {
  const time = seconds();
  $('timer').textContent = time > 999 ? '999+' : String(time).padStart(3, '0');
  $('timer').setAttribute('aria-label', `${time} seconds elapsed`);
}
setInterval(() => { if (runningSince !== null) updateTimer(); }, 200);

function fitBoard() {
  if (!game) return;
  const viewport = $('board-viewport');
  const style = getComputedStyle(viewport);
  const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 12;
  const gap = document.documentElement.dataset.theme === 'classic' ? 0 : 2;
  const preferred = game.cols === 9 ? 40 : game.cols === 16 ? 29 : 27;
  const minimum = game.cols === 9 ? 25 : 26;
  const size = Math.max(minimum, Math.min(preferred, Math.floor((available - (game.cols - 1) * gap) / game.cols)));
  board.style.setProperty('--size', size + 'px');
  board.style.setProperty('--cols', game.cols);
  viewport.classList.toggle('needs-scroll', game.cols * (size + gap) > available);
}

function buildBoard() {
  const fragment = document.createDocumentFragment();
  cells = [];
  for (let row = 0; row < game.rows; row++) {
    const rowElement = document.createElement('div');
    rowElement.className = 'board-row';
    rowElement.setAttribute('role', 'row');
    for (let col = 0; col < game.cols; col++) {
      const index = row * game.cols + col;
      const cell = document.createElement('button');
      cell.type = 'button'; cell.className = 'cell'; cell.dataset.index = index;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-rowindex', row + 1); cell.setAttribute('aria-colindex', col + 1);
      rowElement.append(cell); cells.push(cell);
    }
    fragment.append(rowElement);
  }
  board.replaceChildren(fragment);
  board.setAttribute('aria-rowcount', game.rows); board.setAttribute('aria-colcount', game.cols);
  fitBoard();
}

function bestKey() { return level + (game.charges < 3 ? ':sonar' : ':unassisted'); }
function showBest() {
  const assisted = game.charges < 3;
  $('best-label').textContent = `YOUR BEST · ${assisted ? 'SONAR' : 'UNASSISTED'}`;
  const record = records[bestKey()];
  $('best-time').replaceChildren();
  const note = document.createElement('span');
  if (Number.isFinite(record) && record >= 0) {
    $('best-time').append(document.createTextNode(record + 's '));
    note.textContent = PRESETS[level].name.toLowerCase();
  } else {
    $('best-time').append(document.createTextNode('— ')); note.textContent = 'set your first time';
  }
  $('best-time').append(note);
}

function render(changed = []) {
  const finished = ['won', 'lost'].includes(game.status), fresh = new Set(changed), scanArea = new Set(lastScan?.area || []);
  const active = document.activeElement;
  cells.forEach((element, index) => {
    const cell = game.cells[index], showMine = cell.mine && game.status === 'lost';
    let content = '', label = 'covered';
    if (cell.flagged) { content = FLAG; label = 'flagged'; }
    else if (showMine) { content = MINE; label = cell.exploded ? 'exploded mine' : 'mine'; }
    else if (cell.revealed) { content = cell.adjacent ? String(cell.adjacent) : ''; label = cell.adjacent ? `${cell.adjacent} adjacent mines` : 'empty'; }
    const flower = game.status === 'won' && cell.mine;
    if (flower) label = 'mine transformed into a flower';
    if (game.status === 'lost' && cell.flagged && !cell.mine) label = 'incorrect flag';
    const className = ['cell', cell.revealed || showMine ? 'revealed' : '', cell.flagged ? 'flagged' : '', cell.exploded ? 'exploded' : '', finished ? 'finished' : '', fresh.has(index) ? 'fresh' : '', scanArea.has(index) ? 'in-scan' : '', lastScan?.index === index ? 'scan-center' : '', flower ? 'flower' : '', game.status === 'lost' && cell.flagged && !cell.mine ? 'wrong-flag' : ''].filter(Boolean).join(' ');
    element.className = className;
    if (fresh.has(index)) element.style.setProperty('--reveal-delay', Math.min(130, (Math.abs(Math.floor(index / game.cols) - Math.floor(focusIndex / game.cols)) + Math.abs(index % game.cols - focusIndex % game.cols)) * 12) + 'ms');
    if (element.innerHTML !== content) element.innerHTML = content;
    element.dataset.number = cell.revealed && !cell.mine ? cell.adjacent : '';
    element.setAttribute('aria-label', `Row ${Math.floor(index / game.cols) + 1}, column ${index % game.cols + 1}: ${label}`);
    element.tabIndex = !paused && index === focusIndex ? 0 : -1;
    if (flower) element.style.setProperty('--bloom-delay', (index % 13) * .04 + 's');
  });
  const remaining = game.mineCount - game.flagCount;
  $('mines-left').textContent = remaining < 0 ? '-' + String(Math.abs(remaining)).padStart(2, '0') : String(remaining).padStart(3, '0');
  $('mines-left').setAttribute('aria-label', `${remaining} mines left to flag`);
  $('progress').textContent = `${game.revealedCount} / ${game.cells.length - game.mineCount}`;
  $('progress').setAttribute('aria-label', `${game.revealedCount} of ${game.cells.length - game.mineCount} safe squares uncovered`);
  $('pause').disabled = game.status !== 'playing';
  $('pause').textContent = paused ? '▷' : 'Ⅱ';
  $('pause').setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
  $('pause-overlay').hidden = !paused;
  board.classList.toggle('paused', paused); board.classList.toggle('sonar-ready', sonarArmed);
  board.setAttribute('aria-disabled', String(paused || finished));
  $('sonar').disabled = game.status !== 'playing' || paused || !game.charges;
  $('sonar').setAttribute('aria-pressed', String(sonarArmed));
  $('sonar-label').textContent = sonarArmed ? 'Pick a square' : game.charges ? 'Use sonar' : 'Pulses used';
  $('charge-pips').querySelectorAll('i').forEach((pip, index) => pip.classList.toggle('used', index >= game.charges));
  $('charge-pips').setAttribute('aria-label', `${game.charges} sonar charges left`);
  $('charges-label').textContent = `${game.charges} ${game.charges === 1 ? 'pulse' : 'pulses'} left · +10s each`;
  $('face-mouth').setAttribute('d', game.status === 'lost' ? 'M13 28q7-8 14 0' : game.status === 'won' ? 'M12 22q8 12 16 0Z' : 'M13 24q7 8 14 0');
  $('status-dot').style.background = game.status === 'lost' ? '#eea88b' : '';
  updateTimer(); showBest();
  if (active && board.contains(active) && paused) $('resume').focus({ preventScroll: true });
}

function announce(message) { $('status').textContent = message; }

function newGame(nextLevel = level) {
  clearLongPress();
  level = nextLevel; game = new Minesweeper(PRESETS[level]);
  elapsedMs = 0; runningSince = null; paused = false; pauseReason = '';
  focusIndex = 0; sonarArmed = false; lastScan = null; inputMode = 'reveal';
  $('board-viewport').scrollLeft = 0;
  $('result-strip').hidden = true; $('petals').replaceChildren();
  $('explosion').replaceChildren(); $('game-window').classList.remove('boom');
  $('sonar-wave').classList.remove('ping');
  document.querySelectorAll('[data-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.level === level)));
  $('reveal-mode').setAttribute('aria-pressed', 'true'); $('flag-mode').setAttribute('aria-pressed', 'false');
  $('scan-message').textContent = 'Uncover a square to begin.';
  announce('Your first click is always a safe place to start.');
  buildBoard(); render(); persist();
}

function setPaused(value, reason = 'manual') {
  if (game.status !== 'playing') return;
  if (value && !paused) stopClock();
  if (!value && paused) runningSince = performance.now();
  paused = value; pauseReason = value ? reason : ''; sonarArmed = false;
  announce(value ? 'Paused. Take your time.' : 'Welcome back. One square at a time.');
  render();
}

function finish() {
  stopClock(); sonarArmed = false; lastScan = null;
  $('result-strip').hidden = false;
  if (game.status === 'won') {
    const time = seconds(), key = bestKey(), previous = records[key];
    const best = !Number.isFinite(previous) || time < previous;
    if (best) { records[key] = time; persist(); }
    $('result-eyebrow').textContent = best ? 'A NEW PERSONAL BEST' : 'FIELD COMPLETE';
    $('result-title').textContent = 'You made a minefield bloom.';
    $('result-copy').textContent = `${PRESETS[level].name} cleared in ${time}s${game.charges < 3 ? ` · ${3 - game.charges} sonar ${game.charges === 2 ? 'pulse' : 'pulses'}` : ' · no sonar needed'}. Beautifully done.`;
    announce('Every safe square found. A little garden, just for you.');
    $('scan-message').textContent = 'From a field of mines to a field of flowers. Enjoy your afterglow.';
    celebrate(); tone('won');
  } else {
    $('result-eyebrow').textContent = 'THAT ONE HAD A MINE';
    $('result-title').textContent = 'A little wiser. One more try?';
    $('result-copy').textContent = `${game.revealedCount} safe squares found in ${seconds()}s. Start a fresh field whenever you’re ready.`;
    announce('A mine! The field is revealed. The smiley starts a fresh game.');
    $('scan-message').textContent = 'Even a sixth sense has its limits. There’s a fresh field waiting.';
    explode();
    tone('lost');
  }
}

function uncover(index) {
  if (paused || $('help-dialog').open) return;
  const wasReady = game.status === 'ready';
  const result = game.reveal(index);
  if (wasReady && game.status !== 'ready') {
    runningSince = performance.now();
    $('scan-message').textContent = 'A tricky corner? Ready a pulse, then choose where to listen.';
  }
  if (result.type === 'won' || result.type === 'lost') finish();
  else if (result.type === 'revealed') {
    announce(`${result.changed.length} ${result.changed.length === 1 ? 'square' : 'squares'} uncovered. Follow the numbers.`);
    tone(result.changed.length > 1 ? 'flood' : 'uncover', result.changed.length);
  } else if (game.status === 'playing' && game.cells[index]?.revealed && game.cells[index].adjacent) {
    announce('Match the number with nearby flags, then click it to clear around it.');
  }
  render(result.changed);
}

function flag(index) {
  if (paused || sonarArmed || $('help-dialog').open) return;
  if (game.toggleFlag(index)) {
    announce(game.cells[index].flagged ? 'Flag placed. A little caution goes a long way.' : 'Flag removed.');
    tone('flag'); render();
  }
}

function armSonar() {
  if (game.status !== 'playing' || paused || game.charges === 0) return;
  sonarArmed = !sonarArmed;
  $('scan-message').textContent = sonarArmed ? 'Choose a square. We’ll count every mine in its surrounding 3 × 3 area.' : lastScan ? scanDescription(lastScan) : 'Sonar cancelled. Your pulses are safe.';
  render();
}
function scanDescription(scan) {
  return `${scan.mines} ${scan.mines === 1 ? 'mine' : 'mines'} in the ${scan.area.length} outlined squares, including flagged mines.`;
}
function sendSonar(index) {
  const scan = game.scan(index);
  if (!scan) return;
  lastScan = scan; sonarArmed = false; elapsedMs += 10000;
  $('scan-message').textContent = scanDescription(scan);
  announce('Sonar returned. ' + scanDescription(scan) + ' 10 seconds added.');
  const wave = $('sonar-wave');
  wave.style.left = ((index % game.cols + .5) / game.cols * 100) + '%';
  wave.style.top = ((Math.floor(index / game.cols) + .5) / game.rows * 100) + '%';
  wave.classList.remove('ping'); void wave.offsetWidth; wave.classList.add('ping');
  tone('sonar'); render();
}

function act(index) {
  if (paused) return;
  if (sonarArmed) sendSonar(index);
  else if (inputMode === 'flag') flag(index);
  else uncover(index);
}

function focusCell(index) {
  cells[focusIndex].tabIndex = -1;
  focusIndex = index; cells[index].tabIndex = 0; cells[index].focus({ preventScroll: true });
  const viewport = $('board-viewport'), cellRect = cells[index].getBoundingClientRect(), viewRect = viewport.getBoundingClientRect();
  if (cellRect.left < viewRect.left + 14) viewport.scrollLeft -= viewRect.left + 14 - cellRect.left;
  else if (cellRect.right > viewRect.right - 14) viewport.scrollLeft += cellRect.right - viewRect.right + 14;
}

function clearLongPress() { if (longPress) clearTimeout(longPress.timer); longPress = null; }
board.addEventListener('pointerdown', event => {
  const element = event.target.closest('.cell');
  if (!element || paused) return;
  const index = Number(element.dataset.index);
  cells[focusIndex].tabIndex = -1; focusIndex = index; element.tabIndex = 0;
  if (event.pointerType === 'mouse' || sonarArmed) return;
  clearLongPress();
  longPress = { x: event.clientX, y: event.clientY, timer: setTimeout(() => {
    flag(index); suppressClickUntil = performance.now() + 800; clearLongPress();
  }, 500) };
});
board.addEventListener('pointermove', event => { if (longPress && Math.hypot(event.clientX - longPress.x, event.clientY - longPress.y) > 9) clearLongPress(); });
for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) board.addEventListener(eventName, clearLongPress);
board.addEventListener('click', event => {
  const element = event.target.closest('.cell');
  if (element && performance.now() > suppressClickUntil) act(Number(element.dataset.index));
});
board.addEventListener('contextmenu', event => {
  event.preventDefault();
  const element = event.target.closest('.cell');
  if (!element || performance.now() < suppressClickUntil) return;
  clearLongPress(); flag(Number(element.dataset.index));
});
board.addEventListener('focusin', event => {
  const element = event.target.closest('.cell');
  if (!element) return;
  cells[focusIndex].tabIndex = -1; focusIndex = Number(element.dataset.index); element.tabIndex = paused ? -1 : 0;
});
board.addEventListener('keydown', event => {
  if (paused || event.altKey || event.ctrlKey || event.metaKey) return;
  const row = Math.floor(focusIndex / game.cols), col = focusIndex % game.cols;
  let target = focusIndex;
  if (event.key === 'ArrowLeft') target = row * game.cols + Math.max(0, col - 1);
  else if (event.key === 'ArrowRight') target = row * game.cols + Math.min(game.cols - 1, col + 1);
  else if (event.key === 'ArrowUp') target = Math.max(0, row - 1) * game.cols + col;
  else if (event.key === 'ArrowDown') target = Math.min(game.rows - 1, row + 1) * game.cols + col;
  else if (event.key === 'Home') target = row * game.cols;
  else if (event.key === 'End') target = row * game.cols + game.cols - 1;
  else if (event.key === 'Enter') { event.preventDefault(); if (sonarArmed) sendSonar(focusIndex); else uncover(focusIndex); return; }
  else if (event.code === 'Space' || event.key.toLowerCase() === 'f') { event.preventDefault(); flag(focusIndex); return; }
  else return;
  event.preventDefault(); focusCell(target);
});

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || $('help-dialog').open || event.repeat) return;
  if (event.key.toLowerCase() === 's') { event.preventDefault(); armSonar(); }
  else if (event.key.toLowerCase() === 'p') { event.preventDefault(); setPaused(!paused); }
  else if (event.key === 'Escape' && sonarArmed) { event.preventDefault(); armSonar(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.status === 'playing') { clearLongPress(); setPaused(true, 'hidden'); } });
window.addEventListener('blur', clearLongPress);
new ResizeObserver(fitBoard).observe($('board-viewport'));
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => newGame(button.dataset.level)));
$('new-game').addEventListener('click', () => newGame());
$('play-again').addEventListener('click', () => { newGame(); cells[0].focus({ preventScroll: true }); });
$('pause').addEventListener('click', () => setPaused(!paused));
$('resume').addEventListener('click', () => { setPaused(false); focusCell(focusIndex); });
$('sonar').addEventListener('click', armSonar);
for (const mode of ['reveal', 'flag']) $(mode + '-mode').addEventListener('click', () => {
  inputMode = mode;
  if (sonarArmed) armSonar();
  $('reveal-mode').setAttribute('aria-pressed', String(mode === 'reveal'));
  $('flag-mode').setAttribute('aria-pressed', String(mode === 'flag'));
});
$('skin-classic').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'classic' ? 'daylight' : 'classic'));
function updateSound() {
  $('sound').setAttribute('aria-pressed', String(soundOn));
  $('sound').setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
  $('sound').title = soundOn ? 'Sound on' : 'Sound off';
}
$('sound').addEventListener('click', () => { soundOn = !soundOn; updateSound(); persist(); if (soundOn) tone('flag'); });
$('help').addEventListener('click', () => {
  if (game.status === 'playing' && !paused) setPaused(true, 'help');
  $('help-dialog').showModal();
});
for (const id of ['close-help', 'got-it']) $(id).addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('click', event => { if (event.target === $('help-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
$('help-dialog').addEventListener('close', () => { if (paused && pauseReason === 'help' && !document.hidden) setPaused(false); });

function celebrate() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 38; i++) {
    const petal = document.createElement('i'); petal.className = 'petal';
    petal.style.left = (i * 37 % 100) + '%';
    petal.style.animationDelay = (i % 9) * .12 + 's';
    petal.style.setProperty('--drift', (i % 2 ? 95 : -75) + 'px');
    petal.style.background = ['#e4ae60', '#d7795c', '#94b4d0', '#e7c79b'][i % 4];
    fragment.append(petal);
  }
  $('petals').replaceChildren(fragment);
}

function explode() {
  const index = game.cells.findIndex(cell => cell.exploded);
  if (index < 0) return;
  const cellRect = cells[index].getBoundingClientRect(), viewport = $('board-viewport'), rect = viewport.getBoundingClientRect();
  const layer = $('explosion');
  layer.style.setProperty('--blast-x', (cellRect.left - rect.left + viewport.scrollLeft + cellRect.width / 2) + 'px');
  layer.style.setProperty('--blast-y', (cellRect.top - rect.top + cellRect.height / 2) + 'px');
  const fragment = document.createDocumentFragment(), ring = document.createElement('i'); ring.className = 'blast-ring'; fragment.append(ring);
  for (let i = 0; i < 22; i++) {
    const spark = document.createElement('i'), angle = i / 22 * Math.PI * 2, distance = 55 + i % 5 * 23;
    spark.className = 'spark'; spark.style.setProperty('--spark-x', Math.cos(angle) * distance + 'px'); spark.style.setProperty('--spark-y', Math.sin(angle) * distance + 30 + 'px'); fragment.append(spark);
  }
  layer.replaceChildren(fragment);
  $('game-window').classList.remove('boom'); void $('game-window').offsetWidth; $('game-window').classList.add('boom');
}

document.querySelectorAll('.digital').forEach(output => output.setAttribute('aria-live', 'off'));
setTheme(preferences.theme === 'classic' ? 'classic' : 'daylight');
updateSound(); newGame();
