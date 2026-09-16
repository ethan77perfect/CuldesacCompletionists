// ---------------------------------------------------------------
// Gauntlet.jsx — "#/gauntlet": the Roguelike Gauntlet.
//
// The wheel decides your fate twice: once for WHICH roguelike you
// own gets run next, once for the route/character/deck you must win
// with. Beat it → streak +1, that game leaves your wheel, spin again.
// Clear everything you own → the lap rolls (🔁), pool refills, streak
// keeps climbing. Lose → streak dies, everything returns.
//
// Honor system, glory-only: run outcomes aren't Steam-verifiable, so
// the buttons are the truth and the main points economy is untouched.
// State: gauntlet_state holds each member's ONE pending assignment;
// gauntlet_events is the immutable win/loss log everything derives
// from (lib/gauntlet.js). The Hall of Streaks ranks every streak
// ever — one member may hold half the board; that's the point.
// ---------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { S, fmtDate } from "./ui.jsx";
import FateWheel from "./FateWheel.jsx";
import { gauntletNow, topStreaks, eventsBySid } from "../lib/gauntlet.js";

const capsule = (appid) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`;

export default function Gauntlet({ stats, meta, mutate, busy }) {
  const [tab, setTab] = useState("play");
  const [member, setMember] = useState(meta.members[0]?.steamid ?? "");
  const [phase, setPhase] = useState({ step: "game" });   // {step:"game"} → {step:"route", appid} → {step:"lock", appid, route}
  const [confirmFall, setConfirmFall] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  useEffect(() => { setPhase({ step: "game" }); setConfirmFall(false); setConfirmErase(false); }, [member, meta.gauntletState]);

  const name = (sid) => stats.byId[sid]?.name ?? "?";
  const color = (sid) => stats.byId[sid]?.color ?? "var(--muted)";
  const gameName = useMemo(() => Object.fromEntries(stats.games.map((g) => [g.appid, g.name])), [stats.games]);
  const coverOf = useMemo(() => Object.fromEntries((meta.covers ?? []).map((c) => [Number(c.appid), c.url])), [meta.covers]);
  const routesOf = useMemo(() => Object.fromEntries((meta.roguelikes ?? []).map((r) => [Number(r.appid), r.routes ?? []])), [meta.roguelikes]);
  const designated = useMemo(() => (meta.roguelikes ?? []).map((r) => Number(r.appid)), [meta.roguelikes]);

  const byMember = useMemo(() => eventsBySid(meta.gauntletEvents ?? []), [meta.gauntletEvents]);
  const ownedRoguesOf = (sid) => {
    const pt = stats.profilesPlaytime?.[sid] ?? {};
    const known = Object.keys(pt).length > 0;
    return new Set(designated.filter((a) => !known || pt[a] !== undefined));
  };
  const ownedSet = ownedRoguesOf(member);
  const now = gauntletNow(byMember[member] ?? [], ownedSet);
  const pending = (meta.gauntletState ?? []).find((s) => s.steamid === member) ?? null;
  const ownershipKnown = Object.keys(stats.profilesPlaytime?.[member] ?? {}).length > 0;

  const lockIn = async () => {
    await mutate("gauntletSpin", { steamid: member, appid: phase.appid, route: phase.route },
      () => `${name(member)} must now conquer ${gameName[phase.appid]}${phase.route !== "Win a run" ? ` — ${phase.route}` : ""}. Fate is sealed.`);
  };
  const resolve = async (outcome) => {
    await mutate("gauntletResolve", { steamid: member, outcome },
      () => outcome === "win"
        ? `🏆 Streak: ${now.streak + 1}. The wheel awaits your next spin.`
        : `💀 The gauntlet claims another. Streak resets — all games return to the wheel.`);
  };

  const hall = useMemo(() => topStreaks(byMember, ownedRoguesOf, 20), [byMember, meta.roguelikes, stats.profilesPlaytime]);

  const Thumb = ({ appid, caption, faded }) => (
    <div style={{ display: "grid", justifyItems: "center", gap: 2, width: 92, opacity: faded ? 0.45 : 1 }}>
      <img src={coverOf[appid] ?? capsule(appid)} alt={gameName[appid] ?? `App ${appid}`}
        title={gameName[appid] ?? `App ${appid}`}
        style={{ width: 88, height: 34, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)" }}
        onError={(e) => { e.currentTarget.style.display = "none"; }} />
      <span style={{ fontSize: 9, color: "var(--faint)", textAlign: "center", lineHeight: 1.2 }}>{caption}</span>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 22 }}>⚔️</span>
        <span style={{ ...S.display, fontSize: 26, fontWeight: 700, color: "var(--ink-strong)" }}>The Roguelike Gauntlet</span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          The wheel picks your roguelike, then your route. Win and it leaves the wheel; clear them all and the lap rolls;
          fall and everything comes back. Honor system, glory only — the streak is the prize.
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {[["play", "The Gauntlet"], ["hall", "Hall of Streaks"], ["designate", "Designate"]].map(([k, label]) => (
            <button key={k} style={tab === k ? S.btn : S.btnGhost} onClick={() => setTab(k)}>{label}</button>
          ))}
        </span>
      </div>

      {tab === "play" && (
        <div className="panel" style={{ ...S.panel, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select style={S.input} value={member} onChange={(e) => setMember(e.target.value)}>
              {meta.members.map((m) => <option key={m.steamid} value={m.steamid}>{m.name}</option>)}
            </select>
            <span style={{ fontSize: 13 }}>
              Streak <b style={{ ...S.display, fontSize: 18, color: "var(--accent)" }}>{now.streak}</b>
              {now.lap > 1 && <span title={`Lap ${now.lap} — full library cleared ${now.lap - 1}×`}> 🔁×{now.lap - 1}</span>}
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {now.pool.length} of {ownedSet.size} roguelikes left on the wheel this lap
            </span>
            {!ownershipKnown && <span style={{ fontSize: 11, color: "var(--faint)" }}>⚠ ownership unknown (private profile?) — showing all designated games</span>}
          </div>

          {(byMember[member]?.length ?? 0) > 0 && (() => {   // record-keeping: undo a misclick, or wipe test history
            const evs = byMember[member];
            const last = evs[evs.length - 1];
            return (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: "var(--faint)" }}>
                {evs.length} recorded run{evs.length > 1 ? "s" : ""}
                <button style={{ ...S.btnGhost, fontSize: 11, padding: "2px 8px" }} disabled={busy}
                  title="Removes the last recorded outcome; if it was a misclicked resolve, the pending run comes back"
                  onClick={() => mutate("gauntletUndo", { steamid: member },
                    (j) => `Undid the last ${j.undone === "win" ? "🏆 win" : "💀 fall"} (${gameName[j.appid] ?? `App ${j.appid}`})${j.restored ? " — back mid-run" : ""}.`)}>
                  ⎌ Undo last ({last.kind === "win" ? "🏆" : "💀"} {gameName[last.appid] ?? `App ${last.appid}`})
                </button>
                {confirmErase ? (
                  <>
                    <button style={{ ...S.btnGhost, fontSize: 11, padding: "2px 8px", color: "var(--err-border)", borderColor: "var(--err-border)" }}
                      disabled={busy} onClick={() => mutate("gauntletErase", { steamid: member }, () => "History erased — a blank slate.")}>
                      Really erase {name(member)}'s entire gauntlet history?
                    </button>
                    <button style={{ ...S.btnGhost, fontSize: 11, padding: "2px 8px" }} onClick={() => setConfirmErase(false)}>Keep it</button>
                  </>
                ) : (
                  <button style={{ ...S.btnGhost, fontSize: 11, padding: "2px 8px" }} disabled={busy} onClick={() => setConfirmErase(true)}>Erase history…</button>
                )}
              </div>
            );
          })()}

          {designated.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No roguelikes designated yet — the Designate tab awaits its curator.</div>
          ) : pending ? (
            <div style={{ display: "grid", gap: 10, justifyItems: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 12, color: "var(--faint)" }}>CURRENTLY RUNNING · sealed {fmtDate(Date.parse(pending.spun_at) / 1000)}</div>
              <Thumb appid={Number(pending.appid)} caption="" />
              <div style={{ ...S.display, fontSize: 22, fontWeight: 700 }}>{gameName[pending.appid] ?? `App ${pending.appid}`}</div>
              <div style={{ fontSize: 14, color: "var(--accent)", fontWeight: 700 }}>{pending.route || "Win a run"}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.btn} disabled={busy} onClick={() => resolve("win")}>🏆 Beat it</button>
                {confirmFall ? (
                  <>
                    <button style={{ ...S.btnGhost, color: "var(--err-border)", borderColor: "var(--err-border)" }}
                      disabled={busy} onClick={() => resolve("loss")}>Really fall? Streak of {now.streak} dies.</button>
                    <button style={S.btnGhost} onClick={() => setConfirmFall(false)}>I fight on</button>
                  </>
                ) : (
                  <button style={S.btnGhost} disabled={busy} onClick={() => setConfirmFall(true)}>💀 I fell</button>
                )}
              </div>
            </div>
          ) : now.pool.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>This member owns none of the designated roguelikes — the gauntlet cannot claim what it cannot reach.</div>
          ) : phase.step === "game" ? (
            <FateWheel drumTitle="Under the pointer — the game"
              slices={now.pool.map((a) => ({ id: a, name: gameName[a] ?? `App ${a}` }))}
              disabled={busy} onLanded={(i) => setPhase({ step: "route", appid: now.pool[i] })} />
          ) : (
            <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                The wheel has chosen: <b style={{ color: "var(--ink-strong)" }}>{gameName[phase.appid]}</b>
                {phase.step === "route" && " — now, the route."}
              </div>
              {phase.step === "route" ? (
                <FateWheel drumTitle="Under the pointer — the route"
                  slices={(routesOf[phase.appid]?.length ? routesOf[phase.appid] : ["Win a run"]).map((r, i) => ({ id: i, name: r }))}
                  disabled={busy}
                  onLanded={(i) => setPhase({ step: "lock", appid: phase.appid, route: (routesOf[phase.appid]?.length ? routesOf[phase.appid] : ["Win a run"])[i] })} />
              ) : (
                <>
                  <div style={{ fontSize: 16 }}>Your fate: <b style={{ color: "var(--accent)" }}>{phase.route}</b></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={S.btn} disabled={busy} onClick={lockIn}>Seal it 🔒</button>
                    <button style={S.btnGhost} disabled={busy} onClick={() => setPhase({ step: "game" })}>Respin everything</button>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--faint)" }}>Sealing writes the assignment — the Beat it / I fell buttons take over from there.</div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "hall" && (
        <div className="panel" style={{ ...S.panel, display: "grid", gap: 14 }}>
          <div style={S.label}>Top {Math.min(20, hall.length) || 20} longest streaks — every run of glory, living or dead</div>
          {hall.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No streaks yet. The first spin writes the first legend.</div>}
          {hall.map((s, i) => (
            <div key={`${s.sid}-${s.start}`} style={{ display: "grid", gap: 6, paddingBottom: 10, borderBottom: i < hall.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ color: "var(--faint)", width: 24 }}>{i + 1}.</span>
                <b style={{ color: color(s.sid) }}>{name(s.sid)}</b>
                <span style={{ ...S.display, fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{s.len}</span>
                {s.laps > 0 && <span title={`cleared their whole library ${s.laps}×`}>🔁×{s.laps}</span>}
                {s.active
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: "#6BC46D", border: "1px solid #6BC46D", borderRadius: 10, padding: "1px 8px" }}>ACTIVE</span>
                  : <span style={{ fontSize: 10, color: "var(--faint)", border: "1px solid var(--border)", borderRadius: 10, padding: "1px 8px" }}>ENDED {fmtDate(Date.parse(s.end) / 1000)}</span>}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                {s.wins.map((w, k) => (
                  <span key={k} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {k > 0 && <span style={{ color: "var(--faint)" }}>→</span>}
                    <Thumb appid={w.appid} caption={`${w.route || "Win a run"} · ${fmtDate(Date.parse(w.at) / 1000)}`} />
                  </span>
                ))}
                {s.death && (
                  <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ color: "var(--err-border, #E05B5B)" }}>→ 💀</span>
                    <Thumb appid={s.death.appid} faded caption={s.death.route || "the run that ended it"} />
                  </span>
                )}
                {s.active && <span style={{ color: "var(--accent)", fontSize: 18 }} title="the streak lives">→ …</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "designate" && (
        <div className="panel" style={{ ...S.panel, display: "grid", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Mark club games as roguelikes and list their routes/characters/decks — one per line. No routes = the wheel assigns "Win a run".
          </div>
          <AddRoguelike stats={stats} designated={designated} mutate={mutate} busy={busy} />
          {(meta.roguelikes ?? []).map((r) => (
            <DesignatedRow key={r.appid} row={r} gameName={gameName} mutate={mutate} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddRoguelike({ stats, designated, mutate, busy }) {
  const [appid, setAppid] = useState("");
  const candidates = stats.games.filter((g) => !designated.includes(Number(g.appid)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select style={S.input} value={appid} onChange={(e) => setAppid(e.target.value)}>
        <option value="">Choose a club game…</option>
        {candidates.map((g) => <option key={g.appid} value={g.appid}>{g.name}</option>)}
      </select>
      <button style={S.btn} disabled={busy || !appid}
        onClick={async () => { await mutate("setRoguelike", { appid: Number(appid), routes: [] }, () => "Designated. Now give it routes below."); setAppid(""); }}>
        Mark as roguelike
      </button>
    </div>
  );
}

function DesignatedRow({ row, gameName, mutate, busy }) {
  const [text, setText] = useState((row.routes ?? []).join("\n"));
  const dirty = text !== (row.routes ?? []).join("\n");
  return (
    <div style={{ display: "grid", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <b>{gameName[row.appid] ?? `App ${row.appid}`}</b>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>{(row.routes ?? []).length || "no"} routes</span>
        <button style={{ ...S.btnGhost, marginLeft: "auto", color: "var(--faint)" }} disabled={busy}
          onClick={() => mutate("removeRoguelike", { appid: row.appid }, () => "Removed from the gauntlet.")}>Remove</button>
      </div>
      <textarea style={{ ...S.input, minHeight: 64, fontFamily: "inherit" }} value={text}
        placeholder={"Ironclad\nThe Silent\nDefect…"} onChange={(e) => setText(e.target.value)} />
      {dirty && (
        <button style={{ ...S.btn, justifySelf: "start" }} disabled={busy}
          onClick={() => mutate("setRoguelike", { appid: row.appid, routes: text.split("\n").map((s) => s.trim()).filter(Boolean) }, () => "Routes saved.")}>
          Save routes
        </button>
      )}
    </div>
  );
}
