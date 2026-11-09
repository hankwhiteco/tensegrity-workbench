# Tensegrity Workbench

Browser tool for designing tensegrity structures that are mathematically sound. Style references: Kenneth Snelson (sculptures, towers) and Marcelo Pars (tensegriteit.nl math pages).

## Working style
Short, direct replies. No em dashes. No corporate or AI-sounding language.

## Method
- Pars' principle: cables have fixed lengths, struts grow until the cable web stops them.
- Solver (`formFind` in src/solver.js): Newton with damping on an elastic energy, stiff struts, plus a small push on the growing struts. The push shrinks in steps (1e-2 down to 1e-6), so the result converges to the exact Pars geometry.
- Verifier (`verify`), independent of the solver:
  - node equilibrium residual
  - every cable in tension, every strut in compression
  - rank of the rigidity matrix (self-stresses, mechanisms)
  - prestress stability: the stress matrix must be positive on every mechanism
  - super stability: the stress matrix is positive semidefinite with 4 zero eigenvalues
  - clearance between struts
- A design only counts as valid if the verifier passes. Never tune the verifier to make a shape pass.
- Big models (> 36 joints with icosahedral symmetry): `formFindSym` solves one repeat unit (1/60) and rotates it with the 60 icosahedral rotations. More than 80 joints: `verifyBand` uses reverse Cuthill-McKee ordering and a banded Cholesky factorization. It pins 6 dofs (prestress) or 4 joints (super stability), and a clean factorization proves positive definiteness. It does not count mechanisms or self-stresses.
- `solveModel` picks the path. tests/verify_agree.js must show 0 disagreements between the dense and banded verifiers.
- `formFind` also has a banded path (`opts.band`, default for more than 36 joints): RCM ordering, 6 pinned coordinates, banded Cholesky per Newton step, the growth scale handled by a Schur complement. Same answers as the dense path (1e-14). A 12 x 10 tower (240 joints) takes about 7 s; dense took minutes.
- Solves stop after 15 s (`opts.timeLimit`) and return `timedOut`; the page says "Stopped after 15 s" and the checks report the shape as it is.

## Benchmarks (tests/benchmarks.js must keep matching)
- Pars dissimilar 3-strut: cables 20.44, two struts 26.0, long strut 36.3 (we get 36.333)
- Pars truncated tetrahedron eq. 18-22 (`parsTetra`): matches to 5 digits
- Prism twist 90 - 180/n degrees
- Expanded octahedron with equal cables: strut / cable = sqrt(8/3) = 1.63299 (not 1.618; that is the regular icosahedron, which is not the equal-cable equilibrium)

