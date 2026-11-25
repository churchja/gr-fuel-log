// Builds the locked demos for other flex fuel kit companies: demo/<id>/ for each company in demos/brands.js.
// A demo is the partner version in that company's look, running on the preview's sample data: no sign-in, no database,
// nothing saved. Run: node demos/build.js   (fetches each logo once; commit the demo/ folder it writes)
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const BRANDS = require("./brands");
const ROOT = path.resolve(__dirname, "..");
// A demo keeps its company's look whatever the phone's light or dark setting, so it starts from the app's own light
// (or dark) colors and lays the company's on top.
const appCss = fs.readFileSync(path.join(ROOT, "app.css"), "utf8");
const BASE = { light: appCss.match(/:root \{[\s\S]*?\n\}/)[0], dark: appCss.match(/@media \(prefers-color-scheme: dark\) \{\s*(:root \{[\s\S]*?\n  \})/)[1] };
const V = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/app\.js\?v=(\d+)/)[1];

for (const [id, b] of Object.entries(BRANDS)) {
  if (b.mockup) continue; // not approved yet: mock-up screens only
  const dir = path.join(ROOT, "demo", id); fs.mkdirSync(dir, { recursive: true });
  const ext = /\.svg(\?|$)/.test(b.logo) ? "svg" : "png", logo = `logo.${ext}`;
  if (!fs.existsSync(path.join(dir, logo))) execFileSync("curl", ["-s", "-f", "-o", path.join(dir, logo), b.logo]);
  const partner = { ...b.partner, demo: true, logo: { light: logo, dark: logo, alt: b.title } };
  fs.writeFileSync(path.join(dir, "partner.js"), `// ${b.title}: a demo of the app in their look, made to show them. Built by demos/build.js from demos/brands.js.\nwindow.PARTNER = ${JSON.stringify(partner, null, 2)};\n`);
  fs.writeFileSync(path.join(dir, "brand.css"), `/* ${b.title}'s look, read from ${b.site}. Built by demos/build.js. */\n@import url("https://fonts.googleapis.com/css2?${b.fonts}&display=swap");\n${BASE.light}\n${b.scheme === "dark" ? BASE.dark + "\n" : ""}${b.css.replace(/^ {6}/gm, "")}\n.preview-ribbon { background: var(--brand); color: #fff; font: 500 13px/1.3 var(--body); text-align: center; padding: max(6px, env(safe-area-inset-top, 0px)) 12px 6px; }\n.preview-ribbon a { color: #fff; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }\nbody.signin #app { min-height: calc(100svh - 30px); }\n`);
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html>
<html lang="en"${b.scheme === "dark" ? ' style="color-scheme: dark"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${b.partner.name} · Demo</title>
<meta name="description" content="A demo of ${b.partner.name} with sample data. Nothing you enter is saved.">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="../../icons/icon-192.png" type="image/png">
<link rel="stylesheet" href="../../app.css?v=${V}">
<link rel="stylesheet" href="../../limitplus1/partner.css?v=1">
<link rel="stylesheet" href="brand.css?v=${V}">
</head>
<body class="partner">
<div class="preview-ribbon" role="note"><b>Demo</b> · sample data, nothing is saved · <a href="./" data-preview-reset>Start over</a></div>
<main id="app" aria-live="polite"><p class="muted">Loading…</p></main>
<div class="tabs" id="tabs" hidden></div>
<noscript>${b.partner.name} needs JavaScript turned on.</noscript>
<!-- No database here: preview.js stands in for it with sample data that stays in this tab. -->
<script src="partner.js?v=${V}"></script>
<script src="../../limitplus1/preview/preview.js?v=${V}"></script>
<script src="../../calc.js?v=${V}"></script>
<script src="../../service.js?v=${V}"></script>
<script src="../../app.js?v=${V}"></script>
</body>
</html>
`);
  console.log("built demo/" + id);
}
