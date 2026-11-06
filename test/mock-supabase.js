// Stand-in for supabase-js used only by the UI test.
(function () {
  const uid = "u-test";
  const db = {
    profiles: [{ id: uid, handle: null, status: "approved", is_admin: true, flagged: false, settings: {}, learn_since: null }],
    fills: [], oil_changes: [],
    car_model: [{ user_id: uid, bias: 1.5, bias_sd: 0.4, bias_basis: 20, dte_a: 0.95, dte_b: 20.4, dte_sd: 0.3, dte_n: 8, regional_value: 68, regional_sd: 4, accuracy_recent: 1.1, accuracy_n: 10, accuracy_by_month: [{ month: "2026-09", miss: 2.6, n: 3 }, { month: "2026-10", miss: 1.7, n: 4 }, { month: "2026-11", miss: 1.1, n: 3 }], recent: [] }],
    my_stations: [{ user_id: uid, station_key: "motomart e lloyd", display_name: "MotoMart E Lloyd", value: 66.2, sd: 1.8, n_mine: 9, n_total: 40, last_value: 64, last_date: "2026-10-30", switch_date: "2026-10-08", switch_from: 78.4, switch_to: 66.6 }],
    station_estimates: [{ station_key: "motomart e lloyd", display_name: "MotoMart E Lloyd", value: 66.2, sd: 1.8, n_fills: 40, n_owners: 8 }],
  };
  window.__db = db; window.__calls = [];
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
    rpc: async (name, args) => {
      window.__calls.push({ rpc: name, args });
      if (name === "receipt_quota") return { data: { used_today: 1, daily_limit: 6, month_used: 38, month_cap: 1000 } };
      if (name === "community_stats") return { data: { owners: 12, stations: [{ name: "MotoMart E Lloyd", value: 66, sd: 2, n: 31, owners: 8, switch_date: "2026-10-08", switch_from: 78, switch_to: 66 }], blends: [{ label: "E35 to E44", cpm: 0.136, mpg: 24.3, n: 41 }], grades: [{ grade: "93", cpm: 0.137, n: 30 }, { grade: "87", cpm: 0.129, n: 12 }], on_target: 78 } };
      if (name === "admin_overview") return { data: { config: { pace_per_hour: 5, pace_per_day: 15, hold_all: false, claude_daily_per_user: 6, claude_monthly_cap: 1000, admin_email: "jason.a.church@shadyacres.my", mail_from: "GR Fuel Log <fuel@shadyacres.my>" },
        held: [{ id: "u-held", handle: "mr_grc", email: "m@mailinator.com", created_at: "2026-11-06T20:14:00Z", reason: "throwaway email address" }], flagged: [],
        log: [{ email: "m@mailinator.com", decision: "held", reason: "throwaway email address", created_at: "2026-11-06T20:14:00Z" }, { email: "d@gmail.com", decision: "approved", reason: "verified email, normal pace", created_at: "2026-11-04T19:41:00Z" }],
        alerts: [{ kind: "signup_held", message: "Sign-up held: m@mailinator.com (throwaway email address).", created_at: "2026-11-06T20:14:00Z", emailed_at: "2026-11-06T20:14:05Z" }], owners: 12, joined_month: 3, month_reads: 38 } };
      return { data: null, error: null };
    },
    functions: { invoke: async (name, { body }) => { window.__calls.push({ fn: name, bytes: body.image.length }); return { data: { ok: true, receipt: { station: "COSTCO WHOLESALE", fuel: "gas", octane: 93, gallons: 5.1, price_per_gallon: 3.299, total: 16.82, date: "2026-11-05" } }, error: null }; } },
  };
  window.supabase = { createClient: () => client };
})();
