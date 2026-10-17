// Fjordheim's thumbnail scene, for tools/thumbnail.py --eval (see NOTES.md): a summer homestead with a ripe field and the
// knarr coming in along the fjord.
(() => {
  HOME.season = 1; HOME.tod = .5; paintGround(1); HOME.stock = { wood: 30, planks: 20, stone: 30, food: 30 };
  const L = LANDING, put = (t, i, j, st) => { const o = placeBuilding(t, i, j); finishBuilding(o); if (st != null) o.stage = st; return o; };
  for (let j = L[1] - 12; j < L[1]; j++) for (let i = L[0] - 7; i < L[0] + 9; i++) if (inMap(i, j)) { const k = tidx(i, j); if (thing[k] === T_TREE || thing[k] === T_ROCK || thing[k] === T_BUSH) { thing[k] = 0; ref[k] = -1; } }
  put('longhouse', L[0] - 2, L[1] - 6); put('fishing', L[0] - 5, L[1] - 3); put('well', L[0] + 2, L[1] - 3);
  put('field', L[0] + 2, L[1] - 7, 3); put('field', L[0] + 5, L[1] - 7, 2); put('woodcutter', L[0] + 4, L[1] - 11); put('stabbur', L[0] - 2, L[1] - 10);
  isoPaintFoot(HOME.buildings[3]); isoPaintFoot(HOME.buildings[4]);
  newPerson('father', L[0] + 1, L[1] - 2); newPerson('mother', L[0] + 3, L[1] - 1);
  sendShip(); HOME.ship.u = L[0] + 5; HOME.ship.v = shipLane(L[0] + 5); NEWS = [];
  centreOn([L[0] - 2, L[1] - 9, 6, 6]);
})()