## Structures
- Prisms with n struts. Equal cables go flat at n = 6, so side cables default to 1.5 for n >= 5.
- Truncated polyhedra: each vertex becomes a cable ring, each edge becomes a strut plus a cross cable (tetra, octa, cube, icosa, dodeca).
- Expanded octahedron with 6 struts.
- Spheres (main focus): `ringSphere` on a Goldberg polyhedron ("triangle joints", every strut end sits in a cable triangle) or on a class I geodesic sphere ("ring joints"). Both have 60 f^2 joints and 30 f^2 struts (geo rings have 5 or 6 cables). All struts come out equal length. Joint types = f^2: forces are identical within a type, not across types.
  - Sizes: Goldberg-Coxeter GP(m,n) (`geodesicMN`, `goldbergMN`, list in `SPHERE_SIZES`): 30, 90, 120, 210, 270, 360, 390, 480, 570, 630, 750 struts. The Repeats control steps through these.
  - Fixed scale (View switch, spheres only): every size is framed as the largest (750 struts) would be, so all sizes share one scale. It used to hold the 270-strut scale only, so from 360 up each size filled the frame again.
  - Vector equilibrium (View switch, spheres only, off by default): Fuller's VE as 4 great-circle disks whose axes run through opposite triangular faces (geometryofthinking.com, 2023-08-14). Those axes are (1, 1, 1) and its sign flips, four of the sphere's three-fold axes; every size and both patterns are symmetric about them (checked in Node). Drawn by `drawVE()` in the highlight orange like the Dymaxion studio's VE layer: faint disk, rim fading on the far side, dashed axis with a point at each face. The axes (with their points) have their own Spin axes switch, on by default, shown only while the VE is on.
    - VE build (`veState`, `veTime`, own clock `VE_T`): each great circle strokes itself round from a point with a bright tip (1.6 s each, 0.55 s apart), its axis grows out from the centre both ways, the disk fades in; about 3.5 s. Plays when the VE is switched on. During a sphere build it waits until the sphere is finished, then runs in real time; the build clip gets VE_IN + 1 s more tail.
    - Continuous switch (shown while the VE is on): draw, hold, unwind (axes draw back, then a tail chases each circle round), short pause, again. The cycle is Turn length / round(Turn length / 10), so it fits the turn a whole number of times and a seamless turn export still loops (frame veT = start + u T). Phases shrink for short cycles. Not continuous: turn exports show the VE fully drawn. Reduced motion: always fully drawn. Circles sit 3% outside the joint radius so the rims read as separate rings; disk fill alpha 0.03 (0.07 tinted the whole sphere orange). Included in exports.
  - Reference: reference/sphere_photo.webp. Closest match is ring joints, 120 struts (GP 2,0), twist 1, b = c. That is the page default. Measured strut / diameter 0.33, photo reads about 0.37 to 0.42 (camera close, so the front struts look long). tests/photo_compare.js renders candidates beside the photo.
  - Twist 2 (`ringSphere(..., twist)`) gives longer struts but lumpy, crowded spheres. Rejected by eye.
  - Ring joints are valid up to 270 struts; from 360 on, struts collide (clearance 0). Triangle joints are valid up to 750.
- Towers: Snelson three-way column. Modules alternate handedness. Between modules: 2n slings in a zigzag ring, n ascending draws, n descending draws. Rings only at the two ends. Rules summarized from reference/Snelson_Tensegrity_and_Weaving.pdf p. 22.

