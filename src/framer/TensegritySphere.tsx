// Tensegrity sphere: a Framer code component exported from Tensegrity Workbench
// (https://hankwhiteco.github.io/tensegrity-workbench/). The geometry was solved and verified in the
// workbench; this file only draws it. Drag to turn (with inertia), the sphere leans toward the cursor,
// members light up under the cursor, and it can build itself as the page scrolls.
// Add it in Framer: Assets > Code > New code file, paste this file, then drag the component onto the canvas.
import { createElement, useEffect, useRef } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// P: joints (x, y, z, centred, radius 1). M: members (a, b, 1 = strut / 0 = cable).
// B: build timing per member in seconds: struts [start, dur, from joint, 0 = stroke / 1 = grow],
// cables [start, reveal, settle, from joint]. end: length of the build.
const DATA = /*DATA*/ null

const TAU = Math.PI * 2
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 600
 * @framerIntrinsicHeight 600
 */
export default function TensegritySphere(props) {
    const wrap = useRef(null)
    const canvas = useRef(null)
    const live = useRef(props)
    const redraw = useRef(null)
    live.current = props // the animation loop always reads the latest props

    useEffect(() => {
        const el = wrap.current, cv = canvas.current
        if (!el || !cv || !DATA) return
        const ctx = cv.getContext("2d")
        const onCanvas = RenderTarget.current() === RenderTarget.canvas // Framer's editor: hold still, fully built
        const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

        const P = DATA.P, M = DATA.M, B = DATA.B, nM = M.length / 3, nP = P.length / 3
        // members meeting at each joint, for the hover highlight
        const atJoint = Array.from({ length: nP }, () => [])
        for (let k = 0; k < nM; k++) { atJoint[M[3 * k]].push(k); atJoint[M[3 * k + 1]].push(k) }

        const st = {
            yaw: DATA.view.yaw, pitch: DATA.view.pitch, vy: 0, vp: 0, // orbit and its inertia (rad/s)
            tx: 0, ty: 0, // cursor tilt, eased
            sy: -1e9, // scroll rotation (rad), eased; -1e9: not measured yet
            mouse: null, drag: null, hover: -1,
            prog: onCanvas || reduce ? 1 : -1, // scroll build progress, eased (-1: not measured yet)
            visible: true, raf: 0, last: 0,
        }
        const proj = new Float32Array(nP * 3) // screen x, y and depth of each joint, last frame

        // Framer colours can be CSS variables (colour tokens); the canvas needs plain colours
        const probe = document.createElement("span")
        probe.style.display = "none"; el.appendChild(probe)
        const colorCache = new Map()
        const color = (c) => {
            if (!c || c.indexOf("var(") < 0) return c || "transparent"
            if (!colorCache.has(c)) { probe.style.color = c; colorCache.set(c, getComputedStyle(probe).color) }
            return colorCache.get(c)
        }

        const resize = () => {
            const d = window.devicePixelRatio || 1, r = cv.getBoundingClientRect()
            cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d))
        }
        const ro = new ResizeObserver(resize); ro.observe(cv); resize()
        const io = new IntersectionObserver((e) => { st.visible = e[0].isIntersecting; if (st.visible) kick() })
        io.observe(el)

        const project = (yaw, pitch, s, W, H) => {
            const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), dist = 4.2
            for (let i = 0; i < nP; i++) {
                const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2]
                const X = cy * x - sy * y, Y = sy * x + cy * y
                const Y2 = cp * Y - sp * z, Z2 = sp * Y + cp * z, k = dist / (dist + Y2)
                proj[3 * i] = W / 2 + X * s * k; proj[3 * i + 1] = H / 2 - Z2 * s * k; proj[3 * i + 2] = Y2
            }
        }

        const pick = (mx, my) => { // nearest member to a point in canvas pixels, front ones first
            const d = window.devicePixelRatio || 1
            let best = -1, bd = 10 * d, bz = Infinity
            for (let k = 0; k < nM; k++) {
                const a = M[3 * k], b = M[3 * k + 1]
                const ax = proj[3 * a], ay = proj[3 * a + 1], dx = proj[3 * b] - ax, dy = proj[3 * b + 1] - ay
                const t = clamp01(((mx - ax) * dx + (my - ay) * dy) / (dx * dx + dy * dy || 1))
                const dd = Math.hypot(mx - ax - dx * t, my - ay - dy * t) - (M[3 * k + 2] ? 3 * d : 0)
                const z = proj[3 * a + 2] + (proj[3 * b + 2] - proj[3 * a + 2]) * t
                if (dd < bd - 2 * d || (dd < bd + 2 * d && z < bz)) { bd = Math.max(dd, 0); best = k; bz = z }
            }
            return best
        }

        const scrollTarget = (p) => { // 0 when the top crosses "Starts at", 1 when it reaches "Ends at"
            const r = el.getBoundingClientRect(), vh = window.innerHeight || 1
            const y0 = vh * p.buildStart / 100, y1 = vh * p.buildEnd / 100
            return Math.abs(y0 - y1) < 1 ? (r.top <= y1 ? 1 : 0) : clamp01((y0 - r.top) / (y0 - y1))
        }

        const draw = () => {
            const p = live.current, W = cv.width, H = cv.height, d = window.devicePixelRatio || 1
            ctx.clearRect(0, 0, W, H)
            const s = Math.min(W, H) * 0.4 * (p.zoom / 100)
            project(st.yaw + st.tx + (p.scrollRotate && st.sy > -1e8 ? st.sy : 0), st.pitch + st.ty, s, W, H)
            let zmin = Infinity, zmax = -Infinity
            for (let i = 0; i < nP; i++) { const z = proj[3 * i + 2]; if (z < zmin) zmin = z; if (z > zmax) zmax = z }
            const t = (p.scrollBuild ? Math.max(0, st.prog) : 1) * DATA.end
            const built = t >= DATA.end
            const shade = p.depthShading / 100, cableA = p.cableOpacity / 100
            const rod = Math.max(1.6, Math.min(7, DATA.strut * s / 40 / d)) * (p.strutWidth / 100)
            const strutC = color(p.strutColor), cableC = color(p.cableColor), hiC = color(p.highlightColor)
            // the hovered member, and the members that share its joints
            const near = new Set()
            if (st.hover >= 0) for (const j of [M[3 * st.hover], M[3 * st.hover + 1]]) for (const k of atJoint[j]) near.add(k)
            const order = []
            for (let k = 0; k < nM; k++) order.push(k)
            const zOf = (k) => proj[3 * M[3 * k] + 2] + proj[3 * M[3 * k + 1] + 2]
            order.sort((a, b) => zOf(b) - zOf(a)) // far first
            ctx.lineCap = "round"
            for (const k of order) {
                const a = M[3 * k], b = M[3 * k + 1], strut = M[3 * k + 2] === 1, q = B[k]
                let x0 = proj[3 * a], y0 = proj[3 * a + 1], x1 = proj[3 * b], y1 = proj[3 * b + 1]
                let alpha = 1, width = strut ? rod : 1.1, tip = false
                if (!built) {
                    if (strut) {
                        const r = ease((t - q[0]) / q[1])
                        if (t < q[0]) continue
                        if (q[3] === 1) { // grows out from its middle
                            const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
                            x0 = mx + (x0 - mx) * r; y0 = my + (y0 - my) * r; x1 = mx + (x1 - mx) * r; y1 = my + (y1 - my) * r
                        } else if (r < 1) { // a stroke from one joint, with a bright point at its tip
                            if (q[2] === b) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0] }
                            x1 = x0 + (x1 - x0) * r; y1 = y0 + (y1 - y0) * r; tip = true
                        }
                    } else {
                        const u = t - q[0]
                        if (u <= 0) continue
                        const r = ease(u / q[1]), firm = ease((u - q[1] * 0.6) / q[2])
                        alpha = 0.35 + 0.6 * firm; width *= 0.7 + 0.3 * firm
                        if (r < 1) {
                            if (q[3] === b) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0] }
                            x1 = x0 + (x1 - x0) * r; y1 = y0 + (y1 - y0) * r
                        }
                    }
                }
                const depth = zmax > zmin ? (zOf(k) / 2 - zmin) / (zmax - zmin) : 0.5
                let a1 = Math.max(0.08, 1 - 0.6 * shade * depth) * (strut ? 1 : Math.min(1, cableA)) * alpha
                let col = strut ? strutC : cableC
                if (p.hover && k === st.hover) { col = hiC; a1 = 1 }
                ctx.globalAlpha = a1; ctx.strokeStyle = col
                ctx.lineWidth = width * d * (strut ? Math.max(0.2, 1 - 0.35 * shade * depth) : 1)
                ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
                if (p.hover && k !== st.hover && near.has(k)) { ctx.globalAlpha = 0.55 * alpha; ctx.strokeStyle = hiC; ctx.stroke() }
                if (tip) { ctx.globalAlpha = 0.9; ctx.fillStyle = strutC; ctx.beginPath(); ctx.arc(x1, y1, 1.6 * d, 0, TAU); ctx.fill() }
            }
            ctx.globalAlpha = 1
        }

        const frame = (now) => {
            st.raf = 0
            const p = live.current
            const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 0
            st.last = now
            const moving = !onCanvas && !reduce
            if (moving && !st.drag) {
                if (p.drag && p.inertia) { // let a flick run on and slow down
                    st.yaw += st.vy * dt; st.pitch += st.vp * dt
                    const f = Math.exp(-dt * 2.2); st.vy *= f; st.vp *= f
                }
                if (p.spin && !p.scrollRotate) st.yaw += (TAU / Math.max(1, p.turnSeconds)) * dt
                st.pitch += (DATA.view.pitch - st.pitch) * (1 - Math.exp(-dt * 0.6)) // drift back to the set angle
            }
            // lean toward the cursor, wherever it is on the page
            let tx = 0, ty = 0
            if (moving && p.tilt && st.mouse && !st.drag) {
                const r = el.getBoundingClientRect(), k = (p.tiltAmount * Math.PI) / 180
                tx = Math.max(-1, Math.min(1, (st.mouse[0] - (r.left + r.width / 2)) / (window.innerWidth / 2 || 1))) * k
                ty = Math.max(-1, Math.min(1, (st.mouse[1] - (r.top + r.height / 2)) / (window.innerHeight / 2 || 1))) * k
            }
            const e = 1 - Math.exp(-dt * 4)
            // rotate on scroll: page scroll turns the structure, so many degrees per screen height, eased
            if (p.scrollRotate) {
                const target = (((window.scrollY || 0) / (window.innerHeight || 1)) * p.scrollDegrees * Math.PI) / 180
                st.sy = st.sy < -1e8 || !moving ? target : st.sy + (target - st.sy) * (1 - Math.exp(-dt * 7))
            }
            st.tx += (tx - st.tx) * e; st.ty += (ty - st.ty) * e
            if (p.scrollBuild && moving) {
                const target = scrollTarget(p)
                st.prog = st.prog < 0 ? target : st.prog + (target - st.prog) * (1 - Math.exp(-dt * 6))
            } else st.prog = 1
            draw()
            if (st.visible && (moving || st.drag)) st.raf = requestAnimationFrame(frame)
        }
        const kick = () => { if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(frame) } }
        redraw.current = kick

        // drag to turn
        const local = (ev) => { const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; return [(ev.clientX - r.left) * d, (ev.clientY - r.top) * d] }
        const down = (ev) => {
            if (!live.current.drag) return
            st.drag = { x: ev.clientX, y: ev.clientY, t: performance.now() }; st.vy = st.vp = 0; st.hover = -1
            cv.setPointerCapture(ev.pointerId); cv.style.cursor = "grabbing"; kick()
        }
        const move = (ev) => {
            if (st.drag) {
                const now = performance.now(), dt = Math.max(0.008, (now - st.drag.t) / 1000)
                const dx = (ev.clientX - st.drag.x) * 0.008, dy = (ev.clientY - st.drag.y) * 0.008
                st.yaw += dx; st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch + dy))
                st.vy = 0.7 * st.vy + 0.3 * (dx / dt); st.vp = 0.7 * st.vp + 0.3 * (dy / dt)
                st.drag = { x: ev.clientX, y: ev.clientY, t: now }
            } else if (live.current.hover && ev.pointerType === "mouse") {
                const [x, y] = local(ev); st.hover = pick(x, y); cv.style.cursor = st.hover >= 0 ? "pointer" : (live.current.drag ? "grab" : "default")
            }
            kick()
        }
        const up = () => {
            if (!st.drag) return
            if (performance.now() - st.drag.t > 80) st.vy = st.vp = 0 // held still before letting go: no flick
            st.drag = null; cv.style.cursor = live.current.drag ? "grab" : "default"; kick()
        }
        const leave = () => { st.hover = -1; kick() }
        const track = (ev) => { if (ev.pointerType === "mouse") st.mouse = [ev.clientX, ev.clientY] }
        cv.addEventListener("pointerdown", down)
        cv.addEventListener("pointermove", move)
        cv.addEventListener("pointerup", up)
        cv.addEventListener("pointercancel", up)
        cv.addEventListener("pointerleave", leave)
        window.addEventListener("pointermove", track, { passive: true })
        window.addEventListener("scroll", kick, { passive: true })
        kick()
        return () => {
            redraw.current = null; cancelAnimationFrame(st.raf); ro.disconnect(); io.disconnect(); probe.remove()
            cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move)
            cv.removeEventListener("pointerup", up); cv.removeEventListener("pointercancel", up)
            cv.removeEventListener("pointerleave", leave)
            window.removeEventListener("pointermove", track); window.removeEventListener("scroll", kick)
        }
    }, [])

    // redraw when a property changes while the loop is idle (Framer's editor, reduced motion)
    useEffect(() => { if (redraw.current) redraw.current() })

    // createElement rather than JSX, so the workbench can preview this exact file without a compiler
    return createElement(
        "div",
        { ref: wrap, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: props.background, ...props.style } },
        createElement("canvas", {
            ref: canvas,
            style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", cursor: props.drag ? "grab" : "default", touchAction: props.drag ? "pan-y" : "auto" },
            "aria-label": DATA ? DATA.name : "Tensegrity sphere",
            role: "img",
        })
    )
}

