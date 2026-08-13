// ---------------------------------------------------------------
// Century.jsx — "The Century Club" ("#/century").
//
// Each member curates up to 100 games they intend to 100% in their
// lifetime. Yearbook layout: a 10×10 wall of cover art beside
// "The 100" — the numbered list with progress, sorting, and fun
// ratings.
//
// Cover states:
//   perfected → ornate gold gradient frame + glow (no overlay —
//               the frame IS the trophy)
//   unowned   → dusty: desaturated, dimmed (they dream of it but
//               don't own it yet); detected via Steam ownership,
//               skipped when the profile's game list is private
//   untracked → quiet ○ (club doesn't fetch it; progress unknown)
//   otherwise → thin progress bar along the bottom edge
//
// Sorts: added order, A–Z, difficulty, playtime, points earned,
// last played, and the club's own ★ fun rating (set inline).
// The wall reshuffles with the sort — a living yearbook.
// ---------------------------------------------------------------
import { useMemo, useState } from "react";
import { S, PctBar } from "./ui.jsx";

const GOLD = "linear-gradient(140deg, #8A6A14, #F7E27E 28%, #B8860B 52%, #FFF3B0 78%, #9C7A1C)";

function Cover({ appid, name, status, pct, owned, override }) {
  const [stage, setStage] = useState(0);   // 0 override (if any) → portrait → header → placeholder
  const urls = [
    ...(override ? [override] : []),
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/library_600x900.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`,
  ];
  const dusty = owned === false;   // owned === null → ownership unknown, no dust
  const overrideFailed = Boolean(override) && stage > 0;   // custom URL didn't load; we fell back
  const img = stage < urls.length ? (
    <img src={urls[stage]} alt={name} loading="lazy" onError={() => setStage(stage + 1)}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block",
        filter: dusty ? "grayscale(0.95) brightness(0.72) contrast(0.9)" : "none" }} />
  ) : (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 10, fontWeight: 700, color: "var(--muted)", padding: 2, textAlign: "center",
      opacity: dusty ? 0.5 : 1 }}>
      {name.slice(0, 18)}
    </div>
  );

  if (status === "perfect") {
    // the gold frame: gradient bevel + soft glow — shiny and completed
    return (
      <div title={`${name} — 100% ✓`} style={{ padding: 2, borderRadius: 6, background: GOLD, position: "relative",
        boxShadow: "0 0 10px rgba(240, 200, 80, 0.45), inset 0 0 2px rgba(255,255,255,.6)", aspectRatio: "2 / 3" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 4, overflow: "hidden", background: "var(--chip)" }}>
          {img}
        </div>
        {overrideFailed && (
          <div title="Custom cover URL failed to load (showing Steam art instead). Click 🖼 in The 100 to fix it."
            style={{ position: "absolute", top: 3, left: 3, fontSize: 10 }}>⚠️</div>
        )}
      </div>
    );
  }
  return (
    <div title={name + (dusty ? " — not owned yet" : "")}
      style={{ position: "relative", aspectRatio: "2 / 3", borderRadius: 4, overflow: "hidden",
        border: "1px solid var(--border)", background: "var(--chip)" }}>
      {img}
      {status === "progress" && pct > 0 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "color-mix(in srgb, var(--bg) 60%, transparent)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
        </div>
      )}
      {status === "untracked" && (
        <div title="Not tracked by the club (progress unknown)"
          style={{ position: "absolute", top: 2, right: 2, fontSize: 9, color: "var(--muted)" }}>○</div>
      )}
      {overrideFailed && (
        <div title="Custom cover URL failed to load (showing Steam art instead). Click 🖼 in The 100 to fix it — the URL must open as a bare image in a browser tab."
          style={{ position: "absolute", top: 2, left: 2, fontSize: 10 }}>⚠️</div>
      )}
    </div>
  );
}

function Stars({ value, onSet, disabled }) {
  return (
    <span style={{ whiteSpace: "nowrap", fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} title={`Fun: ${i}/5${value === i ? " (click to clear)" : ""}`}
          onClick={() => !disabled && onSet(value === i ? 0 : i)}
          style={{ color: i <= value ? "var(--accent)" : "var(--faint)" }}>
          {i <= value ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

const SORTS = {
  added: "Added order", az: "A–Z", diff: "Difficulty", playtime: "Playtime",
  points: "Points earned", lastplayed: "Last played", fun: "★ Fun",
};

export default function Century({ stats, meta, mutate, busy, nav }) {
  const [viewing, setViewing] = useState(meta.members[0]?.steamid ?? "");
  const [sort, setSort] = useState("added");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const trackedById = useMemo(() =>
    Object.fromEntries(stats.games.map((g) => [g.appid, g])), [stats]);

  // points this member has earned per game (unlocks + completion bonus, multipliers included)
  const ptsByKey = useMemo(() => {
    const m = new Map();
    for (const e of stats.events) {
      const k = `${e.sid}|${e.appid}`;
      m.set(k, (m.get(k) ?? 0) + e.pts);
    }
    return m;
  }, [stats]);

  const playtime = stats.profilesPlaytime?.[viewing] ?? {};
  const lastPlayed = stats.profilesLastPlayed?.[viewing] ?? {};
  const ownershipKnown = Object.keys(playtime).length > 0;

  const listOf = (sid) => (meta.century ?? []).filter((c) => c.steamid === sid);
  const statusOf = (sid, appid) => {
    const g = trackedById[appid];
    if (!g) return { status: "untracked", pct: 0 };
    const p = g.players[sid];
    if (p?.complete) return { status: "perfect", pct: 100 };
    return { status: "progress", pct: p?.pct ?? 0 };
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

  const coverOf = useMemo(() =>
    Object.fromEntries((meta.covers ?? []).map((cv) => [Number(cv.appid), cv.url])), [meta.covers]);

  function editCover(appid, name) {
    const current = coverOf[appid] ?? "";
    const url = window.prompt(
      `Custom cover for "${name}" — paste a DIRECT https image URL.\n` +
      `Test: the URL should show ONLY the image when opened in a new tab.\n` +
      `On steamgriddb.com: open the grid, right-click the FULL image → Copy image address.\n` +
      `Leave empty and press OK to reset to Steam's default art.`,
      current);
    if (url === null) return;   // cancelled
    mutate("setCover", { appid, url },
      () => url.trim() ? `Custom cover set for ${name} (club-wide)` : `${name} back to Steam's default art`);
  }

  const mine = countsOf(viewing);
  const inList = new Set(listOf(viewing).map((c) => Number(c.appid)));

  // sorted view — drives BOTH the wall and The 100
  const list = useMemo(() => {
    const base = listOf(viewing);
    const key = (c) => {
      const appid = Number(c.appid);
      switch (sort) {
        case "az": return c.name.toLowerCase();
        case "diff": return -(trackedById[appid]?.diff ?? -1);
        case "playtime": return -(playtime[appid] ?? -1);
        case "points": return -(ptsByKey.get(`${viewing}|${appid}`) ?? -1);
        case "lastplayed": return -(lastPlayed[appid] ?? -1);
        case "fun": return -(c.fun ?? 0);
        default: return 0;   // added order (db order)
      }
    };
    if (sort === "added") return base;
    return [...base].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  }, [viewing, sort, meta.century, trackedById, playtime, lastPlayed, ptsByKey]);

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

  const fmtMin = (min) => min >= 60 ? `${Math.round(min / 60)}h` : `${min}m`;

  return (
    <div style={{ display: "grid", gap: 14 }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 3fr) minmax(250px, 2fr)", gap: 14, alignItems: "start" }}
        className="century-cols">
        {/* the yearbook wall — follows the active sort */}
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
              const appid = Number(c.appid);
              const st = statusOf(viewing, appid);
              const owned = ownershipKnown ? playtime[appid] !== undefined : null;
              return <Cover key={`${c.appid}-${coverOf[appid] ?? ""}`} appid={c.appid} name={c.name}
                status={st.status} pct={st.pct} owned={owned} override={coverOf[appid]} />;
            })}
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
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

          {/* The 100 */}
          <div className="panel" style={{ ...S.panel, maxHeight: 480, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={S.label}>The 100</div>
              <select value={sort} onChange={(e) => setSort(e.target.value)}
                style={{ ...S.input, width: "auto", marginLeft: "auto", fontSize: 12, padding: "3px 8px" }}>
                {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {list.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>Empty page. Go dream a little.</p>}
            <div style={{ display: "grid", gap: 5 }}>
              {list.map((c, i) => {
                const appid = Number(c.appid);
                const st = statusOf(viewing, appid);
                const tracked = st.status !== "untracked";
                const owned = ownershipKnown ? playtime[appid] !== undefined : null;
                const sortNote =
                  sort === "playtime" && playtime[appid] !== undefined ? fmtMin(playtime[appid]) :
                  sort === "diff" && tracked ? `${trackedById[appid].diff}/10` :
                  sort === "points" ? `${Math.round(ptsByKey.get(`${viewing}|${appid}`) ?? 0)} pts` :
                  sort === "lastplayed" && lastPlayed[appid] ? new Date(lastPlayed[appid] * 1000).toLocaleDateString(undefined, { month: "short", year: "2-digit" }) :
                  null;
                return (
                  <div key={c.appid} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13 }}>
                    <span style={{ width: 22, color: "var(--faint)", fontSize: 11, textAlign: "right" }}>{i + 1}.</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      cursor: tracked ? "pointer" : "default",
                      color: st.status === "perfect" ? "var(--accent)" : owned === false ? "var(--muted)" : "var(--ink)" }}
                      onClick={() => tracked && nav("game", { appid })}
                      title={owned === false ? "Not owned yet" : undefined}>
                      {c.name}{owned === false && " 🕸"}
                    </span>
                    {sortNote && <span style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>{sortNote}</span>}
                    <Stars value={c.fun ?? 0} disabled={busy}
                      onSet={(v) => mutate("setCenturyFun", { steamid: viewing, appid, fun: v },
                        () => v ? `${c.name}: ${"★".repeat(v)}` : `${c.name}: rating cleared`)} />
                    {tracked ? (
                      <span style={{ width: 74, display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                        <span style={{ flex: 1 }}><PctBar pct={st.pct} /></span>
                        <span style={{ fontSize: 10, color: st.status === "perfect" ? "var(--accent)" : "var(--muted)", width: 27, textAlign: "right" }}>
                          {st.pct}%
                        </span>
                      </span>
                    ) : (
                      <span style={{ width: 74, fontSize: 11, color: "var(--faint)", textAlign: "right", flexShrink: 0 }}>○</span>
                    )}
                    <button title={coverOf[appid] ? "Custom cover set — click to change or reset" : "Set a custom cover image"}
                      style={{ ...S.btnGhost, padding: "0 6px", color: coverOf[appid] ? "var(--accent)" : "var(--faint)" }}
                      disabled={busy} onClick={() => editCover(appid, c.name)}>🖼</button>
                    <button title="Remove" style={{ ...S.btnGhost, padding: "0 7px", color: "var(--faint)" }} disabled={busy}
                      onClick={() => mutate("removeCentury", { steamid: viewing, appid },
                        () => `${c.name} leaves the hundred`)}>×</button>
                  </div>
                );
              })}
            </div>
          </div>

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
