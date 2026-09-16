// ---------------------------------------------------------------
// FateWheel.jsx — the Wheel page's rendering machinery, extracted
// for reuse (currently: both Gauntlet wheels).
//
// Everything readability-critical is ported from Wheel.jsx verbatim
// in technique — that page is the source of truth for the look:
//   · labels curve along the rim (SVG textPath), drawn in reverse on
//     the bottom half so text never reads upside down; slivers get
//     tooltips + the drum instead
//   · the drum readout shows the slice under the pointer big and lit
//     with neighbors curving away in 3D perspective, flickering
//     through names as slices pass — the many-slice answer
//   · the pointer kicks on every slice boundary (global
//     .wheel-pointer CSS, keyed remount per tick)
//   · rAF drives rotation by mutating the <g> directly — no re-render
//     per frame; React only repaints on boundary crossings
//
// What is NOT here: Wheel.jsx's server-committed spin handoff
// (free-run → decel). This wheel decides its own fate client-side:
// pick the target, animate to it, snap, report. Wheel.jsx stays on
// its own machinery on purpose — its contract spins need the server.
// ---------------------------------------------------------------
import { useEffect, useMemo, useRef, useState, useId } from "react";
import { S } from "./ui.jsx";

const SLICE_COLORS = ["#5CB8A6", "#7FB4E6", "#B48CE0", "#E0824B", "#E05B5B", "#E8B84B", "#6BC46D", "#D97BB6"];

