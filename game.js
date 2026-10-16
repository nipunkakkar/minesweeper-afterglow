export const PRESETS = Object.freeze({
  beginner: { rows: 9, cols: 9, mines: 10, name: 'Beginner' },
  intermediate: { rows: 16, cols: 16, mines: 40, name: 'Intermediate' },
  expert: { rows: 16, cols: 30, mines: 99, name: 'Expert' },
});

export class Minesweeper {
  constructor({ rows = 9, cols = 9, mines = 10, random = Math.random } = {}) {
    if (![rows, cols, mines].every(Number.isInteger) || rows < 3 || cols < 3 || mines < 1 || mines > rows * cols - 9) {
      throw new RangeError('The board must leave space for a safe first opening.');
    }
    this.rows = rows;
    this.cols = cols;
    this.mineCount = mines;
    this.random = random;
    this.status = 'ready';
    this.charges = 3;
    this.scans = [];
    this.revealedCount = 0;
    this.cells = Array.from({ length: rows * cols }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false, exploded: false }));
  }

  valid(index) { return Number.isInteger(index) && index >= 0 && index < this.cells.length; }
  get flagCount() { return this.cells.filter(cell => cell.flagged).length; }

  neighbors(index, includeCenter = false) {
    if (!this.valid(index)) return [];
    const row = Math.floor(index / this.cols), col = index % this.cols, result = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr, c = col + dc;
        if ((includeCenter || dr || dc) && r >= 0 && r < this.rows && c >= 0 && c < this.cols) result.push(r * this.cols + c);
      }
    }
    return result;
  }

  plant(firstIndex) {
    const safe = new Set(this.neighbors(firstIndex, true));
    const candidates = this.cells.map((_, index) => index).filter(index => !safe.has(index));
    for (let i = 0; i < this.mineCount; i++) {
      const j = i + Math.floor(this.random() * (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      this.cells[candidates[i]].mine = true;
    }
    this.cells.forEach((cell, index) => { cell.adjacent = this.neighbors(index).filter(i => this.cells[i].mine).length; });
    this.status = 'playing';
  }

  toggleFlag(index) {
    if (!this.valid(index) || !['ready', 'playing'].includes(this.status) || this.cells[index].revealed) return false;
    this.cells[index].flagged = !this.cells[index].flagged;
    return true;
  }

  reveal(index) {
    const changed = [];
    if (!this.valid(index) || !['ready', 'playing'].includes(this.status) || this.cells[index].flagged) return { type: 'noop', changed };
    if (this.status === 'ready') this.plant(index);
    const cell = this.cells[index];
    let targets = [index];
    if (cell.revealed) {
      const neighbors = this.neighbors(index);
      if (!cell.adjacent || neighbors.filter(i => this.cells[i].flagged).length !== cell.adjacent) return { type: 'noop', changed };
      targets = neighbors.filter(i => !this.cells[i].flagged && !this.cells[i].revealed);
    }
    const queued = new Set(targets), queue = [...targets];
    while (queue.length) {
      const i = queue.pop(), target = this.cells[i];
      if (target.revealed || target.flagged) continue;
      target.revealed = true;
      changed.push(i);
      if (target.mine) {
        target.exploded = true;
        this.status = 'lost';
        return { type: 'lost', changed };
      }
      this.revealedCount++;
      if (target.adjacent === 0) {
        for (const n of this.neighbors(i)) {
          if (!queued.has(n)) { queued.add(n); queue.push(n); }
        }
      }
    }
    if (this.revealedCount === this.cells.length - this.mineCount) {
      this.status = 'won';
      this.cells.forEach(target => { if (target.mine) target.flagged = true; });
    }
    return { type: this.status === 'won' ? 'won' : changed.length ? 'revealed' : 'noop', changed };
  }

  scan(index) {
    if (!this.valid(index) || this.status !== 'playing' || this.charges === 0) return null;
    const area = this.neighbors(index, true);
    const scan = { index, area, mines: area.filter(i => this.cells[i].mine).length };
    this.charges--;
    this.scans.push(scan);
    return scan;
  }
}
