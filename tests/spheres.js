const TG = require('../src/solver.js');
const f = +process.argv[2] || 2, kinds = (process.argv[3] || 'geo,gold').split(',');
for (const kind of kinds) for (const chir of [1, -1]) {
  const base = kind === 'geo' ? TG.geodesic(f) : TG.goldberg(f);
  const s = TG.ringSphere(base.V, base.E, kind + f, chir);
  const md = { P: s.P, members: s.members.map(m => { const g = s.groups[m.group]; return { ...m, len: g.len, mode: g.mode, ratio: g.ratio }; }) };
  const t = Date.now();
  const { r, v } = TG.solveModel(md);
  const st = md.members.map((m, k) => m.kind === 's' ? r.lengths[k] : null).filter(x => x);
  console.log(kind, 'f', f, 'chir', chir, 'nodes', md.P.length, 'struts', st.length, 'units', r.repeatUnits, (Date.now() - t) + 'ms',
    '| run', r.runaway, 'eq', v.equilibrium.toExponential(1), 'slack', v.slack, 'PS', v.prestressStable, 'c', v.prestressC, 'SS', v.superStable,
    'clear', v.clearance.toFixed(3), 'struts', Math.min(...st).toFixed(3) + '-' + Math.max(...st).toFixed(3), 'jointClasses', v.classes.length);
}
