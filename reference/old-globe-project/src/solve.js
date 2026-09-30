const R1=require('./geodesic.js');
const {geodesic}=R1;
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mulS=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return mulS(a,1/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dist=(a,b)=>len(sub(a,b));
function rot(t,n,a){const c=Math.cos(a),s=Math.sin(a);return add(mulS(t,c),mulS(cross(n,t),s));}
function segSeg(p1,q1,p2,q2){
  const d1=sub(q1,p1),d2=sub(q2,p2),r=sub(p1,p2),a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r);
  const c=dot(d1,r),b=dot(d1,d2),den=a*e-b*b;let s,t;
  s=den>1e-12?Math.max(0,Math.min(1,(b*f-c*e)/den)):0;
  t=(b*s+f)/e;
  if(t<0){t=0;s=Math.max(0,Math.min(1,-c/a));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(b-c)/a));}
  return [s,t,add(p1,mulS(d1,s)),add(p2,mulS(d2,t))];
}
function pick(f,opt){
  const pts=geodesic(f),n=pts.length;
  let e=1e9;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)e=Math.min(e,dist(pts[i],pts[j]));
  const adj=pts.map(()=>[]);
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(dist(pts[i],pts[j])<e*1.3){adj[i].push(j);adj[j].push(i);}
  const L=e*opt.L;
  // lattice directions at each node, rotated by the twist angle
  const dirs=pts.map((p,v)=>adj[v].map(w=>{const d=sub(pts[w],p);const t=sub(d,mulS(p,dot(d,p)));return rot(norm(t),p,opt.alpha);}));
  const okAt=(v,w,tol)=>{
    const d=sub(pts[w],pts[v]);const t=norm(sub(d,mulS(pts[v],dot(d,pts[v]))));
    return dirs[v].some(u=>dot(u,t)>Math.cos(tol));
  };
  let tol=opt.tol;
  const cand=pts.map(()=>[]);
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const d=dist(pts[i],pts[j]);
    if(d>L*(1-opt.lw)&&d<L*(1+opt.lw)&&okAt(i,j,tol)&&okAt(j,i,tol)){cand[i].push(j);cand[j].push(i);}
  }
  let m=null,bestLeft=1e9;
  for(let sd=1;sd<300;sd++){
    let s=sd;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
    const mm=Array(n).fill(-1);
    for(;;){
      let best=-1,bd=1e9;
      for(let v=0;v<n;v++)if(mm[v]<0){const dd=cand[v].filter(w=>mm[w]<0).length;if(dd===0)continue;if(dd<bd||(dd===bd&&rnd()<.3)){bd=dd;best=v;}}
      if(best<0)break;
      const c=cand[best].filter(w=>mm[w]<0);
      c.sort((a,b)=>Math.abs(dist(pts[best],pts[a])-L)-Math.abs(dist(pts[best],pts[b])-L)+(rnd()-.5)*0.02);
      mm[best]=c[0];mm[c[0]]=best;
    }
    const left=mm.filter(x=>x<0).length;
    if(left<bestLeft){bestLeft=left;m=mm;}
    if(left===0)break;
  }
  // pair up anything left over with the nearest free node (loosest rule, rare)
  const free=[];for(let v=0;v<n;v++)if(m[v]<0)free.push(v);
  while(free.length>1){
    const v=free.shift();let bi=0,bd=1e9;
    free.forEach((w,i)=>{const d=Math.abs(dist(pts[v],pts[w])-L);if(d<bd){bd=d;bi=i;}});
    const w=free.splice(bi,1)[0];m[v]=w;m[w]=v;
  }
  console.error('leftover after rule-based matching:',bestLeft);
  if(!m)throw new Error('no matching');
  return {pts,adj,e,L,m,tol};
}
function run(f,opt){
  const {pts,adj,e,L,m,tol}=pick(f,opt);const n=pts.length;
  const struts=[],cables=[];
  for(let i=0;i<n;i++){if(m[i]>i)struts.push([i,m[i]]);for(const j of adj[i])if(j>i)cables.push([i,j]);}
  const P=pts.map(p=>p.slice()),V=pts.map(()=>[0,0,0]);
  const cl=e*opt.cab;
  const U0=pts.map(p=>p.slice()),RR=pts.map(()=>1),VR=pts.map(()=>0);
  for(let it=0;it<opt.iters;it++){
    const F=P.map(()=>[0,0,0]);
    const sp=(a,b,r,k)=>{const d=dist(P[a],P[b])||1e-9,ff=k*(d-r)/d;for(let q=0;q<3;q++){const dx=P[b][q]-P[a][q];F[a][q]+=ff*dx;F[b][q]-=ff*dx;}};
    cables.forEach(([a,b])=>sp(a,b,cl,opt.kc));
    struts.forEach(([a,b])=>sp(a,b,L,opt.ks));
    const rr=e*opt.nrep;
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const dx0=P[j][0]-P[i][0];if(dx0>rr||dx0<-rr)continue;const d=dist(P[i],P[j]);if(d<rr&&d>1e-9){const ff=-0.6*(rr-d)/d;for(let q=0;q<3;q++){const dx=P[j][q]-P[i][q];F[i][q]+=ff*dx;F[j][q]-=ff*dx;}}}
    const gm=e*opt.gap;
    for(let i=0;i<struts.length;i++){const [a,b]=struts[i];
      for(let j=i+1;j<struts.length;j++){const [c,d]=struts[j];if(a===c||a===d||b===c||b===d)continue;
        if(Math.abs(P[a][0]-P[c][0])>L*1.5+gm)continue;
        const [s,t,X,Y]=segSeg(P[a],P[b],P[c],P[d]);const dd=dist(X,Y);
        if(dd<gm&&dd>1e-9){const ff=opt.kg*(gm-dd)/dd,dv=sub(Y,X);
          for(const [idx,w] of[[a,1-s],[b,s]])for(let q=0;q<3;q++)F[idx][q]-=ff*dv[q]*w;
          for(const [idx,w] of[[c,1-t],[d,t]])for(let q=0;q<3;q++)F[idx][q]+=ff*dv[q]*w;}
      }}
    // radial-only: nodes keep their geodesic direction, only their radius moves (layers the struts)
    for(let i=0;i<n;i++){
      const u=U0[i];const fr=dot(F[i],u);
      VR[i]=(VR[i]+fr*opt.dt)*opt.damp;
      RR[i]=Math.max(opt.rmin,Math.min(opt.rmax,RR[i]+VR[i]));
      P[i]=mulS(u,RR[i]);
    }
  }
  return {P,struts,cables,e,n,tol};
}
function stats(r){
  const {P,struts,cables}=r;const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
  const sl=struts.map(([a,b])=>dist(P[a],P[b])),rad=P.map(len);
  let gap=1e9;
  for(let i=0;i<struts.length;i++)for(let j=i+1;j<struts.length;j++){const [a,b]=struts[i],[c,d]=struts[j];if(a===c||a===d||b===c||b===d)continue;const [,,X,Y]=segSeg(P[a],P[b],P[c],P[d]);gap=Math.min(gap,dist(X,Y));}
  return {n:r.n,struts:struts.length,cables:cables.length,strutLen:[Math.min(...sl),avg(sl),Math.max(...sl)].map(x=>+x.toFixed(3)),rad:[Math.min(...rad),Math.max(...rad)].map(x=>+x.toFixed(3)),gap:+gap.toFixed(3),e:+r.e.toFixed(3),tol:+r.tol.toFixed(2)};
}
module.exports={run,stats};
if(require.main===module){
  const f=+process.argv[2],o=JSON.parse(process.argv[3]||'{}');
  const opt=Object.assign({L:3.5,alpha:0.25,tol:0.12,lw:0.25,cab:0.85,kc:0.5,ks:2,nrep:0.6,gap:0.4,kg:2,kr:0.5,dt:0.03,damp:0.94,iters:2500,rmin:0.9,rmax:1.1},o);
  const r=run(f,opt);console.error(JSON.stringify(stats(r)));
  console.log(JSON.stringify({P:r.P,struts:r.struts,cables:r.cables}));
}
