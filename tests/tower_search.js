const TG = require('../src/solver.js');
function tower(n, stages, { a, b, sling, draw, side, h = 1.4, ov = 0.35, flipA = false, flipB = false }) {
  const P = [], m = [], B = [], T = [];
  let th = 0;
  for (let k = 0; k < stages; k++) {
    const dir = k % 2 ? -1 : 1, tau = -dir * (Math.PI / 2 - Math.PI / n);
    B.push([]); T.push([]);
    const z0 = k * h * (1 - ov);
    for (let i = 0; i < n; i++) { const t = th + 2 * Math.PI * i / n; B[k].push(P.length); P.push([Math.cos(t), Math.sin(t), z0]); }
    for (let i = 0; i < n; i++) { const t = th + 2 * Math.PI * i / n + tau; T[k].push(P.length); P.push([Math.cos(t), Math.sin(t), z0 + h]); }
    for (let i = 0; i < n; i++) {
      m.push({ a: B[k][(i + dir + n) % n], b: T[k][i], kind: 's', mode: 'grow', ratio: 1, len: 1 });
      m.push({ a: B[k][i], b: T[k][i], kind: 'c', len: side });
    }
    th = th + tau + Math.PI / n;
  }
  for (let i = 0; i < n; i++) {
    m.push({ a: B[0][i], b: B[0][(i + 1) % n], kind: 'c', len: 1 });
    m.push({ a: T[stages - 1][i], b: T[stages - 1][(i + 1) % n], kind: 'c', len: 1 });
  }
  for (let k = 0; k + 1 < stages; k++) for (let i = 0; i < n; i++) {
    const alt = k % 2 ? -1 : 1, fa = flipA ? alt : 1, fb = flipB ? alt : 1;
    m.push({ a: T[k][i], b: B[k + 1][i], kind: 'c', len: sling });
    m.push({ a: T[k][i], b: B[k + 1][(i - 1 + n) % n], kind: 'c', len: sling });
    m.push({ a: T[k][i], b: T[k + 1][(i + fa * a + 2 * n) % n], kind: 'c', len: draw });
    m.push({ a: B[k + 1][i], b: B[k][(i + fb * b + 2 * n) % n], kind: 'c', len: draw });
  }
  return { P, members: m };
}
module.exports = tower;
if (require.main === module) {
  const good = [];
  for (const n of [3]) for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const sling of [0.5, 0.7, 0.9]) for (const draw of [0.8, 1, 1.2]) for (const side of [1, 1.3]) {
    const md = tower(n, 3, { a, b, sling, draw, side });
    const r = TG.formFind(md, { eps: [1e-2, 1e-3, 1e-4] }); const v = TG.verify(r.P, md.members, r.tension);
    if (!r.runaway && v.slack === 0 && v.prestressStable && v.clearance > 0.08) good.push([a, b, sling, draw, side, v.clearance.toFixed(3), v.superStable, v.mech, r.lengths[0].toFixed(3)]);
  }
  console.log(good.length); good.forEach(g => console.log(g.join(' ')));
}
