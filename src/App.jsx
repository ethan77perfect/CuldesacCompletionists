import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  DEFAULT_SETTINGS, difficultyFromRarity, scoreGame, buildTimeline,
} from "./lib/scoring.js";

// ---------------------------------------------------------------
// THE 100% CLUB — live site
// Data: /api/db (roster, game list, saved rules from Supabase)
//     + /api/club (raw Steam achievement + rarity data)
// All scoring runs in the browser so the sliders update live.
// ---------------------------------------------------------------

const diffColor = (d) => (d <= 3 ? "#5CB8A6" : d <= 6 ? "#E8B84B" : d <= 8 ? "#E0824B" : "#E05B5B");

function Dial({ value, size = 44 }) {
  const notches = [];
  const cx = size / 2, cy = size / 2, rO = size / 2 - 2, rI = size / 2 - 9;
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * (1.25 - (1.5 * i) / 9);
    notches.push(
      <line key={i}
        x1={cx + rI * Math.cos(a)} y1={cy - rI * Math.sin(a)}
        x2={cx + rO * Math.cos(a)} y2={cy - rO * Math.sin(a)}
        stroke={i < value ? diffColor(value) : "#2A3447"} strokeWidth="3" strokeLinecap="round" />
    );
  }
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }} aria-label={`Difficulty ${value} of 10`}>
      {notches}
      <text x={cx} y={cy + 5} textAnchor="middle" fill={diffColor(value)} fontSize="14"
        fontWeight="700" fontFamily="'Barlow Condensed', sans-serif">{value}</text>
    </svg>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label style={{ display: "block", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: "#E8B84B", fontWeight: 600 }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#E8B84B" }} />
    </label>
  );
}

