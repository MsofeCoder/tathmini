/**
 * Generates the migration SQL to import the real TP roster (routes,
 * trainees, assignments) — printed to stdout, not applied by this
 * script. Needs only TRAINEE_REGISTER_PATH (no secrets), since it just
 * reads the local spreadsheet via the existing parseRoster().
 *
 * Unlike import-trainees.ts's own main(), this does NOT exit non-zero on
 * a validation issue — it prints them as warnings and generates the SQL
 * anyway. That's deliberate: the user's instruction for the IPT import
 * ("for now" — import as-is, duplicates included, fix by hand later via
 * the Phase 3 admin tool ROADMAP.md now tracks) applies here too. See
 * MEMORY.md.
 *
 * 364 rows is too many to safely hand-transcribe into SQL (the IPT
 * import's 118 was already right at that edge) — this generates it
 * directly from the parsed, validated data instead.
 */

import { pathToFileURL } from 'node:url';
import { ALL_ACCOUNTS } from './create-accounts';
import { parseRoster, validateRoster, type RosterRow } from './import-trainees';

// Route code -> [a1 email, a2 email], from the source's route-header text.
// Route 6's a2 is Adam Msofe's EXISTING supervisor account (created for
// his IPT Route 6 duty) — not a new one.
const ROUTE_ASSESSOR_EMAILS: Record<string, [string, string]> = {
  'ROUTE 1': ['mkama.maugo@tathmini.internal', 'yohana.yona@tathmini.internal'],
  'ROUTE 2': ['anicia.osward@tathmini.internal', 'frank.urio@tathmini.internal'],
  'ROUTE 3': ['enelisa.mbwile@tathmini.internal', 'rodgers.amin@tathmini.internal'],
  'ROUTE 4': ['ramadhani.msidada@tathmini.internal', 'ramadhani.ngare@tathmini.internal'],
  'ROUTE 5': ['nehemia.david@tathmini.internal', 'laurent.mwaisanila@tathmini.internal'],
  'ROUTE 6': ['denis.michael@tathmini.internal', 'adam.msofe.supervisor@tathmini.internal'],
  'ROUTE 7': ['lucia.daniel@tathmini.internal', 'fayson.mwakaseka@tathmini.internal'],
  'ROUTE 8': ['aloyce.nyoni@tathmini.internal', 'bakari.ulende@tathmini.internal'],
  'ROUTE 9': ['benson.chibwi@tathmini.internal', 'francis.makori@tathmini.internal'],
};

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlStringOrNull(value: string): string {
  return value ? sqlString(value) : 'null';
}

export function generateUsersSql(): string {
  const rows = Object.values(ROUTE_ASSESSOR_EMAILS)
    .flat()
    .map((email) => {
      const acct = ALL_ACCOUNTS.find((a) => a.email === email);
      if (!acct) throw new Error(`No account entry for ${email}`);
      return `  (${sqlString(acct.email)}, ${sqlString(acct.role)}, ${sqlString(acct.name)})`;
    })
    // Adam Msofe's email appears once already in ipt-accounts.ts's own
    // users insert (0007) — de-dupe so this migration doesn't try to
    // "create" him a second time.
    .filter((row, i, all) => all.indexOf(row) === i);

  return `insert into users (id, role, name, email)
select au.id, v.role::app_role, v.name, v.email
from (values
${rows.join(',\n')}
) as v(email, role, name)
join auth.users au on au.email = v.email
where not exists (select 1 from users u where u.id = au.id);`;
}

export function generateRoutesSql(): string {
  const rows = Object.entries(ROUTE_ASSESSOR_EMAILS).map(
    ([code, [a1, a2]]) => `  ('TP ${code}', ${sqlString(a1)}, ${sqlString(a2)})`,
  );

  return `insert into routes (code, supervisor_a1_id, supervisor_a2_id)
select v.code, a1.id, a2.id
from (values
${rows.join(',\n')}
) as v(code, a1_email, a2_email)
join users a1 on a1.email = v.a1_email
join users a2 on a2.email = v.a2_email
where not exists (select 1 from routes r where r.code = v.code);`;
}

/**
 * trainees.registration_number has a database-level UNIQUE constraint —
 * unlike the IPT roster's phone-sharing duplicates, two TP rows sharing
 * one registration number (found live: Rafael/Raphael Pato Mohele, both
 * MVTTC/CAVT/2025/0128) aren't just messy data, they're something the
 * database physically refuses to insert. The user's call (see MEMORY.md):
 * keep both trainee records — different rows, different names, may be
 * different people — but only the first occurrence keeps the real
 * registration number; later ones are set to null rather than inventing
 * a number that isn't in the source, until the College clarifies.
 */
