// Shared set-up for the how-to video and its storyboard. It opens the real app pages (GR Fuel Log and LIMIT+1 Flex
// Fuel) from this folder's parent, with the database client swapped for the preview's sample data, so nothing is sent
// anywhere and no member's data appears. The owner starts brand new: no fills, in Crystal Lake, IL.
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const ROOT = path.resolve(__dirname, "..");
const BASE = "http://localhost:4173";
const OUT = path.join(__dirname, "out");

const BRANDS = {
  grfl: { id: "grfl", name: "GR Fuel Log", page: "/index.html", url: "fuel.shadyacres.my" },
  lp1: { id: "lp1", name: "LIMIT+1 Flex Fuel", page: "/limitplus1/index.html", url: "" },
};

// The sample-data client from limitplus1/preview/preview.js, set up for recording: a normal sign-in screen (any email,
// any code). The how-to video's owner is new, with no fills; `history` keeps the preview's ten weeks of sample fills.
function standIn(history) {
  const preview = fs.readFileSync(path.join(ROOT, "limitplus1/preview/preview.js"), "utf8");
  return `window.PARTNER = { logo: { light: "", dark: "" } };\n${preview}\ndelete window.PARTNER;
(function () {
  ${history ? "" : "window.__preview.data().seeded = true; // a new owner: no sample fills"}
  const make = window.supabase.createClient;
  window.supabase.createClient = function () {
    const c = make.apply(null, arguments);
    c.auth.signInWithOtp = async () => ({ error: null });
    c.auth.verifyOtp = async () => { await c.auth.signInAnonymously(); return { error: null }; };
    return c;
  };
})();`;
}

// A receipt the phone "reads" when the owner taps Scan receipt.
function receiptText(date) {
  const [y, m, d] = date.split("-");
  return `THORNTONS #343\n911 TEK DR\nCRYSTAL LAKE IL\n${m}/${d}/${y.slice(2)} 5:41 PM\nPUMP 04 E85 FLEX FUEL\nGALLONS 5.612\nPRICE/GAL $2.399\nFUEL SALE $13.46\nVISA ****1234`;
}

async function route(ctx, { history = false } = {}) {
  const outside = [];
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE + "/")) {
      const rel = new URL(u).pathname;
      if (rel === "/config.js") return r.fulfill({ contentType: "application/javascript", body: "/* recording: the sample-data client sets APP_CONFIG */" });
      const p = path.join(ROOT, rel);
      return fs.existsSync(p) && fs.statSync(p).isFile() ? r.fulfill({ path: p }) : r.fulfill({ status: 404, body: "" });
    }
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "application/javascript", body: standIn(history) });
    if (u.includes("tesseract")) return r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(ROOT, "test/mock-tesseract.js"), "utf8") });
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return r.continue();
    outside.push(u);
    return r.abort();
  });
  return outside;
}

async function launch() { return chromium.launch(); }

module.exports = { ROOT, BASE, OUT, BRANDS, launch, route, receiptText };
