// LIMIT+1 Flex Fuel: a branded version of GR Fuel Log, built as a concept to show LIMIT+1 (Crystal Lake, IL).
// Everything partner-specific lives here; the app itself is the shared ../app.js. Remove a block to drop that feature.
window.PARTNER = {
  id: "limitplus1",                 // matches public.partners.id: every account waits for the admin's approval
  name: "LIMIT+1 Flex Fuel",
  product: "Flex Fuel",            // shown beside the logo
  poweredBy: "Powered by Shady Acres LLC",
  concept: "A concept by Shady Acres LLC, made to show LIMIT+1 what the app could do for its customers. Not an official LIMIT+1 product.",
  tagline: "Exactly how much E85 to pump for your LIMIT+1 flex fuel kit and tune, a fill log that learns your station's real E85, and service reminders for your car.",
  logo: { light: "logo-black.png", dark: "logo-white.png", alt: "LIMIT+1" },
  storageKey: "lp1",                // its own sign-in on the phone, separate from GR Fuel Log's

  // Cars LIMIT+1 sells flex fuel kits and tunes for. The GR86 / BRZ uses Toyota's GR86 service schedule.
  models: [{ id: "grc", name: "GR Corolla" }, { id: "gr86", name: "GR86 / BRZ" }, { id: "supra", name: "GR Supra", soon: true }],

  // Package presets: a starting target and tune limit for each package. Placeholders until LIMIT+1's tuner
  // supplies the real numbers: the GR Corolla uses a known E50-limit flex tune; the GR86 uses the safest setting.
  // Delete this block (and packageLabel) to drop the step from setup.
  packageLabel: "Your LIMIT+1 package",
  packages: {
    grc: [{ id: "kit", name: "Flex fuel kit", target: 40, limit: 50 }, { id: "pp2", name: "Power Package 2", target: 40, limit: 50 }, { id: "pp3", name: "Power Package 3", target: 40, limit: 50 }],
    gr86: [{ id: "kit", name: "Flex fuel kit", target: 40, limit: 50, limitSure: false }, { id: "pp2", name: "Power Package 2", target: 40, limit: 50, limitSure: false }, { id: "pp3", name: "Power Package 3", target: 40, limit: 50, limitSure: false }],
  },

  // Asked at setup (optional): where the owner posts, for a shop that wants to see and share their builds.
  profile: { forumLabel: "Forum name" },

  // From limitplus1.com and LIMIT+1's own emails, Nov 2026.
  contact: {
    phone: "815-345-3035", phoneNote: "Call or text, Mon–Fri 9 am–5 pm Central",
    website: "https://limitplus1.com", contactForm: "https://limitplus1.com/pages/contact",
    support: "support@limitplus1.com", info: "info@limitplus1.com",
    address: "4500 Northwest Hwy, Suite 800, Crystal Lake, IL 60014",
    instagram: "https://www.instagram.com/limitplus1/", youtube: "https://www.youtube.com/@LIMITplus1",
  },

  // The scrolling bar above the bottom menu: the current sale first, then products that fit the owner's car.
  // A snapshot from LIMIT+1's Black Friday email of Nov 23, 2026 and its flex fuel and tuning products.
  // `ends` (an ISO time) turns on the countdown; the sale line hides itself after `until`.
  promo: {
    checked: "2026-11-23",
    sale: { title: "Black Friday sale is live", detail: "45+ brands on sale", url: "https://limitplus1.com/", ends: null, until: "2026-11-30" },
    items: [
      { name: "LIMIT+1 x Delicious Tuning GR Corolla Flex Fuel Kit", url: "https://limitplus1.com/products/limit-1-x-delicious-tuning-gr-corolla-flex-fuel-kit", models: ["grc"] },
      { name: "LIMIT+1 GR Corolla Exhaust System", url: "https://limitplus1.com/products/limit-1-gr-corolla-exhaust-system", models: ["grc"], sale: true },
      { name: "LIMIT+1 GR Corolla High Flow Downpipe + Midpipe", url: "https://limitplus1.com/products/limit-1-gr-corolla-high-flow-street-downpipe-w-epa-approved-gesi-cat", models: ["grc"], sale: true },
      { name: "LIMIT+1 GR Corolla Power Package 2", url: "https://limitplus1.com/products/limit-1-gr-corolla-power-package-2", models: ["grc"] },
      { name: "GR Corolla Tune Revision (Boosted Performance)", url: "https://limitplus1.com/products/limit-1-x-boosted-performance-tuning-tune-revision-for-exisiting-customers", models: ["grc"] },
      { name: "Billetworkz GR Corolla \"Fusion\" Shift Knob", url: "https://limitplus1.com/products/billetworkz-grcorolla-the-fusion-weighted-shift-knob", models: ["grc"], sale: true },
      { name: "MegaChip GR Corolla Carbon Chip Guards", url: "https://limitplus1.com/products/megachip-gr-corolla-carbon-fiber-guards", models: ["grc"], sale: true },
      { name: "SPL GR Corolla Rear Upper Camber Arms", url: "https://limitplus1.com/products/spl-gr-corolla-rear-upper-camber-arms", models: ["grc"], sale: true },
      { name: "APR GR Corolla Carbon Radiator Cooling Plate", url: "https://limitplus1.com/products/apr-performance-gr-corolla-carbon-fiber-radiator-cooling-plate", models: ["grc"], sale: true },
      { name: "Delicious Tuning GR86 / BRZ CAN Flex Fuel Kit V3", url: "https://limitplus1.com/products/delicious-tuning-gr86-brz-can-flexfuel-bluetooth-kit-for-ecutek", models: ["gr86"] },
      { name: "LIMIT+1 GR86 / BRZ High Flow Front Pipe", url: "https://limitplus1.com/products/limit-1-gr86-brz-midpipe", models: ["gr86"], sale: true },
      { name: "LIMIT+1 GR86 / BRZ Power Package 2", url: "https://limitplus1.com/products/limit-1-gr86-brz-power-package-2", models: ["gr86"] },
      { name: "GR86 / BRZ EcuTek Phone Flash Tune (Boosted Performance)", url: "https://limitplus1.com/products/limit-1-x-boosted-performance-tuning-gr86-ecutek-phone-flash-custom-tuning-1", models: ["gr86"] },
      { name: "Billetworkz GR86 / BRZ Short Shifter", url: "https://limitplus1.com/products/billetworkz-gr86-brz-short-shifter", models: ["gr86"], sale: true },
      { name: "MegaChip GR86 / BRZ Chip Guards", url: "https://limitplus1.com/products/gr86-megachip-low-profile-chip-guards", models: ["gr86"], sale: true },
      { name: "SPL GR86 / BRZ Rear Lower Camber Arms", url: "https://limitplus1.com/products/spl-rear-lower-camber-arms-gr86-fr-s-brz-gt86", models: ["gr86"], sale: true },
    ],
  },
};
