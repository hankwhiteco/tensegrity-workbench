// Compare sphere proportions with the reference photo (reference/sphere_photo.webp).
// Photo, measured on the 2000 px image: sphere ~1410 px across, longest face-on struts ~590 px
// -> strut / diameter >= 0.42. Strut ends sit almost on the sides of neighbouring struts. ~3 cables per end.
const TG = require('../src/solver.js');
function measure(pat, m, n, b, c, chir = 1) {
  const base = pat === 'gold' ? TG.goldbergMN(m, n) : TG.geodesicMN(m, n);
  const s = TG.ringSphere(base.V, base.E, 'x', chir);
  s.groups.ring.len = b; s.groups.cross.len = c;
  const md = { P: s.P, members: s.members.map(e => { const g = s.groups[e.group]; return { ...e, len: g.len, mode: g.mode, ratio: g.ratio }; }) };
  const { r, v } = TG.solveModel(md);
  const S = r.lengths[md.members.findIndex(e => e.kind === 's')];
  let R = 0; r.P.forEach(p => R = Math.max(R, Math.hypot(...p)));
  // for each strut end: distance to the nearest other strut (centre line), relative to strut length
  const st = md.members.filter(e => e.kind === 's');
  const segPt = (p, a, b) => { const d = b.map((x, i) => x - a[i]), t = Math.max(0, Math.min(1, d.reduce((s, x, i) => s + x * (p[i] - a[i]), 0) / d.reduce((s, x) => s + x * x, 0))); return Math.hypot(...p.map((x, i) => x - a[i] - d[i] * t)); };
  const endGap = [];
  st.forEach(e => [e.a, e.b].forEach(end => { let best = Infinity; st.forEach(o => { if (o === e) return; best = Math.min(best, segPt(r.P[end], r.P[o.a], r.P[o.b])); }); endGap.push(best / S); }));
  endGap.sort((x, y) => x - y);
  return { valid: v.prestressStable && v.slack === 0, ss: v.superStable, strutDiam: S / (2 * R), endGap: endGap[endGap.length >> 1], clear: v.clearance / S, struts: st.length };
}
module.exports = measure;
if (require.main === module) {
  const rows = [];
  for (const [m, n] of [[1, 0], [1, 1], [2, 0]]) for (const b of [0.6, 1, 1.5, 2, 3]) for (const c of [0.5, 1, 1.5]) {
    const x = measure('geo', m, n, b, c); rows.push({ m, n, b, c, ...x });
  }
  rows.forEach(x => console.log(`${x.struts} struts b ${x.b} c ${x.c} valid ${x.valid} SS ${x.ss} strut/diam ${x.strutDiam.toFixed(3)} endGap ${x.endGap.toFixed(3)} clear ${x.clear.toFixed(3)}`));
}
