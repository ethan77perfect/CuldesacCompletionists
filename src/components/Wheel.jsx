// ---------------------------------------------------------------
// Wheel.jsx — the wheel of fate ("#/wheel").
//
// Two modes:
//   personal — slices are YOUR unfinished games, weighted toward the
//              ones you're closest to finishing; accepting binds a
//              1.5× contract on that game for you.
//   public   — every tracked game, equal slices; accepting (club key
//              required, it affects everyone) posts a 2× bounty for
//              the whole club.
// The spin animation is CSS rotation with easing; the winning slice
// is chosen by weight FIRST, then the wheel is rotated to land on it
// (the honest way to do a weighted wheel).
// ---------------------------------------------------------------
import { useMemo, useState } from "react";
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
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);   // slice landed on, pending accept
  const [spinning, setSpinning] = useState(false);

  // ---- build slices ----
  const slices = useMemo(() => {
    if (mode === "public") {
      return stats.games.map((g, i) => ({
        appid: g.appid, name: g.name, diff: g.diff, weight: 1,
        color: SLICE_COLORS[i % SLICE_COLORS.length],
      }));
    }
    // personal: unfinished games with progress, weighted by closeness
    // (1/effort from the recommender = closer → fatter slice); games
    // you haven't started get a sliver so the wheel can surprise you.
    const mine = stats.games
      .filter((g) => !g.players[spinner]?.complete)
      .map((g, i) => {
        const rec = stats.recs.find((r) => r.sid === spinner && r.appid === g.appid);
        return {
          appid: g.appid, name: g.name, diff: g.diff,
          weight: rec ? 100 / rec.effort : 0.5,
          color: SLICE_COLORS[i % SLICE_COLORS.length],
        };
      });
    return mine;
  }, [mode, spinner, stats]);

  const totalW = slices.reduce((s, x) => s + x.weight, 0);

  // ---- geometry (viewBox coordinates; rendered size is responsive) ----
  const VB = 400, C = VB / 2;               // viewBox + center
  const R_RIM = 188, R_SLICE = 176, R_HUB = 54;

  function spin() {
    if (!slices.length || spinning) return;
    const winner = pickWeighted(slices);
    // land at a RANDOM point inside the winning slice (not dead center)
    let acc = 0, landing = 0;
    for (const s of slices) {
      const sweep = (s.weight / totalW) * 360;
      if (s.appid === winner.appid) { landing = acc + sweep * (0.25 + Math.random() * 0.5); break; }
      acc += sweep;
    }
    const turns = 5 + Math.floor(Math.random() * 2);          // 5–6 full turns
    setSpinning(true); setResult(null);
    setRotation((r) => r - (r % 360) + turns * 360 + (360 - landing));
    setTimeout(() => { setSpinning(false); setResult(winner); }, 4400);
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

  // ---- build slice paths + radial labels ----
  let angle = 0;
  const paths = slices.map((s) => {
    const sweep = (s.weight / totalW) * 360;
    const a0 = (angle - 90) * Math.PI / 180, a1 = (angle + sweep - 90) * Math.PI / 180;
    const large = sweep > 180 ? 1 : 0;
    const d = `M ${C} ${C} L ${C + R_SLICE * Math.cos(a0)} ${C + R_SLICE * Math.sin(a0)} A ${R_SLICE} ${R_SLICE} 0 ${large} 1 ${C + R_SLICE * Math.cos(a1)} ${C + R_SLICE * Math.sin(a1)} Z`;

    // radial label: runs from just inside the rim toward the hub, along the
    // slice's mid-angle. Flipped on the left half so it never reads upside
    // down. Truncated to the radial space available; hidden on slivers
    // (hover the slice for a tooltip instead).
    let label = null;
    const mid = angle + sweep / 2;
    if (sweep >= 9) {
      const fs = sweep > 26 ? 13 : sweep > 15 ? 11 : 9.5;
      const maxChars = Math.floor((R_SLICE - R_HUB - 18) / (fs * 0.56));
      const text = s.name.length > maxChars ? s.name.slice(0, maxChars - 1) + "…" : s.name;
      const flip = mid > 90 && mid < 270;
      const r = R_SLICE - 10;
      const rad = (mid - 90) * Math.PI / 180;
      label = {
        x: C + r * Math.cos(rad), y: C + r * Math.sin(rad),
        rot: flip ? mid + 180 : mid, anchor: flip ? "start" : "end", fs, text,
      };
    }
    const boundary = (angle - 90) * Math.PI / 180;   // dot at each slice start
    const dot = { x: C + R_RIM * Math.cos(boundary), y: C + R_RIM * Math.sin(boundary) };
    angle += sweep;
    return { ...s, d, label, dot };
  });

  const activeBounty = stats.contractView.filter((c) => c.source === "public" && !c.fulfilledBy.length).slice(-1)[0];

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
          {mode === "personal" ? "Fatter slices = closer to 100% · hover a sliver to identify it" : `${slices.length} games, equal odds — the club rides together`}
        </span>
      </div>

      <div className="panel" style={{ ...S.panel, display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center", justifyContent: "center", padding: 26 }}>
        {/* responsive square: scales with viewport and zoom, capped at 440px */}
        <div style={{ position: "relative", width: "min(88vw, 440px)", aspectRatio: "1 / 1", flexShrink: 0 }}>
          {/* pointer */}
          <div style={{ position: "absolute", top: "-2px", left: "50%", transform: "translateX(-50%)", zIndex: 2,
            width: 0, height: 0, borderLeft: "13px solid transparent", borderRight: "13px solid transparent",
            borderTop: "22px solid var(--accent)", filter: "drop-shadow(0 0 8px var(--accent)) drop-shadow(0 2px 3px rgba(0,0,0,.5))" }} />
          <svg width="100%" height="100%" viewBox={`0 0 ${VB} ${VB}`} style={{ display: "block" }}>
            <defs>
              <radialGradient id="wheelSheen" cx="38%" cy="34%" r="75%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.16" />
                <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.03" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
              </radialGradient>
            </defs>

            {/* outer rim (static) */}
            <circle cx={C} cy={C} r={R_RIM} fill="none" stroke="var(--border2)" strokeWidth="9" />
            <circle cx={C} cy={C} r={R_RIM + 6} fill="none" stroke="var(--border)" strokeWidth="2" />

            {/* rotating group */}
            <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "50% 50%", transformBox: "view-box",
              transition: spinning ? "transform 4.4s cubic-bezier(.1,.65,.14,1)" : "none" }}>
              {paths.map((p) => (
                <g key={p.appid}>
                  <path d={p.d} fill={p.color} fillOpacity="0.82" stroke="var(--bg)" strokeWidth="2.5"
                    style={result?.appid === p.appid && !spinning ? { stroke: "var(--accent)", strokeWidth: 4, filter: "drop-shadow(0 0 6px var(--accent))" } : {}}>
                    <title>{p.name}</title>
                  </path>
                  {p.label && (
                    <text x={p.label.x} y={p.label.y} fontSize={p.label.fs} fontWeight="700"
                      fill="#0E1420" fillOpacity="0.9" textAnchor={p.label.anchor} dominantBaseline="middle"
                      transform={`rotate(${p.label.rot}, ${p.label.x}, ${p.label.y})`}
                      style={{ pointerEvents: "none", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
                      {p.label.text}
                    </text>
                  )}
                </g>
              ))}
              <circle cx={C} cy={C} r={R_SLICE} fill="url(#wheelSheen)" pointerEvents="none" />
              {paths.map((p) => (
                <circle key={"d" + p.appid} cx={p.dot.x} cy={p.dot.y} r="3.2" fill="var(--bg)" stroke="var(--border2)" strokeWidth="1" />
              ))}
            </g>

            {/* hub = the spin button (static, always upright) */}
            <g onClick={spin} style={{ cursor: spinning || !slices.length ? "default" : "pointer" }}>
              <circle cx={C} cy={C} r={R_HUB} fill="var(--panel)" stroke="var(--accent-border)" strokeWidth="3" />
              <circle cx={C} cy={C} r={R_HUB - 8} fill="none" stroke="var(--border)" strokeWidth="1.5" />
              <text x={C} y={C + 2} textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="700"
                fill={spinning ? "var(--faint)" : "var(--accent)"}
                style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.14em", userSelect: "none" }}>
                {spinning ? "· · ·" : "SPIN"}
              </text>
            </g>
          </svg>
        </div>

        <div style={{ minWidth: 240, maxWidth: 340, flex: "1 1 240px" }}>
          {!result && !spinning && (
            <>
              <div style={{ ...S.label, marginBottom: 8 }}>{mode === "personal" ? "Your fate awaits" : "The club's fate awaits"}</div>
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
                Hit the hub to spin.{!slices.length && " (No eligible games for this wheel.)"}
              </p>
              {activeBounty && mode === "public" && (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>
                  Active bounty: <b style={{ color: "var(--accent)" }}>{activeBounty.gameName}</b> at 2× — spinning again posts an additional bounty.
                </p>
              )}
            </>
          )}
          {spinning && <div style={{ ...S.display, fontSize: 22, fontWeight: 700, color: "var(--muted)" }}>Fate is deciding…</div>}
          {result && (
            <div>
              <div style={{ ...S.label, marginBottom: 6 }}>The wheel has chosen</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <Dial value={result.diff} size={44} />
                <div style={{ ...S.display, fontSize: 24, fontWeight: 700, color: "var(--ink-strong)" }}>{result.name}</div>
              </div>
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
              {c.fulfilledBy.length > 0 ? (
                <span style={{ color: "var(--accent)" }}>✓ fulfilled by {c.fulfilledBy.map((sid) => stats.byId[sid]?.name).join(", ")}</span>
              ) : (
                <span style={{ color: "var(--faint)" }}>open</span>
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