const S = (DATA && DATA.style) || {}
const I = (DATA && DATA.interact) || {} // interaction settings chosen in the workbench preview
const or = (v, d) => (v === undefined ? d : v)
TensegritySphere.defaultProps = {
    background: S.background || "rgba(0, 0, 0, 0)", strutColor: S.strut || "#f2f0ea", cableColor: S.cable || "#9a9890",
    highlightColor: S.highlight || "#f26a2c", scrollRotate: or(I.scrollRotate, false), scrollDegrees: or(I.scrollDegrees, 90), spin: or(I.spin, true), turnSeconds: S.turn || 35, drag: or(I.drag, true),
    inertia: or(I.inertia, true), tilt: or(I.tilt, true), tiltAmount: or(I.tiltAmount, 8), hover: or(I.hover, true),
    scrollBuild: or(I.scrollBuild, true), buildStart: or(I.buildStart, 95), buildEnd: or(I.buildEnd, 35),
    depthShading: S.shade || 100, cableOpacity: S.cableOpacity || 100, zoom: or(I.zoom, 100), strutWidth: 100,
}
const D = TensegritySphere.defaultProps

addPropertyControls(TensegritySphere, {
    background: { type: ControlType.Color, title: "Background", defaultValue: D.background },
    strutColor: { type: ControlType.Color, title: "Struts", defaultValue: D.strutColor },
    cableColor: { type: ControlType.Color, title: "Cables", defaultValue: D.cableColor },
    highlightColor: { type: ControlType.Color, title: "Highlight", defaultValue: D.highlightColor },
    scrollRotate: { type: ControlType.Boolean, title: "Rotate on scroll", defaultValue: D.scrollRotate },
    scrollDegrees: { type: ControlType.Number, title: "Per screen", min: -360, max: 360, step: 5, unit: "\u00b0", defaultValue: D.scrollDegrees, description: "How far it turns for each screen height scrolled. Negative turns the other way.", hidden: (p) => !p.scrollRotate },
    spin: { type: ControlType.Boolean, title: "Spin", defaultValue: D.spin, hidden: (p) => p.scrollRotate },
    turnSeconds: { type: ControlType.Number, title: "Turn time", min: 4, max: 120, step: 1, unit: "s", defaultValue: D.turnSeconds, hidden: (p) => !p.spin || p.scrollRotate },
    drag: { type: ControlType.Boolean, title: "Drag to turn", defaultValue: D.drag },
    inertia: { type: ControlType.Boolean, title: "Inertia", defaultValue: D.inertia, hidden: (p) => !p.drag },
    tilt: { type: ControlType.Boolean, title: "Cursor tilt", defaultValue: D.tilt },
    tiltAmount: { type: ControlType.Number, title: "Tilt", min: 0, max: 30, step: 1, unit: "\u00b0", defaultValue: D.tiltAmount, hidden: (p) => !p.tilt },
    hover: { type: ControlType.Boolean, title: "Hover highlight", defaultValue: D.hover },
    scrollBuild: { type: ControlType.Boolean, title: "Scroll build", defaultValue: D.scrollBuild },
    buildStart: { type: ControlType.Number, title: "Starts at", min: 0, max: 100, step: 1, unit: "%", defaultValue: D.buildStart, description: "Where the top of the sphere's frame is in the viewport (% from the top) when the build starts.", hidden: (p) => !p.scrollBuild },
    buildEnd: { type: ControlType.Number, title: "Ends at", min: 0, max: 100, step: 1, unit: "%", defaultValue: D.buildEnd, hidden: (p) => !p.scrollBuild },
    depthShading: { type: ControlType.Number, title: "Depth shading", min: 0, max: 150, step: 5, unit: "%", defaultValue: D.depthShading },
    cableOpacity: { type: ControlType.Number, title: "Cables", min: 20, max: 100, step: 5, unit: "%", defaultValue: Math.min(100, D.cableOpacity) },
    zoom: { type: ControlType.Number, title: "Size", min: 40, max: 160, step: 1, unit: "%", defaultValue: D.zoom },
    strutWidth: { type: ControlType.Number, title: "Strut width", min: 40, max: 250, step: 5, unit: "%", defaultValue: D.strutWidth },
})
