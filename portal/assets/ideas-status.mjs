// What an idea can be marked as. Shared by the idea bank page and the Worker's API (worker/ideas.js), so the
// two cannot disagree. "idea" is the default and is never stored: an idea with no row is simply an idea.
export const STATUSES = [
  { id: 'idea', label: 'Idea', help: 'Not looked at yet' },
  { id: 'planned', label: 'Planned', help: 'We want this: next to pick up in a session' },
  { id: 'building', label: 'Building', help: 'A session is working on it' },
  { id: 'shipped', label: 'Shipped', help: 'In the engine or a game' },
  { id: 'parked', label: 'Parked', help: 'Not now' }
];
export const STATUS_IDS = STATUSES.map(s => s.id);
export const NOTE_MAX = 500;