const S = {
  page: { minHeight: "100vh", background: "#0E1420", color: "#D7DFEC", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 64 },
  wrap: { maxWidth: 1060, margin: "0 auto", padding: "0 20px" },
  panel: { background: "#18202F", border: "1px solid #232D40", borderRadius: 10, padding: 18 },
  label: { fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8FA3BF", fontWeight: 600 },
  display: { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" },
  input: { background: "#0E1420", border: "1px solid #2C3852", borderRadius: 6, color: "#D7DFEC", padding: "9px 12px", fontSize: 14, width: "100%", boxSizing: "border-box" },
  btn: { background: "#E8B84B", color: "#1A1608", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnGhost: { background: "none", color: "#8FA3BF", border: "1px solid #2C3852", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" },
};

export default function App() {
  const [tab, setTab] = useState("board");
  const [meta, setMeta] = useState(null);      // { members, games, settings }
  const [clubData, setClubData] = useState(null); // { games } raw from Steam
  const [cfg, setCfg] = useState(DEFAULT_SETTINGS);
  const [clubKey, setClubKey] = useState(() => localStorage.getItem("clubKey") ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // ----- load roster + game list + saved rules, then Steam data -----
  async function loadAll() {
    setError("");
    try {
      const metaRes = await fetch("/api/db");
      const metaJson = await metaRes.json();
      if (!metaRes.ok) throw new Error(metaJson.error);
      setMeta(metaJson);
      setCfg({ ...DEFAULT_SETTINGS, ...metaJson.settings });

      if (metaJson.members.length && metaJson.games.length) {
        const sids = metaJson.members.map((m) => m.steamid).join(",");
        const aids = metaJson.games.map((g) => g.appid).join(",");
        const clubRes = await fetch(`/api/club?steamids=${sids}&appids=${aids}`);
        const clubJson = await clubRes.json();
        if (!clubRes.ok) throw new Error(clubJson.error);
        setClubData(clubJson);
      } else {
        setClubData({ games: [] });
      }
    } catch (e) {
      setError(e.message || "Something went wrong loading club data");
    }
  }
  useEffect(() => { loadAll(); }, []);

  async function mutate(op, body, successMsg) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, clubKey, ...body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setNotice(successMsg(j));
      await loadAll();
    } catch (e) {
      setError(e.message || "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  // ----- score everything (recomputes live as cfg changes) -----
  const scored = useMemo(() => {
    if (!meta || !clubData) return null;
    const members = meta.members;

    const games = clubData.games.map((g) => {
      const diff = difficultyFromRarity(g.ach.map((a) => a.pct), cfg);
      const players = {};
      for (const m of members) {
        const unlocks = g.players[m.steamid];
        if (unlocks) players[m.steamid] = scoreGame(g.ach, unlocks, cfg);
      }
      return { ...g, diff, results: players };
    });

    const board = members.map((m) => {
      const rows = games.filter((g) => g.results[m.steamid]);
      const perfects = rows.filter((g) => g.results[m.steamid].complete);
      const points = rows.reduce((s, g) => s + g.results[m.steamid].points, 0);
      const hardest = perfects.reduce((b, g) => (g.diff > (b?.diff ?? 0) ? g : b), null);
      return { ...m, points, perfects: perfects.length, inProg: rows.length - perfects.length, hardest };
    }).sort((a, b) => b.points - a.points);

    const timeline = buildTimeline(clubData.games, members, cfg);
    const histogram = Array.from({ length: 10 }, (_, i) => ({
      diff: i + 1, games: games.filter((g) => g.diff === i + 1).length,
    }));

    return { games, board, timeline, histogram };
  }, [meta, clubData, cfg]);

  const memberColor = (sid) => meta?.members.find((m) => m.steamid === sid)?.color ?? "#8FA3BF";

  // ----- forms state -----
  const [newMember, setNewMember] = useState({ idOrVanity: "", color: "#7FB4E6" });
  const [newGame, setNewGame] = useState("");

  const empty = meta && (!meta.members.length || !meta.games.length);

  return (
    <div style={S.page}>
      <style>{`
        .tab { background:none; border:none; color:#8FA3BF; font:600 13px Inter,sans-serif; letter-spacing:.08em; text-transform:uppercase; padding:10px 2px; margin-right:24px; cursor:pointer; border-bottom:2px solid transparent; }
        .tab.on { color:#E8B84B; border-bottom-color:#E8B84B; }
        .tab:focus-visible, button:focus-visible, input:focus-visible { outline:2px solid #E8B84B; outline-offset:2px; }
        @media (prefers-reduced-motion: reduce){ *{ transition:none !important } }`}</style>

      <div style={{ borderBottom: "1px solid #232D40", background: "#111828" }}>
        <div style={{ ...S.wrap, padding: "28px 20px 0" }}>
          <h1 style={{ ...S.display, fontSize: 44, fontWeight: 700, margin: 0, color: "#F2F5FA", letterSpacing: "0.02em" }}>THE 100% CLUB</h1>
          <nav style={{ marginTop: 14, overflowX: "auto", whiteSpace: "nowrap" }}>
            {[["board", "Leaderboard"], ["games", "Library"], ["charts", "Charts"], ["settings", "Club settings"]].map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </nav>
        </div>
      </div>

      <div style={{ ...S.wrap, marginTop: 26 }}>
        {error && (
          <div style={{ ...S.panel, borderColor: "#5A2B2B", background: "#241416", marginBottom: 14, fontSize: 13 }}>
            {error} <button style={{ ...S.btnGhost, marginLeft: 10 }} onClick={loadAll}>Retry</button>
          </div>
        )}
        {notice && (
          <div style={{ ...S.panel, borderColor: "#4A3D18", background: "#1E1A0E", marginBottom: 14, fontSize: 13, color: "#E8B84B" }}>{notice}</div>
        )}

        {!meta && !error && <div style={{ color: "#8FA3BF", padding: 40, textAlign: "center" }}>Loading the club…</div>}

        {empty && tab !== "settings" && (
          <div style={{ ...S.panel, textAlign: "center", padding: 40 }}>
            <div style={{ ...S.display, fontSize: 26, fontWeight: 700, color: "#F2F5FA" }}>The club is empty</div>
            <p style={{ color: "#8FA3BF", fontSize: 14 }}>
              Head to Club settings to add members and pick your first games to track.
            </p>
            <button style={S.btn} onClick={() => setTab("settings")}>Open club settings</button>
          </div>
        )}

        {scored && !empty && tab === "board" && (
          <div style={{ display: "grid", gap: 14 }}>
            {scored.board.map((m, i) => (
              <div key={m.steamid} style={{ ...S.panel, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ ...S.display, fontSize: 34, fontWeight: 700, color: i === 0 ? "#E8B84B" : "#44506A", width: 40 }}>{i + 1}</div>
                <div style={{ flex: "1 1 150px" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: m.color }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#8FA3BF", marginTop: 2 }}>
                    Hardest clear: {m.hardest ? `${m.hardest.name} (${m.hardest.diff}/10)` : "—"}
                  </div>
                </div>
                {[["Perfect games", m.perfects, "#F2F5FA"], ["In progress", m.inProg, "#8FA3BF"], ["Club points", m.points.toLocaleString(), "#E8B84B"]].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: "right", minWidth: 84 }}>
                    <div style={S.label}>{l}</div>
                    <div style={{ ...S.display, fontSize: 26, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            ))}
            <p style={{ fontSize: 12, color: "#8FA3BF", margin: "4px 2px" }}>
              Points accrue per achievement (rare unlocks worth more) — but {Math.round(cfg.bonus * 100)}% of every game's pool only lands on 100%.
            </p>
          </div>
        )}

        {scored && !empty && tab === "games" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {[...scored.games].sort((a, b) => b.diff - a.diff).map((g) => (
              <div key={g.appid} style={S.panel}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Dial value={g.diff} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#F2F5FA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: "#8FA3BF" }}>
                      {g.ach.length} achievements · rarest {Math.min(...g.ach.map((a) => a.pct)).toFixed(1)}% · pool {g.diff * 100} pts
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(g.results).map(([sid, r]) => {
                    const m = meta.members.find((x) => x.steamid === sid);
                    return (
                      <span key={sid} style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20,
                        background: r.complete ? "#2A2410" : "#1E2637",
                        color: r.complete ? "#E8B84B" : m?.color,
                        border: `1px solid ${r.complete ? "#4A3D18" : "#2C3852"}`,
                      }}>
                        {m?.name} {r.complete ? `★ ${r.points}` : `${r.pct}% · ${r.points}`} pts
                      </span>
                    );
                  })}
                  {Object.keys(g.results).length === 0 && (
                    <span style={{ fontSize: 12, color: "#44506A" }}>No one has started this yet</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {scored && !empty && tab === "charts" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Club points over time</div>
              {scored.timeline.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={scored.timeline}>
                    <CartesianGrid stroke="#232D40" vertical={false} />
                    <XAxis dataKey="month" stroke="#8FA3BF" fontSize={11} />
                    <YAxis stroke="#8FA3BF" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#111828", border: "1px solid #232D40", borderRadius: 8 }} />
                    <Legend />
                    {meta.members.map((m) => (
                      <Area key={m.steamid} type="monotone" dataKey={m.name}
                        stroke={m.color} fill={m.color} fillOpacity={0.12} strokeWidth={2} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: "#8FA3BF", fontSize: 13 }}>Unlock some achievements and the race chart appears here.</p>
              )}
            </div>
            <div style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Library by difficulty</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scored.histogram}>
                  <CartesianGrid stroke="#232D40" vertical={false} />
                  <XAxis dataKey="diff" stroke="#8FA3BF" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="#8FA3BF" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#111828", border: "1px solid #232D40", borderRadius: 8 }} />
                  <Bar dataKey="games" radius={[4, 4, 0, 0]}>
                    {scored.histogram.map((h) => (
                      <Cell key={h.diff} fill={diffColor(h.diff)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {meta && tab === "settings" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            <div style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Club key</div>
              <p style={{ fontSize: 12, color: "#8FA3BF", marginTop: 0 }}>
                Needed to add or remove anything. It's the CLUB_KEY you set when deploying — share it with your friends.
              </p>
              <input style={S.input} type="password" placeholder="Enter club key" value={clubKey}
                onChange={(e) => { setClubKey(e.target.value); localStorage.setItem("clubKey", e.target.value); }} />
            </div>

            <div style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Members</div>
              {meta.members.map((m) => (
                <div key={m.steamid} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 6, background: m.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                  <button style={S.btnGhost} disabled={busy}
                    onClick={() => mutate("removeMember", { steamid: m.steamid }, () => `${m.name} removed`)}>Remove</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Steam profile URL, vanity name, or ID"
                  value={newMember.idOrVanity}
                  onChange={(e) => setNewMember({ ...newMember, idOrVanity: e.target.value })} />
                <input type="color" value={newMember.color} aria-label="Member color"
                  onChange={(e) => setNewMember({ ...newMember, color: e.target.value })}
                  style={{ width: 42, height: 40, border: "none", background: "none", cursor: "pointer" }} />
              </div>
              <button style={{ ...S.btn, marginTop: 10 }} disabled={busy || !newMember.idOrVanity}
                onClick={() => mutate("addMember", newMember, (j) => `${j.name} joined the club`).then(() => setNewMember({ idOrVanity: "", color: "#7FB4E6" }))}>
                Add member
              </button>
            </div>

            <div style={S.panel}>
              <div style={{ ...S.label, marginBottom: 12 }}>Tracked games</div>
              {meta.games.map((g) => (
                <div key={g.appid} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ flex: 1, fontSize: 14 }}>{g.name ?? g.appid}</span>
                  <button style={S.btnGhost} disabled={busy}
                    onClick={() => mutate("removeGame", { appid: g.appid }, () => `${g.name} removed`)}>Remove</button>
                </div>
              ))}
              <input style={{ ...S.input, marginTop: 6 }} placeholder="Steam store URL or appid"
                value={newGame} onChange={(e) => setNewGame(e.target.value)} />
              <button style={{ ...S.btn, marginTop: 10 }} disabled={busy || !newGame}
                onClick={() => mutate("addGame", { appidOrUrl: newGame }, (j) => `${j.name} added (${j.achCount} achievements)`).then(() => setNewGame(""))}>
                Add game
              </button>
            </div>

            <div style={S.panel}>
              <div style={{ ...S.label, marginBottom: 16 }}>Scoring rules</div>
              <Slider label="100% completion bonus" value={cfg.bonus} min={0} max={0.8} step={0.05}
                onChange={(v) => setCfg({ ...cfg, bonus: v })} fmt={(v) => `${Math.round(v * 100)}% of pool`} />
              <Slider label="Rarity steepness" value={cfg.steepness} min={2} max={4} step={0.1}
                onChange={(v) => setCfg({ ...cfg, steepness: v })} fmt={(v) => v.toFixed(1)} />
              <Slider label="Rarest achievement weight" value={cfg.rarestWeight} min={0.3} max={1} step={0.05}
                onChange={(v) => setCfg({ ...cfg, rarestWeight: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <p style={{ fontSize: 12, color: "#8FA3BF" }}>
                Sliders preview live for you only. Saving makes them the official club rules everyone sees.
              </p>
              <button style={S.btn} disabled={busy}
                onClick={() => mutate("saveSettings", { data: cfg }, () => "Club rules saved")}>
                Save as club rules
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
