import { formatTimestamp } from '@/lib/admin/format';
import {
  loadAssignments,
  loadRoutes,
  loadSubmittedMarks,
  loadTrainees,
  loadUsers,
} from '@/lib/admin/queries';
import {
  assessorActivity,
  gradeDistribution,
  percent,
  routeProgress,
  verdictSplit,
} from '@/lib/coordinator/overview';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * How the assessment is going — the whole cohort on one page.
 *
 * Every figure is a count of rows the database already holds. The bars are all
 * ONE measure (marks submitted against marks owed) on ONE scale, so a route at
 * 40% and an assessor at 40% mean the same thing; there is no second axis
 * anywhere on the page and no chart that needs a legend to be read. Each bar
 * carries its own number, so nothing depends on hovering, and the tables below
 * are the same data in full.
 */
export default async function CoordinatorPage() {
  const supabase = await createClient();

  const [trainees, routes, users, assignments, marks, resultsRes, reportsRes, instrumentsRes] =
    await Promise.all([
      loadTrainees(supabase),
      loadRoutes(supabase),
      loadUsers(supabase),
      loadAssignments(supabase),
      loadSubmittedMarks(supabase),
      supabase.from('results').select('trainee_id, locked_at, grade, competent, pct'),
      supabase
        .from('reports')
        .select('id, generated_at')
        .order('generated_at', { ascending: false }),
      supabase.from('instruments').select('id, track'),
    ]);

  const userNameById = new Map(users.map((u) => [u.id, u.name]));
  const routeCodeById = new Map(routes.map((r) => [r.id, r.code]));

  const instrumentsPerTrack = new Map<string, number>();
  for (const instrument of instrumentsRes.data ?? []) {
    const track = instrument.track as string;
    instrumentsPerTrack.set(track, (instrumentsPerTrack.get(track) ?? 0) + 1);
  }

  const results = resultsRes.data ?? [];
  const lockedTraineeIds = new Set(
    results.filter((r) => r.locked_at).map((r) => r.trainee_id as string),
  );

  const traineeShapes = trainees.map((t) => ({
    id: t.id,
    name: t.name,
    track: t.track,
    routeId: t.route_id,
  }));

  const markShapes = marks.map((m) => ({
    traineeId: m.trainee_id,
    supervisorId: m.supervisor_id,
    slot: m.slot,
    instrumentId: m.instrument_id,
  }));

  const progress = routeProgress({
    routes: routes.map((r) => ({
      id: r.id,
      code: r.code,
      a1Name: r.supervisor_a1_id ? (userNameById.get(r.supervisor_a1_id) ?? null) : null,
      a2Name: r.supervisor_a2_id ? (userNameById.get(r.supervisor_a2_id) ?? null) : null,
    })),
    trainees: traineeShapes,
    marks: markShapes,
    lockedTraineeIds,
    instrumentsPerTrack,
  });

  const assessors = assessorActivity({
    supervisors: users
      .filter((u) => u.role === 'supervisor')
      .map((u) => ({ id: u.id, name: u.name })),
    assignments: assignments.map((a) => ({
      traineeId: a.trainee_id,
      supervisorId: a.supervisor_id,
    })),
    trainees: traineeShapes,
    marks: markShapes,
    routeCodeById,
    instrumentsPerTrack,
  });

  const marksExpected = progress.reduce((total, r) => total + r.marksExpected, 0);
  const marksSubmitted = progress.reduce((total, r) => total + r.marksSubmitted, 0);
  const overall = percent(marksSubmitted, marksExpected);

  const grades = gradeDistribution(results);
  const verdicts = verdictSplit(results.filter((r) => r.locked_at));
  const reports = reportsRes.data ?? [];
  const notStarted = assessors.filter((a) => a.submitted === 0).length;

  return (
    <>
      <header className="border-b border-[#e1e9e6] pb-4">
        <h1 className="text-[22px] font-bold tracking-[-0.2px] text-[#14232e]">
          Where the assessment stands
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[#5b6b78]">
          {trainees.length} trainees across {routes.length} routes, assessed twice each. Read-only —
          this is the College&rsquo;s view of the whole process.
        </p>
      </header>

      {/* The headline: one number, because "how far along are we" is one question. */}
      <section className="rounded-2xl border border-[#e1e9e6] bg-white p-5">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-[#5b6b78]">
          Marking complete
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <p className="text-[44px] font-bold leading-none text-[#0d4a43]">{overall}%</p>
          <p className="text-[14px] text-[#5b6b78]">
            {marksSubmitted.toLocaleString('en-GB')} of {marksExpected.toLocaleString('en-GB')}{' '}
            assessments submitted
          </p>
        </div>
        <Bar value={marksSubmitted} max={marksExpected} height={10} />
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#5b6b78]">
          Each trainee is assessed by two supervisors on every instrument their track requires — a
          TP trainee needs four submissions in all, an IPT trainee two. A result locks only when
          every one of them is in.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Results locked"
          value={lockedTraineeIds.size}
          hint={`of ${trainees.length} trainees`}
        />
        <Tile
          label="Reports issued"
          value={reports.length}
          hint={
            reports[0] ? `last ${formatTimestamp(reports[0].generated_at as string)}` : 'none yet'
          }
        />
        <Tile
          label="Assessors active"
          value={assessors.length - notStarted}
          hint={`of ${assessors.length} with trainees`}
        />
        <Tile
          label="Not yet started"
          value={notStarted}
          hint="assessors with no submission"
          alarm={notStarted > 0}
        />
      </section>

      {/* Routes: one measure, one scale, every bar labelled with its own figure. */}
      <section className="rounded-2xl border border-[#e1e9e6] bg-white">
        <div className="border-b border-[#eef2f1] px-4 py-3">
          <h2 className="text-[14px] font-bold text-[#14232e]">Progress by route</h2>
          <p className="mt-1 text-[12.5px] text-[#5b6b78]">
            Ordered as the register numbers them. The figure on each bar is submissions in, out of
            submissions owed.
          </p>
        </div>
        <ul className="divide-y divide-[#f2f5f4]">
          {progress.map((route) => (
            <li key={route.routeId} className="px-4 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13.5px] font-bold text-[#14232e]">{route.code}</p>
                <p className="text-[12.5px] tabular-nums text-[#5b6b78]">
                  {route.marksSubmitted} of {route.marksExpected} · {route.percentComplete}%
                </p>
              </div>
              <Bar value={route.marksSubmitted} max={route.marksExpected} />
              <p className="mt-1.5 text-[12px] text-[#5b6b78]">
                {route.trainees} trainees — {route.locked} finished, {route.partial} part-marked,{' '}
                {route.notStarted} not started · {route.a1Name ?? 'no assessor 1'} &amp;{' '}
                {route.a2Name ?? <span className="text-[#8a3a2a]">no assessor 2</span>}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Grades stay in the printed VETA order, never sorted by size. */}
        <section className="rounded-2xl border border-[#e1e9e6] bg-white">
          <div className="border-b border-[#eef2f1] px-4 py-3">
            <h2 className="text-[14px] font-bold text-[#14232e]">Grades so far</h2>
            <p className="mt-1 text-[12.5px] text-[#5b6b78]">
              Locked results only, in the order the VETA form prints them.
            </p>
          </div>
          {results.some((r) => r.grade) ? (
            <ul className="space-y-2.5 p-4">
              {grades.map((grade) => (
                <li key={grade.grade} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-[13px] font-bold text-[#14232e]">
                    {grade.grade}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Bar
                      value={grade.count}
                      max={Math.max(...grades.map((g) => g.count), 1)}
                      height={8}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-[12.5px] tabular-nums text-[#5b6b78]">
                    {grade.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-[13px] text-[#5b6b78]">
              No result has been graded yet.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-[#e1e9e6] bg-white">
          <div className="border-b border-[#eef2f1] px-4 py-3">
            <h2 className="text-[14px] font-bold text-[#14232e]">Verdicts</h2>
            <p className="mt-1 text-[12.5px] text-[#5b6b78]">
              Competent or Not Competent, decided in the database from both assessors&rsquo; marks.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 p-4">
            <Verdict label="Competent" value={verdicts.competent} mark="✓" tone="good" />
            <Verdict label="Not Competent" value={verdicts.notCompetent} mark="✕" tone="bad" />
          </dl>
          {verdicts.undecided > 0 ? (
            <p className="px-4 pb-4 text-[12.5px] text-[#5b6b78]">
              {verdicts.undecided} locked{' '}
              {verdicts.undecided === 1 ? 'result carries' : 'results carry'} no verdict yet.
            </p>
          ) : null}
        </section>
      </div>

      {/* The table view of the same measure, and the page's real working list. */}
      <section className="rounded-2xl border border-[#e1e9e6] bg-white">
        <div className="border-b border-[#eef2f1] px-4 py-3">
          <h2 className="text-[14px] font-bold text-[#14232e]">Assessors</h2>
          <p className="mt-1 text-[12.5px] text-[#5b6b78]">
            Furthest behind first — this is the list to act on. Counted from each assessor&rsquo;s
            own assignments, so a trainee handed to someone else is counted against the person who
            now holds the slot.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead>
              <tr>
                <Th>Assessor</Th>
                <Th>Route</Th>
                <Th>Submitted</Th>
                <Th>Progress</Th>
              </tr>
            </thead>
            <tbody>
              {assessors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#5b6b78]">
                    Nobody has trainees assigned yet.
                  </td>
                </tr>
              ) : (
                assessors.map((assessor) => (
                  <tr key={assessor.supervisorId}>
                    <Td>
                      <span className="font-semibold">{assessor.name}</span>
                      {assessor.submitted === 0 ? (
                        <span className="ml-2 rounded-full bg-[#fbe9e4] px-2 py-0.5 text-[11.5px] font-bold text-[#8a3a2a]">
                          not started
                        </span>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap text-[#5b6b78]">
                      {assessor.routeCodes.join(', ') || '—'}
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">
                      {assessor.submitted} of {assessor.expected}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="w-[120px]">
                          <Bar value={assessor.submitted} max={assessor.expected} height={8} />
                        </span>
                        <span className="w-9 text-right text-[12.5px] tabular-nums text-[#5b6b78]">
                          {assessor.percentComplete}%
                        </span>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/**
 * One measure, one hue, one scale across the whole page. The filled end is
 * rounded and the track is not, so the bar reads as a quantity growing from a
 * baseline rather than as a pill.
 */
function Bar({ value, max, height = 6 }: { value: number; max: number; height?: number }) {
  const width = percent(value, max);
  return (
    <div
      className="mt-1.5 w-full overflow-hidden bg-[#e6ebea]"
      style={{ height, borderRadius: 2 }}
      role="img"
      aria-label={`${width}% complete, ${value} of ${max}`}
    >
      <div
        className="h-full bg-[#12665b]"
        style={{ width: `${width}%`, borderRadius: '2px 4px 4px 2px' }}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  alarm,
}: {
  label: string;
  value: number;
  hint: string;
  alarm?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e1e9e6] bg-white p-4">
      <p className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-[#5b6b78]">{label}</p>
      <p
        className={`mt-1.5 text-[26px] font-bold leading-none ${
          alarm ? 'text-[#8a3a2a]' : 'text-[#0d4a43]'
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[12px] text-[#5b6b78]">{hint}</p>
    </div>
  );
}

/** Status never rides on colour alone — the mark and the word carry it too. */
function Verdict({
  label,
  value,
  mark,
  tone,
}: {
  label: string;
  value: number;
  mark: string;
  tone: 'good' | 'bad';
}) {
  const colour = tone === 'good' ? '#1c6650' : '#8a3a2a';
  const wash = tone === 'good' ? '#e2f0ea' : '#fbe9e4';
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ backgroundColor: wash }}>
      <dt className="text-[12px] font-bold" style={{ color: colour }}>
        <span aria-hidden="true">{mark} </span>
        {label}
      </dt>
      <dd className="mt-1 text-[24px] font-bold leading-none" style={{ color: colour }}>
        {value}
      </dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-[#eef2f1] px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.5px] text-[#5b6b78]"
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td
      className={`border-b border-[#f2f5f4] px-4 py-2.5 align-middle text-[#14232e] ${className}`}
    >
      {children}
    </td>
  );
}
