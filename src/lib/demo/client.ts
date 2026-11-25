/* eslint-disable @typescript-eslint/no-explicit-any */
// Demo-Datenbank: ersetzt den Supabase-Client im Browser.
// Versteht die Teile der Supabase-API, die die App nutzt (from/select/insert/update/delete, Filter,
// Verknüpfungen wie profiles:user_id(...), rpc, auth, storage, realtime). Alles bleibt im Speicher,
// beim Neuladen beginnt die Demo wieder von vorn.

import { createSeed, DEMO_USER_ID, type DemoDb } from './seed';

type Row = Record<string, any>;
type Result = { data: any; error: any; count?: number | null; status?: number };

let db: DemoDb = {};

const uuid = () =>
  (globalThis.crypto?.randomUUID?.() as string | undefined) ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const clone = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));
const table = (name: string): Row[] => (db[name] ||= []);

// Primärschlüssel je Tabelle (für upsert)
const KEYS: Record<string, string[]> = {
  courtage_payouts: ['entry_id', 'year'],
  contract_followups: ['entry_id', 'due_date'],
  reception_rules: ['weekday'],
  reception_overrides: ['day'],
  production_lv_snapshots: ['user_id', 'month'],
  vacation_carryover: ['user_id', 'year'],
  calendar_tokens: ['user_id'],
};
const keyOf = (t: string) => KEYS[t] || ['id'];

// Ohne Alias zeigt "profiles(...)" je Tabelle auf diese Spalte
const BARE_PROFILE_FK: Record<string, string> = { polls: 'created_by' };
const singular = (t: string) => (t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.replace(/s$/, ''));

/* ------------------------------------------------------------------ */
/* select-Ausdruck mit Verknüpfungen auswerten                          */
/* ------------------------------------------------------------------ */

type Field = { kind: 'col'; name: string } | { kind: 'all' } | { kind: 'embed'; alias: string; target: string; fields: Field[] };

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseSelect(s: string | undefined): Field[] {
  if (!s || s.trim() === '*') return [{ kind: 'all' }];
  return splitTop(s.replace(/\s+/g, ' ')).map((part): Field => {
    const m = part.match(/^([\w]+)(?:\s*:\s*([\w]+))?(?:!\w+)?\s*\((.*)\)$/s);
    if (m) {
      const alias = m[1];
      const target = m[2] || m[1];
      return { kind: 'embed', alias, target, fields: parseSelect(m[3]) };
    }
    if (part === '*') return { kind: 'all' };
    return { kind: 'col', name: part.split(':')[0].trim() };
  });
}

