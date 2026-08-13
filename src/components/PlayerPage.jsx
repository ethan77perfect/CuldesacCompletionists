// ---------------------------------------------------------------
// PlayerPage.jsx — one member's profile ("#/player/<steamid>").
//
// Everything shown here was precomputed in lib/stats.js and lives
// on stats.perPlayer[sid]: points, badges, streaks, spans, etc.
// The one bit of logic done locally is the "completion
// personality" label — tweak its thresholds freely; it's flavor.
// ---------------------------------------------------------------
import { S, Dial, Avatar, TierChip, fmtDays, fmtDate } from "./ui.jsx";

export default function PlayerPage({ stats, sid, nav }) {
  const p = stats.perPlayer[sid];
  if (!p) return <p style={{ color: "var(--muted)" }}>Player not found.</p>;

  const perfectGames = stats.games.filter((g) => g.players[sid]?.complete)
    .sort((a, b) => b.diff - a.diff);
  const inProgress = stats.recs.filter((r) => r.sid === sid).slice(0, 5);
  const hours = Math.round(p.playtimeMin / 60);

  // completion personality: where do their points come from?
  const skillPts = perfectGames.filter((g) => g.diff >= 7).reduce((s, g) => s + g.pool, 0);
  const totalPerfPts = perfectGames.reduce((s, g) => s + g.pool, 0) || 1;
  const personality = perfectGames.length === 0 ? "Fresh blood"
    : skillPts / totalPerfPts > 0.5 ? "Skill chaser"
    : p.avgSpanDays > 120 ? "Marathon grinder" : "Steady closer";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <Avatar url={p.avatar} color={p.color} size={72} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ ...S.display, fontSize: 30, fontWeight: 700, color: p.color }}>{p.name}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {personality} · {hours > 0 && `${hours}h across tracked games · `}
            streak {p.streak.current}w (best {p.streak.best}w)
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {p.badges.map((b) => (
              <span key={b} style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accent-bg)",
                border: "1px solid var(--accent-border)", borderRadius: 12, padding: "2px 9px" }}>🏅 {b}</span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 24, textAlign: "right" }}>
          {[["Points", p.points.toLocaleString()], ["Perfects", p.perfects], ["Closer rate", `${Math.round(p.closerRate * 100)}%`]].map(([l, v]) => (
            <div key={l}>
              <div style={S.label}>{l}</div>
              <div style={{ ...S.display, fontSize: 26, fontWeight: 700, color: "var(--accent)" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 12 }}>Perfect shelf ({perfectGames.length})</div>
          {perfectGames.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>The shelf awaits its first trophy.</p>}
          <div style={{ display: "grid", gap: 10, maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
            {perfectGames.map((g) => (
              <div key={g.appid} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Dial value={g.diff} size={34} />
                <a style={{ ...S.link, flex: 1, fontSize: 14 }} onClick={() => nav(`/game/${g.appid}`)}>{g.name}</a>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDate(g.players[sid].lastUnlock)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div className="panel" style={S.panel}>
            <div style={{ ...S.label, marginBottom: 12 }}>Next easiest 100%s</div>
            {inProgress.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>Nothing in progress.</p>}
            {inProgress.map((r) => (
              <div key={r.appid} style={{ fontSize: 13, marginBottom: 8 }}>
                <a style={S.link} onClick={() => nav(`/game/${r.appid}`)}>{r.name}</a>{" "}
                <span style={{ color: "var(--muted)" }}>{r.pct}% · {r.missingCount} left · +{r.ptsLeft} pts</span>
              </div>
            ))}
          </div>

          <div className="panel" style={S.panel}>
            <div style={{ ...S.label, marginBottom: 12 }}>Signature stats</div>
            <div style={{ fontSize: 13, display: "grid", gap: 8 }}>
              <div>Rarest unlock: {p.rarestUnlock ? (
                <><i>{p.rarestUnlock.achName}</i> ({p.rarestUnlock.gameName}) <TierChip pct={p.rarestUnlock.pct} /></>
              ) : "—"}</div>
              <div>Hardest clear: {p.hardestClear ? `${p.hardestClear.name} (${p.hardestClear.diff}/10)` : "—"}</div>
              <div>Pioneer unlocks 🚩: {p.pioneerCount ?? 0} <span style={{ color: "var(--faint)" }}>(earned while ≤1% of the world had them)</span></div>
              <div>Avg time to 100%: {p.avgSpanDays != null ? fmtDays(p.avgSpanDays) : "—"}</div>
              <div>Season points ({stats.season}): <b style={{ color: "var(--accent)" }}>{p.seasonPoints.toLocaleString()}</b></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
