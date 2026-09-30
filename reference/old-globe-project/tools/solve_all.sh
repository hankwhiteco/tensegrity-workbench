#!/bin/sh
# Solve shells for f=4..8. Slow at high f (a minute or so each).
cd "$(dirname "$0")/.."
for f in 4 5 6 7 8; do
  node src/solve.js $f '{"tol":0.5,"lw":0.35,"L":3.2,"gap":0.3,"kg":3,"kc":0.05,"ks":0,"iters":1500,"dt":0.05}' > data/f$f.json
done
python3 tools/build.py
