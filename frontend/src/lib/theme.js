// Chalkboard → notebook palette. Each accent maps to a real product stage,
// so the same color always means the same thing everywhere it appears.
export const COLORS = {
  ink: '#14181a',
  board: '#1e2a22',
  paper: '#faf6ec',
  paperDim: '#f1ead9',
  chalk: '#f5f1e6',
  coral: '#ef7862', // Capture
  amber: '#f2b84e', // Review
  digital: '#2DD4BF', // Generate / AI
  teal: '#0F9F8F', // Learn & Analyze
};

export const STAGE_ORDER = ['coral', 'amber', 'digital', 'teal'];

export const STAGE_LABELS = {
  coral: 'Capture',
  amber: 'Review',
  digital: 'Generate',
  teal: 'Learn & Analyze',
};
