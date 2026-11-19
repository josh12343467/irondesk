// Security tests for the Supabase migration, run against PGlite with a stubbed auth schema.
//   npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const db = new PGlite();

let passed = 0;
let failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && extra ? `  →  ${extra}` : ''}`);
};

/** Run SQL as a given user (null = anonymous), the way PostgREST does: role + JWT claims, in a transaction. */
async function as(sub, sql, params = [], aal = 'aal1') {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${sub ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role: 'authenticated', aal } : {})]);
    return tx.query(sql, params);
  });
}
/** Same, but returns the error message instead of throwing. */
async function tryAs(sub, sql, params = [], aal) {
  try {
    const r = await as(sub, sql, params, aal);
    return { rows: r.rows, affected: r.affectedRows ?? 0, error: null };
  } catch (e) {
    return { rows: [], affected: 0, error: String(e.message || e) };
  }
}
const one = async (sub, sql, params, aal) => (await as(sub, sql, params, aal)).rows[0];
const count = async (sub, table) => Number((await one(sub, `select count(*)::int as n from public.${table}`)).n);

/* ---------- setup ---------- */
await db.exec(readFileSync(join(here, 'stub-supabase.sql'), 'utf8'));
for (const f of readdirSync(migrationsDir).sort()) await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
console.log('Migration applied.\n');

const user = async (email, confirmed = true) =>
  (await db.query(`insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id`, [email, confirmed ? new Date() : null])).rows[0].id;

const ADMIN = await user('owner@example.com');
const STAFF = await user('desk@example.com');
const MEMBER = await user('juan@example.com');
const OTHER = await user('maria@example.com');
const STRANGER = await user('stranger@example.com');
await db.query(`insert into public.staff (user_id, email, name, role) values ($1,'owner@example.com','Owner Ramon','admin'), ($2,'desk@example.com','Desk Joy','staff')`, [ADMIN, STAFF]);
const PLAN = (await db.query(`insert into public.plans (name, duration_days, price) values ('Monthly', 30, 1200) returning id`)).rows[0].id;
const TRAINER = (await db.query(`insert into public.trainers (name) values ('Coach Migs') returning id`)).rows[0].id;
const today = (await db.query(`select public.ph_today()::text as d`)).rows[0].d;
// a session date 1–7 days ahead and its weekday
const future = new Date(today + 'T00:00:00Z');
future.setUTCDate(future.getUTCDate() + 2);
const SESSION = future.toISOString().slice(0, 10);
const CLASS = (await db.query(`insert into public.classes (name, trainer_id, weekday, start_time, duration_min, capacity) values ('HIIT', $1, $2, '18:00', 45, 2) returning id`, [TRAINER, future.getUTCDay()])).rows[0].id;

const register = (sub, email, birth = '1995-05-05', guardian = null, answers = '{f,f,f,f,f,f,f}', clearance = false) =>
  tryAs(sub, `select public.register_member($1, $2, $3, '', $4, 'Cash', 170, $5::date, $6, $7::boolean[], $8, false, '2026-11-19') as id`,
    ['Juan Dela Cruz', '09171234567', email, PLAN, birth, guardian, answers, clearance]);

/* ---------- registration ---------- */
console.log('Registration');
const reg = await register(STAFF, 'juan@example.com');
ok(!reg.error && reg.rows[0]?.id, 'staff can register a member', reg.error);
const M1 = reg.rows[0]?.id;
const linked = (await db.query(`select user_id from public.members where id = $1`, [M1])).rows[0];
ok(linked?.user_id === MEMBER, 'member is linked to the verified auth account with the same email');
ok((await register(MEMBER, 'x1@example.com')).error?.includes('not allowed'), 'a member cannot register members');
ok((await register(null, 'x2@example.com')).error !== null, 'anonymous cannot register members');
ok((await register(STAFF, 'kid@example.com', '2014-01-01', null)).error?.includes('guardian'), 'minor without guardian is rejected');
ok((await register(STAFF, 'kid2@example.com', '2018-01-01', 'Parent')).error?.includes('12'), 'under-12 is rejected');
ok((await register(STAFF, 'sick@example.com', '1990-01-01', null, '{t,f,f,f,f,f,f}', false)).error?.includes('clearance'), 'health flag without clearance acknowledgement is rejected');
const dup = await tryAs(STAFF, `select public.register_member('Juan Two', '0917 123 4567', 'juan2@example.com', '', $1, 'Cash', null, '1990-01-01', null, '{f,f,f,f,f,f,f}', false, false, 'v')`, [PLAN]);
ok(dup.error?.includes('duplicate') || dup.error?.includes('unique'), 'duplicate mobile number is rejected', dup.error);
const r2 = await tryAs(STAFF, `select public.register_member('Maria Santos', '09181112222', 'maria@example.com', '', $1, 'GCash', 160, '1992-02-02', null, '{f,t,f,f,f,f,f}', true, true, 'v') as id`, [PLAN]);
const M2 = r2.rows[0]?.id;
ok(!!M2, 'second member registered (with a health flag + clearance)', r2.error);

/* ---------- reading: who sees what ---------- */
console.log('\nRead access');
ok((await count(MEMBER, 'members')) === 1, 'member sees only their own member row');
ok((await count(STAFF, 'members')) === 2, 'staff see all members');
ok((await count(STRANGER, 'members')) === 0, 'a signed-in stranger sees no members');
ok((await tryAs(null, `select * from public.members`)).error !== null, 'anonymous cannot read members');
ok((await tryAs(null, `select gym_name from public.settings`)).rows.length === 1, 'anonymous can read public settings (login screen)');
ok((await count(MEMBER, 'payments')) === 1, 'member sees only their own payments');
ok((await count(STAFF, 'health_declarations')) === 0, 'staff cannot read health answers');
ok((await count(ADMIN, 'health_declarations')) === 2, 'admin can read health answers');
ok((await count(MEMBER, 'health_declarations')) === 1, 'member can read their own health answers');
ok((await count(MEMBER, 'consents')) === 4, 'member sees their own 4 consent records');
ok((await count(STAFF, 'activity_log')) === 0, 'staff cannot read the audit log');
ok((await count(ADMIN, 'activity_log')) > 0, 'admin can read the audit log');
ok((await count(STAFF, 'staff')) === 1, 'staff only see their own staff row');
ok((await count(ADMIN, 'staff')) === 2, 'admin sees all staff');

/* ---------- writing: direct table access is locked down ---------- */
console.log('\nWrite protection');
ok((await tryAs(MEMBER, `insert into public.payments (member_id,label,plan_name,amount,method,kind,received_by) values ($1,'x','x',0,'Cash','new','x')`, [M1])).error !== null, 'member cannot insert payments directly');
ok((await tryAs(STAFF, `insert into public.payments (member_id,label,plan_name,amount,method,kind,received_by) values ($1,'x','x',0,'Cash','new','x')`, [M1])).error !== null, 'staff cannot insert payments directly (only via operations)');
const delPay = await tryAs(ADMIN, `delete from public.payments`);
ok(delPay.affected === 0 && (await db.query(`select count(*)::int n from public.payments`)).rows[0].n === 2, 'payments cannot be deleted, even by admin');
ok((await tryAs(MEMBER, `update public.members set name = 'Hacked' where id = $1`, [M1])).affected === 0, 'member cannot update their record directly');
ok((await tryAs(STAFF, `update public.members set user_id = $2 where id = $1`, [M1, STRANGER])).error?.includes('permission'), 'staff cannot re-link a member to another login');
ok((await tryAs(STAFF, `update public.members set expiry_date = '2099-01-01' where id = $1`, [M1])).error?.includes('permission'), 'staff cannot edit expiry dates directly');
ok((await tryAs(STAFF, `update public.members set notes = 'Prefers mornings' where id = $1`, [M1])).affected === 1, 'staff can edit profile fields');
ok((await tryAs(STAFF, `insert into public.activity_log (actor_name, action, summary) values ('x','x','fake')`)).error !== null, 'nobody can write fake audit entries');
ok((await tryAs(ADMIN, `delete from public.activity_log`)).affected === 0, 'audit log cannot be deleted directly');
ok((await tryAs(STAFF, `insert into public.plans (name, duration_days, price) values ('Free', 365, 0)`)).error !== null, 'staff cannot create plans');
ok((await tryAs(ADMIN, `insert into public.plans (name, duration_days, price) values ('Quarterly', 90, 3200)`)).error === null, 'admin can create plans');
const planLog = (await db.query(`select actor_name, summary from public.activity_log where action = 'insert:plans' order by id desc limit 1`)).rows[0];
ok(planLog?.summary === 'Created plan Quarterly (90 days · ₱3200)' && planLog?.actor_name === 'Owner Ramon', 'audit log reads "Created plan …" and names the admin', JSON.stringify(planLog));
await tryAs(ADMIN, `insert into public.classes (name, trainer_id, weekday, start_time, duration_min, capacity) values ('Spin', $1, 1, '07:00', 45, 10)`, [TRAINER]);
const classLog = (await db.query(`select summary from public.activity_log where action = 'insert:classes' order by id desc limit 1`)).rows[0];
ok(classLog?.summary === 'Created class Spin', 'class entries say "class", not "classe"', JSON.stringify(classLog));
ok((await tryAs(STAFF, `update public.settings set walk_in_price = 0`)).affected === 0, 'staff cannot change settings');
ok((await tryAs(MEMBER, `select public.renew_membership($1, $2, 'Cash')`, [M1, PLAN])).error?.includes('not allowed'), 'member cannot renew themselves');
ok((await tryAs(MEMBER, `select public.check_in_member($1)`, [M1])).error?.includes('not allowed'), 'member cannot check themselves in');
ok((await tryAs(MEMBER, `insert into public.measurements (member_id, measured_on, weight_kg) values ($1, $2, 70)`, [M2, today])).error !== null, "member cannot log weigh-ins for someone else");
ok((await tryAs(MEMBER, `insert into public.measurements (member_id, measured_on, weight_kg) values ($1, $2, 70)`, [M1, today])).error === null, 'member can log their own weigh-in');
ok((await tryAs(MEMBER, `insert into public.measurements (member_id, measured_on, weight_kg) values ($1, '2099-01-01', 70)`, [M1])).error !== null, 'weigh-ins in the future are rejected');

/* ---------- business rules ---------- */
console.log('\nBusiness rules');
ok((await one(STAFF, `select public.check_in_member($1, 'qr') as r`, [M1])).r === 'ok', 'staff can check a member in');
ok((await one(STAFF, `select public.check_in_member($1) as r`, [M1])).r === 'duplicate', 'second check-in on the same day is refused');
await db.query(`update public.members set expiry_date = public.ph_today() - 1 where id = $1`, [M2]);
ok((await one(STAFF, `select public.check_in_member($1) as r`, [M2])).r === 'expired', 'expired member is refused at check-in');
const renewed = await one(STAFF, `select public.renew_membership($1, $2, 'Cash')::text as d`, [M2, PLAN]);
const expected = (await db.query(`select (public.ph_today() + 30)::text as d`)).rows[0].d;
ok(renewed.d === expected, 'renewing an expired member restarts from today', `${renewed.d} vs ${expected}`);
ok((await one(MEMBER, `select public.book_class($1, $2, $3) as r`, [CLASS, M1, SESSION])).r === 'ok', 'member can book a class for themselves');
ok((await one(MEMBER, `select public.book_class($1, $2, $3) as r`, [CLASS, M1, SESSION])).r === 'duplicate', 'double booking is refused');
ok((await one(MEMBER, `select public.book_class($1, $2, $3) as r`, [CLASS, M2, SESSION])).r === 'denied', "member cannot book on someone else's behalf");
ok((await one(MEMBER, `select public.book_class($1, $2, $3) as r`, [CLASS, M1, today === SESSION ? '2000-01-01' : today])).r === 'denied', 'booking on the wrong weekday or a past date is refused');
ok((await one(STAFF, `select public.book_class($1, $2, $3) as r`, [CLASS, M2, SESSION])).r === 'ok', 'staff can book for any member');
const M3 = (await one(STAFF, `select public.register_member('Third Member','09190001111','third@example.com','',$1,'Cash',null,'1990-01-01',null,'{f,f,f,f,f,f,f}',false,false,'v') as id`, [PLAN])).id;
ok((await one(STAFF, `select public.book_class($1, $2, $3) as r`, [CLASS, M3, SESSION])).r === 'full', 'capacity is enforced');
const counts = (await as(MEMBER, `select * from public.session_counts($1, $2)`, [today, SESSION])).rows;
ok(counts.length === 1 && counts[0].booked === 2, 'members can see slot counts without seeing who booked');
ok((await count(MEMBER, 'bookings')) === 1, "members can't read other members' bookings");

/* ---------- MFA for admins ---------- */
console.log('\nAdmin MFA');
await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [ADMIN]);
ok((await tryAs(ADMIN, `update public.settings set gym_name = 'Changed'`, [], 'aal1')).affected === 0, 'admin with MFA enrolled is blocked on an aal1 session');
ok((await tryAs(ADMIN, `update public.settings set gym_name = 'Iron Gym'`, [], 'aal2')).affected === 1, 'admin with MFA works on an aal2 session');
ok((await count(ADMIN, 'activity_log')) === 0, 'aal1 admin cannot read the audit log either');

/* ---------- account linking only after email verification ---------- */
console.log('\nAccount linking');
await one(STAFF, `select public.register_member('Late Joiner','09201234567','late@example.com','',$1,'Cash',null,'1990-01-01',null,'{f,f,f,f,f,f,f}',false,false,'v') as id`, [PLAN]);
const lateUser = await user('late@example.com', false);
ok((await db.query(`select user_id from public.members where email = 'late@example.com'`)).rows[0].user_id === null, 'an unverified sign-up is NOT linked to the member record');
await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [lateUser]);
ok((await db.query(`select user_id from public.members where email = 'late@example.com'`)).rows[0].user_id === lateUser, 'linking happens once the email is verified');

/* ---------- privacy: erasure ---------- */
console.log('\nRight to erasure');
const req = await tryAs(MEMBER, `select public.submit_privacy_request('erasure', 'Moving abroad, please delete') as id`);
ok(!req.error, 'member can submit an erasure request', req.error);
ok((await tryAs(MEMBER, `select public.submit_privacy_request('erasure', 'again')`)).error?.includes('pending'), 'duplicate pending erasure requests are refused');
ok((await tryAs(STAFF, `select public.resolve_privacy_request($1, true, '')`, [req.rows[0]?.id])).error?.includes('not allowed'), 'staff cannot approve erasure');
ok((await tryAs(ADMIN, `select public.resolve_privacy_request($1, true, 'Done')`, [req.rows[0]?.id], 'aal2')).error === null, 'admin (aal2) approves erasure');
const dump = JSON.stringify((await db.query(`
  select (select json_agg(m) from public.members m) members, (select json_agg(p) from public.payments p) payments,
         (select json_agg(a) from public.activity_log a) activity, (select json_agg(r) from public.privacy_requests r) requests,
         (select json_agg(u) from auth.users u) users`)).rows[0]);
ok(!dump.includes('Juan Dela Cruz'), "the member's name is gone from every table, including the audit log");
ok(!dump.includes('juan@example.com'), "the member's email and login are gone");
ok(/Deleted member #/.test(dump), 'payments are kept but de-identified');
ok((await db.query(`select count(*)::int n from public.payments where label like 'Deleted member%'`)).rows[0].n === 1, 'exactly their payment was de-identified');
const logRows = (await db.query(`select summary from public.activity_log where summary ilike '%consent%'`)).rows.length;
ok(logRows === 0, 'registration and erasure did not flood the log with per-consent entries', `${logRows} rows`);

/* ---------- retention ---------- */
console.log('\nRetention');
await db.query(`insert into public.check_ins (member_id, via, created_at) values ($1, 'search', now() - interval '5 years')`, [M2]);
const ret = await one(ADMIN, `select public.apply_retention() as r`, [], 'aal2');
ok(ret.r.checkIns === 1, 'retention purges records older than the configured period', JSON.stringify(ret.r));
ok((await tryAs(STAFF, `select public.apply_retention()`)).error?.includes('not allowed'), 'staff cannot run retention');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
