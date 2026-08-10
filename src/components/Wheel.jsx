// ---------------------------------------------------------------
// Wheel.jsx — the wheel of fate ("#/wheel").
//
// v3.3 mechanics:
//  - The spin is driven by JavaScript (requestAnimationFrame) with a
//    friction curve: theta(t) = total · (1 − (1−t)⁴). Fast launch,
//    long real-wheel decay, randomized duration and landing point.
//    Because JS owns the angle every frame, the UI can TRACK the spin:
//  - The drum readout ("under the pointer") shows the current slice
//    big and lit with neighbors curving away in 3D perspective —
//    Price-is-Right style — flickering through names as slices pass.
//    This is the readability answer for the 80-slice public wheel.
//  - Labels curve along the rim (SVG textPath), flipped on the bottom
//    half so they never read upside down; slivers get tooltips + the
//    drum instead.
//  - The pointer kicks on every slice boundary.
// ---------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from "react";
import { S, Dial } from "./ui.jsx";

const SLICE_COLORS = ["#5CB8A6", "#7FB4E6", "#B48CE0", "#E0824B", "#E05B5B", "#E8B84B", "#6BC46D", "#D97BB6"];

function pickWeighted(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of items) { r -= x.weight; if (r <= 0) return x; }
  return items[items.length - 1];
}

