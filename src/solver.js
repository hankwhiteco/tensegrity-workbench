// Tensegrity core: generators, Pars form-finding, verification.
// Pars' principle: cables have fixed lengths, struts grow until the cable web stops them.
// We solve it as an energy minimum: stiff elastic members plus a small push F on the
// growing struts. As F -> 0 the result converges to the exact Pars geometry.
(function (root) {
'use strict';
const PHI = (1 + Math.sqrt(5)) / 2;

// ---------- small linear algebra ----------
function solveDense(A, b, n) { // Gaussian elimination with partial pivoting, A is n*n Float64Array (copied)
  const M = Float64Array.from(A), x = Float64Array.from(b);
  for (let k = 0; k < n; k++) {
    let p = k, mx = Math.abs(M[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(M[i * n + k]); if (v > mx) { mx = v; p = i; } }
    if (mx < 1e-300) return null;
    if (p !== k) {
      for (let j = 0; j < n; j++) { const t = M[k * n + j]; M[k * n + j] = M[p * n + j]; M[p * n + j] = t; }
      const t = x[k]; x[k] = x[p]; x[p] = t;
    }
    const d = M[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = M[i * n + k] / d; if (f === 0) continue;
      for (let j = k; j < n; j++) M[i * n + j] -= f * M[k * n + j];
      x[i] -= f * x[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= M[i * n + j] * x[j];
    x[i] = s / M[i * n + i];
  }
  return x;
}

function jacobiEig(S, n) { // symmetric eigen-decomposition; returns {vals, vecs(col-major: vecs[j*n+i] = i-th comp of j-th vec)}
  const a = Float64Array.from(S), v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0, tot = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = a[i * n + j] * a[i * n + j]; tot += x; if (i !== j) off += x; }
    if (off <= 1e-30 * tot || off === 0) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const app = a[p * n + p], aqq = a[q * n + q];
      const th = (aqq - app) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k * n + p], akq = a[k * n + q];
        a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p * n + k], aqk = a[q * n + k];
        a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = v[k * n + p], vkq = v[k * n + q];
        v[k * n + p] = c * vkp - s * vkq; v[k * n + q] = s * vkp + c * vkq;
      }
    }
  }
  const idx = [...Array(n).keys()].sort((i, j) => a[i * n + i] - a[j * n + j]);
  const vals = idx.map(i => a[i * n + i]);
  const vecs = idx.map(j => { const c = new Float64Array(n); for (let i = 0; i < n; i++) c[i] = v[i * n + j]; return c; });
  return { vals, vecs };
}

// ---------- generators ----------
// Each returns { name, P:[[x,y,z]], members:[{a,b,kind:'s'|'c',group}] , groups:{id:{label,kind,len,mode}} }

function prism(n, opts = {}) {
  const P = [], m = [];
  const h = 1.2, tw = -(Math.PI / 2 - Math.PI / n);
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; P.push([Math.cos(a), Math.sin(a), 0]); }
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n + tw; P.push([Math.cos(a), Math.sin(a), h]); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    m.push({ a: i, b: j, kind: 'c', group: 'bot' });
    m.push({ a: n + i, b: n + j, kind: 'c', group: 'top' });
    m.push({ a: i, b: n + i, kind: 'c', group: 'side' });
    m.push({ a: j, b: n + i, kind: 's', group: 'strut' });
  }
  return {
    name: n + '-strut prism', P, members: m,
    groups: {
      bot: { label: 'Bottom ring', kind: 'c', len: 1 },
      top: { label: 'Top ring', kind: 'c', len: 1 },
      side: { label: 'Side cables', kind: 'c', len: n >= 5 ? 1.5 : 1 },
      strut: { label: 'Struts', kind: 's', mode: 'grow', ratio: 1 },
    },
  };
}

// Snelson three-way column (Needle Tower type), from "Tensegrity, Weaving and the Binary World" p. 22.
// Modules are n-strut prisms that alternate handedness and overlap. Between two modules:
// 2n slings in a zigzag ring (lower tops to upper bottoms), n ascending draws (top to top),
// n descending draws (bottom to bottom). End rings only at the base and the top.
function tower(n, stages) {
  const P = [], m = [], B = [], T = [];
  const h = 2.5, ov = 0.35;
  let th = 0;
  for (let k = 0; k < stages; k++) {
    const dir = k % 2 ? -1 : 1, tau = -dir * (Math.PI / 2 - Math.PI / n), z0 = k * h * (1 - ov);
    B.push([]); T.push([]);
    for (let i = 0; i < n; i++) { const t = th + 2 * Math.PI * i / n; B[k].push(P.length); P.push([Math.cos(t), Math.sin(t), z0]); }
    for (let i = 0; i < n; i++) { const t = th + 2 * Math.PI * i / n + tau; T[k].push(P.length); P.push([Math.cos(t), Math.sin(t), z0 + h]); }
    for (let i = 0; i < n; i++) {
      m.push({ a: B[k][(i + dir + n) % n], b: T[k][i], kind: 's', group: 'strut' });
      m.push({ a: B[k][i], b: T[k][i], kind: 'c', group: 'side' });
    }
    th += tau + Math.PI / n;
  }
  for (let i = 0; i < n; i++) {
    m.push({ a: B[0][i], b: B[0][(i + 1) % n], kind: 'c', group: 'bot' });
    m.push({ a: T[stages - 1][i], b: T[stages - 1][(i + 1) % n], kind: 'c', group: 'top' });
  }
  for (let k = 0; k + 1 < stages; k++) for (let i = 0; i < n; i++) {
    m.push({ a: T[k][i], b: B[k + 1][i], kind: 'c', group: 'sling' });
    m.push({ a: T[k][i], b: B[k + 1][(i - 1 + n) % n], kind: 'c', group: 'sling' });
    m.push({ a: T[k][i], b: T[k + 1][i], kind: 'c', group: 'draw' });
    m.push({ a: B[k + 1][i], b: B[k][(i + 1) % n], kind: 'c', group: 'draw' });
  }
  return {
    name: stages + '-module tower', P, members: m,
    groups: {
      bot: { label: 'Base ring', kind: 'c', len: 1 },
      top: { label: 'Top ring', kind: 'c', len: 1 },
      side: { label: 'Module edges', kind: 'c', len: 2.5 },
      sling: { label: 'Slings', kind: 'c', len: 0.8 },
      draw: { label: 'Draws', kind: 'c', len: 2 },
      strut: { label: 'Struts', kind: 's', mode: 'grow', ratio: 1 },
    },
  };
}

// Shorten slack cables to just under their current span and solve again, until all are taut.
function tighten(model, maxPasses = 12) {
  let md = { P: model.P, members: model.members.map(e => ({ ...e })) };
  const changed = new Set();
  for (let pass = 0; pass < maxPasses; pass++) {
    const r = formFind(md), v = verify(r.P, md.members, r.tension);
    let slack = 0;
    md.members.forEach((e, k) => { if (e.kind === 'c' && v.q[k] <= 1e-9) { e.len = +(r.lengths[k] * 0.97).toPrecision(6); changed.add(k); slack++; } });
    if (!slack) return { members: md.members, changed: [...changed], passes: pass, r, v };
    md = { P: r.P, members: md.members };
  }
  return null;
}

