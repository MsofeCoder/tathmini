import Link from 'next/link';
import { dataHealthChecks, failingChecks, severityStyle } from '@/lib/admin/health';
import { countOf, percentOf } from '@/lib/admin/format';
import {
  groupDuplicates,
  loadAssignments,
  loadRoutes,
  loadSubmittedMarks,
  loadTrainees,
  loadUsers,
} from '@/lib/admin/queries';
import { requireAdmin } from '@/lib/admin/session';
import { isTestTrainee } from '@/lib/admin/test-data';
import { Badge, Card, Code, OutOfScopeNote, PageHeader, StatTile } from './ui';

export const dynamic = 'force-dynamic';

/**
 * The console's front page: what the register holds, how far marking has
 * got, and the standing checks for the defects that have actually occurred
 * on this project (see lib/admin/health.ts).
 *
 * Counted from the rows rather than read from a stored summary — the whole
 * point of the page is to be right about the state of the data at the moment
 * it is opened.
 */
export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();

  const [users, routes, trainees, assignments, marks, resultsRes, reportsRes] = await Promise.all([
    loadUsers(supabase),
    loadRoutes(supabase),
    loadTrainees(supabase),
    loadAssignments(supabase),
    loadSubmittedMarks(supabase),
    supabase.from('results').select('trainee_id, locked_at'),
    supabase.from('reports').select('id', { count: 'exact', head: true }),
  ]);

  const routeCodeById = new Map(routes.map((r) => [r.id, r.code]));
  const assignedTraineeIds = new Set(assignments.map((a) => a.trainee_id));
  const results = resultsRes.data ?? [];
  const lockedTraineeIds = new Set(
    results.filter((r) => r.locked_at).map((r) => r.trainee_id as string),
  );
  const markedTraineeIds = new Set(marks.map((m) => m.trainee_id));

  const tp = trainees.filter((t) => t.track === 'TP');
  const ipt = trainees.filter((t) => t.track === 'IPT');
  const testTrainees = trainees.filter((t) =>
    isTestTrainee({
      registrationNumber: t.registration_number,
      routeCode: routeCodeById.get(t.route_id),
    }),
  );

  const supervisors = users.filter((u) => u.role === 'supervisor');
  const inactive = users.filter((u) => !u.active);

  const checks = dataHealthChecks({
    testTrainees: testTrainees.length,
    staffMissingContactEmail: supervisors.filter((u) => !u.contact_email).length,
    duplicateTraineeEmails: groupDuplicates(trainees, (t) => t.email).length,
    routesMissingSupervisor: routes.filter((r) => !r.supervisor_a1_id || !r.supervisor_a2_id)
      .length,
    traineesWithoutAssignment: trainees.filter((t) => !assignedTraineeIds.has(t.id)).length,
    duplicateTraineeNames: groupDuplicates(trainees, (t) => `${t.track}|${t.name}`).length,
  });
  const failing = failingChecks(checks);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="The register as it stands right now, and the standing checks for the defects this project has actually hit."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Trainees"
          value={trainees.length}
          hint={`${tp.length} TP · ${ipt.length} IPT`}
          href="/admin/trainees"
        />
        <StatTile
          label="Routes"
          value={routes.length}
          hint="two assessors each"
          href="/admin/routes"
        />
        <StatTile
          label="Accounts"
          value={users.length}
          hint={`${supervisors.length} supervisors${inactive.length > 0 ? ` · ${inactive.length} deactivated` : ''}`}
          href="/admin/users"
        />
        <StatTile
          label="Marks submitted"
          value={marks.length}
          hint={`${markedTraineeIds.size} trainees started`}
        />
        <StatTile
          label="Results locked"
          value={lockedTraineeIds.size}
          hint="both assessors in"
          href="/admin/results"
        />
        <StatTile label="Reports generated" value={reportsRes.count ?? 0} hint="PDFs on file" />
      </div>

      <Card
        title="Register health"
        description="Counted live from the rows, every time this page is opened."
        tone={failing.some((c) => c.severity === 'urgent') ? 'warning' : 'plain'}
      >
        {failing.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-[#1c6650]">
            ✓ Every check is clear — no test rows, no shared addresses, no empty assessor slot, no
            unassigned trainee.
          </p>
        ) : (
          <ul className="divide-y divide-[#f2f5f4]">
            {failing.map((check) => {
              const style = severityStyle(check.severity);
              return (
                <li key={check.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge bg={style.bg} fg={style.fg}>
                      {check.count}
                    </Badge>
                    <p className="text-[13.5px] font-bold text-[#14232e]">{check.label}</p>
                    {check.href ? (
                      <Link
                        href={check.href}
                        className="text-teal-mid focus:outline-accent ml-auto text-[12.5px] font-semibold underline focus:outline focus:outline-[3px] focus:outline-offset-2"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-[#4d5f6c]">
                    {check.detail}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Marking progress"
        description="A result locks once both assessors have submitted every instrument that trainee's track requires."
      >
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <TrackProgress
            track="TP"
            total={tp.length}
            locked={tp.filter((t) => lockedTraineeIds.has(t.id)).length}
            started={tp.filter((t) => markedTraineeIds.has(t.id)).length}
          />
          <TrackProgress
            track="IPT"
            total={ipt.length}
            locked={ipt.filter((t) => lockedTraineeIds.has(t.id)).length}
            started={ipt.filter((t) => markedTraineeIds.has(t.id)).length}
          />
        </div>
      </Card>

      <OutOfScopeNote title="What this console deliberately does not do">
        <p>
          <strong>Creating accounts and setting passwords</strong> stay in the command-line scripts
          (<Code>pnpm create:accounts</Code>, <Code>pnpm assign:passwords</Code>,{' '}
          <Code>pnpm reset:passwords</Code>). Each needs the Supabase service-role key, which
          bypasses every database policy — it is kept out of the deployed application on purpose, so
          a flaw in this web app can never reach it.
        </p>
        <p>
          <strong>Marks, totals, grades and verdicts</strong> cannot be edited here or on any other
          screen. Submitted marks are append-only; a correction is a superseding revision carrying a
          typed reason, and that screen is not built yet.
        </p>
      </OutOfScopeNote>
    </>
  );
}

function TrackProgress({
  track,
  total,
  locked,
  started,
}: {
  track: 'TP' | 'IPT';
  total: number;
  locked: number;
  started: number;
}) {
  const pct = percentOf(locked, total);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-bold text-[#14232e]">{track} trainees</p>
        <p className="text-[12.5px] text-[#5b6b78]">{countOf(locked, total)} locked</p>
      </div>
      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#e6ebea]"
        role="img"
        aria-label={`${pct}% of ${track} results locked`}
      >
        <div className="h-full rounded-full bg-[#12665b]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[12px] text-[#5b6b78]">
        {started} {started === 1 ? 'trainee has' : 'trainees have'} at least one submitted mark.
      </p>
    </div>
  );
}
