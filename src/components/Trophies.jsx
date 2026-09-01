// ---------------------------------------------------------------
// Trophies.jsx — "#/trophies": the Trophy Room.
//
// Every honor the club hands out, hung in one hall:
//   · Monthly point crowns (from monthHistory — derived live, so a
//     crown corrects itself if late data lands)
//   · Hunt champions (frozen `final` standings of finished hunts)
//   · Bingo champions — DERIVED from persisted cards + real unlock
//     timestamps (deriveBingoWinners): first line, first blackout.
//     Only rounds still in the DB can hang here; deleting a round
//     burns its banner.
//   · Perfection leaders, club records, rarest unlocks, race podium
// Everything is computed from live stats + meta — this page owns no
// data and never writes.
// ---------------------------------------------------------------
import { useMemo } from "react";
import { S, TierChip, fmtDate } from "./ui.jsx";
import { deriveBingoWinners } from "../lib/bingo.js";

const Panel = ({ title, sub, children }) => (
  <div className="panel" style={S.panel}>
    <div style={S.label}>{title}</div>
    {sub && <div style={{ fontSize: 12, color: "var(--faint)", margin: "2px 0 10px" }}>{sub}</div>}
    {children}
  </div>
);

export default function Trophies({ stats, meta, nav }) {
  const name = (sid) => stats.byId[sid]?.name ?? "?";
  const color = (sid) => stats.byId[sid]?.color ?? "var(--muted)";
  const Who = ({ sid }) => (
    <b style={{ color: color(sid), cursor: "pointer" }} onClick={() => nav(`/player/${sid}`)}>{name(sid)}</b>
  );

  const crowns = (stats.monthHistory ?? []).filter((mo) => mo.done && mo.winners.length).slice().reverse();
  const mostCrowns = Object.values(stats.perPlayer ?? {})
    .filter((p) => (p.monthWins ?? 0) > 0).sort((a, b) => b.monthWins - a.monthWins);
  const huntWins = (meta.hunts ?? []).filter((h) => h.status === "finished" && h.final?.length)
    .sort((a, b) => (a.month < b.month ? 1 : -1));
  const bingo = useMemo(() => deriveBingoWinners(stats, meta), [stats, meta]);
  const perfectBoard = [...(stats.board ?? [])].sort((a, b) => b.perfects - a.perfects).filter((p) => p.perfects > 0);
  const hardest = perfectBoard.filter((p) => p.hardestClear)
    .sort((a, b) => (b.hardestClear.diff ?? 0) - (a.hardestClear.diff ?? 0))[0] ?? null;
  const r = stats.records ?? {};
  const raceWinners = (stats.races ?? []).filter((x) => x.winner);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 22 }}>🏆</span>
        <span style={{ ...S.display, fontSize: 26, fontWeight: 700, color: "var(--ink-strong)" }}>The Trophy Room</span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          Every banner the club has earned — crowns, hunts, bingo, perfection, records. All derived, nothing forgotten.
        </span>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        <Panel title="👑 Monthly crowns" sub="one per finished calendar month, scored in the main points economy">
          {crowns.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>The first crown is still on the table.</div>}
          <div style={{ display: "grid", gap: 6 }}>
            {crowns.map((mo) => (
              <div key={mo.month} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ color: "var(--faint)", width: 92 }}>{mo.label}</span>
                <span>{mo.winners.map((sid, i) => <span key={sid}>{i > 0 && " & "}<Who sid={sid} /></span>)}</span>
                <span style={{ color: "var(--muted)", marginLeft: "auto" }}>{mo.standings[0]?.pts} pts</span>
              </div>
            ))}
          </div>
          {mostCrowns.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
              Most crowns: {mostCrowns.map((p, i) => (
                <span key={p.steamid}>{i > 0 && " · "}<Who sid={p.steamid} /> ×{p.monthWins}</span>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="🎯 Hunt champions" sub="finished hunts keep their frozen standings">
          {huntWins.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No hunt has been run to its end yet.</div>}
          <div style={{ display: "grid", gap: 6 }}>
            {huntWins.map((h) => {
              const w = h.final[0];
              return (
                <div key={h.month} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ color: "var(--faint)", width: 92 }}>{h.month}</span>
                  <Who sid={w.sid} />
                  <span style={{ color: "var(--muted)", marginLeft: "auto" }}>{w.pts} pts · {w.captures} firsts</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="🅱️ Bingo champions" sub="first line wins the round — derived from real unlock times, no honor system">
          {bingo.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No rounds on record. Deal one and make history literal.</div>}
          <div style={{ display: "grid", gap: 6 }}>
            {bingo.map(({ round, winner, blackout }) => (
              <div key={round.id} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ color: "var(--faint)", width: 92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{round.label}</span>
                {winner
                  ? <><Who sid={winner.sid} /><span style={{ color: "var(--muted)" }}>line, {fmtDate(winner.at)}</span></>
                  : <span style={{ color: "var(--muted)" }}>in progress — no line yet</span>}
                {blackout && <span style={{ marginLeft: "auto", fontSize: 12 }}>⬛ blackout: <Who sid={blackout.sid} /></span>}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="💯 Perfection" sub="the shelf, ranked">
          <div style={{ display: "grid", gap: 6 }}>
            {perfectBoard.slice(0, 5).map((p, i) => (
              <div key={p.steamid} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "baseline" }}>
                <span style={{ color: "var(--faint)", width: 20 }}>{i + 1}.</span>
                <Who sid={p.steamid} />
                <span style={{ color: "var(--muted)", marginLeft: "auto" }}>{p.perfects} perfects</span>
              </div>
            ))}
            {hardest && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                Hardest clear: <Who sid={hardest.steamid} /> — {hardest.hardestClear.name} (diff {hardest.hardestClear.diff?.toFixed?.(1) ?? hardest.hardestClear.diff})
              </div>
            )}
          </div>
        </Panel>

        <Panel title="📜 Club records" sub="held until someone takes them">
          <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
            {r.fastest && <div>⚡ Fastest 100%: <Who sid={r.fastest.sid} /> — {r.fastest.name} in {r.fastest.days < 1 ? "under a day" : `${Math.round(r.fastest.days)} days`}</div>}
            {r.longest && <div>🐢 Longest haul: <Who sid={r.longest.sid} /> — {r.longest.name}, {Math.round(r.longest.days)} days</div>}
            {r.bestDay && <div>🔥 Best single day: <Who sid={r.bestDay.sid} /> — {r.bestDay.count} unlocks ({r.bestDay.date})</div>}
            {r.firstPerfect && <div>🥇 First perfect ever: <Who sid={r.firstPerfect.sid} /> — {r.firstPerfect.gameName}, {fmtDate(r.firstPerfect.t)}</div>}
            {r.biggestUnlock && <div>💥 Biggest single unlock: <Who sid={r.biggestUnlock.sid} /> — "{r.biggestUnlock.achName}" (+{Math.round(r.biggestUnlock.pts)})</div>}
          </div>
        </Panel>

        <Panel title="💎 Rarest unlocks" sub="the club's five most exclusive moments">
          <div style={{ display: "grid", gap: 6 }}>
            {(stats.hallOfFame ?? []).slice(0, 5).map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center", flexWrap: "wrap" }}>
                <Who sid={e.sid} />
                <span style={{ flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.achName}</span>
                <TierChip pct={e.pct} />
              </div>
            ))}
          </div>
        </Panel>

        {raceWinners.length > 0 && (
          <Panel title="🏁 Race podium" sub="first to 100% on flagged races">
            <div style={{ display: "grid", gap: 6 }}>
              {raceWinners.map((x) => (
                <div key={x.appid} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "baseline" }}>
                  <span style={{ flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                  <Who sid={x.winner} />
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