export default function FateWheel({ slices, onLanded, disabled, hubLabel = "SPIN", drumTitle = "Under the pointer" }) {
  const uid = useId().replace(/:/g, "");
  const VB = 400, C = VB / 2;
  const R_RIM = 188, R_SLICE = 176, R_HUB = 54, R_LABEL = 158;
  const [current, setCurrent] = useState(0);   // slice index under the pointer
  const [tick, setTick] = useState(0);         // increments per boundary → pointer kick
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(null);  // slice index after the snap
  const gRef = useRef(null);
  const rotRef = useRef(0);
  const rafRef = useRef(null);

  // slice paths + curved label arcs + boundary dots + [start, sweep]
  const totalW = slices.reduce((s, x) => s + (x.weight ?? 1), 0) || 1;
  const built = useMemo(() => {
    let angle = 0;
    return slices.map((s, idx) => {
      const sweep = Math.min(((s.weight ?? 1) / totalW) * 360, 359.99);   // clamp: a 1-slice wheel still draws
      const a0 = (angle - 90) * Math.PI / 180, a1 = (angle + sweep - 90) * Math.PI / 180;
      const large = sweep > 180 ? 1 : 0;
      const d = `M ${C} ${C} L ${C + R_SLICE * Math.cos(a0)} ${C + R_SLICE * Math.sin(a0)} A ${R_SLICE} ${R_SLICE} 0 ${large} 1 ${C + R_SLICE * Math.cos(a1)} ${C + R_SLICE * Math.sin(a1)} Z`;
      // curved label: arc near the rim, reversed on the bottom half so
      // the text stays upright; too-thin slices rely on drum + tooltip
      let label = null;
      const mid = angle + sweep / 2;
      if (sweep >= 10) {
        const pad = Math.min(4, sweep * 0.12);
        const flip = mid > 90 && mid < 270;
        const s0 = (angle + pad - 90) * Math.PI / 180, s1 = (angle + sweep - pad - 90) * Math.PI / 180;
        const P = (r, a) => `${C + r * Math.cos(a)} ${C + r * Math.sin(a)}`;
        const arc = flip
          ? `M ${P(R_LABEL, s1)} A ${R_LABEL} ${R_LABEL} 0 ${large} 0 ${P(R_LABEL, s0)}`
          : `M ${P(R_LABEL, s0)} A ${R_LABEL} ${R_LABEL} 0 ${large} 1 ${P(R_LABEL, s1)}`;
        const fs = sweep > 26 ? 13 : sweep > 16 ? 11.5 : 10;
        const arcLen = ((sweep - 2 * pad) * Math.PI / 180) * R_LABEL;
        const maxChars = Math.floor(arcLen / (fs * 0.62));
        const text = s.name.length > maxChars ? s.name.slice(0, Math.max(1, maxChars - 1)) + "…" : s.name;
        label = { arc, fs, text, id: `fw-${uid}-${idx}`, dy: flip ? fs * 0.7 : 0 };
      }
      const b = (angle - 90) * Math.PI / 180;
      const dot = { x: C + R_RIM * Math.cos(b), y: C + R_RIM * Math.sin(b) };
      const out = { ...s, idx, d, label, dot, start: angle, sweep,
        color: s.color ?? SLICE_COLORS[idx % SLICE_COLORS.length] };
      angle += sweep;
      return out;
    });
  }, [slices, totalW, uid]);

  const sliceAt = (rot) => {
    const w = ((360 - (rot % 360)) + 360) % 360;
    for (const s of built) if (w >= s.start && w < s.start + s.sweep) return s.idx;
    return built.length - 1;
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  // reset tracking when the wheel's SHAPE changes (pool shrank, routes swapped)
  const shape = built.map((b) => b.id ?? b.name).join("|");
  useEffect(() => { setLanded(null); setCurrent(sliceAt(rotRef.current)); }, [shape]);

  const spin = () => {
    if (spinning || disabled || !built.length) return;
    setLanded(null);
    // fate decided up front; the animation makes the answer feel earned
    const target = Math.floor(Math.random() * built.length);
    const t = built[target];
    const want = (360 - (t.start + t.sweep * (0.2 + Math.random() * 0.6))) % 360;
    const from = rotRef.current;
    const total = 360 * (4 + Math.floor(Math.random() * 3)) + ((want - (from % 360)) % 360 + 360) % 360;
    const D = 2800 + Math.random() * 1000, t0 = performance.now();
    let lastIdx = sliceAt(from);
    setSpinning(true);
    const frame = (now) => {
      const tt = Math.min(1, (now - t0) / D);
      const rot = from + total * (1 - Math.pow(1 - tt, 4));   // friction: fast launch, long decay
      rotRef.current = rot;
      if (gRef.current) gRef.current.style.transform = `rotate(${rot}deg)`;
      const idx = sliceAt(rot);
      if (idx !== lastIdx) { lastIdx = idx; setCurrent(idx); setTick((k) => k + 1); }
      if (tt < 1) { rafRef.current = requestAnimationFrame(frame); return; }
      // snap and read the result from where the wheel PHYSICALLY stopped
      rotRef.current = from + total;
      if (gRef.current) gRef.current.style.transform = `rotate(${from + total}deg)`;
      const finalIdx = sliceAt(from + total);
      setSpinning(false); setCurrent(finalIdx); setLanded(finalIdx);
      onLanded(finalIdx);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  // drum readout: current slice ± 2 neighbors, curved away in perspective
  const drumRows = built.length ? [-2, -1, 0, 1, 2].map((off) => {
    const idx = ((current + off) % built.length + built.length) % built.length;
    return { off, s: built[idx] };
  }) : [];

  return (
    <div style={{ display: "flex", gap: 30, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: "min(88vw, 380px)", aspectRatio: "1 / 1", flexShrink: 0 }}>
        <div key={tick} className="wheel-pointer" style={{ position: "absolute", top: "-2px", left: "50%", zIndex: 2,
          width: 0, height: 0, borderLeft: "13px solid transparent", borderRight: "13px solid transparent",
          borderTop: "22px solid var(--accent)", transformOrigin: "50% 0%",
          filter: "drop-shadow(0 0 8px var(--accent)) drop-shadow(0 2px 3px rgba(0,0,0,.5))" }} />
        <svg width="100%" height="100%" viewBox={`0 0 ${VB} ${VB}`} style={{ display: "block" }}>
          <defs>
            <radialGradient id={`fwSheen-${uid}`} cx="38%" cy="34%" r="75%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.16" />
              <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
            </radialGradient>
            {built.map((p) => p.label && <path key={p.label.id} id={p.label.id} d={p.label.arc} fill="none" />)}
          </defs>
          <circle cx={C} cy={C} r={R_RIM} fill="none" stroke="var(--border2)" strokeWidth="9" />
          <circle cx={C} cy={C} r={R_RIM + 6} fill="none" stroke="var(--border)" strokeWidth="2" />
          <g ref={gRef} style={{ transform: `rotate(${rotRef.current}deg)`, transformOrigin: "50% 50%", transformBox: "view-box" }}>
            {built.map((p) => (
              <g key={p.idx}>
                <path d={p.d} fill={p.color} fillOpacity="0.82" stroke="var(--bg)" strokeWidth="2.5"
                  style={landed === p.idx && !spinning ? { stroke: "var(--accent)", strokeWidth: 4, filter: "drop-shadow(0 0 6px var(--accent))" } : {}}>
                  <title>{p.name}</title>
                </path>
                {p.label && (
                  <text fontSize={p.label.fs} fontWeight="700" fill="#0E1420" fillOpacity="0.9" dy={p.label.dy}
                    style={{ pointerEvents: "none", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
                    <textPath href={`#${p.label.id}`} startOffset="50%" textAnchor="middle">{p.label.text}</textPath>
                  </text>
                )}
              </g>
            ))}
            <circle cx={C} cy={C} r={R_SLICE} fill={`url(#fwSheen-${uid})`} pointerEvents="none" />
            {built.map((p) => (
              <circle key={"d" + p.idx} cx={p.dot.x} cy={p.dot.y} r="3.2" fill="var(--bg)" stroke="var(--border2)" strokeWidth="1" />
            ))}
          </g>
          <g onClick={spin} style={{ cursor: spinning || disabled || !built.length ? "default" : "pointer" }}>
            <circle cx={C} cy={C} r={R_HUB} fill="var(--panel)" stroke="var(--accent-border)" strokeWidth="3" />
            <circle cx={C} cy={C} r={R_HUB - 8} fill="none" stroke="var(--border)" strokeWidth="1.5" />
            <text x={C} y={C + 2} textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="700"
              fill={spinning ? "var(--faint)" : "var(--accent)"} style={{ ...S.display, letterSpacing: "0.06em", userSelect: "none" }}>
              {spinning ? "…" : hubLabel}
            </text>
          </g>
        </svg>
      </div>
      <div style={{ minWidth: 230, maxWidth: 320, flex: "1 1 230px" }}>
        <div style={{ ...S.label, marginBottom: 8 }}>{drumTitle}</div>
        <div style={{ perspective: "520px" }}>
          {drumRows.map(({ off, s }) => {
            const abs = Math.abs(off);
            return (
              <div key={off} style={{
                transform: `rotateX(${off * -28}deg) translateZ(${abs ? -8 : 14}px) scale(${1 - abs * 0.13})`,
                opacity: 1 - abs * 0.32, transformOrigin: "center",
                background: off === 0 ? "var(--accent-bg)" : "var(--chip)",
                border: `1px solid ${off === 0 ? "var(--accent-border)" : "var(--border)"}`,
                borderRadius: 8, padding: off === 0 ? "10px 14px" : "5px 14px",
                margin: "3px 0", display: "flex", alignItems: "center", gap: 10,
                transition: spinning ? "none" : "all .25s ease",
              }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: s.color, flexShrink: 0 }} />
                <span style={{ ...S.display, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflowEllipsis: undefined, textOverflow: "ellipsis",
                  fontSize: off === 0 ? 19 : 13, color: off === 0 ? "var(--accent)" : "var(--muted)" }}>{s.name}</span>
              </div>
            );
          })}
          {!drumRows.length && <p style={{ color: "var(--muted)", fontSize: 13 }}>Nothing on this wheel.</p>}
        </div>
      </div>
    </div>
  );
}
