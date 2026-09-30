// The banded verifier (big spheres) must agree with the dense one (exact counts) wherever both can run.
const TG = require('../src/solver.js');
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let n = 0, dis = 0, psF = 0, ssF = 0;
for (let t = 0; t < 120; t++) {
  const pick = Math.floor(rnd() * 4);
  const s = pick === 0 ? TG.prism(3 + Math.floor(rnd() * 5)) : pick === 1 ? TG.tower(3, 2 + Math.floor(rnd() * 3)) : pick === 2 ? TG.truncated(['tetra', 'octa', 'cube'][Math.floor(rnd() * 3)]) : TG.icosa6();
  for (const g of Object.values(s.groups)) { if (g.kind === 'c') g.len *= 0.5 + rnd() * 1.5; else g.ratio = 1; }
  const md = { P: s.P, members: s.members.map(m => { const g = s.groups[m.group]; return { ...m, len: g.len, mode: g.mode, ratio: g.ratio }; }) };
  const r = TG.formFind(md);
  if (r.runaway) continue;
  const a = TG.verify(r.P, md.members, r.tension), b = TG.verifyBand(r.P, md.members, r.tension);
  n++; if (!a.prestressStable) psF++; if (!a.superStable) ssF++;
  if (a.prestressStable !== b.prestressStable || a.superStable !== b.superStable) { dis++; console.log('disagree', s.name, 'dense', a.prestressStable, a.superStable, 'minMech', a.minMech, 'omNeg', a.omNeg, 'omZero', a.omZero, '| band', b.prestressStable, b.superStable); }
}
console.log('compared', n, 'disagreements', dis, '(dense says not prestress stable:', psF, ', not super stable:', ssF + ')');
