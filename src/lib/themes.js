// ---------------------------------------------------------------
// themes.js — colors, modes, and surfaces.
//
// Each THEME has a dark and a light palette (hand-tuned — light
// variants lean into each game's real identity, not just inverted
// dark). A MODE picks which palette; a SURFACE (solid/glass/neon)
// is a finish on top. All three combine freely.
//
// --sem-darken: how much semantic colors (rarity tiers, difficulty
// dial text) get mixed toward black so they stay readable — 0% on
// dark, ~30% on light. Used via color-mix in ui.jsx.
//
// chartInk() reads live CSS vars for recharts (SVG attributes can't
// use var(), so charts pull concrete values at render time).
// ---------------------------------------------------------------

const dk = (v) => ({ "--sem-darken": "0%", ...v });
const lt = (v) => ({
  "--sem-darken": "30%",
  "--err-bg": "#F9E7E4", "--err-border": "#DCA79F", "--ok-bg": "#F5EEDB",
  ...v,
});

// "game" (True-to-game) palettes commit the whole surface to the game's
// colors and carry TWO accents. Each specifies its own --sem-darken and
// --label (the section-header color, normally --muted).
const gm = (v) => ({ "--err-bg": "#3A1518", "--err-border": "#6E3236", "--ok-bg": "#2A2412", ...v });

const t = (label, dark, light, game) => ({ label, dark: dk(dark), light: lt(light), game: gm(game) });