function platonic(which) {
  let V;
  if (which === 'tetra') V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  else if (which === 'octa') V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  else if (which === 'cube') { V = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]); }
  else if (which === 'icosa') { V = []; for (const a of [-1, 1]) for (const b of [-PHI, PHI]) V.push([0, a, b], [a, b, 0], [b, 0, a]); }
  else if (which === 'dodeca') {
    V = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]);
    const ip = 1 / PHI;
    for (const a of [-ip, ip]) for (const b of [-PHI, PHI]) V.push([0, a, b], [a, b, 0], [b, 0, a]);
  }
  let emin = Infinity;
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) emin = Math.min(emin, dist(V[i], V[j]));
  const E = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) if (dist(V[i], V[j]) < emin * 1.001) E.push([i, j]);
  return { V, E };
}

// Pars-style truncated polyhedron: each vertex becomes a cable ring, each edge a strut plus a crossing cable.
function truncated(which, chir = 1) {
  const { V, E } = platonic(which);
  const names = { tetra: 'Truncated tetrahedron', octa: 'Truncated octahedron', cube: 'Truncated cube', icosa: 'Truncated icosahedron', dodeca: 'Truncated dodecahedron' };
  return ringSphere(V, E, names[which], chir);
}

// Geodesic sphere, class I: icosahedron with each face cut into f*f triangles, pushed out to the sphere.
function geodesic(f) {
  const { V: V0 } = platonic('icosa');
  const ico = V0.map(norm);
  const F = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
    const e = 1.0515 * 1.001; // icosahedron edge on the unit sphere
    if (dist(ico[i], ico[j]) < e && dist(ico[j], ico[k]) < e && dist(ico[i], ico[k]) < e) F.push([i, j, k]);
  }
  const V = [], key = new Map(), faces = [];
  const id = p => { const k = p.map(x => Math.round(x * 1e6)).join(','); if (!key.has(k)) { key.set(k, V.length); V.push(p); } return key.get(k); };
  for (const [a, b, c] of F) {
    const A = ico[a], B = ico[b], C = ico[c], g = [];
    for (let i = 0; i <= f; i++) { g.push([]); for (let j = 0; j <= f - i; j++) {
      const k = f - i - j, p = norm([(A[0] * k + B[0] * i + C[0] * j) / f, (A[1] * k + B[1] * i + C[1] * j) / f, (A[2] * k + B[2] * i + C[2] * j) / f]);
      g[i].push(id(p));
    } }
    for (let i = 0; i < f; i++) for (let j = 0; j < f - i; j++) {
      faces.push([g[i][j], g[i + 1][j], g[i][j + 1]]);
      if (j + 1 <= f - i - 1) faces.push([g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]]);
    }
  }
  const es = new Set(), E = [];
  for (const t of faces) for (let q = 0; q < 3; q++) { const u = t[q], v = t[(q + 1) % 3], k = u < v ? u + ',' + v : v + ',' + u; if (!es.has(k)) { es.add(k); E.push(u < v ? [u, v] : [v, u]); } }
  return { V, E, F: faces };
}

// Goldberg polyhedron: dual of the geodesic sphere. Every vertex has three edges.
function goldberg(f) {
  const g = geodesic(f);
  const V = g.F.map(t => norm([0, 1, 2].map(d => g.V[t[0]][d] + g.V[t[1]][d] + g.V[t[2]][d])));
  const byEdge = new Map();
  g.F.forEach((t, fi) => { for (let q = 0; q < 3; q++) { const u = t[q], v = t[(q + 1) % 3], k = u < v ? u + ',' + v : v + ',' + u; (byEdge.get(k) || byEdge.set(k, []).get(k)).push(fi); } });
  const E = [...byEdge.values()].map(([a, b]) => [a, b]);
  return { V, E };
}

// Ring sphere: each vertex of a polyhedron becomes a ring of cables, each edge a strut plus a crossing cable.
// twist: how many ring positions the strut end is carried round from the edge it belongs to (1 = Pars' rule).
function ringSphere(V, E, name, chir = 1, twist = 1) {
  const nb = V.map(() => []);
  E.forEach(([i, j], e) => { nb[i].push({ v: j, e }); nb[j].push({ v: i, e }); });
  // sort neighbours counter-clockwise seen from outside
  nb.forEach((list, u) => {
    const n = norm(V[u]);
    const ref = sub(V[list[0].v], V[u]);
    const x = norm(sub(ref, scale(n, dot(ref, n)))), y = cross(n, x);
    list.forEach(o => { const d = sub(V[o.v], V[u]); o.ang = Math.atan2(dot(d, y), dot(d, x)); });
    list.sort((p, q) => p.ang - q.ang);
  });
  const P = [], id = {};
  nb.forEach((list, u) => list.forEach(o => { id[u + ':' + o.e] = P.length; P.push(lerp(V[u], V[o.v], 0.3)); }));
  const m = [];
  const next = (u, e) => { const l = nb[u], k = l.findIndex(o => o.e === e); return l[(((k + chir * twist) % l.length) + l.length) % l.length].e; };
  nb.forEach((list, u) => list.forEach((o, k) => {
    m.push({ a: id[u + ':' + o.e], b: id[u + ':' + list[(k + 1) % list.length].e], kind: 'c', group: 'ring' });
  }));
  E.forEach(([u, v], e) => {
    m.push({ a: id[u + ':' + next(u, e)], b: id[v + ':' + next(v, e)], kind: 's', group: 'strut' });
    m.push({ a: id[u + ':' + e], b: id[v + ':' + e], kind: 'c', group: 'cross' });
  });
  return {
    name, P, members: m,
    groups: {
      ring: { label: 'Ring cables (b)', kind: 'c', len: 1 },
      cross: { label: 'Cross cables (c)', kind: 'c', len: 1 },
      strut: { label: 'Struts (s)', kind: 's', mode: 'grow', ratio: 1 },
    },
  };
}

function icosa6() {
  const { V, E } = platonic('icosa');
  const m = [];
  const zeroSlot = p => p.findIndex(c => c === 0);
  // struts join the two vertices that differ only in the sign of the golden coordinate
  const used = new Set();
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
    const a = V[i], b = V[j];
    if (zeroSlot(a) !== zeroSlot(b)) continue;
    const k = zeroSlot(a), g = (k + 2) % 3, o = (k + 1) % 3;
    if (a[o] === b[o] && a[g] === -b[g]) m.push({ a: i, b: j, kind: 's', group: 'strut' });
  }
  E.forEach(([i, j]) => { if (zeroSlot(V[i]) !== zeroSlot(V[j])) m.push({ a: i, b: j, kind: 'c', group: 'cable' }); });
  return {
    name: '6-strut icosahedron', P: V.map(p => p.slice()), members: m,
    groups: { cable: { label: 'Cables', kind: 'c', len: 1 }, strut: { label: 'Struts', kind: 's', mode: 'grow', ratio: 1 } },
  };
}

