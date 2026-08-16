// ---------------------------------------------------------------
// GameDetail.jsx — one game's page ("#/game/<appid>").
//
// Props: stats (computed data), appid (from the URL), meta (raw
// DB rows — members/games), mutate (function that POSTs to
// /api/db and reloads), busy (true while a mutation is running),
// nav (page navigation).
//
// The notes box uses a "draft" pattern: notesDraft starts null
// (meaning "no local edits, show the saved value") and becomes a
// string once you type. The Save button only appears when the
// draft differs from what's saved — a common React idiom for
// edit-in-place fields.
// ---------------------------------------------------------------
import { useState } from "react";
import { S, Dial, TierChip, fmtDate } from "./ui.jsx";

export default function GameDetail({ stats, appid, meta, mutate, busy, nav }) {
  const g = stats.games.find((x) => x.appid === Number(appid));
  const [notesDraft, setNotesDraft] = useState(null);
  if (!g) return <p style={{ color: "var(--muted)" }}>Game not found — is it still tracked?</p>;

  const members = meta.members.filter((m) => g.players[m.steamid]);
  const sorted = [...g.ach].sort((a, b) =>
    (a.pct <= 0 ? Infinity : a.pct) - (b.pct <= 0 ? Infinity : b.pct));   // rarest first; ⏳ Unrated last

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <Dial value={g.diff} size={56} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ ...S.display, fontSize: 28, fontWeight: 700, color: "var(--ink-strong)" }}>{g.name}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {g.ach.length} achievements · pool {g.pool} pts · rarest {Math.min(...g.ach.map((a) => a.pct)).toFixed(2)}%
            {g.unrated
              ? <span style={{ color: "var(--accent)" }}> · ⏱ no time data — add median hours in Settings</span>
              : <span> · {g.hours}h median</span>}
            {g.race && <span> · 🏁 race</span>}
          </div>
        </div>
        <button style={S.btnGhost} disabled={busy}
          onClick={() => mutate("toggleRace", { appid: g.appid, race: !g.race }, () => g.race ? "Race ended" : `${g.name} is now a race! First 100% wins.`)}>
          {g.race ? "End race" : "Make it a race"}
        </button>
      </div>

      <div className="panel" style={S.panel}>
        <div style={{ ...S.label, marginBottom: 8 }}>Club notes</div>
        <textarea style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
          placeholder="Tips for the club — missables, order, warnings…"
          value={notesDraft ?? g.notes}
          onChange={(e) => setNotesDraft(e.target.value)} />
        {notesDraft !== null && notesDraft !== g.notes && (
          <button style={{ ...S.btn, marginTop: 8 }} disabled={busy}
            onClick={() => mutate("setNotes", { appid: g.appid, notes: notesDraft }, () => "Notes saved").then(() => setNotesDraft(null))}>
            Save notes
          </button>
        )}
      </div>

      <div className="panel" style={{ ...S.panel, overflowX: "auto" }}>
        <div style={{ ...S.label, marginBottom: 12 }}>Achievements — rarest first</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)" }}>
              <th style={{ padding: "6px 8px" }}>Achievement</th>
              <th style={{ padding: "6px 8px" }}>Rarity</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Pts</th>
              {members.map((m) => (
                <th key={m.steamid} style={{ padding: "6px 8px", color: m.color, textAlign: "center" }}>{m.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const pts = Math.round(g.table.per.get(a.id) ?? 0);
              return (
                <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px" }}>{a.name}</td>
                  <td style={{ padding: "7px 8px" }}><TierChip pct={a.pct} /></td>
                  <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--accent)", fontWeight: 600 }}>{pts}</td>
                  {members.map((m) => {
                    const u = g.players[m.steamid].unlocks.find((x) => x.id === a.id);
                    return (
                      <td key={m.steamid} style={{ padding: "7px 8px", textAlign: "center" }}
                        title={u?.t ? fmtDate(u.t) : "Not unlocked"}>
                        {u ? "✓" : <span style={{ color: "var(--border2)" }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {members.map((m) => {
          const r = g.players[m.steamid];
          const hours = statsHours(stats, m.steamid, g.appid);
          return (
            <div key={m.steamid} className="panel" style={S.panel}>
              <a style={{ ...S.link, fontWeight: 600, fontSize: 15 }} onClick={() => nav(`/player/${m.steamid}`)}>{m.name}</a>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
                {r.complete ? `★ 100% on ${fmtDate(r.lastUnlock)}` : `${r.pct}% · ${r.missing.length} to go`}
                <br />{Math.round(r.basePoints)} pts{hours != null && <> · {hours}h played</>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function statsHours(stats, sid, appid) {
  const min = stats.profilesPlaytime?.[sid]?.[appid];
  return min ? Math.round(min / 6) / 10 : null;
}
