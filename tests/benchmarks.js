const TG=require('../src/solver.js');
function resolve(s, over={}){ // apply group settings
  return {P:s.P, members:s.members.map((m,i)=>{const g=s.groups[m.group];const o=over[i]||{};
    return {...m, len:o.len??g.len, mode:o.mode??g.mode, ratio:o.ratio??g.ratio};})};
}
function run(label,s,over){const t0=Date.now();const md=resolve(s,over);const r=TG.formFind(md);const v=TG.verify(r.P,md.members,r.tension);
  const byG={};md.members.forEach((m,i)=>{(byG[m.group]=byG[m.group]||[]).push(r.lengths[i]);});
  console.log(label, (Date.now()-t0)+'ms it',r.iters,'runaway',r.runaway);
  for(const g in byG){const a=byG[g];console.log('  ',g,Math.min(...a).toFixed(5),Math.max(...a).toFixed(5));}
  console.log('  eq',v.equilibrium.toExponential(2),'slack',v.slack,'bad',v.badStrut,'ss',v.selfStress,'mech',v.mech,'minMech',v.minMech&&v.minMech.toExponential(2),'PS',v.prestressStable,'SS',v.superStable,'omZ',v.omZero,'omNeg',v.omNeg,'clear',v.clearance.toFixed(4));
  return {r,v,md};}
for(const n of [3,4,5,6]){const {r}=run('prism'+n,TG.prism(n));
  const a=Math.atan2(r.P[0][1],r.P[0][0]), b=Math.atan2(r.P[n][1],r.P[n][0]); let tw=(b-a)*180/Math.PI; console.log('  twist(side cable b0-t0)',tw.toFixed(4),'expect 90-180/n=',(90-180/n).toFixed(4), '90+180/n', (90+180/n).toFixed(3));}
// Pars dissimilar: cables 20.44, struts 0,1 fixed 26 and one grows
{const s=TG.prism(3); s.groups.bot.len=s.groups.top.len=s.groups.side.len=20.44; const over={}; const st=s.members.map((m,i)=>m.kind==='s'?i:-1).filter(i=>i>=0);
 over[st[0]]={mode:'fixed',len:26};over[st[1]]={mode:'fixed',len:26}; const {r}=run('pars dissimilar',s,over); console.log('  struts',st.map(i=>r.lengths[i].toFixed(3)),' Pars: 36.3');}
{const s=TG.truncated('tetra'); const {r,md}=run('tetra b=c=1',s); console.log('  Pars formula',TG.parsTetra(1,1));}
{const s=TG.truncated('tetra'); s.groups.cross.len=1.5; run('tetra c=1.5',s); console.log('  Pars formula',TG.parsTetra(1,1.5));}
{const s=TG.truncated('tetra',-1); run('tetra other chirality',s);}
run('icosa6',TG.icosa6());
for(const w of ['octa','cube','icosa','dodeca']) run('trunc '+w,TG.truncated(w));
run('tower3x2',TG.tower(3,2)); run('tower3x4',TG.tower(3,4));
// Spheres: 1 repeat must equal the matching truncated polyhedron; bigger ones must pass every check.
for (const [kind, f, expect] of [['gold', 1, 2.87903], ['geo', 1, 2.80252], ['gold', 2], ['gold', 3], ['geo', 2]]) {
  const base = kind === 'gold' ? TG.goldberg(f) : TG.geodesic(f);
  const s = TG.ringSphere(base.V, base.E, kind + f);
  const md = resolve(s); const { r, v } = TG.solveModel(md);
  const k = md.members.findIndex(m => m.kind === 's');
  console.log('sphere', kind, f, 'strut', r.lengths[k].toFixed(5), expect ? '(expect ' + expect + ')' : '', 'PS', v.prestressStable, 'SS', v.superStable, 'slack', v.slack, 'joint types', v.classes.length, 'clear', v.clearance.toFixed(3));
}
