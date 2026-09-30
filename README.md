# Tensegrity Workbench

A browser tool for designing tensegrity structures that are mathematically sound, in the tradition of Kenneth Snelson's sculptures and Marcelo Pars' calculations.

- Set the cable lengths; the struts grow until the cable web stops them (Pars' principle).
- Every result is checked independently: equilibrium at every joint, cables in tension, struts in compression, prestress stability, super stability, and strut clearance.
- Repeating-pattern spheres from 30 to 750 struts, solved one repeat unit at a time using icosahedral symmetry.
- A build animation that draws the first pattern stroke by stroke and repeats it round the sphere.

Live page: `docs/index.html` (served by GitHub Pages).

## Build and test

```
python3 tools/build.py        # writes dist/ and docs/
node tests/benchmarks.js      # checks against Pars' published results
node tests/fuzz.js            # random settings, must report bad 0
node tests/verify_agree.js    # dense and banded verifiers must agree
python3 tests/ui_smoke.py     # headless Chrome run of the page
```
