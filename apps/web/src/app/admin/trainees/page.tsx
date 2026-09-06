import Link from 'next/link';
import { loadRoutes, loadSubmittedMarks, loadTrainees } from '@/lib/admin/queries';
import { requireAdmin } from '@/lib/admin/session';
import { isTestTrainee } from '@/lib/admin/test-data';
import { Badge, Card, EmptyRow, PageHeader, TableWrap, Td, Th } from '../ui';
import { SearchBox } from '../search-box';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * The register, searchable. Everything a Super Admin currently does with a
 * hand-written migration starts here: find the row, open it, correct it.
 *
 * Paged rather than virtualised — 546 rows is small, but rendering all of
 * them server-side makes a heavy page for a college laptop on a slow line,
 * and a page number in the URL is something an administrator can share.
 */
export default async function AdminTraineesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; route?: string; page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { q, route: routeFilter, page } = await searchParams;
  const query = (q ?? '').trim().toLowerCase();
  const pageNumber = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);

  const [trainees, routes, marks] = await Promise.all([
    loadTrainees(supabase),
    loadRoutes(supabase),
    loadSubmittedMarks(supabase),
  ]);

  const routeById = new Map(routes.map((r) => [r.id, r]));
  const markCountByTrainee = new Map<string, number>();
  for (const mark of marks) {
    markCountByTrainee.set(mark.trainee_id, (markCountByTrainee.get(mark.trainee_id) ?? 0) + 1);
  }

  const filtered = trainees.filter((trainee) => {
    if (routeFilter && trainee.route_id !== routeFilter) return false;
    if (query === '') return true;
    return (
      trainee.name.toLowerCase().includes(query) ||
      (trainee.registration_number ?? '').toLowerCase().includes(query) ||
      trainee.institution.toLowerCase().includes(query) ||
      (trainee.email ?? '').toLowerCase().includes(query) ||
      (trainee.phone ?? '').toLowerCase().includes(query) ||
      (routeById.get(trainee.route_id)?.code ?? '').toLowerCase().includes(query)
    );
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(pageNumber, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const testCount = filtered.filter((t) =>
    isTestTrainee({
      registrationNumber: t.registration_number,
      routeCode: routeById.get(t.route_id)?.code,
    }),
  ).length;

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (routeFilter) params.set('route', routeFilter);
    params.set('page', String(n));
    return `/admin/trainees?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Trainees"
        subtitle={`${filtered.length} of ${trainees.length} rows shown. Open a trainee to correct their particulars or move them to another route.`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox
          action="/admin/trainees"
          placeholder="Search name, registration number, institution"
          value={q}
          hidden={{ route: routeFilter }}
        />
        {routeFilter ? (
          <Link
            href="/admin/trainees"
            className="text-teal-mid focus:outline-accent text-[12.5px] font-semibold underline focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            Clear route filter ({routeById.get(routeFilter)?.code ?? 'unknown route'})
          </Link>
        ) : null}
        {testCount > 0 ? (
          <Badge bg="#fbe9e4" fg="#8a3a2a">
            {testCount} test {testCount === 1 ? 'row' : 'rows'} in this list
          </Badge>
        ) : null}
      </div>

      <Card>
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Registration</Th>
              <Th>Track</Th>
              <Th>Route</Th>
              <Th>Institution</Th>
              <Th>Contact</Th>
              <Th>Marks</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={7}>No trainee matches that search.</EmptyRow>
            ) : (
              visible.map((trainee) => {
                const routeCode = routeById.get(trainee.route_id)?.code;
                const isTest = isTestTrainee({
                  registrationNumber: trainee.registration_number,
                  routeCode,
                });
                const markCount = markCountByTrainee.get(trainee.id) ?? 0;
                return (
                  <tr key={trainee.id}>
                    <Td>
                      <Link
                        href={`/admin/trainees/${trainee.id}`}
                        className="focus:outline-accent font-bold text-[#0d4a43] underline focus:outline focus:outline-[3px] focus:outline-offset-2"
                      >
                        {trainee.name}
                      </Link>
                      {isTest ? (
                        <span className="ml-2">
                          <Badge bg="#fbe9e4" fg="#8a3a2a">
                            test row
                          </Badge>
                        </span>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap">{trainee.registration_number ?? '—'}</Td>
                    <Td>
                      <Badge
                        bg={trainee.track === 'IPT' ? '#fff0d6' : '#e2f0ea'}
                        fg={trainee.track === 'IPT' ? '#6b4400' : '#1c6650'}
                      >
                        {trainee.track}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap">{routeCode ?? '—'}</Td>
                    <Td>{trainee.institution}</Td>
                    <Td className="break-all">{trainee.email ?? trainee.phone ?? '—'}</Td>
                    <Td>{markCount === 0 ? '—' : markCount}</Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableWrap>
      </Card>

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-3">
          {current > 1 ? (
            <Link
              href={pageHref(current - 1)}
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
              href={pageHref(current + 1)}
              className="focus:outline-accent min-h-[44px] rounded-xl border border-[#ccd7d4] bg-white px-3.5 py-2.5 text-[13px] font-bold text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