export const THEMES = {
  campfire: t("Campfire · Outer Wilds",
    { "--bg": "#0E1420", "--panel": "#18202F", "--header": "#111828",
      "--border": "#232D40", "--border2": "#2C3852",
      "--ink": "#D7DFEC", "--ink-strong": "#F2F5FA", "--muted": "#8FA3BF", "--faint": "#44506A",
      "--accent": "#E8B84B", "--accent-ink": "#1A1608", "--accent-bg": "#2A2410", "--accent-border": "#4A3D18",
      "--chip": "#1E2637", "--err-bg": "#241416", "--err-border": "#5A2B2B", "--ok-bg": "#1E1A0E" },
    { "--bg": "#F5F0E4", "--panel": "#FDFAF2", "--header": "#F9F4E8",
      "--border": "#E0D7C2", "--border2": "#CCC1A6",
      "--ink": "#2A3550", "--ink-strong": "#18202F", "--muted": "#6C7A94", "--faint": "#A8B0BE",
      "--accent": "#94700D", "--accent-ink": "#FFFDF5", "--accent-bg": "#F2E7C8", "--accent-border": "#D8C48E",
      "--chip": "#EFE9D8" },
    { "--bg": "#0F2129", "--panel": "#173340", "--header": "#122A34",
      "--border": "#234653", "--border2": "#2F5A6A",
      "--ink": "#E6F1EF", "--ink-strong": "#F7FCFB", "--muted": "#9CC0BC", "--faint": "#4E7078",
      "--accent": "#F5A83B", "--accent-ink": "#231402", "--accent-bg": "#33301A", "--accent-border": "#5E5324",
      "--accent2": "#7FD4C1", "--label": "#8ED9C6", "--sem-darken": "0%",
      "--chip": "#1B3B48" }),
  hades: t("House of Hades",
    { "--bg": "#170D0E", "--panel": "#221315", "--header": "#1C1012",
      "--border": "#382023", "--border2": "#4A2A2D",
      "--ink": "#EBD9D4", "--ink-strong": "#FAF2EE", "--muted": "#B99A92", "--faint": "#6A4A45",
      "--accent": "#F0703C", "--accent-ink": "#230D05", "--accent-bg": "#331A10", "--accent-border": "#5E301C",
      "--chip": "#2A1719", "--err-bg": "#2A1113", "--err-border": "#5E2A2E", "--ok-bg": "#291A10" },
    { "--bg": "#F8EFEA", "--panel": "#FEF8F4", "--header": "#FAF2ED",
      "--border": "#E7D4CB", "--border2": "#D5BAAD",
      "--ink": "#43231B", "--ink-strong": "#2A1510", "--muted": "#95685C", "--faint": "#C2A69C",
      "--accent": "#C6441A", "--accent-ink": "#FFF6F1", "--accent-bg": "#F6DED2", "--accent-border": "#E0B49E",
      "--chip": "#F2E4DC" },
    { "--bg": "#2E1016", "--panel": "#3E161F", "--header": "#361219",
      "--border": "#5A2230", "--border2": "#712C3D",
      "--ink": "#FBEADF", "--ink-strong": "#FFF7F0", "--muted": "#D8A395", "--faint": "#8A5350",
      "--accent": "#FF6A42", "--accent-ink": "#2A0D03", "--accent-bg": "#4A1F14", "--accent-border": "#7A3722",
      "--accent2": "#F2C94C", "--label": "#F2C94C", "--sem-darken": "0%",
      "--chip": "#341219" }),
  paleCourt: t("Pale Court · Hollow Knight",
    { "--bg": "#0B0C10", "--panel": "#15171C", "--header": "#101216",
      "--border": "#24272E", "--border2": "#32363F",
      "--ink": "#D8DBE0", "--ink-strong": "#F4F5F7", "--muted": "#9AA1AB", "--faint": "#4A4F58",
      "--accent": "#E9EDF2", "--accent-ink": "#101216", "--accent-bg": "#22262C", "--accent-border": "#3C424B",
      "--chip": "#1B1E24", "--err-bg": "#231416", "--err-border": "#57302F", "--ok-bg": "#191B20" },
    { "--bg": "#F1F2F5", "--panel": "#FBFCFD", "--header": "#F5F6F8",
      "--border": "#DCDFE4", "--border2": "#C4C9D1",
      "--ink": "#2A2E35", "--ink-strong": "#15171C", "--muted": "#6E7683", "--faint": "#AAB0BA",
      "--accent": "#3C424B", "--accent-ink": "#F4F5F7", "--accent-bg": "#E4E7EC", "--accent-border": "#B9C0CA",
      "--chip": "#EBEDF1" },
    { "--bg": "#0E1B27", "--panel": "#152A3D", "--header": "#112231",
      "--border": "#223D55", "--border2": "#2E4F6D",
      "--ink": "#DEEAF6", "--ink-strong": "#F5FAFE", "--muted": "#9AB8D3", "--faint": "#4A6B88",
      "--accent": "#A3D2F0", "--accent-ink": "#0E1B27", "--accent-bg": "#1C3A52", "--accent-border": "#32587A",
      "--accent2": "#E9EDF2", "--label": "#A3D2F0", "--sem-darken": "0%",
      "--chip": "#183145" }),
  hornet: t("Hornet · Silksong",
    { "--bg": "#121013", "--panel": "#1C181B", "--header": "#171316",
      "--border": "#2E2529", "--border2": "#3E3136",
      "--ink": "#EBE4E6", "--ink-strong": "#FBF7F8", "--muted": "#AC9CA1", "--faint": "#5C4C51",
      "--accent": "#E04A55", "--accent-ink": "#26080B", "--accent-bg": "#301418", "--accent-border": "#59262D",
      "--chip": "#241D20", "--err-bg": "#2A1214", "--err-border": "#5C2A2E", "--ok-bg": "#251A1C" },
    { "--bg": "#FAF5F6", "--panel": "#FFFFFF", "--header": "#FBF6F7",
      "--border": "#EBDCDF", "--border2": "#DBC3C8",
      "--ink": "#33262A", "--ink-strong": "#1E1417", "--muted": "#8A727A", "--faint": "#C0AAB1",
      "--accent": "#C22833", "--accent-ink": "#FFF5F6", "--accent-bg": "#F8DFE1", "--accent-border": "#E5AFB4",
      "--chip": "#F5EBED" },
    { "--bg": "#241016", "--panel": "#33171F", "--header": "#2B1319",
      "--border": "#4E2230", "--border2": "#642C3E",
      "--ink": "#F8ECE7", "--ink-strong": "#FEF8F5", "--muted": "#D3A49B", "--faint": "#855353",
      "--accent": "#EE4B59", "--accent-ink": "#2A070C", "--accent-bg": "#45161E", "--accent-border": "#732634",
      "--accent2": "#E7CE8F", "--label": "#E7CE8F", "--sem-darken": "0%",
      "--chip": "#2C1219" }),
  mjolnir: t("Mjolnir · Halo",
    { "--bg": "#0C110D", "--panel": "#141B15", "--header": "#101711",
      "--border": "#212B23", "--border2": "#2E3B30",
      "--ink": "#D9E2DA", "--ink-strong": "#F1F6F2", "--muted": "#93A796", "--faint": "#48584B",
      "--accent": "#C9A227", "--accent-ink": "#1C1503", "--accent-bg": "#26200C", "--accent-border": "#4A3F17",
      "--chip": "#1A231C", "--err-bg": "#241416", "--err-border": "#553231", "--ok-bg": "#20200E" },
    { "--bg": "#EFF3EE", "--panel": "#FAFCF9", "--header": "#F3F6F2",
      "--border": "#D8E0D6", "--border2": "#BECBBC",
      "--ink": "#243026", "--ink-strong": "#141B15", "--muted": "#68785F", "--faint": "#A5B2A0",
      "--accent": "#8A6F0C", "--accent-ink": "#FFFCF0", "--accent-bg": "#EDE5C4", "--accent-border": "#D0C088",
      "--chip": "#E9EEE6" },
    { "--bg": "#152017", "--panel": "#1D2D20", "--header": "#18261B",
      "--border": "#2B4230", "--border2": "#3A5641",
      "--ink": "#E1EDE2", "--ink-strong": "#F4FAF4", "--muted": "#A0BCA2", "--faint": "#52704F",
      "--accent": "#8DBE62", "--accent-ink": "#101E06", "--accent-bg": "#243A18", "--accent-border": "#40602C",
      "--accent2": "#58B7E8", "--label": "#7FC3E6", "--sem-darken": "0%",
      "--chip": "#1B2B1E" }),
  jimbo: t("Jimbo · Balatro",
    { "--bg": "#0D1A1C", "--panel": "#132528", "--header": "#102022",
      "--border": "#1F373B", "--border2": "#2A484D",
      "--ink": "#D8E7E8", "--ink-strong": "#F1F9F9", "--muted": "#8FB0B3", "--faint": "#456164",
      "--accent": "#E85D4A", "--accent-ink": "#260C07", "--accent-bg": "#2E1A16", "--accent-border": "#573028",
      "--chip": "#182E31", "--err-bg": "#271315", "--err-border": "#582D30", "--ok-bg": "#222512" },
    { "--bg": "#EEF3F2", "--panel": "#FFFFFF", "--header": "#F4F8F7",
      "--border": "#D8E2E0", "--border2": "#BCCDCA",
      "--ink": "#1F3A3E", "--ink-strong": "#122326", "--muted": "#5E7C7F", "--faint": "#9FB5B4",
      "--accent": "#CE3B28", "--accent-ink": "#FFF5F3", "--accent-bg": "#F8DFD9", "--accent-border": "#E5AC9F",
      "--chip": "#E8EFEE" },
    { "--bg": "#1B5040", "--panel": "#144236", "--header": "#174A3B",
      "--border": "#0F352B", "--border2": "#2A6B54",
      "--ink": "#EDF8F1", "--ink-strong": "#FBFFFC", "--muted": "#A8D2BE", "--faint": "#5B927C",
      "--accent": "#FF8273", "--accent-ink": "#2C0A05", "--accent-bg": "#3E241E", "--accent-border": "#6E3A2E",
      "--accent2": "#5FB0FF", "--label": "#8FC9FF", "--sem-darken": "0%",
      "--chip": "#123A2E" }),
  inkwell: t("Inkwell · Cuphead",
    { "--bg": "#171210", "--panel": "#221B16", "--header": "#1C1512",
      "--border": "#372C23", "--border2": "#493B2F",
      "--ink": "#EFE4D3", "--ink-strong": "#FBF5EA", "--muted": "#BCA98D", "--faint": "#655743",
      "--accent": "#DE4A3A", "--accent-ink": "#280A06", "--accent-bg": "#33170F", "--accent-border": "#5C2B1E",
      "--chip": "#2A211A", "--err-bg": "#2A1311", "--err-border": "#5C2C27", "--ok-bg": "#292013" },
    { "--bg": "#F6EEDB", "--panel": "#FCF7E9", "--header": "#F8F1E1",
      "--border": "#E6D9BC", "--border2": "#D3C09A",
      "--ink": "#3E2E1E", "--ink-strong": "#271C10", "--muted": "#8B7658", "--faint": "#BFAE90",
      "--accent": "#BF3123", "--accent-ink": "#FFF6EE", "--accent-bg": "#F4DCCB", "--accent-border": "#DFAE93",
      "--chip": "#F0E7D0" },
    { "--bg": "#E9DAB4", "--panel": "#F4EACB", "--header": "#EEE1BE",
      "--border": "#D2BE92", "--border2": "#B9A276",
      "--ink": "#3A2A16", "--ink-strong": "#241A0C", "--muted": "#7E6A48", "--faint": "#AE9C79",
      "--accent": "#BB2D1D", "--accent-ink": "#FFF4EC", "--accent-bg": "#F1D3BB", "--accent-border": "#D8A583",
      "--accent2": "#2E6E8C", "--label": "#2E6E8C", "--sem-darken": "26%",
      "--chip": "#EDE0BC", "--err-bg": "#F4DCD2", "--err-border": "#D8A08D", "--ok-bg": "#EFE4B8" }),
  determination: t("Determination · Undertale",
    { "--bg": "#120F1C", "--panel": "#1C1729", "--header": "#171322",
      "--border": "#2C2542", "--border2": "#3B3257",
      "--ink": "#E2DDF0", "--ink-strong": "#F6F3FC", "--muted": "#A79ECB", "--faint": "#544B78",
      "--accent": "#F5D442", "--accent-ink": "#221B03", "--accent-bg": "#2C2610", "--accent-border": "#54481D",
      "--chip": "#241E38", "--err-bg": "#271320", "--err-border": "#582B44", "--ok-bg": "#26220F" },
    { "--bg": "#F2F0F8", "--panel": "#FCFBFE", "--header": "#F5F3FA",
      "--border": "#DEDAEB", "--border2": "#C6C0DC",
      "--ink": "#312A4D", "--ink-strong": "#1E1930", "--muted": "#746B99", "--faint": "#AEA7C7",
      "--accent": "#8A6D07", "--accent-ink": "#FFFCEF", "--accent-bg": "#F1E7BD", "--accent-border": "#D9C67F",
      "--chip": "#ECE9F3" },
    { "--bg": "#0A0A12", "--panel": "#14141F", "--header": "#0F0F18",
      "--border": "#232336", "--border2": "#303048",
      "--ink": "#F0F0F4", "--ink-strong": "#FCFCFE", "--muted": "#A5A5C2", "--faint": "#525270",
      "--accent": "#FFD93B", "--accent-ink": "#231B01", "--accent-bg": "#2E2708", "--accent-border": "#584B12",
      "--accent2": "#5D95F5", "--label": "#8AB2F7", "--sem-darken": "0%",
      "--chip": "#1A1A28" }),
  overworld: t("Overworld · Minecraft",
    { "--bg": "#101312", "--panel": "#181D1A", "--header": "#141815",
      "--border": "#262E29", "--border2": "#333E37",
      "--ink": "#DCE3DD", "--ink-strong": "#F3F7F4", "--muted": "#9AAB9D", "--faint": "#4D5A50",
      "--accent": "#6CC24A", "--accent-ink": "#0F1E08", "--accent-bg": "#1C2C15", "--accent-border": "#375426",
      "--chip": "#1E2620", "--err-bg": "#241416", "--err-border": "#553231", "--ok-bg": "#1B2413" },
    { "--bg": "#F0F4EB", "--panel": "#FAFCF7", "--header": "#F3F7EF",
      "--border": "#DBE3D2", "--border2": "#C2CFB4",
      "--ink": "#28321F", "--ink-strong": "#161E10", "--muted": "#6A7A5C", "--faint": "#A7B49A",
      "--accent": "#3E7E27", "--accent-ink": "#F4FBEF", "--accent-bg": "#DFEDD2", "--accent-border": "#B4D19E",
      "--chip": "#EAF0E2" },
    { "--bg": "#8CBC66", "--panel": "#9AC776", "--header": "#91C16C",
      "--border": "#5F8C3E", "--border2": "#4C7330",
      "--ink": "#0B1104", "--ink-strong": "#070B02", "--muted": "#274015", "--faint": "#4E7433",
      "--accent": "#543013", "--accent-ink": "#F8EFE6", "--accent-bg": "#B99B72", "--accent-border": "#8C6B45",
      "--accent2": "#0E3E63", "--label": "#0E3E63", "--sem-darken": "22%",
      "--chip": "#86B95F", "--err-bg": "#C4756A", "--err-border": "#8C4038", "--ok-bg": "#A8B458" }),
  goldenBerry: t("Golden Berry · Celeste",
    { "--bg": "#151226", "--panel": "#1F1B33", "--header": "#191531",
      "--border": "#2E2949", "--border2": "#3B3560",
      "--ink": "#E2DEF2", "--ink-strong": "#F6F4FC", "--muted": "#A79FC9", "--faint": "#544D77",
      "--accent": "#F27BA5", "--accent-ink": "#2A0E18", "--accent-bg": "#301B2A", "--accent-border": "#5A3247",
      "--chip": "#272242", "--err-bg": "#2A1420", "--err-border": "#5E2B42", "--ok-bg": "#251B30" },
    { "--bg": "#F8F1F6", "--panel": "#FEFBFD", "--header": "#FAF4F8",
      "--border": "#EBDAE6", "--border2": "#DBC0D2",
      "--ink": "#3A2B47", "--ink-strong": "#251A30", "--muted": "#84708F", "--faint": "#BCAAC4",
      "--accent": "#BE3D6E", "--accent-ink": "#FFF4F8", "--accent-bg": "#F7DCE8", "--accent-border": "#E5AFC8",
      "--chip": "#F3EAF0" },
    { "--bg": "#2B2148", "--panel": "#382C5C", "--header": "#312651",
      "--border": "#4A3C77", "--border2": "#5D4C93",
      "--ink": "#F0EBFA", "--ink-strong": "#FAF8FE", "--muted": "#B9ACD9", "--faint": "#6C5E96",
      "--accent": "#F5799B", "--accent-ink": "#2C0B16", "--accent-bg": "#4A2338", "--accent-border": "#753A57",
      "--accent2": "#5FD4D8", "--label": "#7EDCDF", "--sem-darken": "0%",
      "--chip": "#332759" }),
  junimoGrove: t("Junimo Grove · Stardew Valley",
    { "--bg": "#101810", "--panel": "#18231A", "--header": "#131D14",
      "--border": "#25332A", "--border2": "#32443A",
      "--ink": "#DBE6DA", "--ink-strong": "#F2F8F1", "--muted": "#93AB94", "--faint": "#48584B",
      "--accent": "#7FD37B", "--accent-ink": "#0E1A0D", "--accent-bg": "#1B2E1D", "--accent-border": "#35513A",
      "--chip": "#1D2A20", "--err-bg": "#241614", "--err-border": "#553229", "--ok-bg": "#182415" },
    { "--bg": "#F1F6EC", "--panel": "#FBFDF8", "--header": "#F4F8F0",
      "--border": "#DCE6D2", "--border2": "#C3D4B4",
      "--ink": "#2B3826", "--ink-strong": "#182213", "--muted": "#6C8060", "--faint": "#A9B99C",
      "--accent": "#3B8A38", "--accent-ink": "#F2FBF1", "--accent-bg": "#DEEEDB", "--accent-border": "#AFD3AC",
      "--chip": "#EBF1E4" },
    { "--bg": "#2E4C29", "--panel": "#3A5E33", "--header": "#33532D",
      "--border": "#4C7842", "--border2": "#5E9052",
      "--ink": "#F0F6E7", "--ink-strong": "#FAFDF4", "--muted": "#BCD3A8", "--faint": "#6E9060",
      "--accent": "#F2C14E", "--accent-ink": "#241A03", "--accent-bg": "#4E4419", "--accent-border": "#7A6A28",
      "--accent2": "#FCC2A8", "--label": "#FCC2A8", "--sem-darken": "0%",
      "--chip": "#35572F" }),
  aperture: t("Aperture · Portal",
    { "--bg": "#14161A", "--panel": "#1D2026", "--header": "#181B20",
      "--border": "#2A2E36", "--border2": "#383D47",
      "--ink": "#DCDFE4", "--ink-strong": "#F5F6F8", "--muted": "#9BA3AF", "--faint": "#4C525C",
      "--accent": "#F08A3C", "--accent-ink": "#1F1206", "--accent-bg": "#2C2015", "--accent-border": "#553D24",
      "--chip": "#22262E", "--err-bg": "#251517", "--err-border": "#563132", "--ok-bg": "#231C13" },
    { "--bg": "#F1F2F4", "--panel": "#FCFCFD", "--header": "#F5F6F7",
      "--border": "#DEE0E4", "--border2": "#C6CAD1",
      "--ink": "#2A2E35", "--ink-strong": "#17191D", "--muted": "#6E7683", "--faint": "#ACB2BB",
      "--accent": "#BD5510", "--accent-ink": "#FFF7F0", "--accent-bg": "#F8E3D0", "--accent-border": "#E8BC93",
      "--chip": "#ECEEF1" },
    { "--bg": "#DCE0E3", "--panel": "#F1F3F4", "--header": "#E5E8EA",
      "--border": "#C2C8CD", "--border2": "#A6AEB5",
      "--ink": "#25282D", "--ink-strong": "#151719", "--muted": "#5C646D", "--faint": "#9AA2AB",
      "--accent": "#A8490A", "--accent-ink": "#FFF6EE", "--accent-bg": "#F3DBC4", "--accent-border": "#DDAF86",
      "--accent2": "#186FB4", "--label": "#186FB4", "--sem-darken": "28%",
      "--chip": "#E7EAEC", "--err-bg": "#F3DBD6", "--err-border": "#D19A90", "--ok-bg": "#EBE6CE" }),
};

