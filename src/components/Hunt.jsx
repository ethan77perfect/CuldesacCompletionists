// ---------------------------------------------------------------
// Hunt.jsx — monthly achievement hunt ("#/hunt").
//
// Tabs: current hunt (live standings + capture board), Hall of Fame
// (past winners), and a creator flow (club key): pick 5 games (spin
// or choose), auto-generate a slate of ~20 achievements per game
// (60% rare "important", 25% mid, 15% wildcard), curate with
// checkboxes, lock it in.
//
// Scoring (computeHunt in stats.js): finish order within the month
// earns base × [1, .8, .6, .4, then .2]. Pre-month owners get flat
// veteran credit (0.6×) and don't occupy podium slots. Hunt points
// are their OWN economy — they never touch the main leaderboard.
// ---------------------------------------------------------------
import { useMemo, useState } from "react";
import { computeHunt, suggestHuntAchievements } from "../lib/stats.js";
import { S, TierChip, fmtDate } from "./ui.jsx";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Hunt({ stats, meta, mutate, busy, nav }) {
  const [tab, setTab] = useState("current");
  const hunts = meta.hunts ?? [];
  const active = hunts.find((h) => h.status === "active");
  const finished = hunts.filter((h) => h.status === "finished");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[["current", "Current hunt"], ["fame", "🏆 Hall of Fame"], ["create", "Create a hunt"]].map(([k, l]) => (
          <button key={k} style={{ ...S.btnGhost, ...(tab === k ? { color: "var(--accent)", borderColor: "var(--accent-border)" } : {}) }}
            onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "current" && (active
        ? <ActiveHunt hunt={active} stats={stats} meta={meta} mutate={mutate} busy={busy} nav={nav} />
        : <div style={{ ...S.panel, textAlign: "center", padding: 36 }}>
            <div style={{ ...S.display, fontSize: 24, fontWeight: 700 }}>No hunt this month</div>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>Someone with the club key should fix that.</p>
            <button style={S.btn} onClick={() => setTab("create")}>Create a hunt</button>
          </div>)}

      {tab === "fame" && <HallOfFame finished={finished} stats={stats} />}
      {tab === "create" && <CreateHunt stats={stats} meta={meta} mutate={mutate} busy={busy} onDone={() => setTab("current")} />}
    </div>
  );
}

