import Link from 'next/link';
import { formatTimestamp } from '@/lib/admin/format';
import { loadRoutes, loadSubmittedMarks, loadTrainees } from '@/lib/admin/queries';
import { requireAdmin } from '@/lib/admin/session';
import { Badge, Card, EmptyRow, PageHeader, StatTile, TableWrap, Td, Th } from '../ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type Status = 'locked' | 'partial' | 'pending';

/**
 * Results oversight — the Coordinator's read-only view (CONTEXT.md), and the
 * one screen in the console that is read-only for everybody including a Super
 * Administrator.
 *
 * Every figure here is computed in Postgres by recompute_result() from the
 * submitted marks (AGENTS.md rule 3). Nothing on this page can change one,
 * and no total is recalculated in this file — they are displayed exactly as
 * the database holds them.
 */
export default async function AdminResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { status: statusFilter, page } = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);

  const [trainees, routes, marks, resultsRes, reportsRes, instrumentsRes] = await Promise.all([
    loadTrainees(supabase),
    loadRoutes(supabase),
    loadSubmittedMarks(supabase),
    supabase
      .from('results')
      .select('trainee_id, total, max, pct, grade, gpa, class_of_award, competent, locked_at'),
    supabase.from('reports').select('trainee_id'),
    supabase.from('instruments').select('id, track'),
  ]);

  const routeById = new Map(routes.map((r) => [r.id, r]));
  const resultByTrainee = new Map((resultsRes.data ?? []).map((r) => [r.trainee_id as string, r]));

  const instrumentsPerTrack = new Map<string, number>();
  for (const instrument of instrumentsRes.data ?? []) {
    const track = instrument.track as string;
    instrumentsPerTrack.set(track, (instrumentsPerTrack.get(track) ?? 0) + 1);
  }

  const marksByTrainee = new Map<string, number>();
  for (const mark of marks) {
    marksByTrainee.set(mark.trainee_id, (marksByTrainee.get(mark.trainee_id) ?? 0) + 1);
  }

  const reportCountByTrainee = new Map<string, number>();
  for (const report of reportsRes.data ?? []) {
    const traineeId = report.trainee_id as string;
    reportCountByTrainee.set(traineeId, (reportCountByTrainee.get(traineeId) ?? 0) + 1);
  }

  const rows = trainees.map((trainee) => {
    const result = resultByTrainee.get(trainee.id);
    const submitted = marksByTrainee.get(trainee.id) ?? 0;
    // Both assessors, every instrument the track requires.
    const expected = (instrumentsPerTrack.get(trainee.track) ?? 0) * 2;
    const status: Status = result?.locked_at ? 'locked' : submitted > 0 ? 'partial' : 'pending';
    return { trainee, result, submitted, expected, status };
  });

  const counts = {
    locked: rows.filter((r) => r.status === 'locked').length,
    partial: rows.filter((r) => r.status === 'partial').length,
    pending: rows.filter((r) => r.status === 'pending').length,
  };

  const filtered =
    statusFilter === 'locked' || statusFilter === 'partial' || statusFilter === 'pending'
      ? rows.filter((r) => r.status === statusFilter)
      : rows.filter((r) => r.status !== 'pending');

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(pageNumber, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const href = (params: Record<string, string>) =>
    `/admin/results?${new URLSearchParams(params).toString()}`;

  return (
    <>
      <PageHeader
        title="Results"
        subtitle="Read-only, for everyone. Totals, grades and the Competent verdict are computed in the database from both assessors' submitted marks."
      />

      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="Locked"
          value={counts.locked}
          hint="both assessors in"
          href={href({ status: 'locked' })}
        />
        <StatTile
          label="In progress"
          value={counts.partial}
          hint="one assessor so far"
          href={href({ status: 'partial' })}
        />
        <StatTile
          label="Not started"
          value={counts.pending}
          hint="no mark submitted"
          href={href({ status: 'pending' })}
        />
      </div>

      <p className="text-[12.5px] text-[#5b6b78]">
        Showing{' '}
        {statusFilter === 'locked' || statusFilter === 'partial' || statusFilter === 'pending'
          ? `${filtered.length} ${statusFilter}`
          : `${filtered.length} started`}{' '}
        {filtered.length === 1 ? 'trainee' : 'trainees'}.{' '}
        <Link
          href="/admin/results"
          className="text-teal-mid focus:outline-accent font-semibold underline focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Show everything started
        </Link>
      </p>

      <Card>
        <TableWrap>
          <thead>
            <tr>
              <Th>Trainee</Th>
              <Th>Route</Th>
              <Th>Marks in</Th>
              <Th>Total</Th>
              <Th>Grade</Th>
              <Th>Verdict</Th>
              <Th>Locked</Th>
              <Th>Reports</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={8}>Nothing to show for that filter.</EmptyRow>
            ) : (
              visible.map(({ trainee, result, submitted, expected, status }) => (
                <tr key={trainee.id}>
                  <Td>
                    <Link
                      href={`/admin/trainees/${trainee.id}`}
                      className="focus:outline-accent font-bold text-[#0d4a43] underline focus:outline focus:outline-[3px] focus:outline-offset-2"
                    >
                      {trainee.name}
                    </Link>
                    <p className="mt-0.5 text-[12px] text-[#5b6b78]">{trainee.track}</p>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {routeById.get(trainee.route_id)?.code ?? '—'}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {submitted} of {expected}
                    {status === 'locked' ? null : (
                      <p className="mt-0.5 text-[12px] text-[#5b6b78]">
                        {status === 'partial' ? 'awaiting the other assessor' : 'not started'}
                      </p>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {result?.total != null ? `${result.total} / ${result.max}` : '—'}
                    {result?.pct != null ? (
                      <p className="mt-0.5 text-[12px] text-[#5b6b78]">{result.pct}%</p>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {result?.grade ?? '—'}
                    {result?.gpa != null ? (
                      <p className="mt-0.5 text-[12px] text-[#5b6b78]">GPA {result.gpa}</p>
                    ) : null}
                  </Td>
                  <Td>
                    {result?.competent == null ? (
                      '—'
                    ) : result.competent ? (
                      <Badge bg="#e2f0ea" fg="#1c6650">
                        Competent
                      </Badge>
                    ) : (
                      <Badge bg="#fbe9e4" fg="#8a3a2a">
                        Not Competent
                      </Badge>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">{formatTimestamp(result?.locked_at)}</Td>
                  <Td>{reportCountByTrainee.get(trainee.id) ?? 0}</Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Card>

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-3">
          {current > 1 ? (
            <Link
              href={href({
                ...(statusFilter ? { status: statusFilter } : {}),
                page: String(current - 1),
              })}
              className="focus:outline-accent min-h-[44px] rounded-xl border border-[#ccd7d4] bg-white px-3.5 py-2.5 text-[13px] font-bold text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              ← Previous
            </Link>
          ) : null}
          <p className="text-[12.5px] text-[#5b6b78]">
            Page {current} of {pageCount}
          </p>
          {current < pageCount ? (
            <Link
              href={href({
                ...(statusFilter ? { status: statusFilter } : {}),
                page: String(current + 1),
              })}
              className="focus:outline-accent min-h-[44px] rounded-xl border border-[#ccd7d4] bg-white px-3.5 py-2.5 text-[13px] font-bold text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}

      <p className="text-[12.5px] leading-relaxed text-[#5f6f7c]">
        Correcting a locked result is a superseding revision with a typed reason — the original
        stays visible forever, and no mark is ever edited in place. That screen is not built yet;
        until it is, a correction is a reviewed database change.
      </p>
    </>
  );
}