## Layout
- src/solver.js: generators, form finding, verification. Runs in Node and in the page (as a Worker).
- src/page.html: UI. `/*SOLVER*/` gets replaced by solver.js at build.
- tools/build.py: escapes every non-ASCII character (\uXXXX in scripts, &#x..; elsewhere). The artifact viewer showed UTF-8 symbols as 'Ã'. Writes dist/index.html (the artifact body) and dist/dev.html (standalone, for local testing).
- tests/benchmarks.js: `node tests/benchmarks.js`
- tests/fuzz.js: random control settings; must report `bad 0`.
- tests/tower_search.js: tower topology experiments.
- tests/spheres.js: `node tests/spheres.js <repeats> [geo,gold]`
- tests/verify_agree.js: dense vs banded verifier.
- tests/ui_smoke.py: headless Chrome run of the page with `#noworker` (virtual time does not run Workers).
- reference/: Snelson PDF, and the old animated-globe project.
- Published artifact: https://claude.ai/artifact/FhSaeKeedso497N2HPApPy (republish dist/index.html to that URL).
- Public site: https://hankwhiteco.github.io/tensegrity-workbench/ (GitHub Pages, serves docs/ on main).
  Repo: https://github.com/hankwhiteco/tensegrity-workbench (public). To update: `python3 tools/build.py`, commit, `git push`.
  The Snelson PDF and the reference photo are git-ignored (third-party copyright). Keep it that way.

## UI rules
- Design matches the Dymaxion Sphere Studio (github.com/hankwhiteco/dymaxion-sphere-studio, studio.html): Braun-style control face after Dieter Rams. Dark housing, control panel on the right, Helvetica Neue, Braun orange accent, lowercase section labels, thin sliders with rectangular caps, push buttons with indicator lamps (`.seg`), slide switches (`.layer`), round transport keys (`.key`), the grille ornament by the title. Keep the two tools looking like one family. The workbench is always dark (the studio's dark-mode palette), whatever the system setting.
- The structure sits on a rounded artboard (`#board`): Ink (white rods on black like the studio photos), Paper or Clear. Viewport colours are CSS variables on `.board[data-bg]`; `readColors()` reads them from the board. The page always lands on Ink (the choice is not remembered). The compression colour in the Forces view is #7A711E on every artboard; selection, hover and tension stay orange.
- Panel tabs (sticky bar, remembered as `tw.tab`): Design (structure, member lengths, Pars presets, build check), View (display: Rotate, Forces, Node ids, Fixed scale, Turn time, artboard, depth shading, cable brightness, give; vector equilibrium group, spheres only; build), Export (image: PNG and the artboard background switch; motion clip; icon; website). The selected-member box sits above the tabs so a click in the view always shows it. Reset view and Full view sit in the masthead. The icon GIF button is always visible, disabled with a hint while the icon is Still (the user could not find it when it was hidden).
- Lower panel collapses with the Hide/Show details strip; the strip keeps the verdict visible when collapsed. Full view also hides the side panel. Both are remembered in localStorage.
- Model, structure and result are swapped in together, only when a solve succeeds. Earlier this was not the case: the draw loop indexed the old shape's nodes and died, and the shape vanished.
- The draw loop must never stop on a bad frame.
- One solve at a time: a new solve terminates the worker running the old one and starts a fresh worker (`cancelInFlight`). Pick the worker after cancelling, never before. Benchmarks run on their own worker. Stale queued solves were why towers looked stuck.
- Member lengths are remembered per family (sphere per pattern), but only groups the user edited (`touched`), so changing struts, modules, repeats or twist keeps them, and untouched groups still take each size's defaults. Saved in localStorage (`tw.lengths`) on every edit.
- Known gap: towers with more than 3 struts per module, or odd module counts, have slack cables at the default lengths. The interstage pattern needs work for wider modules. Tighten slack cables rescues many.

## Build animation
- Watch it build button in the panel's build section (plays once by itself on the first sphere load). On the artboard: a compact bar with the caption, a round Play/Pause key (restarts once finished), the scrubber and a close button. Speed slider (panel) 0.25x to 8x, logarithmic, snaps to round values (remembered in localStorage).
- Sequence for icosahedral structures (`repeatTiles` splits members into 60 copies of one repeat unit):
  1. The first pattern is the flower of 5 round the five-fold axis nearest the unit. Each strut is drawn as a stroke (1.3 s, ease in-out) from one joint to the other, with a bright point at the tip. A small faint ellipse (a circle lying flat on the sphere, radius 2.2% of strut length) marks the starting joint just before and fades after. Crosses were too dominant. Each stroke starts at the end with the most already-drawn neighbours, so the pattern grows out of itself. (An earlier version flew struts in from outside; the user preferred strokes. `drift` mode is still in the code.)
  2. Cables are straight hairlines stroked from the joint that was placed first, once both ends are home. Pace is constant (duration grows with length). Golden-ratio offsets spread the starts. Each starts faint (alpha 0.35, thinner) and settles to full strength as it takes up tension. (Slack curved threads were tried and dropped: the bend was invented and clashed with the straight-line style.)
  3. When the ring has closed, the whole flower draws in by 4.5% (the breath).
  4. Every other flower (the 11 other five-fold axes, nearest first) is built with exactly the same animation: the first flower's strokes, in the same order and from the matching joints, carried onto its axis by the rotation that takes v0 there. Each has its own give, tugs and breath. The second starts as the first breathes; later starts quicken (gaps 3.2 s x 0.82^j, at least 1.2 s). About 39 s at 1x for 120 struts. The `swing` mode is no longer used for spheres.
- Elastic give (`applyGive`, shared by the build and the finished structure; user wants it malleable but not bouncy):
  - Each strut sways about its own centre (up to 1.7 degrees) and floats (up to 1.6% of strut length), slowly (8 to 25 s a cycle, golden-ratio spread). Struts stay rigid; cables stretch.
  - Under that, the 3 softest symmetric modes, very lightly (0.8% of strut length).
  - A settling cable draws its pattern in once, smoothly (sin^2 bump over 2.4 s). No damped oscillation: the earlier version was too bouncy.
  - Fuller while a pattern forms, then it carries on at 55% (`GIVE_REST`) after the pattern closes, after the build ends, and in the normal view of a sphere. It never stops, so the drawn shape drifts slightly around the solved one. Checks and the cut list always use the solved geometry.
  - Give slider (0 to 3) in the view section. Its own clock (`GIVE_T`), so closing a finished build does not jump.
- View section: Depth shading 0 to 150% (0 = every line the same, near or far) and Cable brightness 20 to 200% (above 100% blends cables toward the strut colour).
- Controls: one Play/Pause key; after the build ends it shows Play and restarts from the start.

## Export
- PNG still (1024 to 4096), and GIF or MP4 (30 fps, H.264 via WebCodecs) clips at 720, 1080 or 1600 px. Same scheme as the Dymaxion studio. GIF frame rate is a choice of 10, 12.5, 16.7, 20 (default), 25, 33 or 50 fps: GIF delays are whole hundredths of a second, so only these are exact (`S.gifCs`, remembered). Frames are generated at that exact rate, so clip length is right. gifenc and mp4-muxer load from jsDelivr on first use.
- Frames are square, drawn off screen by the same `draw(canvas, ctx, opts)` as the view, with line scale `size / 700` so they read like a 700 px view. No selection or hover in exports.
- Turn length (4 to 40 s, default 35 s, which is the old 0.18 rad/s) also sets the live Rotate speed, so the view turns at exactly the speed a turn exports at; the build clip's spin follows it too. The slow 0.03 rad/s while the first pattern forms is unchanged.
- Seamless turn: one 360 degree yaw turn over the Turn length. The resting give is not periodic, so each frame blends the pose at t with the pose at t - T by u = i/n; the frame after the last is exactly frame 0. Measured: the last-to-first frame step equals an ordinary frame step.
- Build: runs `beginBuild()` and steps the same clocks as the live view (`step(dt)`), at the build speed, plus 1.5 s of the finished structure. The live loop holds still while `exporting` is set; every clock, the camera and the build state are saved and restored afterwards. A solve that lands mid-export cancels it.
- Backgrounds: with "Include artboard background" off, PNG and GIF are transparent (GIF soft edges blended toward the artboard colour). MP4 always has one: the artboard, or for Clear, Ink or Paper, whichever suits the strut colour.
- Icon (SVG): a flat drawing for icons, like the user's reference (a hexagon of single-weight lines): orthographic, no depth shading, every member one stroke, back lines kept by default. One `<path>` on a 48 x 48 grid (3 px margin), stroke currentColor, round caps and joins; stroke 0.75 / 1 (default) / 1.5 / 2 (1.5 on a 24 grid was far too heavy). Lines that land on each other are drawn once; members seen end on are dropped. Switches: Cables, Back lines (off = members whose midpoint faces away). Live 96 px preview in the export section; follows the camera in As shown.
  - Motion (Still default, Rock, Turn): Rock swings the structure about the drawing's vertical, up to 28 degrees each way (40 keyframes); Turn is a full revolution (72 keyframes). Exported as an animated SVG: the same single path with a SMIL `<animate attributeName="d">` looping over the keyframes, linear between them; Loop 2 to 20 s (default 6). Every member is kept in every frame (no dedupe), so the keyframes share one command list; Back lines is off for moving icons. One scale for all frames, from the 3D radius, so nothing leaves the frame. About 27 KB (Rock) and 47 KB (Turn) for 30 lines. The preview plays the exact SVG and is only replaced when it changes, so it keeps playing.
  - Icon GIF (shown for Rock and Turn), because Figma drops SVG animation: the same lines (`iconMoving()`, `iconLines(g, t)`, shared with the SVG keyframes) drawn at the GIF frame rate setting, one colour (colour picker, also tints the preview), 120 / 240 / 480 px. Palette = matte + 8 tints of the colour over it (no quantizing); coverage under 20% is transparent; 'For dark bg' / 'For light bg' picks the matte so soft edges suit where it will sit. Frame i is loop phase i / n, so it loops cleanly. Shows frames and megapixels (width x height x frames) and turns red over Figma's 50 MP.
  - Views: As shown (current camera, orthographic), Top, Front, and the structure's own n-fold axes from `symmetryAxes()`: a rotation is fixed by where it sends a joint and its nearest neighbour, so every candidate pair at the same radii and spacing gives a rotation, kept if it maps every joint onto a joint (grid lookup, 2e-3 R tolerance). One axis per order 6..2. Found: prism 3, 2; tetra 3, 2; octa and cube 4, 3, 2; spheres 5, 3, 2; tower 3. About 1 ms. Choice remembered (`tw.icon`), kept across structures when the new one has that axis.
- Framer component (`Framer component (.tsx)` button): src/framer/TensegritySphere.tsx is inlined at build as `<script type="text/plain" id="framerSrc">` (`/*FRAMER*/`); the export replaces `/*DATA*/ null` with `framerData()`: joints centred at radius 1 (4 decimals), members, per-member build timing from `makePlan()` (struts: start, dur, from joint, stroke/grow; cables: start, reveal, settle, from joint), mean strut length, the current view angle and look (colours, turn time, shading, cable opacity, background from the export background setting). The site never runs the solver; about 36 KB for 120 struts.
  - The component: canvas 2D, same projection, rod width and depth shading as the workbench. Drag to turn with inertia (velocity decays e^-2.2t; held still before release = no flick; touch-action pan-y so vertical page scroll still works on phones), pitch drifts back to the set angle, cursor tilt toward the mouse anywhere on the page (up to Tilt degrees), hover highlight (member in highlight colour, members sharing its joints at 55%), scroll build (build progress 0 when the frame's top crosses Starts at %, 1 at Ends at %, eased, reverses on scroll up). Framer property controls for all of it. On Framer's canvas (`RenderTarget.canvas`) and with reduced motion: still and fully built. Stops drawing off screen (IntersectionObserver). Colour tokens (CSS variables) are resolved through a hidden element. The file must stay ASCII and plain JSX (no TS types), and must not contain `</script`.
  - Website section (panel): Preview on a page opens `#webview`, a full-window mock page (iframe srcdoc, React 18 UMD from unpkg, a small stand-in for the `framer` module) that runs the exact exported file: its imports are stripped and it is run with `new Function`. The component uses `createElement`, not JSX, so no compiler is needed. Beside it, the interaction settings (spin, drag, inertia, cursor tilt and amount, hover, scroll build with Starts at / Ends at, size); changes re-render live, are remembered (`tw.web`, `S.web`) and are baked into the export as `DATA.interact`, which the component uses as its defaults. Esc or Close preview closes it.
  - Tested in a scratch React 18 page (Babel standalone, a `framer` shim for ControlType / addPropertyControls / RenderTarget): scroll build grows and reverses, hover lights a strut and its neighbours, a flick runs on and stops by about 4 s, tilt settles. Not yet run inside Framer itself.
- Saving uses `window.claude.use('downloads')` when the page runs as an artifact, otherwise a download link. The artifact needs the downloads capability for this.
- The camera starts close on the pattern and aimed at it (`zoom.focus`), with a slow drift, then pulls back as the pattern repeats. No ghost for spheres now; the camera pulls back slowly while flowers 2 to 6 form. With Fixed scale on there is no close-up or pull-back: the build plays at the fixed scale (the camera still turns to face the first pattern). Checked live in `animZoom()` and `project()`, so the switch takes effect mid-build.
- Inspiration the user shared (stills): hairlines drawn out from points, small + and x markers, radial bursts, trails, tiny mono labels.
- Tone: calm and quiet. No orange glow on the first pattern; captions are short lines, not numbers.
- Structures without the symmetry (prisms, towers) build bottom to top.
- tests/anim_frames.py [sizeIndex] [geo|gold] scrubs the timeline headless and writes tests/out/anim_sheet.png. It needs the `#noworker` redraw hook (`window.__twDraw`), because headless Chrome stops firing requestAnimationFrame.