function project(tableName: string, row: Row, fields: Field[]): Row {
  const out: Row = {};
  for (const f of fields) {
    if (f.kind === 'all') Object.assign(out, row);
    else if (f.kind === 'col') out[f.name] = row[f.name] ?? null;
    else {
      const isTable = !!db[f.target] && f.target !== 'profiles';
      if (isTable) {
        // eins-zu-viele: Kindzeilen, die auf diese Zeile zeigen
        const fk = `${singular(tableName)}_id`;
        out[f.alias] = table(f.target).filter((c) => c[fk] === row.id).map((c) => project(f.target, c, f.fields));
      } else {
        // viele-zu-eins auf profiles
        const col = f.target === 'profiles' ? BARE_PROFILE_FK[tableName] || 'user_id' : f.target;
        const p = table('profiles').find((x) => x.id === row[col]);
        out[f.alias] = p ? project('profiles', p, f.fields) : null;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Filter                                                              */
/* ------------------------------------------------------------------ */

type Pred = (r: Row) => boolean;

const norm = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : v);
const cmp = (a: any, b: any) => {
  if (a == null || b == null) return NaN;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b);
  return String(norm(a)).localeCompare(String(norm(b)));
};

function opPred(col: string, op: string, val: any): Pred {
  const get = (r: Row) => r[col];
  switch (op) {
    case 'eq': return (r) => String(get(r)) === String(val) && get(r) != null;
    case 'neq': return (r) => get(r) == null || String(get(r)) !== String(val);
    case 'gt': return (r) => cmp(get(r), val) > 0;
    case 'gte': return (r) => cmp(get(r), val) >= 0;
    case 'lt': return (r) => cmp(get(r), val) < 0;
    case 'lte': return (r) => cmp(get(r), val) <= 0;
    case 'is': return (r) => (val === null || val === 'null' ? get(r) == null : get(r) === (val === 'true' || val === true));
    case 'in': {
      const list = Array.isArray(val) ? val : String(val).replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      return (r) => list.map(String).includes(String(get(r)));
    }
    case 'ilike': {
      const re = new RegExp('^' + String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i');
      return (r) => re.test(String(get(r) ?? ''));
    }
    case 'cs': return (r) => (Array.isArray(val) ? val : [val]).every((v) => (get(r) || []).includes(v));
    default: return () => true;
  }
}

function parseOr(expr: string): Pred {
  const parts = splitTop(expr);
  const preds = parts.map((p) => {
    const [col, op, ...rest] = p.split('.');
    return opPred(col, op, rest.join('.'));
  });
  return (r) => preds.some((f) => f(r));
}

/* ------------------------------------------------------------------ */
/* Abfrage                                                             */
/* ------------------------------------------------------------------ */

class Query implements PromiseLike<Result> {
  private preds: Pred[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private fields: Field[] = [{ kind: 'all' }];
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private returning = false;
  private singleMode: 'one' | 'maybe' | null = null;
  private countMode = false;
  private head = false;
  private source: () => Row[];

  constructor(private name: string, source?: () => Row[]) {
    this.source = source || (() => table(name));
  }

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    this.fields = parseSelect(cols);
    if (this.mode !== 'select') this.returning = true;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(v: any) { this.mode = 'insert'; this.payload = v; return this; }
  upsert(v: any) { this.mode = 'upsert'; this.payload = v; return this; }
  update(v: any) { this.mode = 'update'; this.payload = v; return this; }
  delete() { this.mode = 'delete'; return this; }

  eq(c: string, v: any) { this.preds.push(opPred(c, 'eq', v)); return this; }
  neq(c: string, v: any) { this.preds.push(opPred(c, 'neq', v)); return this; }
  gt(c: string, v: any) { this.preds.push(opPred(c, 'gt', v)); return this; }
  gte(c: string, v: any) { this.preds.push(opPred(c, 'gte', v)); return this; }
  lt(c: string, v: any) { this.preds.push(opPred(c, 'lt', v)); return this; }
  lte(c: string, v: any) { this.preds.push(opPred(c, 'lte', v)); return this; }
  in(c: string, v: any[]) { this.preds.push(opPred(c, 'in', v)); return this; }
  is(c: string, v: any) { this.preds.push(opPred(c, 'is', v)); return this; }
  ilike(c: string, v: string) { this.preds.push(opPred(c, 'ilike', v)); return this; }
  like(c: string, v: string) { this.preds.push(opPred(c, 'ilike', v)); return this; }
  contains(c: string, v: any) { this.preds.push(opPred(c, 'cs', v)); return this; }
  match(o: Row) { Object.entries(o).forEach(([c, v]) => this.eq(c, v)); return this; }
  filter(c: string, op: string, v: any) { this.preds.push(opPred(c, op, v)); return this; }
  not(c: string, op: string, v: any) { const p = opPred(c, op, v); this.preds.push((r) => !p(r)); return this; }
  or(expr: string) { this.preds.push(parseOr(expr)); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(from: number, to: number) { this.lim = to + 1; void from; return this; }
  returns() { return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'one'; return this; }

  private match_(r: Row) { return this.preds.every((p) => p(r)); }

  private run(): Result {
    const t = this.name;
    const rows = this.source();
    let affected: Row[] = [];

    if (this.mode === 'insert' || this.mode === 'upsert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((v: Row) => ({ ...v }));
      for (const v of list) {
        if (keyOf(t).includes('id') && !v.id) v.id = uuid();
        if (!('created_at' in v)) v.created_at = new Date().toISOString();
        if (t === 'absences') applyAbsenceRules(v);
        if (t === 'production_entries') linkCustomer(v);
        // Wie die berechnete Spalte in der Datenbank
        if (t === 'customers') v.name_key = nameKey(v.last_name, v.first_name);
        const key = keyOf(t);
        const existing = rows.find((r) => key.every((k) => String(r[k]) === String(v[k])));
        if (existing) {
          if (this.mode === 'insert') return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          Object.assign(existing, v);
          affected.push(existing);
        } else {
          rows.push(v);
          affected.push(v);
        }
      }
    } else if (this.mode === 'update') {
      affected = rows.filter((r) => this.match_(r));
      affected.forEach((r) => {
        const before = { name: r.customer_name, first: r.customer_firstname };
        Object.assign(r, this.payload);
        if (t === 'absences') applyAbsenceRules(r);
        if (t === 'production_entries' && (before.name !== r.customer_name || before.first !== r.customer_firstname)) {
          r.customer_id = null;
          linkCustomer(r);
        }
        if (t === 'customers') {
          table('production_entries').filter((e) => e.customer_id === r.id).forEach((e) => { e.customer_name = r.last_name; e.customer_firstname = r.first_name; });
        }
      });
    } else if (this.mode === 'delete') {
      affected = rows.filter((r) => this.match_(r));
      const keep = rows.filter((r) => !affected.includes(r));
      rows.length = 0;
      rows.push(...keep);
    } else {
      affected = rows.filter((r) => this.match_(r));
    }

    if (this.mode !== 'select' && !this.returning) return { data: null, error: null, status: 204 };

    let out = [...affected];
    for (const o of [...this.orders].reverse()) {
      out.sort((a, b) => {
        const x = a[o.col], y = b[o.col];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        const c = cmp(x, y);
        return o.asc ? c : -c;
      });
    }
    const count = out.length;
    if (this.lim != null) out = out.slice(0, this.lim);
    if (this.head) return { data: null, error: null, count };
    const data = clone(out.map((r) => project(t, r, this.fields)));
    if (this.singleMode) {
      if (data.length === 0) return this.singleMode === 'maybe' ? { data: null, error: null } : { data: null, error: { message: 'Keine Zeile gefunden', code: 'PGRST116' } };
      return { data: data[0], error: null };
    }
    return { data, error: null, count: this.countMode ? count : null };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    let res: Result;
    try {
      res = this.run();
    } catch (e) {
      res = { data: null, error: { message: (e as Error).message } };
    }
    return Promise.resolve(res).then(ok, fail);
  }
}

/** Wie die Datenbank-Trigger: Admin-Einträge sind genehmigt, Entscheidungen werden protokolliert. */
function applyAbsenceRules(r: Row) {
  if (r.status === 'approved' || r.status === 'rejected') {
    r.approved_by ||= DEMO_USER_ID;
    r.approved_at ||= new Date().toISOString();
  }
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

const demoUser = () => {
  const p = table('profiles').find((x) => x.id === DEMO_USER_ID)!;
  return {
    id: DEMO_USER_ID,
    email: p.email,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: { full_name: p.full_name },
    created_at: p.created_at,
  };
};
const session = () => ({ access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, user: demoUser() });

const noop = () => {};
const channel = () => {
  const ch: any = { on: () => ch, subscribe: (cb?: (s: string) => void) => { cb?.('SUBSCRIBED'); return ch; }, unsubscribe: async () => 'ok', send: async () => 'ok' };
  return ch;
};

// Wie der Datenbank-Trigger: Vertrag ohne Kunde bekommt einen passenden oder neuen Kunden
const nameKey = (last?: string | null, first?: string | null) => `${(last || '').trim().toLowerCase()}|${(first || '').trim().toLowerCase()}`;
function linkCustomer(e: Row) {
  if (e.customer_id || !e.customer_name?.trim()) return;
  const k = nameKey(e.customer_name, e.customer_firstname);
  let c = table('customers').find((x) => nameKey(x.last_name, x.first_name) === k);
  if (!c) {
    c = { id: uuid(), created_at: new Date().toISOString(), created_by: DEMO_USER_ID, last_name: e.customer_name.trim(), first_name: e.customer_firstname?.trim() || null, birth_date: null, phone: null, email: null, address: null, household: null, notes: null };
    table('customers').push(c);
  }
  e.customer_id = c.id;
}

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export const createDemoClient = (): any => {
  db = createSeed();
  return {
  from: (name: string) => new Query(name),
  rpc: (fn: string, args?: Row) => {
    if (fn === 'team_absences') return new Query('absences');
    if (fn === 'merge_customers') {
      const keep = table('customers').find((x) => x.id === args?.p_keep);
      const drop = table('customers').find((x) => x.id === args?.p_drop);
      if (keep && drop && keep !== drop) {
        for (const f of ['birth_date', 'phone', 'email', 'address', 'household', 'notes']) keep[f] = keep[f] ?? drop[f];
        table('production_entries').filter((e) => e.customer_id === drop.id).forEach((e) => { e.customer_id = keep.id; e.customer_name = keep.last_name; e.customer_firstname = keep.first_name; });
        table('callbacks').filter((c) => c.customer_id === drop.id).forEach((c) => { c.customer_id = keep.id; });
        table('customer_contracts').filter((c) => c.customer_id === drop.id).forEach((c) => { c.customer_id = keep.id; });
        db.customers = table('customers').filter((x) => x !== drop);
      }
      return Promise.resolve({ data: null, error: null });
    }
    if (fn === 'merge_products') {
      const keep = table('insurance_products').find((x) => x.id === args?.p_keep);
      const drop = table('insurance_products').find((x) => x.id === args?.p_drop);
      if (keep && drop && keep !== drop) {
        table('production_entries').filter((e) => e.sub_category === drop.name).forEach((e) => { e.sub_category = keep.name; e.category = keep.area; });
        table('customer_contracts').filter((e) => e.sub_category === drop.name).forEach((e) => { e.sub_category = keep.name; e.category = keep.area; });
        table('leads').filter((l) => l.product === drop.name).forEach((l) => { l.product = keep.name; });
        keep.aliases = [keep.aliases, drop.name, drop.aliases].filter(Boolean).join(' ');
        db.insurance_products = table('insurance_products').filter((x) => x !== drop);
      }
      return Promise.resolve({ data: null, error: null });
    }
    if (fn === 'product_usage') {
      const data = table('insurance_products').map((p) => ({
        name: p.name,
        entries: table('production_entries').filter((e) => e.sub_category === p.name).length,
        contracts: table('customer_contracts').filter((e) => e.sub_category === p.name).length,
        leads: table('leads').filter((l) => l.product === p.name).length,
      }));
      return Promise.resolve({ data, error: null });
    }
    if (fn === 'get_my_webhook_secret') return Promise.resolve({ data: 'demo-geheimnis', error: null });
    if (fn === 'respond_reception_swap') {
      const s = table('reception_swaps').find((x) => x.id === args?.p_swap_id);
      if (s) {
        s.status = args?.p_accept ? 'accepted' : 'declined';
        s.responded_at = new Date().toISOString();
        if (args?.p_accept) {
          const to = table('profiles').find((p) => p.id === s.to_user);
          table('reception_overrides').push({ day: s.day, person: to?.full_name?.split(' ')[0] || 'Vertretung', user_id: s.to_user, note: 'Getauscht', created_by: DEMO_USER_ID, created_at: new Date().toISOString() });
        }
      }
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  },
  channel,
  removeChannel: async () => 'ok',
  removeAllChannels: async () => [],
  auth: {
    getSession: async () => ({ data: { session: session() }, error: null }),
    getUser: async () => ({ data: { user: demoUser() }, error: null }),
    onAuthStateChange: (cb: (e: string, s: any) => void) => {
      setTimeout(() => cb('SIGNED_IN', session()), 0);
      return { data: { subscription: { unsubscribe: noop } } };
    },
    signInWithPassword: async () => ({ data: { session: session(), user: demoUser() }, error: null }),
    signUp: async () => ({ data: { user: null, session: null }, error: { message: 'In der Demo kann kein Konto angelegt werden.' } }),
    // Abmelden geht in der Demo nicht: nach dem Neuladen ist man wieder drin
    signOut: async () => {
      window.location.assign('/');
      return { error: null };
    },
    updateUser: async () => ({ data: { user: demoUser() }, error: null }),
    resetPasswordForEmail: async () => ({ data: null, error: null }),
    mfa: {
      // Fehler heißt für die App: 2FA nicht prüfen, einfach weiter
      listFactors: async () => ({ data: null, error: { message: 'Demo' } }),
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }),
      enroll: async () => ({ data: null, error: { message: 'In der Demo nicht verfügbar.' } }),
      challengeAndVerify: async () => ({ data: null, error: null }),
      unenroll: async () => ({ data: null, error: null }),
    },
  },
  storage: {
    from: () => ({
      upload: async (path: string) => ({ data: { path }, error: null }),
      remove: async () => ({ data: [], error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: PIXEL }, error: null }),
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: PIXEL })), error: null }),
      getPublicUrl: () => ({ data: { publicUrl: PIXEL } }),
      download: async () => ({ data: new Blob(), error: null }),
    }),
  },
  functions: { invoke: async () => ({ data: null, error: { message: 'In der Demo nicht verfügbar.' } }) },
};
};
