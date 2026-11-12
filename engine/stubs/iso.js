// ===================== ENGINE · stand-in for the isometric ground: this page was built without it =====================
// game.json's "engine" list does not name "iso", so the page leaves out engine/12_iso.js and keeps these names; calling one says what to add.
const ISO = { ni: 0, nj: 0, tw: 0, th: 0, ox: 0, oy: 0 };
const _noIso = name => () => { throw new Error(`${name}: this page was built without the isometric ground: add "iso" to the "engine" list in game.json (engine/API.md, Smaller pages)`); };
const isoInit = _noIso('isoInit'), isoToWorld = _noIso('isoToWorld'), worldToIso = _noIso('worldToIso'), isoPick = _noIso('isoPick'), isoGround = _noIso('isoGround'),
  isoSetTile = _noIso('isoSetTile'), isoOutline = _noIso('isoOutline'), isoDraw = _noIso('isoDraw');
