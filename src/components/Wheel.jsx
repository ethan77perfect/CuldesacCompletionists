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
import { useMemo, useRef, useState } from "react";
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
  const wheelRef = useRef(null);

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

  function spin() {
    if (!slices.length || spinning) return;
    const winner = pickWeighted(slices);
    // find winner's angular center to rotate the wheel onto the pointer (top)
    let acc = 0, center = 0;
    for (const s of slices) {
      const sweep = (s.weight / totalW) * 360;
      if (s.appid === winner.appid) { center = acc + sweep / 2; break; }
      acc += sweep;
    }
    const target = 360 * 5 + (360 - center); // 5 dramatic full turns
    setSpinning(true); setResult(null);
    setRotation((r) => r + target - (r % 360));
    setTimeout(() => { setSpinning(false); setResult(winner); }, 4200);
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

  // ---- wheel SVG ----
  const R = 150, C = 160;
  let angle = 0;
  const paths = slices.map((s) => {
    const sweep = (s.weight / totalW) * 360;
    const a0 = (angle - 90) * Math.PI / 180, a1 = (angle + sweep - 90) * Math.PI / 180;
    const large = sweep > 180 ? 1 : 0;
    const d = `M ${C} ${C} L ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)} Z`;
    const mid = (angle + sweep / 2 - 90) * Math.PI / 180;
    const label = sweep > 14 ? { x: C + R * 0.62 * Math.cos(mid), y: C + R * 0.62 * Math.sin(mid), rot: angle + sweep / 2 } : null;
    angle += sweep;
    return { ...s, d, label };
  });

  const activeBounty = stats.contractView.filter((c) => c.source === "public" && !c.fulfilledBy.length).slice(-1)[0];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...S.panel, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
          {mode === "personal" ? "Fatter slices = closer to 100%" : "Every game, equal odds — the club rides together"}
        </span>
      </div>

      <div style={{ ...S.panel, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 320, height: 330 }}>
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", zIndex: 2,
            width: 0, height: 0, borderLeft: "12px solid transparent", borderRight: "12px solid transparent",
            borderTop: "18px solid var(--accent)" }} />
          <svg ref={wheelRef} width="320" height="320" viewBox="0 0 320 320" style={{
            marginTop: 10, transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4.2s cubic-bezier(.12,.68,.16,1)" : "none",
          }}>
            {paths.map((p) => (
              <g key={p.appid}>
                <path d={p.d} fill={p.color} fillOpacity="0.75" stroke="var(--bg)" strokeWidth="2" />
                {p.label && (
                  <text x={p.label.x} y={p.label.y} fontSize="10" fontWeight="700" fill="#0E1420"
                    textAnchor="middle" transform={`rotate(${p.label.rot}, ${p.label.x}, ${p.label.y})`}>
                    {p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name}
                  </text>
                )}
              </g>
            ))}
            <circle cx="160" cy="160" r="26" fill="var(--panel)" stroke="var(--border2)" strokeWidth="2" />
          </svg>
        </div>

        <div style={{ minWidth: 240, maxWidth: 340 }}>
          {!result && (
            <>
              <button style={{ ...S.btn, fontSize: 16, padding: "12px 28px" }} onClick={spin}
                disabled={spinning || !slices.length}>
                {spinning ? "Fate is deciding…" : "SPIN"}
              </button>
              {!slices.length && <p style={{ color: "var(--muted)", fontSize: 13 }}>No eligible games for this wheel.</p>}
              {activeBounty && mode === "public" && (
                <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 14 }}>
                  Active bounty: <b style={{ color: "var(--accent)" }}>{activeBounty.gameName}</b> at 2× — spinning again posts an additional bounty.
                </p>
              )}
            </>
          )}
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

      <div style={S.panel}>
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
