// Renders candidate spheres beside the reference photo: node tests/photo_compare.js -> tests/out/compare.png
const TG = require('../src/solver.js'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const cands = JSON.parse(process.argv[2] || '[["geo",1,1,1,1,1],["geo",1,1,2,1,1],["geo",2,0,1,1,1],["geo",2,0,2,1,1],["gold",2,0,1,1,1]]');
const models = cands.map(([pat, m, n, tw, b, c]) => {
  const base = pat === 'gold' ? TG.goldbergMN(m, n) : TG.geodesicMN(m, n);
  const s = TG.ringSphere(base.V, base.E, 'x', 1, tw); s.groups.ring.len = b; s.groups.cross.len = c;
  const md = { P: s.P, members: s.members.map(e => { const g = s.groups[e.group]; return { ...e, len: g.len, mode: g.mode, ratio: g.ratio }; }) };
  const { r, v } = TG.solveModel(md);
  const S = r.lengths[md.members.findIndex(e => e.kind === 's')]; let R = 0; r.P.forEach(p => R = Math.max(R, Math.hypot(...p)));
  return { label: `${pat === 'gold' ? 'triangle' : 'ring'} joints, ${md.members.filter(e => e.kind === 's').length} struts, twist ${tw}, b ${b} c ${c}` + ` | valid ${v.prestressStable && v.slack === 0}, strut/diam ${(S / 2 / R).toFixed(2)}`, P: r.P, M: md.members.map(e => [e.a, e.b, e.kind === 's' ? 1 : 0]) };
});
const photo = path.resolve(__dirname, '../tests/out/crops/full.png');
const html = `<!doctype html><html><body style="margin:0;background:#8a8c8f;font:16px sans-serif;color:#111">
<div style="display:grid;grid-template-columns:repeat(3,900px);gap:8px;padding:8px">
<div><img src="file://${photo}" style="width:900px;height:900px;object-fit:cover"><div>photo</div></div>
${models.map((_, i) => `<div><canvas id="c${i}" width="900" height="900"></canvas><div id="l${i}"></div></div>`).join('')}
</div><script>
const models = ${JSON.stringify(models)};
models.forEach((md, i) => {
  document.getElementById('l' + i).textContent = md.label;
  const cv = document.getElementById('c' + i), x = cv.getContext('2d');
  x.fillStyle = '#8a8c8f'; x.fillRect(0, 0, 900, 900);
  let R = 0; md.P.forEach(p => R = Math.max(R, Math.hypot(...p)));
  const yaw = 0.5, pit = 0.25, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  const pr = p => { const X = cy * p[0] - sy * p[1], Y = sy * p[0] + cy * p[1], Z = p[2]; const Y2 = cp * Y - sp * Z, Z2 = sp * Y + cp * Z; const k = 4 * R / (4 * R + Y2); return [450 + X / R * 330 * k, 400 - Z2 / R * 330 * k, Y2]; };
  const Q = md.P.map(pr);
  const segs = md.M.map(([a, b, s]) => ({ a: Q[a], b: Q[b], s, z: (Q[a][2] + Q[b][2]) / 2 })).sort((u, v) => v.z - u.z);
  x.lineCap = 'round';
  for (const g of segs) { const depth = (g.z / R + 1) / 2; x.strokeStyle = g.s ? 'rgb(' + [200 - 90 * depth, 200 - 90 * depth, 205 - 90 * depth] + ')' : 'rgba(20,20,20,0.8)'; x.lineWidth = g.s ? 7.5 * (1 - 0.3 * depth) : 0.7; x.beginPath(); x.moveTo(g.a[0], g.a[1]); x.lineTo(g.b[0], g.b[1]); x.stroke(); if (g.s) { x.strokeStyle = 'rgba(40,40,45,0.9)'; x.lineWidth = 1; x.stroke(); } }
});
</script></body></html>`;
fs.mkdirSync(path.resolve(__dirname, 'out'), { recursive: true });
const f = path.resolve(__dirname, 'out/compare.html'); fs.writeFileSync(f, html);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=2740,960', '--screenshot=' + path.resolve(__dirname, 'out/compare.png'), 'file://' + f], { stdio: 'ignore' });
console.log(models.map(m => m.label).join('\n'));
