// Random control changes like a user would make; report anything that would blank the view.
const TG = require('../src/solver.js');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const fams = ['prism', 'tetra', 'octa', 'cube', 'icosa6', 'tower'];
let bad = 0;
for (let t = 0; t < 150; t++) {
  const fam = fams[Math.floor(rnd() * fams.length)];
  let s = fam === 'tower' ? TG.tower(3 + Math.floor(rnd() * 3), 2 + Math.floor(rnd() * 4)) : fam === 'prism' ? TG.prism(3 + Math.floor(rnd() * 8)) : fam === 'icosa6' ? TG.icosa6() : TG.truncated(fam);
  if (rnd() < 0.5) s.P = s.P.map(p => [-p[0], p[1], p[2]]);
  for (const g of Object.values(s.groups)) {
    if (g.kind === 'c') g.len = 20 * (rnd() < 0.3 ? 0.05 + rnd() * 5 : 1);
    else g.ratio = rnd() < 0.3 ? 0.05 + rnd() * 5 : 1;
  }
  const over = {};
  s.members.forEach((m, i) => { if (m.kind === 's' && rnd() < 0.15) over[i] = { mode: 'fixed', len: 5 + rnd() * 60 }; if (m.kind === 'c' && rnd() < 0.1) over[i] = { len: 1 + rnd() * 60 }; });
  const md = { P: s.P, members: s.members.map((m, i) => { const g = s.groups[m.group], o = over[i] || {}; return { ...m, len: o.len ?? g.len, mode: o.mode ?? g.mode, ratio: o.ratio ?? g.ratio }; }) };
  let r, v, err = null;
  const t0 = Date.now();
  try { r = TG.formFind(md); v = TG.verify(r.P, md.members, r.tension); } catch (e) { err = e.message; }
  const nan = r && r.P.some(p => p.some(x => !Number.isFinite(x)));
  const vnan = v && !Number.isFinite(v.equilibrium);
  if (err || nan || vnan || (r && r.runaway)) { bad++; console.log(t, s.name, err || (nan ? 'NaN positions' : vnan ? 'NaN verify' : 'runaway'), 'fixed', Object.values(over).filter(o => o.mode).length, (Date.now() - t0) + 'ms'); }
}
console.log('bad', bad, 'of 150');
