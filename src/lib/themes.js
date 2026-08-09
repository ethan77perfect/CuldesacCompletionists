// ---------------------------------------------------------------
// themes.js — colors AND surfaces.
//
// A THEME is a palette: values for the CSS variables every
// component uses. A SURFACE is a finish applied on top — solid,
// frosted glass, or neon glow — implemented as CSS rules keyed
// off a data-attribute on <html> (see the style block in App.jsx).
// Add a theme: add an entry here. Nothing else changes.
//
// All themes are dark variants on purpose (charts, rarity tiers,
// and member colors assume a dark backdrop).
// ---------------------------------------------------------------

const t = (label, vars) => ({ label, vars });

export const THEMES = {
  campfire: t("Campfire · Outer Wilds", {           // the original navy + gold
    "--bg": "#0E1420", "--panel": "#18202F", "--header": "#111828",
    "--border": "#232D40", "--border2": "#2C3852",
    "--ink": "#D7DFEC", "--ink-strong": "#F2F5FA",
    "--muted": "#8FA3BF", "--faint": "#44506A",
    "--accent": "#E8B84B", "--accent-ink": "#1A1608",
    "--accent-bg": "#2A2410", "--accent-border": "#4A3D18",
    "--chip": "#1E2637", "--err-bg": "#241416", "--err-border": "#5A2B2B", "--ok-bg": "#1E1A0E",
  }),
  hades: t("House of Hades", {                       // now ACTUALLY Hades: ember reds on underworld black
    "--bg": "#170D0E", "--panel": "#221315", "--header": "#1C1012",
    "--border": "#382023", "--border2": "#4A2A2D",
    "--ink": "#EBD9D4", "--ink-strong": "#FAF2EE",
    "--muted": "#B99A92", "--faint": "#6A4A45",
    "--accent": "#F0703C", "--accent-ink": "#230D05",
    "--accent-bg": "#331A10", "--accent-border": "#5E301C",
    "--chip": "#2A1719", "--err-bg": "#2A1113", "--err-border": "#5E2A2E", "--ok-bg": "#291A10",
  }),
  paleCourt: t("Pale Court · Hollow Knight", {
    "--bg": "#0B0C10", "--panel": "#15171C", "--header": "#101216",
    "--border": "#24272E", "--border2": "#32363F",
    "--ink": "#D8DBE0", "--ink-strong": "#F4F5F7",
    "--muted": "#9AA1AB", "--faint": "#4A4F58",
    "--accent": "#E9EDF2", "--accent-ink": "#101216",
    "--accent-bg": "#22262C", "--accent-border": "#3C424B",
    "--chip": "#1B1E24", "--err-bg": "#231416", "--err-border": "#57302F", "--ok-bg": "#191B20",
  }),
  hornet: t("Hornet · Silksong", {                   // charcoal, crimson thread, silk white
    "--bg": "#121013", "--panel": "#1C181B", "--header": "#171316",
    "--border": "#2E2529", "--border2": "#3E3136",
    "--ink": "#EBE4E6", "--ink-strong": "#FBF7F8",
    "--muted": "#AC9CA1", "--faint": "#5C4C51",
    "--accent": "#E04A55", "--accent-ink": "#26080B",
    "--accent-bg": "#301418", "--accent-border": "#59262D",
    "--chip": "#241D20", "--err-bg": "#2A1214", "--err-border": "#5C2A2E", "--ok-bg": "#251A1C",
  }),
  mjolnir: t("Mjolnir · Halo", {                     // spartan green, near-black, honor gold
    "--bg": "#0C110D", "--panel": "#141B15", "--header": "#101711",
    "--border": "#212B23", "--border2": "#2E3B30",
    "--ink": "#D9E2DA", "--ink-strong": "#F1F6F2",
    "--muted": "#93A796", "--faint": "#48584B",
    "--accent": "#C9A227", "--accent-ink": "#1C1503",
    "--accent-bg": "#26200C", "--accent-border": "#4A3F17",
    "--chip": "#1A231C", "--err-bg": "#241416", "--err-border": "#553231", "--ok-bg": "#20200E",
  }),
  jimbo: t("Jimbo · Balatro", {                      // card-felt teal, joker red, chip gold
    "--bg": "#0D1A1C", "--panel": "#132528", "--header": "#102022",
    "--border": "#1F373B", "--border2": "#2A484D",
    "--ink": "#D8E7E8", "--ink-strong": "#F1F9F9",
    "--muted": "#8FB0B3", "--faint": "#456164",
    "--accent": "#E85D4A", "--accent-ink": "#260C07",
    "--accent-bg": "#2E1A16", "--accent-border": "#573028",
    "--chip": "#182E31", "--err-bg": "#271315", "--err-border": "#582D30", "--ok-bg": "#222512",
  }),
  inkwell: t("Inkwell · Cuphead", {                  // aged film sepia, cream ink, cherry red
    "--bg": "#171210", "--panel": "#221B16", "--header": "#1C1512",
    "--border": "#372C23", "--border2": "#493B2F",
    "--ink": "#EFE4D3", "--ink-strong": "#FBF5EA",
    "--muted": "#BCA98D", "--faint": "#655743",
    "--accent": "#DE4A3A", "--accent-ink": "#280A06",
    "--accent-bg": "#33170F", "--accent-border": "#5C2B1E",
    "--chip": "#2A211A", "--err-bg": "#2A1311", "--err-border": "#5C2C27", "--ok-bg": "#292013",
  }),
  determination: t("Determination · Undertale", {    // dark violet void, SOUL yellow
    "--bg": "#120F1C", "--panel": "#1C1729", "--header": "#171322",
    "--border": "#2C2542", "--border2": "#3B3257",
    "--ink": "#E2DDF0", "--ink-strong": "#F6F3FC",
    "--muted": "#A79ECB", "--faint": "#544B78",
    "--accent": "#F5D442", "--accent-ink": "#221B03",
    "--accent-bg": "#2C2610", "--accent-border": "#54481D",
    "--chip": "#241E38", "--err-bg": "#271320", "--err-border": "#582B44", "--ok-bg": "#26220F",
  }),
  overworld: t("Overworld · Minecraft", {            // deepslate, grass-block green, gold ore
    "--bg": "#101312", "--panel": "#181D1A", "--header": "#141815",
    "--border": "#262E29", "--border2": "#333E37",
    "--ink": "#DCE3DD", "--ink-strong": "#F3F7F4",
    "--muted": "#9AAB9D", "--faint": "#4D5A50",
    "--accent": "#6CC24A", "--accent-ink": "#0F1E08",
    "--accent-bg": "#1C2C15", "--accent-border": "#375426",
    "--chip": "#1E2620", "--err-bg": "#241416", "--err-border": "#553231", "--ok-bg": "#1B2413",
  }),
  goldenBerry: t("Golden Berry · Celeste", {
    "--bg": "#151226", "--panel": "#1F1B33", "--header": "#191531",
    "--border": "#2E2949", "--border2": "#3B3560",
    "--ink": "#E2DEF2", "--ink-strong": "#F6F4FC",
    "--muted": "#A79FC9", "--faint": "#544D77",
    "--accent": "#F27BA5", "--accent-ink": "#2A0E18",
    "--accent-bg": "#301B2A", "--accent-border": "#5A3247",
    "--chip": "#272242", "--err-bg": "#2A1420", "--err-border": "#5E2B42", "--ok-bg": "#251B30",
  }),
  junimoGrove: t("Junimo Grove · Stardew Valley", {
    "--bg": "#101810", "--panel": "#18231A", "--header": "#131D14",
    "--border": "#25332A", "--border2": "#32443A",
    "--ink": "#DBE6DA", "--ink-strong": "#F2F8F1",
    "--muted": "#93AB94", "--faint": "#48584B",
    "--accent": "#7FD37B", "--accent-ink": "#0E1A0D",
    "--accent-bg": "#1B2E1D", "--accent-border": "#35513A",
    "--chip": "#1D2A20", "--err-bg": "#241614", "--err-border": "#553229", "--ok-bg": "#182415",
  }),
  aperture: t("Aperture · Portal", {
    "--bg": "#14161A", "--panel": "#1D2026", "--header": "#181B20",
    "--border": "#2A2E36", "--border2": "#383D47",
    "--ink": "#DCDFE4", "--ink-strong": "#F5F6F8",
    "--muted": "#9BA3AF", "--faint": "#4C525C",
    "--accent": "#F08A3C", "--accent-ink": "#1F1206",
    "--accent-bg": "#2C2015", "--accent-border": "#553D24",
    "--chip": "#22262E", "--err-bg": "#251517", "--err-border": "#563132", "--ok-bg": "#231C13",
  }),
};

export const SURFACES = {
  solid: "Solid",
  glass: "Glass",
  neon: "Neon",
};

export const DEFAULT_THEME = "campfire";
export const DEFAULT_SURFACE = "solid";

export function applyTheme(id) {
  const theme = THEMES[id] ?? THEMES[DEFAULT_THEME];
  for (const [k, v] of Object.entries(theme.vars)) {
    document.documentElement.style.setProperty(k, v);
  }
  localStorage.setItem("theme", id);
}

export function applySurface(id) {
  const s = SURFACES[id] ? id : DEFAULT_SURFACE;
  document.documentElement.dataset.surface = s;
  localStorage.setItem("surface", s);
}