// ---------- vectors ----------
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function norm(a) { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; }
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// ---------- form finding ----------
// model: {P, members} where each member has resolved targets:
//   cables: len (fixed length).  struts: mode 'grow' with ratio, or 'fixed' with len.
function formFind(model, opts = {}) {
  const N = model.P.length, M = model.members.length, n = 3 * N + 1;
  const mem = model.members;
  const X = new Float64Array(3 * N);
  model.P.forEach((p, i) => { X[3 * i] = p[0]; X[3 * i + 1] = p[1]; X[3 * i + 2] = p[2]; });
  const len = (a, b) => Math.hypot(X[3 * b] - X[3 * a], X[3 * b + 1] - X[3 * a + 1], X[3 * b + 2] - X[3 * a + 2]);
  // centre and scale the start so no cable is longer than its target
  let c = [0, 0, 0]; for (let i = 0; i < N; i++) for (let d = 0; d < 3; d++) c[d] += X[3 * i + d] / N;
  for (let i = 0; i < N; i++) for (let d = 0; d < 3; d++) X[3 * i + d] -= c[d];
  let sMax = 0;
  mem.forEach(e => { if (e.kind === 'c') sMax = Math.max(sMax, len(e.a, e.b) / e.len); });
  for (let i = 0; i < 3 * N; i++) X[i] /= sMax;
  const grow = mem.filter(e => e.kind === 's' && e.mode === 'grow');
  let lam = 0;
  grow.forEach(e => lam += len(e.a, e.b) / e.ratio / grow.length);
  if (!grow.length) lam = 1;
  const lam0 = lam || 1;
  const EAc = 1, EAs = opts.strutStiffness || 1e3;
  const restOf = e => e.kind === 'c' ? e.len : (e.mode === 'grow' ? lam * e.ratio : e.len);
  const refLen = mem.map(e => e.kind === 'c' ? e.len : (e.mode === 'grow' ? lam0 * e.ratio : e.len));

  function evalAll(Xv, lv, wantH, F) {
    let E = -F * lv;
    const g = new Float64Array(n), H = wantH ? new Float64Array(n * n) : null;
    g[n - 1] = -F;
    const T = new Float64Array(M);
    for (let k = 0; k < M; k++) {
      const e = mem[k], a = e.a, b = e.b;
      const d = [Xv[3 * b] - Xv[3 * a], Xv[3 * b + 1] - Xv[3 * a + 1], Xv[3 * b + 2] - Xv[3 * a + 2]];
      const l = Math.hypot(d[0], d[1], d[2]);
      const isGrow = e.kind === 's' && e.mode === 'grow';
      const r = e.kind === 'c' ? e.len : (isGrow ? lv * e.ratio : e.len);
      const km = (e.kind === 'c' ? EAc : EAs) / refLen[k];
      let t = km * (l - r);
      if (e.kind === 'c' && t < 0) { T[k] = 0; continue; }
      T[k] = t;
      E += 0.5 * km * (l - r) * (l - r);
      const u = [d[0] / l, d[1] / l, d[2] / l];
      for (let q = 0; q < 3; q++) { g[3 * b + q] += t * u[q]; g[3 * a + q] -= t * u[q]; }
      if (isGrow) g[n - 1] -= t * e.ratio;
      if (wantH) {
        const gg = t / l;
        for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) {
          const v = km * u[p] * u[q] + gg * ((p === q ? 1 : 0) - u[p] * u[q]);
          H[(3 * a + p) * n + 3 * a + q] += v; H[(3 * b + p) * n + 3 * b + q] += v;
          H[(3 * a + p) * n + 3 * b + q] -= v; H[(3 * b + p) * n + 3 * a + q] -= v;
        }
        if (isGrow) {
          for (let q = 0; q < 3; q++) {
            const v = -e.ratio * km * u[q];
            H[(3 * b + q) * n + n - 1] += v; H[(n - 1) * n + 3 * b + q] += v;
            H[(3 * a + q) * n + n - 1] -= v; H[(n - 1) * n + 3 * a + q] -= v;
          }
          H[(n - 1) * n + n - 1] += e.ratio * e.ratio * km;
        }
      }
    }
    if (wantH && !grow.length) H[(n - 1) * n + n - 1] = 1;
    return { E, g, H, T };
  }

  function rigidBasis(Xv) {
    const R = [];
    for (let d = 0; d < 3; d++) { const v = new Float64Array(n); for (let i = 0; i < N; i++) v[3 * i + d] = 1; R.push(v); }
    for (let d = 0; d < 3; d++) {
      const v = new Float64Array(n);
      for (let i = 0; i < N; i++) {
        const p = [Xv[3 * i], Xv[3 * i + 1], Xv[3 * i + 2]], ax = [0, 0, 0]; ax[d] = 1;
        const w = cross(ax, p); v[3 * i] = w[0]; v[3 * i + 1] = w[1]; v[3 * i + 2] = w[2];
      }
      R.push(v);
    }
    // Gram-Schmidt
    const Q = [];
    R.forEach(v => { Q.forEach(q => { let s = 0; for (let i = 0; i < n; i++) s += v[i] * q[i]; for (let i = 0; i < n; i++) v[i] -= s * q[i]; }); let s = 0; for (let i = 0; i < n; i++) s += v[i] * v[i]; s = Math.sqrt(s); if (s > 1e-12) { for (let i = 0; i < n; i++) v[i] /= s; Q.push(v); } });
    return Q;
  }

  // continuation on the push F: larger push first (well conditioned), then shrink toward the exact limit
  const Ms = Math.max(1, grow.length);
  const eps = opts.eps || [1e-2, 1e-3, 1e-4, 1e-5, 1e-6];
  let Y = new Float64Array(n); Y.set(X); Y[n - 1] = lam;
  let iters = 0, ok = true, runaway = false;
  for (const ep of eps) {
    const F = grow.length ? ep * Ms * lam0 : 0;
    let mu = 1e-6;
    for (let it = 0; it < 200; it++) {
      iters++;
      const Xv = Y.subarray(0, 3 * N), cur = evalAll(Xv, Y[n - 1], true, F);
      let gmax = 0; for (let i = 0; i < n; i++) gmax = Math.max(gmax, Math.abs(cur.g[i]));
      if (gmax < 1e-9 * Math.max(F, 1e-12) + 1e-14) break;
      const Rb = rigidBasis(Xv);
      let dmean = 0; for (let i = 0; i < n; i++) dmean += Math.abs(cur.H[i * n + i]) / n;
      for (const q of Rb) for (let i = 0; i < n; i++) { if (!q[i]) continue; for (let j = 0; j < n; j++) cur.H[i * n + j] += dmean * q[i] * q[j]; }
      let accepted = false;
      for (let tries = 0; tries < 30; tries++) {
        const A = Float64Array.from(cur.H);
        for (let i = 0; i < n; i++) A[i * n + i] += mu * dmean;
        const rhs = cur.g.map(v => -v);
        const dx = solveDense(A, rhs, n);
        if (dx) {
          const Z = Float64Array.from(Y); for (let i = 0; i < n; i++) Z[i] += dx[i];
          const nw = evalAll(Z.subarray(0, 3 * N), Z[n - 1], false, F);
          if (nw.E <= cur.E + 1e-16 * Math.abs(cur.E)) { Y = Z; accepted = true; mu = Math.max(mu / 4, 1e-14); break; }
        }
        mu *= 8;
      }
      if (!accepted) break;
      if (Y[n - 1] > 1e4 * lam0) { runaway = true; break; }
    }
    if (runaway) break;
  }
  const Xf = Y.subarray(0, 3 * N);
  const lamF = Y[n - 1];
  const fin = evalAll(Xf, lamF, false, grow.length ? eps[eps.length - 1] * Ms * lam0 : 0);
  const P = []; for (let i = 0; i < N; i++) P.push([Xf[3 * i], Xf[3 * i + 1], Xf[3 * i + 2]]);
  const lengths = mem.map(e => dist(P[e.a], P[e.b]));
  return { P, lengths, tension: Array.from(fin.T), lambda: lamF, iters, runaway };
}

