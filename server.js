const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

/* ------------------------------------------------------------------ */
/*  Virtual reel strips – weighted symbol distribution                 */
/*  'seven' appears least (rare), 'cherry' appears most (common)      */
/* ------------------------------------------------------------------ */
const SYMBOLS = ['cherry','cherry','cherry','cherry','lemon','lemon','orange','seven','star','grape','watermelon','diamond','K','B','C','G','A','M','E'];

const reels = Array.from({ length: 7 }, () => [...SYMBOLS]);

const MULTIPLIERS = {
  seven:      10,
  bar:        8,
  bell:       5,
  cherry:     3,
  lemon:      2,
  orange:     2,
  plum:       2,
  star:       4,
  grape:      3,
  watermelon: 4,
  diamond:    15
};

/* ------------------------------------------------------------------ */
/*  32 paylines: 7 vertical + 15 horizontal + 10 diagonal             */
/*  Horizontal rows split into overlapping 3-position segments        */
/*  Diagonals span across reels at alternating rows                   */
/* ------------------------------------------------------------------ */
const paylines = [
  { name: 'Col 1',       positions: [[0,0],[1,0],[2,0]], description: 'Leftmost reel — all 3 visible rows match', direction: 'vertical', enabled: false },
  { name: 'Col 2',       positions: [[0,1],[1,1],[2,1]], description: 'Second reel — all 3 visible rows match', direction: 'vertical', enabled: false },
  { name: 'Col 3',       positions: [[0,2],[1,2],[2,2]], description: 'Third reel — all 3 visible rows match', direction: 'vertical', enabled: false },
  { name: 'Col 4',       positions: [[0,3],[1,3],[2,3]], description: 'Center reel — all 3 visible rows match', direction: 'vertical', enabled: false },
  { name: 'Col 5',       positions: [[0,4],[1,4],[2,4]], description: 'Fifth reel — all 3 visible rows match', direction: 'vertical', enabled: false },
  { name: 'Col 6',       positions: [[0,5],[1,5],[2,5]], description: 'Sixth reel — all 3 visible rows match', direction: 'vertical', enabled: false },
  { name: 'Col 7',       positions: [[0,6],[1,6],[2,6]], description: 'Rightmost reel — all 3 visible rows match', direction: 'vertical', enabled: false },
  { name: 'Top L',       positions: [[0,0],[0,1],[0,2]], description: 'Top row, reels 1-3', direction: 'horizontal', enabled: true },
  { name: 'Top M1',      positions: [[0,1],[0,2],[0,3]], description: 'Top row, reels 2-4', direction: 'horizontal', enabled: true },
  { name: 'Top M2',      positions: [[0,2],[0,3],[0,4]], description: 'Top row, reels 3-5', direction: 'horizontal', enabled: true },
  { name: 'Top M3',      positions: [[0,3],[0,4],[0,5]], description: 'Top row, reels 4-6', direction: 'horizontal', enabled: true },
  { name: 'Top R',       positions: [[0,4],[0,5],[0,6]], description: 'Top row, reels 5-7', direction: 'horizontal', enabled: true },
  { name: 'Mid L',       positions: [[1,0],[1,1],[1,2]], description: 'Middle row, reels 1-3', direction: 'horizontal', enabled: true },
  { name: 'Mid M1',      positions: [[1,1],[1,2],[1,3]], description: 'Middle row, reels 2-4', direction: 'horizontal', enabled: true },
  { name: 'Mid M2',      positions: [[1,2],[1,3],[1,4]], description: 'Middle row, reels 3-5', direction: 'horizontal', enabled: true },
  { name: 'Mid M3',      positions: [[1,3],[1,4],[1,5]], description: 'Middle row, reels 4-6', direction: 'horizontal', enabled: true },
  { name: 'Mid R',       positions: [[1,4],[1,5],[1,6]], description: 'Middle row, reels 5-7', direction: 'horizontal', enabled: true },
  { name: 'Bot L',       positions: [[2,0],[2,1],[2,2]], description: 'Bottom row, reels 1-3', direction: 'horizontal', enabled: true },
  { name: 'Bot M1',      positions: [[2,1],[2,2],[2,3]], description: 'Bottom row, reels 2-4', direction: 'horizontal', enabled: true },
  { name: 'Bot M2',      positions: [[2,2],[2,3],[2,4]], description: 'Bottom row, reels 3-5', direction: 'horizontal', enabled: true },
  { name: 'Bot M3',      positions: [[2,3],[2,4],[2,5]], description: 'Bottom row, reels 4-6', direction: 'horizontal', enabled: true },
  { name: 'Bot R',       positions: [[2,4],[2,5],[2,6]], description: 'Bottom row, reels 5-7', direction: 'horizontal', enabled: true },
  { name: 'D1',          positions: [[0,0],[1,1],[2,2]], description: 'Diagonal down, reels 1-3', direction: 'diagonal', enabled: true },
  { name: 'D2',          positions: [[0,1],[1,2],[2,3]], description: 'Diagonal down, reels 2-4', direction: 'diagonal', enabled: true },
  { name: 'D3',          positions: [[0,2],[1,3],[2,4]], description: 'Diagonal down, reels 3-5', direction: 'diagonal', enabled: true },
  { name: 'D4',          positions: [[0,3],[1,4],[2,5]], description: 'Diagonal down, reels 4-6', direction: 'diagonal', enabled: true },
  { name: 'D5',          positions: [[0,4],[1,5],[2,6]], description: 'Diagonal down, reels 5-7', direction: 'diagonal', enabled: true },
  { name: 'U1',          positions: [[2,0],[1,1],[0,2]], description: 'Diagonal up, reels 1-3', direction: 'diagonal', enabled: true },
  { name: 'U2',          positions: [[2,1],[1,2],[0,3]], description: 'Diagonal up, reels 2-4', direction: 'diagonal', enabled: true },
  { name: 'U3',          positions: [[2,2],[1,3],[0,4]], description: 'Diagonal up, reels 3-5', direction: 'diagonal', enabled: true },
  { name: 'U4',          positions: [[2,3],[1,4],[0,5]], description: 'Diagonal up, reels 4-6', direction: 'diagonal', enabled: true },
  { name: 'U5',          positions: [[2,4],[1,5],[0,6]], description: 'Diagonal up, reels 5-7', direction: 'diagonal', enabled: true }
];

