// ---------------------------------------------------------------
// Home.jsx — the landing page ("#/home").
//
// Receives two props from App.jsx:
//   stats — the fully-computed club object from lib/stats.js
//           (this component does NO math; it only renders)
//   nav   — function to change page, e.g. nav(`/game/123`)
//
// Sections: club totals strip, activity feed (stats.feed),
// monthly challenge (stats.challenge), races (stats.races),
// and the closest-finishes widget (stats.recs top 5).
// To change what the feed shows, edit stats.js (the data),
// not this file (the display).
// ---------------------------------------------------------------
import { S, Dial, Avatar, TierChip, timeAgo } from "./ui.jsx";

export default function Home({ stats, nav }) {
  const { feed, races, challenge, recs, byId, clubTotals } = stats;
  const closest = recs.slice(0, 5);

  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      <div className="panel" style={{ ...S.panel, gridColumn: "1 / -1", display: "flex", gap: 28, flexWrap: "wrap" }}>
        {[["Perfect games", clubTotals.perfects], ["Club points", clubTotals.points.toLocaleString()], ["Achievements unlocked", clubTotals.unlocks.toLocaleString()]].map(([l, v]) => (
          <div key={l}>
            <div style={S.label}>{l}</div>
            <div style={{ ...S.display, fontSize: 30, fontWeight: 700, color: "var(--accent)" }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 12 }}>Activity</div>
        {feed.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No unlocks yet — go earn something.</p>}
        <div style={{ display: "grid", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
          {feed.map((e, i) => {
            const m = byId[e.sid];
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13 }}>
                <span style={{ color: "var(--faint)", fontSize: 11, minWidth: 56 }}>{timeAgo(e.t)}</span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ color: m?.color }}>{m?.name}</b>{" "}
                  {e.kind === "claim" ? (
                    <>🎯 claimed <i>{e.achName}</i>{" "}
                      <span style={{ color: "var(--muted)" }}>({e.gameName}) +{Math.round(e.pts)} pts</span>
                      {e.firstBlood && <span title="First claim"> 🩸</span>}</>
                  ) : e.kind === "complete" ? (
                    <>💯 <b style={{ color: "var(--accent)" }}>perfected</b>{" "}
                      <a style={S.link} onClick={() => nav(`/game/${e.appid}`)}>{e.gameName}</a>{" "}
                      <span style={{ color: "var(--muted)" }}>+{Math.round(e.pts)} pts</span></>
                  ) : (
                    <>unlocked <i>{e.achName}</i> in{" "}
                      <a style={S.link} onClick={() => nav(`/game/${e.appid}`)}>{e.gameName}</a>{" "}
                      <TierChip pct={e.pct} />{" "}
                      <span style={{ color: "var(--muted)" }}>+{Math.round(e.pts)}</span>
                      {e.firstBlood && <span title="First in the club"> 🩸</span>}
                      {e.pioneer && <span title="Pioneer — unlocked while ≤1% of the world had it"> 🚩</span>}</>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
        {challenge && (
          <div className="panel" style={{ ...S.panel, borderColor: "var(--accent-border)" }}>
            <div style={{ ...S.label, marginBottom: 10 }}>Monthly challenge · {challenge.month}</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
              <Dial value={challenge.game.diff} size={38} />
              <a style={{ ...S.link, fontSize: 16, fontWeight: 600 }} onClick={() => nav(`/game/${challenge.game.appid}`)}>{challenge.game.name}</a>
            </div>
            {challenge.standings.map((s, i) => {
              const m = byId[s.sid];
              return (
                <div key={s.sid} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span><span style={{ color: "var(--faint)" }}>{i + 1}.</span> <b style={{ color: m?.color }}>{m?.name}</b> <span style={{ color: "var(--muted)" }}>{s.pct}%</span></span>
                  <b style={{ color: "var(--accent)" }}>{s.pts} pts</b>
                </div>
              );
            })}
          </div>
        )}

        {races.length > 0 && (
          <div className="panel" style={S.panel}>
            <div style={{ ...S.label, marginBottom: 10 }}>Races</div>
            {races.map((r) => (
              <div key={r.appid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 8 }}>
                <a style={S.link} onClick={() => nav(`/game/${r.appid}`)}>{r.name}</a>
                {r.winner ? (
                  <span>👑 <b style={{ color: byId[r.winner]?.color }}>{byId[r.winner]?.name}</b></span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>in progress…</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="panel" style={S.panel}>
          <div style={{ ...S.label, marginBottom: 10 }}>Closest finishes in the club</div>
          {closest.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>Nothing in progress.</p>}
          {closest.map((r) => {
            const m = byId[r.sid];
            return (
              <div key={r.sid + r.appid} style={{ fontSize: 13, marginBottom: 8 }}>
                <b style={{ color: m?.color }}>{m?.name}</b> — <a style={S.link} onClick={() => nav(`/game/${r.appid}`)}>{r.name}</a>{" "}
                <span style={{ color: "var(--muted)" }}>{r.missingCount} left · +{r.ptsLeft} pts waiting</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