// ---------- verification ----------
// Independent of the solver: takes geometry + member forces and checks the tensegrity conditions.
function verify(P, members, T) {
  const N = P.length, M = members.length, D = 3 * N;
  const L = members.map(e => dist(P[e.a], P[e.b]));
  const q = members.map((e, k) => T[k] / L[k]);
  const qmax = Math.max(...q.map(Math.abs)) || 1;
  const qn = q.map(v => v / qmax);
  // 1. node equilibrium
  const res = new Float64Array(D);
  members.forEach((e, k) => { for (let d = 0; d < 3; d++) { const f = qn[k] * (P[e.b][d] - P[e.a][d]); res[3 * e.a + d] += f; res[3 * e.b + d] -= f; } });
  let rmax = 0; for (let i = 0; i < D; i++) rmax = Math.max(rmax, Math.abs(res[i]));
  const scaleF = Math.max(...members.map((e, k) => Math.abs(qn[k]) * L[k]));
  const equilibrium = rmax / scaleF;
  // 2. signs
  let slack = 0, badStrut = 0;
  members.forEach((e, k) => { if (e.kind === 'c' && qn[k] <= 1e-9) slack++; if (e.kind === 's' && qn[k] >= -1e-9) badStrut++; });
  // 3. rigidity matrix rank
  const A = new Float64Array(D * M); // row-major D x M: column k is member k
  members.forEach((e, k) => { for (let d = 0; d < 3; d++) { const u = (P[e.b][d] - P[e.a][d]) / L[k]; A[(3 * e.a + d) * M + k] = -u; A[(3 * e.b + d) * M + k] = u; } });
  const AAt = new Float64Array(D * D);
  for (let i = 0; i < D; i++) for (let j = i; j < D; j++) { let s = 0; for (let k = 0; k < M; k++) s += A[i * M + k] * A[j * M + k]; AAt[i * D + j] = s; AAt[j * D + i] = s; }
  const eg = jacobiEig(AAt, D);
  const top = eg.vals[D - 1];
  const tol = 1e-9 * top;
  const rank = eg.vals.filter(v => v > tol).length;
  const selfStress = M - rank, mech = D - 6 - rank;
  // 4. prestress stability on the mechanism space
  const nullVecs = eg.vecs.filter((v, i) => eg.vals[i] <= tol);
  const rig = [];
  for (let d = 0; d < 3; d++) { const v = new Float64Array(D); for (let i = 0; i < N; i++) v[3 * i + d] = 1; rig.push(v); }
  for (let d = 0; d < 3; d++) { const v = new Float64Array(D); for (let i = 0; i < N; i++) { const ax = [0, 0, 0]; ax[d] = 1; const w = cross(ax, P[i]); v[3 * i] = w[0]; v[3 * i + 1] = w[1]; v[3 * i + 2] = w[2]; } rig.push(v); }
  const ortho = (list, basis = []) => { const Q = basis.slice(); const out = []; list.forEach(v0 => { const v = Float64Array.from(v0); Q.forEach(qv => { let s = 0; for (let i = 0; i < D; i++) s += v[i] * qv[i]; for (let i = 0; i < D; i++) v[i] -= s * qv[i]; }); let s = 0; for (let i = 0; i < D; i++) s += v[i] * v[i]; s = Math.sqrt(s); if (s > 1e-6) { for (let i = 0; i < D; i++) v[i] /= s; Q.push(v); out.push(v); } }); return out; };
  const R = ortho(rig);
  const mechs = ortho(nullVecs, R);
  // stress matrix
  const Om = new Float64Array(N * N);
  members.forEach((e, k) => { const w = qn[k]; Om[e.a * N + e.b] -= w; Om[e.b * N + e.a] -= w; Om[e.a * N + e.a] += w; Om[e.b * N + e.b] += w; });
  let minMech = null;
  if (mechs.length) {
    const r = mechs.length, K = new Float64Array(r * r);
    const KG = v => { const o = new Float64Array(D); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const w = Om[i * N + j]; if (!w) continue; for (let d = 0; d < 3; d++) o[3 * i + d] += w * v[3 * j + d]; } return o; };
    const KV = mechs.map(KG);
    for (let a = 0; a < r; a++) for (let b = 0; b < r; b++) { let s = 0; for (let i = 0; i < D; i++) s += mechs[a][i] * KV[b][i]; K[a * r + b] = s; }
    minMech = jacobiEig(K, r).vals[0];
  }
  const om = jacobiEig(Om, N).vals;
  const omScale = Math.max(...om.map(Math.abs));
  // Pin 4 affinely independent joints (a transversal to the affine null vectors 1, x, y, z):
  // positive definite there <=> PSD with nullity exactly 4. Same definition as verifyBand.
  const pn = pinNodes(P), keep = [...Array(N).keys()].filter(i => ![pn.p0, pn.p1, pn.p2, pn.p3].includes(i)), nk = keep.length;
  const Or = new Float64Array(nk * nk); keep.forEach((i, a) => keep.forEach((j, b) => { Or[a * nk + b] = Om[i * N + j]; }));
  const omRedMin = nk ? jacobiEig(Or, nk).vals[0] : 0;
  const omPD = omRedMin > 1e-9 * omScale;
  const omNeg = om.filter(v => v < -1e-7 * omScale).length;
  const omZero = omPD ? 4 : om.filter(v => Math.abs(v) < 1e-7 * omScale).length;
  // 5. strut clearance
  let clear = Infinity, pair = null;
  const S = members.map((e, k) => k).filter(k => members[k].kind === 's');
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
    const a = members[S[i]], b = members[S[j]];
    if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
    const d = segDist(P[a.a], P[a.b], P[b.a], P[b.b]);
    if (d < clear) { clear = d; pair = [S[i], S[j]]; }
  }
  const prestressStable = slack === 0 && badStrut === 0 && (mechs.length === 0 || minMech > 1e-7);
  const superStable = slack === 0 && badStrut === 0 && omPD;
  return { equilibrium, slack, badStrut, rank, selfStress, mech, minMech, omZero, omNeg, superStable, prestressStable, clearance: clear, clearPair: pair, q: qn };
}

