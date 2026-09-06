import Link from 'next/link';
import { countOf, percentOf } from '@/lib/admin/format';
import { loadRoutes, loadSubmittedMarks, loadTrainees, loadUsers } from '@/lib/admin/queries';
import { requireAdmin } from '@/lib/admin/session';
import { Badge, Card, EmptyRow, PageHeader, TableWrap, Td, Th } from '../ui';
import { SlotForm, type SupervisorOption } from './slot-form';

export const dynamic = 'force-dynamic';

/**
 * Routes and their two assessor slots (ROADMAP.md Phase 3, "Route management
 * and assignment of assessor slots").
 *
 * A route is a standing thing with two fixed supervisors, assigned before any
 * trainee exists — that is why `routes` is a table at all rather than
 * something derived from `assignments` (see packages/db/src/schema.ts). This
 * screen edits the template and the per-trainee assignments together; doing
 * only one of the two is the bug it exists to prevent.
 */
export default async function AdminRoutesPage() {
  const { supabase, canWrite } = await requireAdmin();

  const [routes, trainees, users, marks, resultsRes] = await Promise.all([
    loadRoutes(supabase),
    loadTrainees(supabase),
    loadUsers(supabase),
    loadSubmittedMarks(supabase),
    supabase.from('results').select('trainee_id, locked_at'),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const supervisors: SupervisorOption[] = users
    .filter((u) => u.role === 'supervisor' && u.active)
    .map((u) => ({ id: u.id, name: u.name }));

  const lockedTraineeIds = new Set(
    (resultsRes.data ?? []).filter((r) => r.locked_at).map((r) => r.trainee_id as string),
  );
  const markedTraineeIds = new Set(marks.map((m) => m.trainee_id));

  const traineesByRoute = new Map<string, typeof trainees>();
  for (const trainee of trainees) {
    const list = traineesByRoute.get(trainee.route_id) ?? [];
    list.push(trainee);
    traineesByRoute.set(trainee.route_id, list);
  }

  return (
    <>
      <PageHeader
        title="Routes"
        subtitle="Each route carries two assessors. Changing a slot moves every trainee on the route to that supervisor's list — except anyone already marked in that slot, whose mark belongs to the assessor who made it."
      />

      {canWrite ? null : (
        <Badge bg="#eef1f3" fg="#4d5f6c">
          Read-only view
        </Badge>
      )}

      <Card>
        <TableWrap>
          <thead>
            <tr>
              <Th>Route</Th>
              <Th>Trainees</Th>
              <Th>Assessor 1</Th>
              <Th>Assessor 2</Th>
              <Th>Progress</Th>
            </tr>
          </thead>
          <tbody>
            {routes.length === 0 ? (
              <EmptyRow colSpan={5}>No routes yet.</EmptyRow>
            ) : (
              routes.map((route) => {
                const onRoute = traineesByRoute.get(route.id) ?? [];
                const locked = onRoute.filter((t) => lockedTraineeIds.has(t.id)).length;
                const started = onRoute.filter((t) => markedTraineeIds.has(t.id)).length;
                const a1 = route.supervisor_a1_id
                  ? userById.get(route.supervisor_a1_id)
                  : undefined;
                const a2 = route.supervisor_a2_id
                  ? userById.get(route.supervisor_a2_id)
                  : undefined;

                return (
                  <tr key={route.id}>
                    <Td>
                      <p className="font-bold">{route.code}</p>
                      {route.label ? (
                        <p className="mt-0.5 text-[12px] text-[#5b6b78]">{route.label}</p>
                      ) : null}
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/trainees?route=${route.id}`}
                        className="text-teal-mid focus:outline-accent font-semibold underline focus:outline focus:outline-[3px] focus:outline-offset-2"
                      >
                        {onRoute.length}
                      </Link>
                    </Td>
                    <Td>
                      <SlotForm
                        routeId={route.id}
                        routeCode={route.code}
                        slot="a1"
                        currentId={route.supervisor_a1_id}
                        currentName={a1?.name ?? null}
                        traineeCount={onRoute.length}
                        supervisors={supervisors}
                        disabled={!canWrite}
                      />
                    </Td>
                    <Td>
                      <SlotForm
                        routeId={route.id}
                        routeCode={route.code}
                        slot="a2"
                        currentId={route.supervisor_a2_id}
                        currentName={a2?.name ?? null}
                        traineeCount={onRoute.length}
                        supervisors={supervisors}
                        disabled={!canWrite}
                      />
                    </Td>
                    <Td>
                      <p className="whitespace-nowrap">{countOf(locked, onRoute.length)} locked</p>
                      <div className="mt-1.5 h-2 w-[110px] overflow-hidden rounded-full bg-[#e6ebea]">
                        <div
                          className="h-full rounded-full bg-[#12665b]"
                          style={{ width: `${percentOf(locked, onRoute.length)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[12px] text-[#5b6b78]">{started} started</p>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableWrap>
      </Card>

      <p className="text-[12.5px] leading-relaxed text-[#5f6f7c]">
        Creating a new route, and renaming one, are not offered here on purpose: a route code is
        matched verbatim by the roster importers, so a code typed into a form is a mismatch waiting
        to happen. New routes arrive with the College&rsquo;s register, through a reviewed
        migration.
      </p>
    </>
  );
}