/* ------------------------------------------------------------------ */
/*  Scatter configuration (also triggers free spins)                   */
/* ------------------------------------------------------------------ */
const scatter = {
  enabled: false,
  freeSpinsEnabled: false,
  symbol:  'diamond',
  description: 'diamond appears anywhere on the grid',
  freeSpinAwards: [
    { count: 3, award: 5 },
    { count: 4, award: 8 },
    { count: 5, award: 15 },
    { count: 6, award: 20 },
    { count: 7, award: 30 }
  ],
  payouts: [
    { count: 3, multiplier: 3 },
    { count: 4, multiplier: 8 },
    { count: 5, multiplier: 15 },
    { count: 6, multiplier: 30 },
    { count: 7, multiplier: 100 }
  ]
};

/* ------------------------------------------------------------------ */
/*  Mini-game bonus (roulette) configuration                           */
/* ------------------------------------------------------------------ */
const miniGame = {
  enabled: false,
  symbol: 'star',
  triggerCount: 3,
  description: '3+ stars triggers the roulette bonus',
  segments: [
    { multiplier: 2,  color: '#4CAF50' },
    { multiplier: 3,  color: '#2196F3' },
    { multiplier: 2,  color: '#4CAF50' },
    { multiplier: 5,  color: '#9C27B0' },
    { multiplier: 3,  color: '#2196F3' },
    { multiplier: 8,  color: '#FF9800' },
    { multiplier: 2,  color: '#4CAF50' },
    { multiplier: 10, color: '#f44336' },
    { multiplier: 3,  color: '#2196F3' },
    { multiplier: 5,  color: '#9C27B0' },
    { multiplier: 2,  color: '#4CAF50' },
    { multiplier: 15, color: '#FFD700' }
  ]
};

/* ------------------------------------------------------------------ */
/*  Jackpot configuration – middle row must match exact pattern        */
/* ------------------------------------------------------------------ */
const jackpot = {
  enabled: true,
  forceJackpot: true,
  pattern: ['K','B','C','G','A','M','E'],
  row: 1,
  potAmount: '$200000',
  description: 'Middle row spells K-B-C-G-A-M-E'
};