function segDist(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2);
  const den = a * e - b * b;
  let s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  return dist([p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t]);
}

// Pars' closed-form for the truncated tetrahedron (tensegriteit.nl, eq. 17-22): maximise s over phi.
function parsTetra(b, c) {
  const k = Math.sqrt(1 / 3), rb = b / Math.sqrt(3);
  let best = 0, bestPhi = 0;
  for (let i = 0; i <= 200000; i++) {
    const ph = -Math.PI + 2 * Math.PI * i / 200000, d = Math.PI * 2 / 3;
    const x1 = rb * Math.sin(ph + d);
    const inner = (c / 2) ** 2 - (rb * Math.sin(ph)) ** 2;
    if (inner < 0) continue;
    const y = Math.sqrt(inner) + rb * Math.cos(ph) * k - rb * Math.cos(ph + d) * k;
    const s = 2 * Math.sqrt(x1 * x1 + y * y);
    if (s > best) { best = s; bestPhi = ph; }
  }
  return { s: best, phi: bestPhi };
}


// ---------- symmetry: solve one repeat unit, rotate it to fill the sphere ----------
function matMul(A, B) { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[3 * i + j] += A[3 * i + k] * B[3 * k + j]; return C; }
function matVec(A, v) { return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]]; }
function axisRot(ax, ang) {
  const [x, y, z] = norm(ax), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
let ICO = null;
function icoGroup() { // the 60 rotations of the icosahedron
  if (ICO) return ICO;
  const gens = [axisRot([0, 1, PHI], 2 * Math.PI / 5), axisRot([1, 1, 1], 2 * Math.PI / 3)];
  const key = M => M.map(v => Math.round(v * 1e6)).join(',');
  const G = [[1, 0, 0, 0, 1, 0, 0, 0, 1]], seen = new Set([key(G[0])]);
  for (let i = 0; i < G.length; i++) for (const g of gens) { const h = matMul(g, G[i]), k = key(h); if (!seen.has(k)) { seen.add(k); G.push(h); } }
  ICO = G; return G;
}
// For each node: its repeat-unit representative and the rotation that carries the representative onto it.
function findSymmetry(P, members) {
  const G = icoGroup();
  const key = p => p.map(v => Math.round(v * 1e4)).join(',');
  const at = new Map(); P.forEach((p, i) => at.set(key(p), i));
  const rep = new Array(P.length).fill(-1), rot = new Array(P.length).fill(-1);
  for (let i = 0; i < P.length; i++) {
    if (rep[i] >= 0) continue;
    let hits = 0;
    for (let g = 0; g < G.length; g++) {
      const j = at.get(key(matVec(G[g], P[i])));
      if (j === undefined) return null;
      if (j === i) hits++;
      if (rep[j] < 0) { rep[j] = i; rot[j] = g; }
    }
    if (hits !== 1) return null; // node sits on a symmetry axis: keep it simple and use the general solver
  }
  const mk = (a, b, k) => (a < b ? a + ',' + b : b + ',' + a) + k;
  const ms = new Set(members.map(e => mk(e.a, e.b, e.kind + e.group)));
  for (const e of members) for (const g of [1, 2]) {
    const a = at.get(key(matVec(G[g], P[e.a]))), b = at.get(key(matVec(G[g], P[e.b])));
    if (!ms.has(mk(a, b, e.kind + e.group))) return null;
  }
  const reps = [...new Set(rep)];
  return { rep, rot, reps, G };
}

// Split the members into the 60 copies of one repeat unit: tile[k] = index of the rotation in icoGroup()
// that carries the unit's member onto member k. Tile 0 (the identity) is the unit itself.
function repeatTiles(P, members) {
  const G = icoGroup(), key = p => p.map(v => Math.round(v * 1e4)).join(',');
  const at = new Map(); P.forEach((p, i) => at.set(key(p), i));
  const mk = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const byEnds = new Map(); members.forEach((e, k) => byEnds.set(mk(e.a, e.b), k));
  const tile = new Array(members.length).fill(-1);
  for (let k = 0; k < members.length; k++) {
    if (tile[k] >= 0) continue;
    const e = members[k];
    for (let g = 0; g < G.length; g++) {
      const a = at.get(key(matVec(G[g], P[e.a]))), b = at.get(key(matVec(G[g], P[e.b])));
      if (a === undefined || b === undefined) return null;
      const j = byEnds.get(mk(a, b));
      if (j === undefined) return null;
      if (tile[j] < 0) tile[j] = g;
    }
  }
  return tile;
}

function formFindSym(model, sym, opts = {}) {
  const N = model.P.length, M = model.members.length, mem = model.members, G = sym.G;
  const R = sym.reps, ri = new Map(R.map((r, k) => [r, k])), n = 3 * R.length + 1;
  const Q = i => G[sym.rot[i]];
  let sMax = 0;
  mem.forEach(e => { if (e.kind === 'c') sMax = Math.max(sMax, dist(model.P[e.a], model.P[e.b]) / e.len); });
  const P0 = model.P.map(p => scale(p, 1 / sMax));
  const grow = mem.filter(e => e.kind === 's' && e.mode === 'grow');
  let lam = 0; grow.forEach(e => lam += dist(P0[e.a], P0[e.b]) / e.ratio / grow.length);
  if (!grow.length) lam = 1;
  const lam0 = lam || 1, EAc = 1, EAs = opts.strutStiffness || 1e3;
  const refLen = mem.map(e => e.kind === 'c' ? e.len : (e.mode === 'grow' ? lam0 * e.ratio : e.len));
  const expand = y => { const X = new Float64Array(3 * N); for (let i = 0; i < N; i++) { const k = ri.get(sym.rep[i]), v = matVec(Q(i), [y[3 * k], y[3 * k + 1], y[3 * k + 2]]); X[3 * i] = v[0]; X[3 * i + 1] = v[1]; X[3 * i + 2] = v[2]; } return X; };
  function evalAll(y, wantH, F) {
    const X = expand(y), lv = y[n - 1];
    let E = -F * lv;
    const gf = new Float64Array(3 * N); let gl = -F;
    const T = new Float64Array(M);
    const H = wantH ? new Float64Array(n * n) : null;
    const addBlock = (i, j, K, sgn) => { // H[rep i, rep j] += sgn * Q_i^T K Q_j
      const A = Q(i), B = Q(j), ki = ri.get(sym.rep[i]), kj = ri.get(sym.rep[j]);
      const KB = new Array(9).fill(0);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let t = 0; t < 3; t++) KB[3 * r + c] += K[3 * r + t] * B[3 * t + c];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { let v = 0; for (let t = 0; t < 3; t++) v += A[3 * t + r] * KB[3 * t + c]; H[(3 * ki + r) * n + 3 * kj + c] += sgn * v; }
    };
    const addLam = (i, w) => { const A = Q(i), k = ri.get(sym.rep[i]); for (let r = 0; r < 3; r++) { const v = A[r] * w[0] + A[3 + r] * w[1] + A[6 + r] * w[2]; H[(3 * k + r) * n + n - 1] += v; H[(n - 1) * n + 3 * k + r] += v; } };
    for (let k = 0; k < M; k++) {
      const e = mem[k], a = e.a, b = e.b;
      const d = [X[3 * b] - X[3 * a], X[3 * b + 1] - X[3 * a + 1], X[3 * b + 2] - X[3 * a + 2]], l = Math.hypot(d[0], d[1], d[2]);
      const isGrow = e.kind === 's' && e.mode === 'grow', r = e.kind === 'c' ? e.len : (isGrow ? lv * e.ratio : e.len);
      const km = (e.kind === 'c' ? EAc : EAs) / refLen[k];
      const t = km * (l - r);
      if (e.kind === 'c' && t < 0) continue;
      T[k] = t; E += 0.5 * km * (l - r) * (l - r);
      const u = [d[0] / l, d[1] / l, d[2] / l];
      for (let q = 0; q < 3; q++) { gf[3 * b + q] += t * u[q]; gf[3 * a + q] -= t * u[q]; }
      if (isGrow) gl -= t * e.ratio;
      if (wantH) {
        const gg = t / l, K = new Array(9);
        for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) K[3 * p + q] = km * u[p] * u[q] + gg * ((p === q ? 1 : 0) - u[p] * u[q]);
        addBlock(a, a, K, 1); addBlock(b, b, K, 1); addBlock(a, b, K, -1); addBlock(b, a, K, -1);
        if (isGrow) { const w = u.map(x => -e.ratio * km * x); addLam(b, w); addLam(a, w.map(x => -x)); H[(n - 1) * n + n - 1] += e.ratio * e.ratio * km; }
      }
    }
    if (wantH && !grow.length) H[(n - 1) * n + n - 1] = 1;
    const g = new Float64Array(n);
    for (let i = 0; i < N; i++) { const A = Q(i), k = ri.get(sym.rep[i]); for (let r = 0; r < 3; r++) g[3 * k + r] += A[r] * gf[3 * i] + A[3 + r] * gf[3 * i + 1] + A[6 + r] * gf[3 * i + 2]; }
    g[n - 1] = gl;
    return { E, g, H, T, X };
  }
  let y = new Float64Array(n);
  R.forEach((r, k) => { y[3 * k] = P0[r][0]; y[3 * k + 1] = P0[r][1]; y[3 * k + 2] = P0[r][2]; });
  y[n - 1] = lam;
  const Ms = Math.max(1, grow.length), eps = opts.eps || [1e-2, 1e-3, 1e-4, 1e-5, 1e-6];
  let iters = 0, runaway = false;
  for (const ep of eps) {
    const F = grow.length ? ep * Ms * lam0 : 0;
    let mu = 1e-6;
    for (let it = 0; it < 200; it++) {
      iters++;
      const cur = evalAll(y, true, F);
      let gmax = 0; for (let i = 0; i < n; i++) gmax = Math.max(gmax, Math.abs(cur.g[i]));
      if (gmax < 1e-9 * Math.max(F, 1e-12) + 1e-14) break;
      let dmean = 0; for (let i = 0; i < n; i++) dmean += Math.abs(cur.H[i * n + i]) / n;
      let accepted = false;
      for (let tries = 0; tries < 30; tries++) {
        const A = Float64Array.from(cur.H); for (let i = 0; i < n; i++) A[i * n + i] += mu * dmean;
        const dx = solveDense(A, cur.g.map(v => -v), n);
        if (dx) {
          const z = Float64Array.from(y); for (let i = 0; i < n; i++) z[i] += dx[i];
          if (evalAll(z, false, F).E <= cur.E + 1e-16 * Math.abs(cur.E)) { y = z; accepted = true; mu = Math.max(mu / 4, 1e-14); break; }
        }
        mu *= 8;
      }
      if (!accepted) break;
      if (y[n - 1] > 1e4 * lam0) { runaway = true; break; }
    }
    if (runaway) break;
  }
  const Ffin = grow.length ? eps[eps.length - 1] * Ms * lam0 : 0;
  const fin = evalAll(y, false, Ffin);
  const P = []; for (let i = 0; i < N; i++) P.push([fin.X[3 * i], fin.X[3 * i + 1], fin.X[3 * i + 2]]);
  // Soft modes: the gentlest ways the (symmetric) structure can flex, from the stiffness at the solution
  // with a working prestress (1e-2) so the prestress-stiffened directions are well separated from stretching.
  let modes = [];
  if (opts.modes !== false) {
    const Hs = evalAll(y, true, grow.length ? 1e-2 * Ms * lam0 : 0).H, m = n - 1;
    const K = new Float64Array(m * m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) K[i * m + j] = Hs[i * n + j];
    const eg = jacobiEig(K, m);
    for (let q = 0; q < Math.min(3, m); q++) {
      const v = eg.vecs[q], d = [];
      let mx = 0;
      for (let i = 0; i < N; i++) { const k = ri.get(sym.rep[i]), w = matVec(Q(i), [v[3 * k], v[3 * k + 1], v[3 * k + 2]]); d.push(w); mx = Math.max(mx, Math.hypot(...w)); }
      modes.push({ value: eg.vals[q], d: d.map(w => w.map(x => +(x / (mx || 1)).toFixed(5))) });
    }
  }
  return { P, lengths: mem.map(e => dist(P[e.a], P[e.b])), tension: Array.from(fin.T), lambda: y[n - 1], iters, runaway, repeatUnits: R.length, modes };
}

