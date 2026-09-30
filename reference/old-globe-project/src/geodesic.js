const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mulS=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return mulS(a,1/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dist=(a,b)=>len(sub(a,b));
function geodesic(f){
  const p=(1+Math.sqrt(5))/2,base=[];
  for(const a of[1,-1])for(const b of[p,-p]){base.push([0,a,b],[a,b,0],[b,0,a]);}
  const B=base.map(norm);let edge=1e9;
  for(let i=0;i<12;i++)for(let j=i+1;j<12;j++)edge=Math.min(edge,dist(B[i],B[j]));
  const faces=[];
  for(let i=0;i<12;i++)for(let j=i+1;j<12;j++)for(let k=j+1;k<12;k++)
    if([[i,j],[j,k],[i,k]].every(([a,b])=>Math.abs(dist(B[a],B[b])-edge)<1e-6))faces.push([i,j,k]);
  const seen=new Map(),pts=[];
  for(const [a,b,c] of faces)for(let i=0;i<=f;i++)for(let j=0;i+j<=f;j++){
    const k=f-i-j,v=norm([0,1,2].map(m=>(i*B[a][m]+j*B[b][m]+k*B[c][m])/f));
    const key=v.map(x=>Math.round(x*1e4)).join(',');
    if(!seen.has(key)){seen.set(key,1);pts.push(v);}
  }
  return pts;
}
function segSeg(p1,q1,p2,q2){ // closest points, Ericson
  const d1=sub(q1,p1),d2=sub(q2,p2),r=sub(p1,p2),a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r);
  const c=dot(d1,r),b=dot(d1,d2),den=a*e-b*b;let s,t;
  s=den>1e-12?Math.max(0,Math.min(1,(b*f-c*e)/den)):0;
  t=(b*s+f)/e;
  if(t<0){t=0;s=Math.max(0,Math.min(1,-c/a));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(b-c)/a));}
  return [s,t,add(p1,mulS(d1,s)),add(p2,mulS(d2,t))];
}
function matching(pts,adj,seed,order){
  let s=seed;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
  const n=pts.length,m=Array(n).fill(-1);
  const free=v=>adj[v].filter(w=>m[w]<0).length;
  for(let it=0;it<n;it++){
    let best=-1,bd=1e9;
    for(let v=0;v<n;v++)if(m[v]<0){const d=free(v);if(d===0)return null;if(d<bd||(d===bd&&rnd()<0.3)){bd=d;best=v;}}
    if(best<0)break;
    const c=adj[best].filter(w=>m[w]<0);
    // prefer partner by score(order) then random
    c.sort((a,b)=>order(best,a)-order(best,b));
    const w=c[0];m[best]=w;m[w]=best;
  }
  return m.every(x=>x>=0)?m:null;
}
function run(f,opt){
  const pts=geodesic(f),n=pts.length;
  let e=1e9;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)e=Math.min(e,dist(pts[i],pts[j]));
  const adj=pts.map(()=>[]);
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(dist(pts[i],pts[j])<e*1.25){adj[i].push(j);adj[j].push(i);}
  // preference: strut heads roughly east (longitude direction) so struts form parallel bands
  const east=v=>{const p=pts[v];const u=norm(cross([0,1,0],p));return u;};
  const order=(v,w)=>{const d=norm(sub(pts[w],pts[v]));const u=east(v);return -Math.abs(dot(d,u));};
  let m=null;for(let sd=1;sd<5000&&!m;sd++)m=matching(pts,adj,sd,order);
  if(!m)throw new Error('no matching');
  const struts=[],cables=[];
  for(let i=0;i<n;i++){if(m[i]>i)struts.push([i,m[i]]);for(const j of adj[i])if(j>i&&m[i]!==j)cables.push([i,j]);}
  const P=pts.map(p=>p.slice()),V=pts.map(()=>[0,0,0]);
  // consistent twist: rotate each strut about its midpoint, same sense everywhere
  for(const [a,b] of struts){
    const mid=mulS(add(P[a],P[b]),.5),nn=norm(mid),th=opt.twist;
    for(const i of[a,b]){
      const r=sub(P[i],mid),c=Math.cos(th),s2=Math.sin(th);
      const rr=add(add(mulS(r,c),mulS(cross(nn,r),s2)),mulS(nn,dot(nn,r)*(1-c)));
      P[i]=add(mid,rr);
    }
  }
  const cl=e*opt.cab,sl=e*opt.strut,R=1;
  for(let it=0;it<opt.iters;it++){
    const F=P.map(()=>[0,0,0]);
    const sp=(a,b,r,k)=>{const d=dist(P[a],P[b])||1e-9,ff=k*(d-r)/d;for(let q=0;q<3;q++){const dx=P[b][q]-P[a][q];F[a][q]+=ff*dx;F[b][q]-=ff*dx;}};
    cables.forEach(([a,b])=>sp(a,b,cl,opt.kc));
    struts.forEach(([a,b])=>sp(a,b,sl,opt.ks));
    // node repulsion
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const d=dist(P[i],P[j]);const r=e*opt.nrep;if(d<r&&d>1e-9){const ff=-0.6*(r-d)/d;for(let q=0;q<3;q++){const dx=P[j][q]-P[i][q];F[i][q]+=ff*dx;F[j][q]-=ff*dx;}}}
    // strut-strut repulsion
    const gm=e*opt.gap;
    for(let i=0;i<struts.length;i++)for(let j=i+1;j<struts.length;j++){
      const [a,b]=struts[i],[c,d]=struts[j];if(a===c||a===d||b===c||b===d)continue;
      const [s,t,X,Y]=segSeg(P[a],P[b],P[c],P[d]);const dd=dist(X,Y);
      if(dd<gm&&dd>1e-9){const ff=opt.kg*(gm-dd)/dd,dv=sub(Y,X);
        for(const [idx,w] of[[a,1-s],[b,s]])for(let q=0;q<3;q++)F[idx][q]-=ff*dv[q]*w;
        for(const [idx,w] of[[c,1-t],[d,t]])for(let q=0;q<3;q++)F[idx][q]+=ff*dv[q]*w;}
    }
    // soft sphere: pull radius toward R
    for(let i=0;i<n;i++){const r=len(P[i]);const u=mulS(P[i],1/(r||1));for(let q=0;q<3;q++)F[i][q]-=opt.kr*(r-R)*u[q];}
    for(let i=0;i<n;i++)for(let q=0;q<3;q++){V[i][q]=(V[i][q]+F[i][q]*opt.dt)*opt.damp;P[i][q]+=V[i][q];}
  }
  return {P,struts,cables,e,n};
}
function stats(r){
  const {P,struts,cables}=r;const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
  const sl=struts.map(([a,b])=>dist(P[a],P[b])),cl=cables.map(([a,b])=>dist(P[a],P[b])),rad=P.map(len);
  let gap=1e9;
  for(let i=0;i<struts.length;i++)for(let j=i+1;j<struts.length;j++){const [a,b]=struts[i],[c,d]=struts[j];if(a===c||a===d||b===c||b===d)continue;const [,,X,Y]=segSeg(P[a],P[b],P[c],P[d]);gap=Math.min(gap,dist(X,Y));}
  return {n:r.n,struts:struts.length,cables:cables.length,strutLen:[Math.min(...sl),avg(sl),Math.max(...sl)].map(x=>+x.toFixed(3)),cabLen:[Math.min(...cl),avg(cl),Math.max(...cl)].map(x=>+x.toFixed(3)),rad:[Math.min(...rad),Math.max(...rad)].map(x=>+x.toFixed(3)),gap:+gap.toFixed(3),e:+r.e.toFixed(3)};
}
module.exports={run,stats,geodesic};
if(require.main===module){
  const f=+process.argv[2]||3;
  const opt={twist:0.5,cab:0.9,strut:1.7,kc:0.8,ks:2,nrep:0.7,gap:0.35,kg:1.5,kr:0.6,dt:0.03,damp:0.94,iters:4000};
  const r=run(f,opt);console.log(JSON.stringify(stats(r)));
}