/* ------------------------------------------------------------------ */
/*  Core spin logic – cryptographically secure RNG                     */
/* ------------------------------------------------------------------ */
function spin(forceJackpot) {

  let stopPositions = reels.map(reel => crypto.randomInt(reel.length));

  const grid = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) =>
      reels[col][(stopPositions[col] + row) % reels[col].length]
    )
  );

  const winningLines = [];
  let totalMultiplier = 0;

  for (const line of paylines.filter(l => l.enabled)) {
    const symbols = line.positions.map(([r, c]) => grid[r][c]);
    if (symbols.every(s => s === symbols[0])) {
      const multiplier = MULTIPLIERS[symbols[0]];
      winningLines.push({
        name:        line.name,
        symbol:      symbols[0],
        multiplier,
        positions:   line.positions,
        description: line.description,
        direction:   line.direction,
        enabled:     line.enabled
      });
      totalMultiplier += multiplier;
    }
  }

  if (scatter.enabled) {
    const scatterCount = grid.flat().filter(s => s === scatter.symbol).length;
    const payout = scatter.payouts.filter(p => scatterCount >= p.count).pop();
    if (payout) {
      const scatterPositions = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 7; c++) {
          if (grid[r][c] === scatter.symbol) scatterPositions.push([r, c]);
        }
      }
      winningLines.push({
        name:        'Scatter',
        symbol:      scatter.symbol,
        multiplier:  payout.multiplier,
        count:       scatterCount,
        positions:   scatterPositions,
        description: scatter.description,
        direction:   'scatter',
        enabled:     scatter.enabled
      });
      totalMultiplier += payout.multiplier;
    }
  }

  /* Free spins award */
  let freeSpinsAwarded = 0;
  if (scatter.enabled && scatter.freeSpinsEnabled) {
    const scatterCount = grid.flat().filter(s => s === scatter.symbol).length;
    const award = scatter.freeSpinAwards.filter(a => scatterCount >= a.count).pop();
    if (award) freeSpinsAwarded = award.award;
  }

  /* Mini-game trigger */
  let miniGameTriggered = false;
  if (miniGame.enabled) {
    const starCount = grid.flat().filter(s => s === miniGame.symbol).length;
    if (starCount >= miniGame.triggerCount) {
      miniGameTriggered = true;
      const starPositions = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 7; c++) {
          if (grid[r][c] === miniGame.symbol) starPositions.push([r, c]);
        }
      }
      winningLines.push({
        name:        'Bonus',
        symbol:      miniGame.symbol,
        multiplier:  0,
        count:       starCount,
        positions:   starPositions,
        description: miniGame.description,
        direction:   'scatter',
        enabled:     miniGame.enabled
      });
    }
  }

  /* Force jackpot for testing – overrides middle row to match pattern */
  if ((forceJackpot || jackpot.forceJackpot) && jackpot.enabled) {
    for (let c = 0; c < 7; c++) {
      grid[jackpot.row][c] = jackpot.pattern[c];
    }
  }

  /* Jackpot trigger – middle row matches exact pattern */
  let jackpotTriggered = false;
  if (jackpot.enabled) {
    const middleRow = grid[jackpot.row];
    if (middleRow.every((s, i) => s === jackpot.pattern[i])) {
      jackpotTriggered = true;
      winningLines.push({
        name:        'Jackpot',
        symbol:      'jackpot',
        multiplier:  0,
        potAmount:   jackpot.potAmount,
        positions:   jackpot.pattern.map((_, i) => [jackpot.row, i]),
        description: jackpot.description,
        direction:   'horizontal',
        enabled:     jackpot.enabled
      });
    }
  }

  return {
    stopPositions,
    grid,
    winningLines,
    totalMultiplier,
    isWinner: winningLines.length > 0,
    freeSpinsAwarded,
    miniGameTriggered,
    jackpotTriggered,
    jackpotPot: jackpot.potAmount,
    jackpotEnabled: jackpot.enabled
  };
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */
app.get('/api/spin', (req, res) => {
  res.json(spin(req.query.forceJackpot === 'true'));
});

app.post('/api/config/jackpot', express.json(), (req, res) => {
  const allowed = ['enabled', 'forceJackpot', 'potAmount', 'pattern', 'row'];
  for (const key of allowed) {
    if (key in req.body) {
      jackpot[key] = req.body[key];
    }
  }
  res.json({ jackpot });
});

app.get('/api/minigame', (_req, res) => {
  const winningIndex = crypto.randomInt(miniGame.segments.length);
  res.json({ segments: miniGame.segments, winningIndex });
});

app.listen(PORT, () => {
  console.log(`Slot machine running on http://localhost:${PORT}`);
});