function ActiveHunt({ hunt, stats, meta, mutate, busy, nav }) {
  const result = useMemo(
    () => computeHunt(hunt, stats.games, meta.members, stats.perPlayer ? (meta.settings ?? {}) : {}),
    [hunt, stats, meta]
  );
  const name = (sid) => stats.byId[sid]?.name ?? "?";
  const color = (sid) => stats.byId[sid]?.color ?? "var(--muted)";
  const byGame = {};
  for (const a of result.board) (byGame[a.gameName] ??= []).push(a);
  const placeLabel = (p) => p === "vet" ? "🎖 vet" : p === 1 ? "🥇" : p === 2 ? "🥈" : p === 3 ? "🥉" : `#${p}`;

  return (
    <>
      <div style={{ ...S.panel, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={S.label}>Hunt · {hunt.month}</div>
          <div style={{ ...S.display, fontSize: 26, fontWeight: 700, color: "var(--ink-strong)" }}>
            {hunt.achievements.length} achievements · {hunt.appids.length} games
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginLeft: "auto", flexWrap: "wrap" }}>
          {result.standings.map((s, i) => (
            <div key={s.sid} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: color(s.sid) }}>{i + 1}. {name(s.sid)}</div>
              <div style={{ ...S.display, fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{s.pts}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{s.captures} firsts · {s.veteran} vet</div>
            </div>
          ))}
        </div>
        <button style={S.btnGhost} disabled={busy}
          onClick={() => mutate("finishHunt", { month: hunt.month, final: result.standings }, () => `Hunt ${hunt.month} closed — crown the winner!`)}>
          End hunt
        </button>
      </div>

      {Object.entries(byGame).map(([gName, achs]) => (
        <div key={gName} style={S.panel}>
          <div style={{ ...S.label, marginBottom: 10 }}>{gName}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {achs.sort((a, b) => b.base - a.base).map((a) => (
              <div key={a.appid + a.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ ...S.display, fontWeight: 700, color: "var(--accent)", width: 44, textAlign: "right" }}>{a.base}</span>
                <span style={{ flex: "1 1 200px", minWidth: 0 }}>{a.name}</span>
                <TierChip pct={a.pct} />
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {a.results.length === 0 && <span style={{ color: "var(--faint)", fontSize: 12 }}>unclaimed</span>}
                  {a.results.map((r) => (
                    <span key={r.sid} title={fmtDate(r.t)} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                      background: "var(--chip)", border: "1px solid var(--border2)", color: color(r.sid) }}>
                      {placeLabel(r.place)} {name(r.sid)} +{r.pts}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function HallOfFame({ finished, stats }) {
  if (!finished.length) return (
    <div style={{ ...S.panel, textAlign: "center", padding: 36, color: "var(--muted)" }}>
      The hall stands empty. Finish a hunt and hang the first banner.
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
      {finished.map((h) => {
        const standings = h.final ?? [];
        const w = standings[0];
        return (
          <div key={h.month} className="card-lift" style={{ ...S.panel, borderColor: "var(--accent-border)" }}>
            <div style={S.label}>{h.month}</div>
            <div style={{ ...S.display, fontSize: 26, fontWeight: 700, color: "var(--accent)", margin: "6px 0" }}>
              👑 {w ? (stats.byId[w.sid]?.name ?? "?") : "—"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {w ? `${w.pts} pts · ${w.captures} first captures` : "no scores recorded"}
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
              {standings.slice(1, 4).map((s, i) => (
                <div key={s.sid} style={{ fontSize: 12, color: "var(--muted)" }}>
                  {i + 2}. <span style={{ color: stats.byId[s.sid]?.color }}>{stats.byId[s.sid]?.name}</span> — {s.pts}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreateHunt({ stats, meta, mutate, busy, onDone }) {
  const [picked, setPicked] = useState([]);          // appids
  const [slate, setSlate] = useState(null);          // suggested achievements
  const [enabled, setEnabled] = useState({});        // id -> bool
  const [month, setMonth] = useState(thisMonth());

  function spinOne() {
    const pool = stats.games.filter((g) => !picked.includes(g.appid));
    if (!pool.length) return;
    const g = pool[Math.floor(Math.random() * pool.length)];
    setPicked((p) => [...p, g.appid]); setSlate(null);
  }
  function togglePick(appid) {
    setPicked((p) => p.includes(appid) ? p.filter((x) => x !== appid) : p.length < 5 ? [...p, appid] : p);
    setSlate(null);
  }
  function generate() {
    const s = suggestHuntAchievements(stats.games, picked, 20);
    setSlate(s);
    setEnabled(Object.fromEntries(s.map((a) => [a.appid + a.id, true])));
  }
  async function lockIn() {
    const achievements = slate.filter((a) => enabled[a.appid + a.id]);
    await mutate("createHunt", { month, appids: picked, achievements },
      () => `Hunt ${month} is LIVE — ${achievements.length} achievements on the board`);
    onDone();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={S.panel}>
        <div style={{ ...S.label, marginBottom: 10 }}>1 · Pick 5 games ({picked.length}/5)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button style={S.btn} onClick={spinOne} disabled={picked.length >= 5}>🎡 Spin for one</button>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...S.input, width: "auto" }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {stats.games.map((g) => (
            <button key={g.appid} onClick={() => togglePick(g.appid)}
              style={{ ...S.btnGhost, ...(picked.includes(g.appid) ? { color: "var(--accent)", borderColor: "var(--accent-border)", fontWeight: 700 } : {}) }}>
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {picked.length > 0 && (
        <div style={S.panel}>
          <div style={{ ...S.label, marginBottom: 10 }}>2 · The slate</div>
          {!slate && <button style={S.btn} onClick={generate}>Generate slate (~20/game: mostly milestones, a few wildcards)</button>}
          {slate && (
            <>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                Curate before locking in — untick anything broken, miserable, or boring. Regenerate rerolls the wildcards.
              </p>
              <div style={{ display: "grid", gap: 6, maxHeight: 380, overflowY: "auto", paddingRight: 4 }}>
                {slate.map((a) => (
                  <label key={a.appid + a.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!enabled[a.appid + a.id]}
                      onChange={() => setEnabled((e) => ({ ...e, [a.appid + a.id]: !e[a.appid + a.id] }))}
                      style={{ accentColor: "var(--accent)" }} />
                    <span style={{ ...S.display, fontWeight: 700, color: "var(--accent)", width: 40, textAlign: "right" }}>{a.base}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.name} <span style={{ color: "var(--faint)" }}>· {stats.games.find((g) => g.appid === a.appid)?.name}</span>
                    </span>
                    <TierChip pct={a.pct} />
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button style={S.btn} disabled={busy} onClick={lockIn}>Lock it in 🔒</button>
                <button style={S.btnGhost} onClick={generate}>Regenerate</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
