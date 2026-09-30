# Tensegrity sphere

Animated, flat, white-on-black tensegrity globe. Starts small, grows into a ball. Goal: match the Buckminster Fuller photo (dense woven ball of long rods, cables barely visible). Later: turn it into a tool that generates these models.

## Working style
Short, direct replies. No em dashes. No corporate or AI-sounding language.

## Look
- Black background, white lines only, no color.
- Flat 2D drawing that reads as 3D: depth-sorted, far lines dimmer.
- Calm motion. No shake, no overshoot, no random jitter.
- Growth like Obsidian graph view, but smooth.

## Structure (current)
- Nodes: geodesic sphere, 10f^2+2 points, f = 4..8 (162 to 642 nodes).
- Struts: one strut end per node, so n/2 struts. Chords about 3.2 edge lengths long.
- Twist: each strut leans a fixed angle (alpha 0.25 rad) off a mesh line, same handedness everywhere.
- Cables: the geodesic edges.
- Solve: nodes keep their sphere direction, only radius moves (0.9 to 1.1), so crossing struts sit in different layers. Strut-strut repulsion enforces gaps.
- Animation: nodes lift out from the center, top of sphere first. A segment fades in once both ends exist. Camera eases to fit. Density change keeps progress and cross-fades shells.

## Known good building block
Single 6-strut tensegrity icosahedron: struts 1.618, cables 1.0, all nodes on one sphere. Reproduced by the first relaxation script (strut rest 1.618 x edge, twist init). Useful as a sanity check.

## Known issues
- Not verified in a browser. Only checked with static matplotlib plots (tools/plot.py).
- 20 to 60 struts per level are paired by a loose fallback rule.
- A few struts touch or cross where radial layers run out of room.
- Compared to the photo: struts too uniform in length, cables too faint, no second inner layer.
- Matching is greedy with random restarts. Not a true maximum matching.

## Ideas, in order
1. Check it in a browser and screenshot. Compare side by side with the photo.
2. Better matching (blossom or local swaps) and longer, more varied struts.
3. Optional inner shell.
4. Move the solver into the browser or a small server so density and strut length are live sliders.
5. The tool: params in, export SVG frames, GIF or MP4.
6. Other structures: 3-strut prism, 6-strut icosahedron, 12/30 strut variants.

## Layout
- src/geodesic.js: geodesic sphere and edge helpers
- src/solve.js: matching + relaxation. `node src/solve.js <f> '<json opts>' > out.json`
- src/template.html: page with __DATA__ placeholder
- tools/solve_all.sh: solve f=4..8 and build
- tools/build.py: inject data/*.json into the template, write dist/tensegrity.html
- tools/plot.py: `python3 tools/plot.py data/f6.json out.png` for a quick two-view check
- dist/tensegrity.html: current published version