// ---------- banded Cholesky: exact positive-definiteness test for big structures ----------
function rcmOrder(N, adj) {
  const deg = adj.map(a => a.length), seen = new Uint8Array(N), order = [];
  const bfs = s => { const lv = new Int32Array(N).fill(-1), q = [s]; lv[s] = 0; for (let h = 0; h < q.length; h++) for (const w of adj[q[h]]) if (lv[w] < 0) { lv[w] = lv[q[h]] + 1; q.push(w); } return { q, lv }; };
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0]) continue;
    let s = s0; for (let t = 0; t < 2; t++) { const { q } = bfs(s); s = q[q.length - 1]; }
    const q = [s]; seen[s] = 1;
    for (let h = 0; h < q.length; h++) { const nb = adj[q[h]].filter(w => !seen[w]).sort((x, y) => deg[x] - deg[y]); for (const w of nb) { seen[w] = 1; q.push(w); } }
    order.push(...q);
  }
  return order.reverse();
}
// Builds the matrix on the free dofs only, then tries to factor it. Success proves it is positive definite.
function bandPD(nDof, entries, freeOf) {
  // entries: array of [i, j, v] on full dofs (both triangles are fine, only i >= j is kept after mapping)
  let b = 0;
  for (const [i, j] of entries) { const fi = freeOf[i], fj = freeOf[j]; if (fi >= 0 && fj >= 0) b = Math.max(b, Math.abs(fi - fj)); }
  let nf = 0; for (let i = 0; i < nDof; i++) if (freeOf[i] >= 0) nf++;
  const w = b + 1, L = new Float64Array(nf * w);
  const at = (i, j) => i * w + (j - i + b);
  for (const [i, j, v] of entries) { let fi = freeOf[i], fj = freeOf[j]; if (fi < 0 || fj < 0) continue; if (fi < fj) { const t = fi; fi = fj; fj = t; } L[at(fi, fj)] += v; }
  let dmax = 0; for (let i = 0; i < nf; i++) dmax = Math.max(dmax, Math.abs(L[at(i, i)]));
  let minPivot = Infinity;
  for (let i = 0; i < nf; i++) {
    const j0 = Math.max(0, i - b);
    for (let j = j0; j <= i; j++) {
      let sum = L[at(i, j)];
      const k0 = Math.max(j0, j - b), ri = i * w - i + b, rj = j * w - j + b;
      for (let k = k0; k < j; k++) sum -= L[ri + k] * L[rj + k];
      if (i === j) { if (!(sum > 1e-12 * dmax)) return { ok: false, band: b, minPivot: sum / dmax }; minPivot = Math.min(minPivot, sum / dmax); L[at(i, i)] = Math.sqrt(sum); }
      else L[at(i, j)] = sum / L[at(j, j)];
    }
  }
  return { ok: true, band: b, minPivot };
}
// three nodes in general position, used to pin away rigid motions (and a fourth for affine maps)
function pinNodes(P) {
  const p0 = 0; let p1 = 0, p2 = 0, p3 = 0, best = -1;
  P.forEach((p, i) => { const d = dist(p, P[p0]); if (d > best) { best = d; p1 = i; } });
  const d01 = norm(sub(P[p1], P[p0])); best = -1;
  P.forEach((p, i) => { const v = sub(p, P[p0]), c = Math.hypot(...cross(v, d01)); if (c > best) { best = c; p2 = i; } });
  const nrm = norm(cross(d01, sub(P[p2], P[p0]))); best = -1;
  P.forEach((p, i) => { const h = Math.abs(dot(sub(p, P[p0]), nrm)); if (h > best) { best = h; p3 = i; } });
  return { p0, p1, p2, p3, d01, nrm };
}
function verifyBand(P, members, T) {
  const N = P.length, M = members.length;
  const L = members.map(e => dist(P[e.a], P[e.b]));
  const q = members.map((e, k) => T[k] / L[k]);
  let qmax = 0; q.forEach(v => qmax = Math.max(qmax, Math.abs(v))); qmax = qmax || 1;
  const qn = q.map(v => v / qmax);
  const res = new Float64Array(3 * N);
  members.forEach((e, k) => { for (let d = 0; d < 3; d++) { const f = qn[k] * (P[e.b][d] - P[e.a][d]); res[3 * e.a + d] += f; res[3 * e.b + d] -= f; } });
  let rmax = 0, scaleF = 0; res.forEach(v => rmax = Math.max(rmax, Math.abs(v))); members.forEach((e, k) => scaleF = Math.max(scaleF, Math.abs(qn[k]) * L[k]));
  let slack = 0, badStrut = 0;
  members.forEach((e, k) => { if (e.kind === 'c' && qn[k] <= 1e-9) slack++; if (e.kind === 's' && qn[k] >= -1e-9) badStrut++; });
  const adj = P.map(() => []); members.forEach(e => { adj[e.a].push(e.b); adj[e.b].push(e.a); });
  const ord = rcmOrder(N, adj), pos = new Int32Array(N); ord.forEach((v, i) => pos[v] = i);
  const pin = pinNodes(P);
  // prestress stability: c * (material) + stress matrix, positive definite once rigid motions are pinned
  const freeX = new Int32Array(3 * N);
  { const fixed = new Set();
    for (let d = 0; d < 3; d++) fixed.add(3 * pin.p0 + d);
    const ax = [0, 1, 2].sort((x, y) => Math.abs(pin.d01[x]) - Math.abs(pin.d01[y]));
    fixed.add(3 * pin.p1 + ax[0]); fixed.add(3 * pin.p1 + ax[1]);
    const an = [0, 1, 2].sort((x, y) => Math.abs(pin.nrm[y]) - Math.abs(pin.nrm[x]));
    fixed.add(3 * pin.p2 + an[0]);
    let c = 0; const byPos = [];
    for (let i = 0; i < N; i++) for (let d = 0; d < 3; d++) byPos.push([3 * pos[i] + d, 3 * i + d]);
    byPos.sort((x, y) => x[0] - y[0]);
    for (const [, full] of byPos) freeX[full] = fixed.has(full) ? -1 : c++;
  }
  let prestress = null;
  for (const c of [1, 10, 100, 1000]) {
    const ent = []; // each unordered dof pair once; bandPD folds it into the lower triangle
    members.forEach((e, k) => {
      const u = norm(sub(P[e.b], P[e.a]));
      for (let p = 0; p < 3; p++) for (let r = 0; r < 3; r++) {
        const v = c * u[p] * u[r] / L[k] + (p === r ? qn[k] : 0);
        if (!v) continue;
        if (p >= r) ent.push([3 * e.a + p, 3 * e.a + r, v], [3 * e.b + p, 3 * e.b + r, v]);
        ent.push([3 * e.a + p, 3 * e.b + r, -v]);
      }
    });
    const r = bandPD(3 * N, ent, freeX);
    if (r.ok) { prestress = { c, band: r.band, minPivot: r.minPivot }; break; }
  }
  // super stability: stress matrix PSD with only the 4 affine null vectors
  const freeN = new Int32Array(N);
  { const fixed = new Set([pin.p0, pin.p1, pin.p2, pin.p3]); let c = 0; ord.forEach(i => freeN[i] = fixed.has(i) ? -1 : c++); }
  const entN = [];
  members.forEach((e, k) => { entN.push([e.a, e.a, qn[k]], [e.b, e.b, qn[k]], [e.a, e.b, -qn[k]]); });
  const sup = bandPD(N, entN, freeN);
  let clear = Infinity, pair = null;
  const S = []; members.forEach((e, k) => { if (e.kind === 's') S.push(k); });
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
    const a = members[S[i]], b = members[S[j]];
    if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
    const d = segDist(P[a.a], P[a.b], P[b.a], P[b.b]);
    if (d < clear) { clear = d; pair = [S[i], S[j]]; }
  }
  const signsOk = slack === 0 && badStrut === 0;
  return { method: 'band', equilibrium: rmax / scaleF, slack, badStrut, rank: null, selfStress: null, mech: null, minMech: prestress && prestress.minPivot, prestressC: prestress && prestress.c,
    omZero: sup.ok ? 4 : null, omNeg: sup.ok ? 0 : null, superStable: signsOk && sup.ok, prestressStable: signsOk && !!prestress, clearance: clear, clearPair: pair, q: qn };
}

