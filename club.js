// ---------------------------------------------------------------
// /api/club — pulls raw achievement data from Steam for the whole
// roster and every tracked game, in one payload. Scoring happens
// in the browser (src/lib/scoring.js) so the settings sliders can
// recalculate everything instantly without re-fetching.
//
//   GET /api/club?steamids=A,B,C&appids=X,Y,Z
//
// Response:
// {
//   games: [{
//     appid, name,
//     ach: [{ id, name, pct }],              // rarity per achievement
//     players: { [steamid]: [{ id, t }] }    // unlocked ids + unix time
//   }]
// }
// ---------------------------------------------------------------

const BASE = "https://api.steampowered.com";

async function steamJSON(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null; // private profile / unplayed game → skip
    return await r.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const key = process.env.STEAM_API_KEY;
  if (!key) return res.status(500).json({ error: "STEAM_API_KEY not set" });

  const steamids = (req.query.steamids || "").split(",").filter((s) => /^\d{17}$/.test(s));
  const appids = (req.query.appids || "").split(",").filter((s) => /^\d+$/.test(s));
  if (!steamids.length || !appids.length)
    return res.status(400).json({ error: "steamids and appids are required" });

  const perApp = await Promise.all(
    appids.map(async (appid) => {
      const [global, schema, ...players] = await Promise.all([
        steamJSON(`${BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`),
        steamJSON(`${BASE}/ISteamUserStats/GetSchemaForGame/v2/?key=${key}&appid=${appid}`),
        ...steamids.map((sid) =>
          steamJSON(`${BASE}/ISteamUserStats/GetPlayerAchievements/v1/?key=${key}&steamid=${sid}&appid=${appid}`)
        ),
      ]);
      return { appid, global, schema, players };
    })
  );

  const games = [];
  for (const app of perApp) {
    const globalList = app.global?.achievementpercentages?.achievements ?? [];
    if (!globalList.length) continue;

    // Human-readable achievement names from the schema
    const names = new Map(
      (app.schema?.game?.availableGameStats?.achievements ?? []).map((a) => [
        a.name,
        a.displayName,
      ])
    );

    const game = {
      appid: Number(app.appid),
      name: app.schema?.game?.gameName ?? `App ${app.appid}`,
      ach: globalList.map((a) => ({
        id: a.name,
        name: names.get(a.name) ?? a.name,
        pct: parseFloat(a.percent),
      })),
      players: {},
    };

    app.players.forEach((p, i) => {
      const list = p?.playerstats?.achievements;
      if (!list) return;
      game.players[steamids[i]] = list
        .filter((a) => a.achieved)
        .map((a) => ({ id: a.apiname, t: a.unlocktime }));
    });

    games.push(game);
  }

  // Short CDN cache so fresh unlocks appear within ~5 minutes
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({ games });
}