export function dedupeRegistrationNumbers(rows: RosterRow[]): RosterRow[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    if (!r.registrationNumber) return r;
    if (seen.has(r.registrationNumber)) return { ...r, registrationNumber: '' };
    seen.add(r.registrationNumber);
    return r;
  });
}

export function generateTraineesSql(rows: RosterRow[]): string {
  const tuples = dedupeRegistrationNumbers(rows).map(
    (r) =>
      `    (${sqlString(`TP ${r.route}`)}, ${sqlString(r.name)}, ${sqlStringOrNull(r.registrationNumber)}, ${sqlString(r.course)}, ${sqlStringOrNull(r.modeOfStudy)}, ${sqlString(r.occupation)}, ${sqlString(r.institution)}, ${sqlStringOrNull(r.district)}, ${sqlStringOrNull(r.region)}, ${sqlStringOrNull(r.email)})`,
  );

  return `with trainee_seed as (
  select * from (values
${tuples.join(',\n')}
  ) as v(route_code, name, registration_number, course, mode_of_study, occupation, institution, district, region, email)
)
insert into trainees (name, registration_number, course, mode_of_study, occupation, institution, district, region, email, track, route_id)
select ts.name, ts.registration_number, ts.course, ts.mode_of_study, ts.occupation, ts.institution, ts.district, ts.region, ts.email, 'TP', r.id
from trainee_seed ts
join routes r on r.code = ts.route_code
where not exists (
  select 1 from trainees t
  where t.route_id = r.id and t.name = ts.name
    and t.registration_number is not distinct from ts.registration_number
);`;
}

export function generateAssignmentsSql(): string {
  return `insert into assignments (trainee_id, supervisor_id, slot)
select t.id, r.supervisor_a1_id, 'a1'
from trainees t
join routes r on r.id = t.route_id
where t.track = 'TP'
  and not exists (
    select 1 from assignments a
    where a.trainee_id = t.id and a.supervisor_id = r.supervisor_a1_id
  );

insert into assignments (trainee_id, supervisor_id, slot)
select t.id, r.supervisor_a2_id, 'a2'
from trainees t
join routes r on r.id = t.route_id
where t.track = 'TP'
  and not exists (
    select 1 from assignments a
    where a.trainee_id = t.id and a.supervisor_id = r.supervisor_a2_id
  );`;
}

export function generateMigrationSql(rows: RosterRow[]): string {
  return [
    '-- Imports the real September 2026 TP roster: links the 17 new + 1',
    '-- existing (Adam Msofe) supervisor accounts into users, 9 routes,',
    `-- ${rows.length} trainees, and their assignments. Generated by`,
    '-- generate-tp-import-sql.ts from the real spreadsheet — see MEMORY.md.',
    '--',
    '-- Trainees are inserted AS-IS, known duplicates included (Rafael/',
    '-- Raphael Pato Mohele share a registration number; two trainees share',
    "-- the e-mail rashidmujwahuzi@gmail.com) — same 'for now' policy as the",
    '-- IPT import. Guarded with NOT EXISTS throughout, same pattern as',
    '-- 0005-0007, so this is a no-op if re-run.',
    '',
    generateUsersSql(),
    '',
    generateRoutesSql(),
    '',
    generateTraineesSql(rows),
    '',
    generateAssignmentsSql(),
    '',
  ].join('\n');
}

async function main() {
  const filePath = process.env.TRAINEE_REGISTER_PATH;
  if (!filePath) {
    console.error('Set TRAINEE_REGISTER_PATH to a local copy of the TP roster spreadsheet.');
    process.exitCode = 1;
    return;
  }

  const rows = await parseRoster(filePath);
  const issues = validateRoster(rows);
  if (issues.length > 0) {
    console.error(`${issues.length} validation issue(s) found — importing as-is anyway:`);
    for (const issue of issues) console.error(`  [${issue.kind}] ${issue.detail}`);
  }

  console.log(generateMigrationSql(rows));
}

// Naive `file://${process.argv[1]}` comparison never matches on Windows —
// see MEMORY.md / import-ipt-roster.ts for why pathToFileURL is used here.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