// Joints that carry identical forces. Sorted incident forces (relative to the largest) are compared.
function jointClasses(P, members, q) {
  const L = members.map(e => dist(P[e.a], P[e.b]));
  const f = members.map((e, k) => q[k] * L[k]);
  let fm = 0; f.forEach(v => fm = Math.max(fm, Math.abs(v)));
  const inc = P.map(() => []);
  members.forEach((e, k) => { inc[e.a].push(k); inc[e.b].push(k); });
  const cls = new Map();
  inc.forEach((ks, i) => {
    const s = ks.map(k => ({ kind: members[k].kind, f: Math.abs(f[k]) / fm })).sort((x, y) => (x.kind > y.kind ? -1 : x.kind < y.kind ? 1 : y.f - x.f));
    const key = s.map(x => x.kind + x.f.toFixed(4)).join('|');
    if (!cls.has(key)) cls.set(key, { count: 0, forces: s });
    cls.get(key).count++;
  });
  return [...cls.values()].sort((a, b) => b.count - a.count);
}

function solveModel(model) {
  const sym = model.P.length > 36 ? findSymmetry(model.P, model.members) : null;
  const r = sym ? formFindSym(model, sym) : formFind(model);
  const v = model.P.length <= 80 ? verify(r.P, model.members, r.tension) : verifyBand(r.P, model.members, r.tension);
  v.classes = jointClasses(r.P, model.members, v.q);
  if (sym) r.repeatUnits = sym.reps.length;
  return { r, v };
}