export default function Wheel({ stats, meta, mutate, busy, nav }) {
  const [mode, setMode] = useState("personal");
  const [spinner, setSpinner] = useState(meta.members[0]?.steamid ?? "");
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [current, setCurrent] = useState(0);   // slice index under the pointer
  const [tick, setTick] = useState(0);         // increments per boundary → pointer kick
  const gRef = useRef(null);                   // rotating <g>; mutated per frame (no re-render)
  const rotRef = useRef(0);
  const rafRef = useRef(null);

  const slices = useMemo(() => {
    if (mode === "public") {
      return stats.games.map((g, i) => ({
        appid: g.appid, name: g.name, diff: g.diff, weight: 1,
        color: SLICE_COLORS[i % SLICE_COLORS.length],
      }));
    }
    return stats.games
      .filter((g) => !g.players[spinner]?.complete)
      .map((g, i) => {
        const rec = stats.recs.find((r) => r.sid === spinner && r.appid === g.appid);
        return { appid: g.appid, name: g.name, diff: g.diff,
          weight: rec ? 100 / rec.effort : 0.5,
          color: SLICE_COLORS[i % SLICE_COLORS.length] };
      });
  }, [mode, spinner, stats]);

  const totalW = slices.reduce((s, x) => s + x.weight, 0);

  // ---- geometry (viewBox coords; rendered size is responsive) ----
  const VB = 400, C = VB / 2;
  const R_RIM = 188, R_SLICE = 176, R_HUB = 54, R_LABEL = 158;

  // slice paths + curved label arcs + boundary dots + [start, sweep] table
  const built = useMemo(() => {
    let angle = 0;
    return slices.map((s, idx) => {
      const sweep = (s.weight / totalW) * 360;
      const a0 = (angle - 90) * Math.PI / 180, a1 = (angle + sweep - 90) * Math.PI / 180;
      const large = sweep > 180 ? 1 : 0;
      const d = `M ${C} ${C} L ${C + R_SLICE * Math.cos(a0)} ${C + R_SLICE * Math.sin(a0)} A ${R_SLICE} ${R_SLICE} 0 ${large} 1 ${C + R_SLICE * Math.cos(a1)} ${C + R_SLICE * Math.sin(a1)} Z`;

      // curved label: an arc near the rim; bottom-half slices get the arc
      // drawn in reverse so the text stays upright
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
        label = { arc, fs, text, id: `arc-${mode}-${s.appid}`, dy: flip ? fs * 0.7 : 0 };
      }
      const b = (angle - 90) * Math.PI / 180;
      const dot = { x: C + R_RIM * Math.cos(b), y: C + R_RIM * Math.sin(b) };
      const out = { ...s, idx, d, label, dot, start: angle, sweep };
      angle += sweep;
      return out;
    });
  }, [slices, totalW, mode]);

  // which slice sits under the top pointer at a given rotation
  const sliceAt = (rot) => {
    const w = ((360 - (rot % 360)) + 360) % 360;
    for (const s of built) if (w >= s.start && w < s.start + s.sweep) return s.idx;
    return built.length - 1;
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  useEffect(() => { setResult(null); setCurrent(sliceAt(rotRef.current)); }, [built]);

  function spin() {
    if (!built.length || spinning) return;
    const winner = pickWeighted(built);
    const landing = winner.start + winner.sweep * (0.2 + Math.random() * 0.6);
    // turns MUST be a whole number — fractional turns shift the landing
    // angle off the chosen slice (the "highlights a different slice" bug)
    const turns = 5 + Math.floor(Math.random() * 2);
    const from = rotRef.current;
    const target = from - (from % 360) + turns * 360 + (360 - landing);
    const total = target - from;
    const D = 4600 + Math.random() * 1200;         // 4.6–5.8s
    const t0 = performance.now();
    setSpinning(true); setResult(null);
    let lastIdx = sliceAt(from);

    const frame = (now) => {
      const t = Math.min(1, (now - t0) / D);
      const eased = 1 - Math.pow(1 - t, 4);        // friction: fast launch, long decay
      const rot = from + total * eased;
      rotRef.current = rot;
      if (gRef.current) gRef.current.style.transform = `rotate(${rot}deg)`;
      const idx = sliceAt(rot);
      if (idx !== lastIdx) { lastIdx = idx; setCurrent(idx); setTick((k) => k + 1); }
      if (t < 1) rafRef.current = requestAnimationFrame(frame);
      else {
        // snap to the exact target and read the result from where the
        // wheel PHYSICALLY stopped — pointer, highlight, drum, and the
        // contract can never disagree
        rotRef.current = target;
        if (gRef.current) gRef.current.style.transform = `rotate(${target}deg)`;
        const finalIdx = sliceAt(target);
        setSpinning(false); setResult(slices[finalIdx]); setCurrent(finalIdx);
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  async function accept() {
    if (!result) return;
    await mutate("createContract",
      { steamid: mode === "personal" ? spinner : null, appid: result.appid, source: mode },
      () => mode === "personal"
        ? `Contract signed: ${result.name} at 1.5× for ${stats.byId[spinner]?.name}`
        : `⚡ BOUNTY POSTED: ${result.name} pays 2× for everyone!`);
    setResult(null);
  }

  const activeBounty = stats.contractView.filter((c) => c.source === "public" && c.status === "active").slice(-1)[0];
  // one active contract per person: spinner is bound until they beat it or Monday clears it
  const boundBy = mode === "personal"
    ? stats.contractView.find((c) => c.steamid === spinner && c.status === "active")
    : null;
  const fmtExpiry = (t) => new Date(t * 1000).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  // drum readout: current slice ± 2 neighbors, curved away in perspective
  const drumRows = built.length ? [-2, -1, 0, 1, 2].map((off) => {
    const idx = ((current + off) % built.length + built.length) % built.length;
    return { off, s: built[idx] };
  }) : [];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {[["personal", "Personal wheel · 1.5×"], ["public", "Public bounty · 2×"]].map(([k, l]) => (
          <button key={k} style={{ ...S.btnGhost, ...(mode === k ? { color: "var(--accent)", borderColor: "var(--accent-border)" } : {}) }}
            onClick={() => { setMode(k); setResult(null); }}>{l}</button>
        ))}
        {mode === "personal" && (
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
            Spinning as
            <select value={spinner} onChange={(e) => { setSpinner(e.target.value); setResult(null); }} style={{ ...S.input, width: "auto" }}>
              {meta.members.map((m) => <option key={m.steamid} value={m.steamid}>{m.name}</option>)}
            </select>
          </span>
        )}
        <span style={{ fontSize: 12, color: "var(--faint)", marginLeft: "auto" }}>
          {mode === "personal" ? "Fatter slices = closer to 100%" : `${slices.length} games, equal odds`}
        </span>
      </div>

      <div className="panel" style={{ ...S.panel, display: "flex", gap: 30, flexWrap: "wrap", alignItems: "center", justifyContent: "center", padding: 26 }}>
        {/* ---- the wheel ---- */}
        <div style={{ position: "relative", width: "min(88vw, 430px)", aspectRatio: "1 / 1", flexShrink: 0 }}>
          <div key={tick} className="wheel-pointer" style={{ position: "absolute", top: "-2px", left: "50%", zIndex: 2,
            width: 0, height: 0, borderLeft: "13px solid transparent", borderRight: "13px solid transparent",
            borderTop: "22px solid var(--accent)", transformOrigin: "50% 0%",
            filter: "drop-shadow(0 0 8px var(--accent)) drop-shadow(0 2px 3px rgba(0,0,0,.5))" }} />
          <svg width="100%" height="100%" viewBox={`0 0 ${VB} ${VB}`} style={{ display: "block" }}>
            <defs>
              <radialGradient id="wheelSheen" cx="38%" cy="34%" r="75%">
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
                <g key={p.appid}>
                  <path d={p.d} fill={p.color} fillOpacity="0.82" stroke="var(--bg)" strokeWidth="2.5"
                    style={result?.appid === p.appid && !spinning ? { stroke: "var(--accent)", strokeWidth: 4, filter: "drop-shadow(0 0 6px var(--accent))" } : {}}>
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
              <circle cx={C} cy={C} r={R_SLICE} fill="url(#wheelSheen)" pointerEvents="none" />
              {built.map((p) => (
                <circle key={"d" + p.appid} cx={p.dot.x} cy={p.dot.y} r="3.2" fill="var(--bg)" stroke="var(--border2)" strokeWidth="1" />
              ))}
            </g>

            <g onClick={boundBy ? undefined : spin} style={{ cursor: spinning || !built.length || boundBy ? "default" : "pointer" }}>
              <circle cx={C} cy={C} r={R_HUB} fill="var(--panel)" stroke="var(--accent-border)" strokeWidth="3" />
              <circle cx={C} cy={C} r={R_HUB - 8} fill="none" stroke="var(--border)" strokeWidth="1.5" />
              <text x={C} y={C + 2} textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="700"
                fill={spinning ? "var(--faint)" : "var(--accent)"}
                style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.14em", userSelect: "none" }}>
                {spinning ? "· · ·" : boundBy ? "BOUND" : "SPIN"}
              </text>
            </g>
          </svg>
        </div>

        {/* ---- drum readout + result ---- */}
        <div style={{ minWidth: 250, maxWidth: 340, flex: "1 1 250px" }}>
          <div style={{ ...S.label, marginBottom: 8 }}>Under the pointer</div>
          <div style={{ perspective: "520px", marginBottom: 16 }}>
            {drumRows.map(({ off, s }) => {
              const abs = Math.abs(off);
              return (
                <div key={off} style={{
                  transform: `rotateX(${off * -28}deg) translateZ(${abs ? -8 : 14}px) scale(${1 - abs * 0.13})`,
                  opacity: 1 - abs * 0.32,
                  transformOrigin: "center",
                  background: off === 0 ? "var(--accent-bg)" : "var(--chip)",
                  border: `1px solid ${off === 0 ? "var(--accent-border)" : "var(--border)"}`,
                  borderRadius: 8, padding: off === 0 ? "10px 14px" : "5px 14px",
                  margin: "3px 0", display: "flex", alignItems: "center", gap: 10,
                  transition: spinning ? "none" : "all .25s ease",
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: s.color, flexShrink: 0 }} />
                  <span style={{
                    ...S.display, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    fontSize: off === 0 ? 20 : 13,
                    color: off === 0 ? "var(--accent)" : "var(--muted)",
                  }}>{s.name}</span>
                  {off === 0 && <span style={{ marginLeft: "auto", flexShrink: 0 }}><Dial value={s.diff} size={30} /></span>}
                </div>
              );
            })}
            {!drumRows.length && <p style={{ color: "var(--muted)", fontSize: 13 }}>No eligible games for this wheel.</p>}
          </div>

          {boundBy && !spinning && (
            <div style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Under contract</div>
              <div style={{ fontSize: 14 }}>
                <b style={{ color: "var(--accent)" }}>{boundBy.gameName}</b> at {boundBy.multiplier}× —
                beat it to spin again, or the contract expires <b>{fmtExpiry(boundBy.expiry)}</b>.
              </div>
            </div>
          )}
          {!result && !spinning && !boundBy && drumRows.length > 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Hit the hub to spin.
              {activeBounty && mode === "public" && <> Active bounty: <b style={{ color: "var(--accent)" }}>{activeBounty.gameName}</b> at 2×.</>}
            </p>
          )}
          {result && !boundBy && (
            <div>
              <div style={{ ...S.label, marginBottom: 6 }}>The wheel has chosen</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={S.btn} disabled={busy} onClick={accept}>
                  {mode === "personal" ? "Sign the contract (1.5×)" : "Post the bounty (2×, everyone)"}
                </button>
                <button style={S.btnGhost} onClick={() => setResult(null)}>Coward's re-spin</button>
              </div>
              {mode === "public" && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>Posting a bounty needs the club key (it changes scoring for everyone).</p>}
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Contract ledger</div>
        {stats.contractView.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No contracts yet. The wheel awaits.</p>}
        <div style={{ display: "grid", gap: 10 }}>
          {[...stats.contractView].reverse().map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, color: "var(--accent)" }}>{c.multiplier}×</span>
              <a style={S.link} onClick={() => nav(`/game/${c.appid}`)}>{c.gameName}</a>
              <span style={{ color: "var(--muted)" }}>
                {c.steamid ? <>· <b style={{ color: stats.byId[c.steamid]?.color }}>{stats.byId[c.steamid]?.name}</b></> : "· ⚡ club bounty"}
              </span>
              {c.status === "fulfilled" ? (
                <span style={{ color: "var(--accent)" }}>✓ fulfilled by {c.fulfilledBy.map((sid) => stats.byId[sid]?.name).join(", ")}</span>
              ) : c.status === "active" ? (
                <span style={{ color: "var(--muted)" }}>active · expires {fmtExpiry(c.expiry)}</span>
              ) : (
                <span style={{ color: "var(--faint)" }}>✗ expired {fmtExpiry(c.expiry)}</span>
              )}
              <button style={{ ...S.btnGhost, marginLeft: "auto" }} disabled={busy}
                onClick={() => mutate("abandonContract", { id: c.id }, () => "Contract torn up")}>✕</button>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--faint)", marginTop: 12 }}>
          Contract points count on the main leaderboard AND the Contracts board. Overlapping multipliers don't stack — the highest wins.
        </p>
      </div>
    </div>
  );
}
