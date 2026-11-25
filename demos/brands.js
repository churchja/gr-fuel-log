// Branded demo mock-ups for other flex fuel kit companies. Each entry is that company's look, read from its own
// website (logo, colors, fonts) on Nov 25, 2026. demos/shots.js renders the real app with it, on sample data.
// These are mock-ups for approval: no company here has agreed to anything, and nothing is published.
const base = (name, short) => ({
  name: `${name} Flex Fuel`, product: "Flex Fuel", poweredBy: "Powered by Shady Acres LLC",
  concept: `A concept by Shady Acres LLC, made to show ${short} what the app could do for its customers. Not an official ${short} product.`,
  tagline: `Exactly how much E85 to pump for your ${short} flex fuel kit and tune, a fill log that learns your station's real E85, and service reminders for your car.`,
  models: [{ id: "grc", name: "GR Corolla" }, { id: "gr86", name: "GR86 / BRZ" }],
});

module.exports = {
  csg: {
    title: "CounterSpace Garage", site: "https://counterspacegarage.com",
    logo: "https://www.counterspacegarage.com/skin/frontend/base/default/images/web-header-logo-hq.png",
    scheme: "light",
    fonts: "family=Roboto:wght@400;500;700&family=Roboto+Condensed:wght@500;700",
    partner: { ...base("CounterSpace Garage", "CounterSpace Garage"), id: "csg", storageKey: "csg",
      contact: { phone: "714-987-2740", website: "https://counterspacegarage.com", info: "sales@counterspacegarage.com" },
      promo: { items: [{ name: "CSG Spec CANBUS Flex Fuel Kit for GR Corolla", url: "https://counterspacegarage.com", models: ["grc"] }, { name: "CSG Spec brake pads", url: "https://counterspacegarage.com", models: ["grc", "gr86"] }, { name: "86 & BRZ maintenance guide", url: "https://counterspacegarage.com", models: ["gr86"] }] } },
    css: `:root { --bg: #f4f4f4; --surface: #ffffff; --sunken: #ececec; --ink: #333333; --muted: #606569; --line: #dddddd; --accent: #333333; --accent-ink: #ffffff; --accent-text: #333333; --highlight: #fde3e7;
        --go: #333333; --go-ink: #ffffff; --go-edge: #333333; --readout: #1c1c1c; --readout-ink: #ffffff; --brand: #ee001c; --promo-bg: #1c1c1c;
        --display: "Roboto Condensed", "Arial Narrow", sans-serif; --body: Roboto, Arial, sans-serif; }
      h1, h2, .btn.primary { text-transform: uppercase; letter-spacing: .02em; }
      .brandbar { background: #1c1c1c; margin: calc(-1 * max(14px, env(safe-area-inset-top, 0px))) -16px 0; padding: 8px 16px; border: 0; } .brandbar span { color: #cfcfcf; }
      .brandbar img { height: 34px; } .signin .brandmark img, .brandmark img { height: 62px; }`,
  },
  visconti: {
    title: "Visconti Tuning", site: "https://vtune.us",
    logo: "https://www.viscontituning.com/cdn/shop/files/vtuning-red_360x.png?v=1613158470",
    scheme: "light",
    fonts: "family=PT+Serif:wght@400;700&family=Source+Sans+3:wght@400;600;700",
    partner: { ...base("Visconti Tuning", "Visconti Tuning"), id: "visconti", storageKey: "visconti",
      contact: { website: "https://vtune.us", info: "john@vtune.us" },
      promo: { items: [{ name: "Visconti CANBOX Flex Fuel Kit for GR Corolla", url: "https://vtune.us", models: ["grc"] }, { name: "EcuTek tuning", url: "https://vtune.us", models: ["grc", "gr86"] }] } },
    css: `:root { --bg: #ffffff; --surface: #ffffff; --sunken: #f1f3f2; --ink: #000000; --muted: #555555; --line: #d9dedb; --accent: #b00000; --accent-ink: #ffffff; --accent-text: #b00000; --highlight: #fbe4e4;
        --go: #59756f; --go-ink: #ffffff; --go-edge: #47605b; --readout: #1a1a1a; --readout-ink: #ffffff; --brand: #b00000; --promo-bg: #59756f;
        --display: "Source Sans 3", "Helvetica Neue", sans-serif; --body: "PT Serif", Georgia, serif; }
      h1, h2 { text-transform: uppercase; letter-spacing: .03em; }
      .btn, .field, .seg, .tabs, .chip, input, select { font-family: var(--display); }
      body.signin { background: #ffffff; } body.signin #app { color: #000000; }
      body.signin .soft, body.signin #app > p { color: #555555 !important; } body.signin .powered { color: #555555; } body.signin .brandmark b { color: #000000; }
      body.signin .card { border: 1px solid #d9dedb; } body.signin .fine { color: #555555; }
      .brandbar img { height: 30px; } .signin .brandmark img, .brandmark img { height: 56px; }
      .promo .sep { background: #cbd5cc; }`,
  },
  delicious: {
    title: "Delicious Tuning", site: "https://www.delicioustuning.com",
    logo: "https://www.delicioustuning.com/sites/all/themes/theme687/logo.png",
    scheme: "dark",
    fonts: "family=Oswald:wght@400;500;600&family=Arimo:wght@400;600;700",
    partner: { ...base("Delicious Tuning", "Delicious Tuning"), id: "delicious", storageKey: "delicious",
      contact: { phone: "408-480-0995", website: "https://www.delicioustuning.com" },
      promo: { items: [{ name: "CAN Enabled Flex Fuel Kit V3 for GR Corolla", url: "https://www.delicioustuning.com", models: ["grc"] }, { name: "Stage 1 (91 oct) + Flex Fuel Complete Package", url: "https://www.delicioustuning.com", models: ["grc"] }, { name: "GR86 / BRZ CAN Flex Fuel Kit", url: "https://www.delicioustuning.com", models: ["gr86"] }] } },
    css: `:root { --bg: #0c1116; --surface: #161b21; --sunken: #20262d; --ink: #f0f0f0; --muted: #a2a6aa; --line: #2b3239; --dash: #3a424a; --accent: #e01020; --accent-ink: #ffffff; --accent-text: #ff5a66; --highlight: #3a1418;
        --go: #e01020; --go-ink: #ffffff; --go-edge: #e01020; --readout: #000000; --readout-ink: #ffffff; --readout-text: #f0f0f0; --brand: #e01020; --promo-bg: #000000;
        --good: #63cf96; --good-bg: #15301f; --warn: #f2a66c; --warn-bg: #382315; --danger: #ff7088; --danger-bg: #3c1520; --low: #8fb3ff; --high: #ff8a8a;
        --display: Oswald, "Arial Narrow", sans-serif; --body: Arimo, Arial, sans-serif; color-scheme: dark; }
      h1, h2, .btn.primary, .tabs span { text-transform: uppercase; letter-spacing: .04em; } h1 { font-weight: 500; }
      .brandbar img { height: 24px; } .signin .brandmark img, .brandmark img { height: 44px; }`,
  },
  e555: {
    title: "555 Engineering", site: "https://555engineer.com",
    logo: "https://www.555engineer.com/cdn/shop/files/Centered_555_Engineering.svg?v=1731027067",
    scheme: "light",
    fonts: "family=Archivo:wght@500;600;700&family=Questrial",
    partner: { ...base("555 Engineering", "555 Engineering"), id: "e555", storageKey: "e555",
      models: [{ id: "grc", name: "GR Corolla" }],
      contact: { website: "https://555engineer.com", info: "info@555engineer.com" },
      promo: { items: [{ name: "555 x CSG Flex Fuel Power Pack", url: "https://555engineer.com", models: ["grc"] }, { name: "GR Corolla track-tested parts", url: "https://555engineer.com", models: ["grc"] }] } },
    css: `:root { --bg: #eff0f5; --surface: #ffffff; --sunken: #e3e5ee; --ink: #0e1b4d; --muted: #4b557d; --line: #d5d8e6; --accent: #4770db; --accent-ink: #ffffff; --accent-text: #2f55b8; --highlight: #dfe7fb;
        --go: #0e1b4d; --go-ink: #ffffff; --go-edge: #0e1b4d; --readout: #010309; --readout-ink: #ffffff; --brand: #4770db; --promo-bg: #0e1b4d;
        --display: Archivo, "Segoe UI", sans-serif; --body: Questrial, "Segoe UI", sans-serif; }
      .btn { border-radius: 41px; } .stepper { border-radius: 41px; }
      .brandbar { background: #010309; margin: calc(-1 * max(14px, env(safe-area-inset-top, 0px))) -16px 0; padding: 8px 16px; border: 0; } .brandbar span { color: #c9cde0; }
      .brandbar img { height: 44px; margin-left: -14px; } .signin .brandmark img, .brandmark img { height: 92px; width: auto; margin: -16px 0 -18px 0; justify-self: start; }`,
  },
};