// Goldberg-Coxeter geodesic sphere GP(m, n): T = m^2 + mn + n^2 triangles per icosahedron face.
// (1,0) 12 vertices, (1,1) 32, (2,0) 42, (2,1) 72 ... Vertices come from the triangular lattice
// laid on each face; the triangulation is the convex hull of those points.
function geodesicMN(m, n) {
  if (n === 0) return geodesic(m);
  const { V: V0 } = platonic('icosa');
  const ico = V0.map(norm);
  const F = [], e = 1.0515 * 1.001;
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++)
    if (dist(ico[i], ico[j]) < e && dist(ico[j], ico[k]) < e && dist(ico[i], ico[k]) < e) {
      // order counter-clockwise seen from outside
      const c = [0, 1, 2].map(d => ico[i][d] + ico[j][d] + ico[k][d]);
      F.push(dot(cross(sub(ico[j], ico[i]), sub(ico[k], ico[i])), c) > 0 ? [i, j, k] : [i, k, j]);
    }
  // lattice: axial coords (i, j) -> planar (i + j/2, j*sqrt3/2)
  const pl = (i, j) => [i + j / 2, j * Math.sqrt(3) / 2];
  const P1 = pl(m, n), P2 = pl(-n, m + n);
  const det = P1[0] * P2[1] - P1[1] * P2[0];
  const V = [], key = new Map();
  const add = p => { const k = p.map(x => Math.round(x * 1e6)).join(','); if (!key.has(k)) { key.set(k, V.length); V.push(p); } };
  const R = m + n + 1;
  for (const [a, b, c] of F) {
    const A = ico[a], B = ico[b], C = ico[c];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= 2 * R; j++) {
      const q = pl(i, j);
      const u = (q[0] * P2[1] - q[1] * P2[0]) / det, v = (P1[0] * q[1] - P1[1] * q[0]) / det, w = 1 - u - v;
      if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
      add(norm([0, 1, 2].map(d => A[d] * w + B[d] * u + C[d] * v)));
    }
  }
  return hullSphere(V);
}
// Triangulation of points on the unit sphere (their convex hull), via local empty-cap tests.
function hullSphere(V) {
  const N = V.length;
  let dmin = Infinity;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) dmin = Math.min(dmin, dist(V[i], V[j]));
  const near = V.map((p, i) => { const l = []; for (let j = 0; j < N; j++) if (j !== i && dist(p, V[j]) < dmin * 1.9) l.push(j); return l; });
  const faces = [], seen = new Set();
  for (let i = 0; i < N; i++) for (const j of near[i]) for (const k of near[i]) {
    if (!(i < j && j < k)) continue;
    if (!near[j].includes(k)) continue;
    let nrm = cross(sub(V[j], V[i]), sub(V[k], V[i]));
    let t = [i, j, k];
    if (dot(nrm, V[i]) < 0) { nrm = scale(nrm, -1); t = [i, k, j]; }
    const nn = norm(nrm), h = dot(nn, V[i]);
    let ok = true;
    for (const x of near[i].concat(near[j], near[k])) { if (x === i || x === j || x === k) continue; if (dot(nn, V[x]) > h + 1e-9) { ok = false; break; } }
    if (ok) { const key = [i, j, k].join(','); if (!seen.has(key)) { seen.add(key); faces.push(t); } }
  }
  const es = new Set(), E = [];
  for (const t of faces) for (let q = 0; q < 3; q++) { const u = t[q], v = t[(q + 1) % 3], k = u < v ? u + ',' + v : v + ',' + u; if (!es.has(k)) { es.add(k); E.push(u < v ? [u, v] : [v, u]); } }
  return { V, E, F: faces };
}
function goldbergMN(m, n) {
  const g = geodesicMN(m, n);
  const V = g.F.map(t => norm([0, 1, 2].map(d => g.V[t[0]][d] + g.V[t[1]][d] + g.V[t[2]][d])));
  const byEdge = new Map();
  g.F.forEach((t, fi) => { for (let q = 0; q < 3; q++) { const u = t[q], v = t[(q + 1) % 3], k = u < v ? u + ',' + v : v + ',' + u; (byEdge.get(k) || byEdge.set(k, []).get(k)).push(fi); } });
  return { V, E: [...byEdge.values()].map(([a, b]) => [a, b]) };
}
// Sphere sizes in order: Goldberg-Coxeter codes and the strut counts they give (30 T).
const SPHERE_SIZES = [[1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [2, 2], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0]];

const api = { repeatTiles, icoGroup, axisRot, matVec, geodesicMN, goldbergMN, hullSphere, SPHERE_SIZES, geodesicSphere: null, solveModel, formFindSym, verifyBand, findSymmetry, jointClasses, prism, tower, tighten, truncated, geodesic, goldberg, ringSphere, icosa6, formFind, verify, parsTetra, dist, jacobiEig };
if (typeof module !== 'undefined') module.exports = api; else root.TG = api;
})(this);