export const SURFACES = { solid: "Solid", glass: "Glass", neon: "Neon" };
export const MODES = { dark: "Dark", light: "Light", game: "True to game" };

export const DEFAULT_THEME = "campfire";
export const DEFAULT_SURFACE = "solid";
export const DEFAULT_MODE = "dark";

export function applyTheme(id, mode = DEFAULT_MODE) {
  const theme = THEMES[id] ?? THEMES[DEFAULT_THEME];
  const vars = theme[mode] ?? theme.dark;
  // reset then apply, so switching modes never leaves stale vars behind
  for (const v of Object.keys({ ...theme.dark, ...theme.light, ...theme.game }))
    document.documentElement.style.removeProperty(v);
  for (const [k, v] of Object.entries(vars))
    document.documentElement.style.setProperty(k, v);
  document.documentElement.dataset.mode = mode;
  localStorage.setItem("theme", id);
  localStorage.setItem("mode", mode);
}

export function applySurface(id) {
  const s = SURFACES[id] ? id : DEFAULT_SURFACE;
  document.documentElement.dataset.surface = s;
  localStorage.setItem("surface", s);
}

// Concrete colors for recharts (SVG attributes can't use var()).
// Reads the live CSS vars, so it's always in sync with theme+mode.
export function chartInk() {
  const css = getComputedStyle(document.documentElement);
  return {
    grid: css.getPropertyValue("--border").trim() || "#232D40",
    axis: css.getPropertyValue("--muted").trim() || "#8FA3BF",
  };
}
