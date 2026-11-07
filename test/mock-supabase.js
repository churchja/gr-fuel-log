// Stand-in for supabase-js used only by the UI test.
(function () {
  const uid = "u-test";
  const db = {
    profiles: [{ id: uid, handle: null, status: "approved", is_admin: true, flagged: false, settings: {}, learn_since: null }],
    fills: [], oil_changes: [],
    car_model: [{ user_id: uid, bias: 1.5, bias_sd: 0.4, bias_basis: 20, dte_a: 0.95, dte_b: 20.4, dte_sd: 0.3, dte_n: 8, regional_value: 68, regional_sd: 4, accuracy_recent: 1.1, accuracy_n: 10, accuracy_by_month: [{ month: "2026-09", miss: 2.6, n: 3 }, { month: "2026-10", miss: 1.7, n: 4 }, { month: "2026-11", miss: 1.1, n: 3 }], recent: [] }],
    my_stations: [{ user_id: uid, station_key: "id:st-moto", display_name: "MotoMart · E Lloyd Expy", value: 66.2, sd: 1.8, n_mine: 9, n_total: 40, last_value: 64, last_date: "2026-10-30", switch_date: "2026-10-08", switch_from: 78.4, switch_to: 66.6 }],
    station_estimates: [{ station_key: "id:st-speedway", display_name: "Speedway · Main St", value: 72, sd: 3, n_fills: 14, n_owners: 4 }, { station_key: "id:st-moto", display_name: "MotoMart · E Lloyd Expy", value: 66.2, sd: 1.8, n_fills: 40, n_owners: 8 }],
  };
  window.__db = db; window.__calls = [];
  window.__known = [
    { id: "st-speedway", source: "custom", name: "Speedway · Main St", brand: "Speedway", street: "Main St", city: "Evansville", state: "IN", standardized: true, distance_m: 60, members: 4, mine: 0, added_by_you: true, can_rename: true, can_delete: true,
      fuels: [{ fuel: "E85", last_month: "2026-11", n: 14, price: 2.39, price_month: "2026-11" }, { fuel: "87 octane", last_month: "2026-11", n: 5, price: 2.89, price_month: "2026-11" }], e85: { value: 72, sd: 3, n: 14, last_month: "2026-11" } },
    { id: "st-moto", source: "osm", name: "MotoMart · E Lloyd Expy", brand: "MotoMart", street: "E Lloyd Expy", city: "Evansville", state: "IN", standardized: true, distance_m: 900, members: 8, mine: 9,
      fuels: [{ fuel: "E85", last_month: "2026-11", n: 40, price: 2.49, price_month: "2026-11" }, { fuel: "88 octane", last_month: "2026-10", n: 3, price: 2.99, price_month: "2026-10" }], e85: { value: 66.2, sd: 1.8, n: 40, last_month: "2026-10", switch_month: "2026-10", switch_from: 78, switch_to: 67 } },
    { id: "afdc-casey", source: "afdc", name: "Casey's · 2031 N Cross Pointe Blvd", brand: "Casey's", street: "2031 N Cross Pointe Blvd", city: "Evansville", state: "IN", standardized: true, distance_m: 6100, members: 1, mine: 0,
      fuels: [{ fuel: "87 octane", last_month: "2026-11", n: 1, price: 2.85, price_month: "2026-11" }], e85: null, listed: { e85: true, status: "E", blender: true, blends: ["E15"], hours: "4am-12am daily", confirmed: "2026-04" } },
  ];
  let listener = null, session = null;
  function q(table) {
    const st = { table, filters: [], op: "select", payload: null, single: false, maybe: false };
    const api = {
      select() { return api; }, order() { return api; }, eq(c, v) { st.filters.push([c, v]); return api; }, neq() { return api; },
      single() { st.single = true; return api; }, maybeSingle() { st.maybe = true; return api; },
      insert(row) { st.op = "insert"; st.payload = row; return api; }, update(p) { st.op = "update"; st.payload = p; return api; }, delete() { st.op = "delete"; return api; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    function match(r) { return st.filters.every(([c, v]) => r[c] === v); }
    function run() {
      window.__calls.push({ table, op: st.op, payload: st.payload });
      const rows = db[table];
      if (st.op === "insert") { const r = { id: "id" + Math.random().toString(36).slice(2, 8), user_id: uid, ...st.payload }; rows.push(r); return { data: r, error: null }; }
      if (st.op === "update") { rows.filter(match).forEach((r) => Object.assign(r, st.payload)); return { data: null, error: null }; }
      if (st.op === "delete") { db[table] = rows.filter((r) => !match(r)); return { data: null, error: null }; }
      const out = rows.filter(match).map((r) => JSON.parse(JSON.stringify(r)));
      return { data: st.single || st.maybe ? out[0] || null : out, error: null };
    }
    return api;
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (fn) => { listener = fn; setTimeout(() => fn("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithOtp: async (args) => { window.__calls.push({ otp: args }); return { error: null }; },
      verifyOtp: async ({ token }) => { if (token !== "123456") return { error: { message: "bad" } }; session = { user: { id: uid, email: "jason.a.church@shadyacres.my" } }; setTimeout(() => listener("SIGNED_IN", session), 0); return { error: null }; },
      signOut: async () => { session = null; listener("SIGNED_OUT", null); return { error: null }; },
    },
    from: q,
    // Like the real client, rpc() sends nothing until something awaits it or calls .then().
    rpc: (name, args) => ({ then: (ok, bad) => rpcRun(name, args).then(ok, bad) }),
  };
  async function rpcRun(name, args) {
      window.__calls.push({ rpc: name, args });
      if (name === "stations_known") return { data: window.__known };
      if (name === "stations_lookup") return { data: [{ id: "afdc-th83", source: "afdc", name: "Thorntons · 701 S Green River Rd", city: "Evansville", state: "IN", distance_m: 7400, standardized: true, known: false, e85_listed: true }] };
      if (name === "stations_at") return { data: [{ id: "osm-costco", name: "Costco Gasoline · 4500 N Green River Rd", brand: "Costco Gasoline", street: "4500 N Green River Rd", standardized: false, known: false, distance_m: 40 }] };
      if (name === "standardize_station" || name === "add_station") {
        const c = { id: args.p_id || "st-new", name: [args.p_brand, args.p_street].filter(Boolean).join(" · "), brand: args.p_brand, street: args.p_street, standardized: true, members: 0, mine: 0, fuels: [], e85: null, distance_m: 0 };
        window.__calls.push({ station: c.name }); return { data: c };
      }
      if (name === "delete_station") { window.__known = window.__known.filter((k) => k.id !== args.p_id); return { data: { deleted: true, fills_unlinked: 1 } }; }
      if (name === "station_detail") return { data: { card: window.__known.find((k) => k.id === args.p_id), prices: [{ fuel: "E85", month: "2026-09", price: 2.39, n: 4 }, { fuel: "E85", month: "2026-10", price: 2.45, n: 6 }, { fuel: "E85", month: "2026-11", price: 2.49, n: 3 }, { fuel: "93 octane", month: "2026-10", price: 3.29, n: 5 }, { fuel: "93 octane", month: "2026-11", price: 3.25, n: 2 }] } };
      if (name === "receipt_quota") return { data: { used_today: 1, daily_limit: 6, month_used: 38, month_cap: 1000 } };
      if (name === "community_stats") return { data: { owners: 12, stations: [{ name: "MotoMart E Lloyd", value: 66, sd: 2, n: 31, owners: 8, switch_date: "2026-10-08", switch_from: 78, switch_to: 66 }], blends: [{ label: "E35 to E44", cpm: 0.136, mpg: 24.3, n: 41 }], grades: [{ grade: "93", cpm: 0.137, n: 30 }, { grade: "87", cpm: 0.129, n: 12 }], on_target: 78 } };
      if (name === "admin_overview") return { data: { config: { pace_per_hour: 5, pace_per_day: 15, hold_all: false, claude_daily_per_user: 6, claude_monthly_cap: 1000, admin_email: "jason.a.church@shadyacres.my", mail_from: "GR Fuel Log <fuel@shadyacres.my>" },
        held: [{ id: "u-held", handle: "mr_grc", email: "m@mailinator.com", created_at: "2026-11-06T20:14:00Z", reason: "throwaway email address" }], flagged: [],
        log: [{ email: "m@mailinator.com", decision: "held", reason: "throwaway email address", created_at: "2026-11-06T20:14:00Z" }, { email: "d@gmail.com", decision: "approved", reason: "verified email, normal pace", created_at: "2026-11-04T19:41:00Z" }],
        alerts: [{ kind: "signup_held", message: "Sign-up held: m@mailinator.com (throwaway email address).", created_at: "2026-11-06T20:14:00Z", emailed_at: "2026-11-06T20:14:05Z" }], owners: 12, joined_month: 3, month_reads: 38 } };
      return { data: null, error: null };
  }
  Object.assign(client, {
    functions: { invoke: async (name, { body }) => { if (name === "stations") { window.__calls.push({ fn: name }); return { data: { ok: true, synced: 0 }, error: null }; } window.__calls.push({ fn: name, bytes: body.image.length }); return { data: { ok: true, receipt: { station: "COSTCO WHOLESALE", fuel: "gas", octane: 93, gallons: 5.1, price_per_gallon: 3.299, total: 16.82, date: "2026-11-05" } }, error: null }; } },
  });
  window.supabase = { createClient: () => client };
})();
