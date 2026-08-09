// ---------------------------------------------------------------
// Compare.jsx — head-to-head page ("#/compare").
//
// Local state: a and b (the two selected steamids) and gapGame
// (which shared game's gap analysis is expanded). "Leads" per
// game = higher completion %, tiebroken by earlier finish date
// when both are at 100%. The W/L tally counts per-game leads.
// The gap analysis lists achievements only one player has, by
// filtering one player's unlocks against the other's.
// ---------------------------------------------------------------
import { useState } from "react";
import { S, Dial, Avatar, PctBar, TierChip } from "./ui.jsx";

export default function Compare({ stats, meta, nav }) {
  const members = meta.members;
  const [a, setA] = useState(members[0]?.steamid ?? "");
  const [b, setB] = useState(members[1]?.steamid ?? "");
  const [gapGame, setGapGame] = useState(null);

  if (members.length < 2) return <p style={{ color: "#8FA3BF" }}>Need at least two members to compare.</p>;
  const A = stats.perPlayer[a], B = stats.perPlayer[b];

  const shared = stats.games.filter((g) => g.players[a] && g.players[b]);
  let winsA = 0, winsB = 0;
  const rows = shared.map((g) => {
    const ra = g.players[a], rb = g.players[b];
    let lead = "tie";
    if (ra.pct !== rb.pct) lead = ra.pct > rb.pct ? "a" : "b";
    else if (ra.complete && rb.complete && ra.lastUnlock !== rb.lastUnlock)
      lead = ra.lastUnlock < rb.lastUnlock ? "a" : "b"; // both perfect: earlier finish wins
    if (lead === "a") winsA++; if (lead === "b") winsB++;
    return { g, ra, rb, lead };
  }).sort((x, y) => y.g.diff - x.g.diff);

  const gap = gapGame ? rows.find((r) => r.g.appid === gapGame) : null;
  const sel = (v, set) => (
    <select value={v} onChange={(e) => { set(e.target.value); setGapGame(null); }}
      style={{ ...S.input, width: "auto", fontWeight: 600 }}>
      {members.map((m) => <option key={m.steamid} value={m.steamid}>{m.name}</option>)}
    </select>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...S.panel, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <Avatar url={A?.avatar} color={A?.color} size={52} />
        {sel(a, setA)}
        <div style={{ ...S.display, fontSize: 30, fontWeight: 700, color: "#44506A" }}>
          {winsA} <span style={{ fontSize: 18 }}>vs</span> {winsB}
        </div>
        {sel(b, setB)}
        <Avatar url={B?.avatar} color={B?.color} size={52} />
      </div>

      {a === b ? <p style={{ color: "#8FA3BF", textAlign: "center" }}>Pick two different people — self-reflection is a different website.</p> : (
        <>
          <div style={{ ...S.panel, display: "flex", gap: 26, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              ["Points", A.points.toLocaleString(), B.points.toLocaleString()],
              ["Perfects", A.perfects, B.perfects],
              ["Season pts", A.seasonPoints.toLocaleString(), B.seasonPoints.toLocaleString()],
              ["Best streak", `${A.streak.best}w`, `${B.streak.best}w`],
            ].map(([l, va, vb]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={S.label}>{l}</div>
                <div style={{ ...S.display, fontSize: 22, fontWeight: 700 }}>
                  <span style={{ color: A.color }}>{va}</span>
                  <span style={{ color: "#44506A" }}> · </span>
                  <span style={{ color: B.color }}>{vb}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={S.panel}>
            <div style={{ ...S.label, marginBottom: 12 }}>Shared games ({shared.length}) — click one for the gap analysis</div>
            <div style={{ display: "grid", gap: 12, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
              {rows.map(({ g, ra, rb, lead }) => (
                <div key={g.appid} onClick={() => setGapGame(g.appid === gapGame ? null : g.appid)}
                  style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer",
                    background: gapGame === g.appid ? "#1E2637" : "transparent", borderRadius: 8, padding: 6 }}>
                  <Dial value={g.diff} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>
                      {g.name}{" "}
                      {lead !== "tie" && <span style={{ color: (lead === "a" ? A : B).color, fontSize: 12 }}>· {(lead === "a" ? A : B).name} leads</span>}
                    </div>
                    <div style={{ display: "grid", gap: 4 }}>
                      <PctBar pct={ra.pct} color={A.color} />
                      <PctBar pct={rb.pct} color={B.color} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#8FA3BF", textAlign: "right", minWidth: 70 }}>
                    {ra.pct}% · {rb.pct}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {gap && (
            <div style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Gap analysis — {gap.g.name}</div>
              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                {[[A, gap.ra, gap.rb], [B, gap.rb, gap.ra]].map(([P, mine, theirs]) => {
                  const only = mine.unlocks.filter((u) => !theirs.unlocks.some((x) => x.id === u.id));
                  return (
                    <div key={P.steamid}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: P.color, marginBottom: 8 }}>
                        Only {P.name} has ({only.length})
                      </div>
                      {only.length === 0 && <span style={{ fontSize: 13, color: "#8FA3BF" }}>Nothing — fix that.</span>}
                      <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                        {only.map((u) => {
                          const ach = gap.g.achById[u.id];
                          return (
                            <div key={u.id} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ flex: 1 }}>{ach?.name ?? u.id}</span>
                              <TierChip pct={ach?.pct ?? 0} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
