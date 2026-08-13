// ---------------------------------------------------------------
// Century.jsx — "The Century Club" ("#/century").
//
// Each member curates a personal list of (up to) 100 games they
// intend to 100% in their lifetime. Yearbook layout: a 10×10 wall
// of cover art on the left, the numbered roll call on the right.
//
// Progress is measured against games the CLUB tracks: tracked +
// perfected = gold ✓, tracked + started = progress bar, untracked
// = a quiet ○ (we can't verify what we don't fetch). The wheel can
// filter a personal spin to century games only.
//
// Covers come straight from Steam's CDN by appid — portrait
// library art with graceful fallbacks (header art → initials).
// ---------------------------------------------------------------
import { useMemo, useState } from "react";
import { S, PctBar } from "./ui.jsx";

function Cover({ appid, name, status, pct }) {
  const [stage, setStage] = useState(0);   // 0 portrait → 1 header → 2 placeholder
  const urls = [
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/library_600x900.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`,
  ];
  const border = status === "perfect" ? "2px solid var(--accent)"
    : status === "progress" ? "1px solid var(--border2)" : "1px solid var(--border)";
  return (
    <div title={name} style={{ position: "relative", aspectRatio: "2 / 3", borderRadius: 4, overflow: "hidden",
      border, background: "var(--chip)", opacity: status === "untracked" ? 0.75 : 1 }}>
      {stage < 2 ? (
        <img src={urls[stage]} alt={name} loading="lazy" onError={() => setStage(stage + 1)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: "var(--muted)", padding: 2, textAlign: "center" }}>
          {name.slice(0, 18)}
        </div>
      )}
      {status === "perfect" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "color-mix(in srgb, var(--accent) 22%, transparent)", fontSize: 18 }}>✓</div>
      )}
      {status === "progress" && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "var(--border)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
        </div>
      )}
      {status === "untracked" && (
        <div title="Not tracked by the club (progress unknown)"
          style={{ position: "absolute", top: 2, right: 2, fontSize: 9, color: "var(--muted)" }}>○</div>
      )}
    </div>
  );
}

export default function Century({ stats, meta, mutate, busy, nav }) {
  const [viewing, setViewing] = useState(meta.members[0]?.steamid ?? "");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const trackedById = useMemo(() =>
    Object.fromEntries(stats.games.map((g) => [g.appid, g])), [stats]);

  const listOf = (sid) => (meta.century ?? []).filter((c) => c.steamid === sid);
  const statusOf = (sid, appid) => {
    const g = trackedById[appid];
    if (!g) return { status: "untracked", pct: 0 };
    const p = g.players[sid];
    if (p?.complete) return { status: "perfect", pct: 100 };
    if (p?.unlocked > 0) return { status: "progress", pct: Math.round((p.unlocked / g.ach.length) * 100) };
    return { status: "progress", pct: 0 };
  };
  const countsOf = (sid) => {
    const list = listOf(sid);
    let perfect = 0, untracked = 0;
    for (const c of list) {
      const s = statusOf(sid, Number(c.appid));
      if (s.status === "perfect") perfect++;
      if (s.status === "untracked") untracked++;
    }
    return { chosen: list.length, perfect, untracked };
  };

  const list = listOf(viewing);
  const mine = countsOf(viewing);
  const inList = new Set(list.map((c) => Number(c.appid)));

  async function search(e) {
    e?.preventDefault();
    if (!term.trim()) return;
    setSearching(true); setResults(null);
    try {
      const r = await fetch(`/api/steam?op=search&term=${encodeURIComponent(term.trim())}`);
      const j = await r.json();
      setResults((j.items ?? []).slice(0, 12));
    } catch { setResults([]); }
    setSearching(false);
  }

  // common ground: games on 2+ lists
  const shared = useMemo(() => {
    const map = new Map();
    for (const c of meta.century ?? []) {
      const k = Number(c.appid);
      if (!map.has(k)) map.set(k, { appid: k, name: c.name, sids: [] });
      map.get(k).sids.push(c.steamid);
    }
    return [...map.values()].filter((x) => x.sids.length >= 2)
      .sort((a, b) => b.sids.length - a.sids.length).slice(0, 20);
  }, [meta.century]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* member strip with everyone's score toward the dream */}
      <div className="panel" style={{ ...S.panel, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={S.label}>The Century Club</span>
        {meta.members.map((m) => {
          const c = countsOf(m.steamid);
          return (
            <button key={m.steamid} onClick={() => setViewing(m.steamid)}
              style={{ ...S.btnGhost, display: "flex", gap: 6, alignItems: "center",
                ...(viewing === m.steamid ? { borderColor: "var(--accent-border)", color: "var(--accent)" } : {}) }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: m.color }} />
              {m.name} <b>{c.perfect}</b><span style={{ color: "var(--faint)" }}>/{c.chosen || "—"}</span>
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--faint)" }}>
          100 games. 100%. A lifetime's work, chosen on purpose.
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 3fr) minmax(240px, 2fr)", gap: 14, alignItems: "start" }}
        className="century-cols">
        {/* the yearbook wall */}
        <div className="panel" style={S.panel}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={S.label}>{stats.byId[viewing]?.name}'s hundred</div>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {mine.perfect} perfected · {mine.chosen}/100 chosen
              {mine.untracked > 0 && <span style={{ color: "var(--faint)" }}> · {mine.untracked} not tracked ○</span>}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
            {Array.from({ length: 100 }, (_, i) => {
              const c = list[i];
              if (!c) return <div key={"e" + i} style={{ aspectRatio: "2 / 3", borderRadius: 4,
                border: "1px dashed var(--border)", opacity: 0.4 }} />;
              const st = statusOf(viewing, Number(c.appid));
              return <Cover key={c.appid} appid={c.appid} name={c.name} status={st.status} pct={st.pct} />;
            })}
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {/* add a game */}
          <div className="panel" style={S.panel}>
            <div style={{ ...S.label, marginBottom: 10 }}>Add to the hundred</div>
            <form onSubmit={search} style={{ display: "flex", gap: 6 }}>
              <input style={{ ...S.input, flex: 1 }} placeholder="Search all of Steam…"
                value={term} onChange={(e) => setTerm(e.target.value)} />
              <button style={S.btnGhost} disabled={searching}>{searching ? "…" : "Search"}</button>
            </form>
            {results && (
              <div style={{ marginTop: 10, display: "grid", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                {results.length === 0 && <span style={{ fontSize: 12, color: "var(--faint)" }}>Nothing found.</span>}
                {results.map((r) => (
                  <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <img src={r.tiny_image} alt="" style={{ width: 60, borderRadius: 3 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    {inList.has(Number(r.id))
                      ? <span style={{ fontSize: 11, color: "var(--accent)" }}>✓ in</span>
                      : <button style={{ ...S.btnGhost, padding: "2px 10px" }} disabled={busy || mine.chosen >= 100}
                          onClick={() => mutate("addCentury", { steamid: viewing, appid: r.id, name: r.name },
                            () => `${r.name} joins ${stats.byId[viewing]?.name}'s hundred (${mine.chosen + 1}/100)`)}>
                          + Add
                        </button>}
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: 11, color: "var(--faint)", marginBottom: 0 }}>
              Games the club doesn't track show ○ — add them to the club library to measure progress.
            </p>
          </div>

          {/* roll call */}
          <div className="panel" style={{ ...S.panel, maxHeight: 420, overflowY: "auto" }}>
            <div style={{ ...S.label, marginBottom: 10 }}>Roll call</div>
            {list.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>Empty page. Go dream a little.</p>}
            <div style={{ display: "grid", gap: 3 }}>
              {list.map((c, i) => {
                const st = statusOf(viewing, Number(c.appid));
                const tracked = st.status !== "untracked";
                return (
                  <div key={c.appid} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <span style={{ width: 22, color: "var(--faint)", fontSize: 11, textAlign: "right" }}>{i + 1}.</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      cursor: tracked ? "pointer" : "default", color: st.status === "perfect" ? "var(--accent)" : "var(--ink)" }}
                      onClick={() => tracked && nav("game", { appid: Number(c.appid) })}>
                      {c.name}
                    </span>
                    {st.status === "perfect" && <span style={{ color: "var(--accent)", fontSize: 12 }}>✓ 100%</span>}
                    {st.status === "progress" && <span style={{ width: 60 }}><PctBar pct={st.pct} /></span>}
                    {st.status === "untracked" && <span style={{ fontSize: 11, color: "var(--faint)" }}>○</span>}
                    <button title="Remove" style={{ ...S.btnGhost, padding: "0 7px", color: "var(--faint)" }} disabled={busy}
                      onClick={() => mutate("removeCentury", { steamid: viewing, appid: Number(c.appid) },
                        () => `${c.name} leaves the hundred`)}>×</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* common ground */}
          {shared.length > 0 && (
            <div className="panel" style={S.panel}>
              <div style={{ ...S.label, marginBottom: 10 }}>Common ground</div>
              <div style={{ display: "grid", gap: 4 }}>
                {shared.map((s) => (
                  <div key={s.appid} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    {s.sids.map((sid) => (
                      <span key={sid} title={stats.byId[sid]?.name}
                        style={{ width: 9, height: 9, borderRadius: 5, background: stats.byId[sid]?.color ?? "var(--muted)" }} />
                    ))}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--faint)", marginBottom: 0 }}>Games on two or more hundreds — natural bounty material.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
