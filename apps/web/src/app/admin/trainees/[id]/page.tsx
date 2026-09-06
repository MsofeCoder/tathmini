import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatTimestamp } from '@/lib/admin/format';
import { loadRoutes, loadUsers } from '@/lib/admin/queries';
import { requireAdmin } from '@/lib/admin/session';
import { isTestTrainee, TEST_TRAINEE_DELETE_SQL } from '@/lib/admin/test-data';
import { isUuid } from '@/lib/admin/validation';
import { Badge, Card, Code, EmptyRow, PageHeader, TableWrap, Td, Th } from '../../ui';
import { ParticularsForm, RouteMoveForm, SlotAssigneeForm } from '../trainee-forms';
import { VoidAssessmentForm } from '../void-form';

export const dynamic = 'force-dynamic';

/**
 * One trainee: their register entry, who assesses them, what has been
 * submitted, and the two corrections an administrator may make — particulars
 * and route.
 *
 * The marks table below is deliberately read-only, and there is no edit
 * anywhere on this page for a score, a total or a verdict. That is not a
 * missing feature: `assessment_marks` has no UPDATE grant for any role
 * (AGENTS.md rule 2), and a correction is a superseding revision with a typed
 * reason, which is its own screen and is not built yet.
 *
 * The one thing an administrator CAN do to an assessment is void it whole —
 * archive it and return the trainee to "Not yet assessed" so both assessors
 * mark them again. That is not an edit either: nothing is changed, nothing is
 * thrown away, and the marks that were cleared stay readable in
 * `voided_assessments`.
 */
export default async function AdminTraineePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, canWrite } = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [
    traineeRes,
    routes,
    users,
    assignmentsRes,
    marksRes,
    resultRes,
    reportsRes,
    instrumentsRes,
    voidsRes,
  ] = await Promise.all([
    supabase
      .from('trainees')
      .select(
        'id, name, registration_number, course, occupation, institution, mode_of_study, district, region, email, phone, track, route_id, created_at',
      )
      .eq('id', id)
      .maybeSingle(),
    loadRoutes(supabase),
    loadUsers(supabase),
    supabase.from('assignments').select('supervisor_id, slot').eq('trainee_id', id),
    supabase
      .from('assessment_marks')
      .select('id, instrument_id, supervisor_id, slot, total, submitted_at')
      .eq('trainee_id', id),
    supabase
      .from('results')
      .select('total, max, pct, grade, gpa, class_of_award, competent, locked_at, updated_at')
      .eq('trainee_id', id)
      .maybeSingle(),
    supabase
      .from('reports')
      .select('id, generated_at, sha256_hash')
      .eq('trainee_id', id)
      .order('generated_at', { ascending: false }),
    supabase.from('instruments').select('id, label, code'),
    /**
     * Voids already on record for this trainee. Selected with the rest rather
     * than behind a condition, because a trainee being assessed for the second
     * time looks exactly like one being assessed for the first — the archive is
     * the only thing that says otherwise. `error` rather than a throw when
     * migration 0031 has not been applied: the table simply does not exist yet,
     * and the card below is then not drawn.
     */
    supabase
      .from('voided_assessments')
      .select(
        'id, marks_voided, reports_voided, result_total, result_pct, result_grade, result_competent, was_locked_at, reason, voided_by_id, voided_at',
      )
      .eq('trainee_id', id)
      .order('voided_at', { ascending: false }),
  ]);

  const trainee = traineeRes.data;
  if (!trainee) notFound();

  const routeById = new Map(routes.map((r) => [r.id, r]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const instrumentById = new Map((instrumentsRes.data ?? []).map((i) => [i.id as string, i]));

  const supervisorChoices = users
    .filter((u) => u.role === 'supervisor' && u.active)
    .map((u) => ({ id: u.id, name: u.name }));

  const route = routeById.get(trainee.route_id);
  const assignments = assignmentsRes.data ?? [];
  const marks = marksRes.data ?? [];
  const result = resultRes.data;
  const reports = reportsRes.data ?? [];

  const voids = voidsRes.data ?? [];
  const submitted = marks.filter((m) => m.submitted_at);
  const canVoid = marks.length > 0 || Boolean(result);
  const isTest = isTestTrainee({
    registrationNumber: trainee.registration_number,
    routeCode: route?.code,
  });

  const moveBlockedReason =
    submitted.length > 0
      ? `This trainee already has ${submitted.length} submitted ${
          submitted.length === 1 ? 'mark' : 'marks'
        }. A mark belongs to the assessor who made it and cannot be reassigned, so the route can no longer be changed.`
      : null;

  return (
    <>
      <PageHeader
        title={trainee.name}
        subtitle={`${trainee.track} · ${route?.code ?? 'no route'} · ${
          trainee.registration_number ?? 'no registration number'
        }`}
        action={
          <Link
            href="/admin/trainees"
            className="focus:outline-accent min-h-[44px] rounded-xl border border-[#ccd7d4] bg-white px-3.5 py-2.5 text-[13px] font-bold text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            ← All trainees
          </Link>
        }
      />

      {isTest ? (
        <Card tone="warning">
          <p className="px-4 py-3 text-[13px] leading-relaxed text-[#5a4212]">
            This is a <strong>test row</strong>, not a real trainee. Test rows sit on real routes,
            so supervisors see them in their own lists and their counters read high. See the note at
            the foot of this page for how they are removed.
          </p>
        </Card>
      ) : null}

      <Card
        title="Particulars"
        description="Pre-loaded from the College's register; nothing is typed in the field. Every change here is written to the audit trail."
      >
        <ParticularsForm
          traineeId={trainee.id}
          disabled={!canWrite}
          values={{
            name: trainee.name,
            registrationNumber: trainee.registration_number ?? '',
            course: trainee.course,
            occupation: trainee.occupation,
            institution: trainee.institution,
            modeOfStudy: trainee.mode_of_study ?? '',
            district: trainee.district ?? '',
            region: trainee.region ?? '',
            email: trainee.email ?? '',
            phone: trainee.phone ?? '',
          }}
        />
      </Card>

      <Card
        title="Route and assessors"
        description="Assignments are what the database reads to decide who may mark this trainee."
      >
        <div className="px-4 pt-4">
          <p className="text-[13px] text-[#14232e]">
            <strong>{route?.code ?? 'No route'}</strong>
            {route?.label ? ` · ${route.label}` : ''}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#5b6b78]">
            Reassigning a slot here changes this trainee only. The route keeps its own standing pair
            of assessors, and nobody else on it is affected — use the move below to change the route
            itself.
          </p>

          <div className="mt-3">
            {(['a1', 'a2'] as const).map((slot) => {
              const assignment = assignments.find((a) => a.slot === slot);
              const supervisor = assignment ? userById.get(assignment.supervisor_id) : undefined;
              const submittedInSlot = submitted.filter((m) => m.slot === slot).length;
              return (
                <SlotAssigneeForm
                  key={slot}
                  traineeId={trainee.id}
                  traineeName={trainee.name}
                  slot={slot}
                  currentId={assignment?.supervisor_id ?? null}
                  currentName={supervisor?.name ?? null}
                  supervisors={supervisorChoices}
                  disabled={!canWrite}
                  blockedReason={
                    submittedInSlot > 0
                      ? `This slot has already submitted ${submittedInSlot === 1 ? 'a mark' : `${submittedInSlot} marks`} for this trainee. A mark belongs to the assessor who made it, so the slot can no longer be handed on.`
                      : null
                  }
                />
              );
            })}
          </div>
        </div>
        <RouteMoveForm
          traineeId={trainee.id}
          traineeName={trainee.name}
          currentRouteId={trainee.route_id}
          routes={routes.map((r) => ({ id: r.id, code: r.code }))}
          blockedReason={moveBlockedReason}
          disabled={!canWrite}
        />
      </Card>

      <Card title="Submitted marks" description="Read-only everywhere in this application.">
        <TableWrap>
          <thead>
            <tr>
              <Th>Instrument</Th>
              <Th>Assessor</Th>
              <Th>Slot</Th>
              <Th>Total</Th>
              <Th>Submitted</Th>
            </tr>
          </thead>
          <tbody>
            {marks.length === 0 ? (
              <EmptyRow colSpan={5}>Nothing submitted yet.</EmptyRow>
            ) : (
              marks.map((mark) => (
                <tr key={mark.id as string}>
                  <Td>{instrumentById.get(mark.instrument_id as string)?.label ?? '—'}</Td>
                  <Td>{userById.get(mark.supervisor_id as string)?.name ?? '—'}</Td>
                  <Td>{String(mark.slot).toUpperCase()}</Td>
                  <Td>{mark.total ?? '—'}</Td>
                  <Td className="whitespace-nowrap">
                    {mark.submitted_at ? (
                      formatTimestamp(mark.submitted_at as string)
                    ) : (
                      <Badge>not submitted</Badge>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Card>

      <Card
        title="Result"
        description="Computed in the database from both assessors' marks — never from anything typed here."
      >
        {result ? (
          <dl className="grid grid-cols-2 gap-3 p-4 text-[13px] sm:grid-cols-4">
            <Figure label="Total" value={`${result.total ?? '—'} / ${result.max}`} />
            <Figure label="Percentage" value={result.pct ? `${result.pct}%` : '—'} />
            <Figure label="Grade" value={result.grade ?? '—'} />
            <Figure label="GPA" value={result.gpa ?? '—'} />
            <Figure label="Class of award" value={result.class_of_award ?? '—'} />
            <Figure
              label="Verdict"
              value={
                result.competent === null ? '—' : result.competent ? 'Competent' : 'Not Competent'
              }
            />
            <Figure label="Locked" value={formatTimestamp(result.locked_at)} />
            <Figure label="Last updated" value={formatTimestamp(result.updated_at)} />
          </dl>
        ) : (
          <p className="px-4 py-6 text-[13px] text-[#5b6b78]">
            No result row yet — one appears once the first mark is submitted.
          </p>
        )}
      </Card>

      <Card title="Reports" description="Every generated PDF stays on file with its own hash.">
        <TableWrap>
          <thead>
            <tr>
              <Th>Generated</Th>
              <Th>SHA-256</Th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <EmptyRow colSpan={2}>No report generated yet.</EmptyRow>
            ) : (
              reports.map((report) => (
                <tr key={report.id as string}>
                  <Td className="whitespace-nowrap">
                    {formatTimestamp(report.generated_at as string)}
                  </Td>
                  <Td className="break-all font-mono text-[11.5px]">{report.sha256_hash}</Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Card>

      {voids.length > 0 ? (
        <Card
          title="Voided assessments"
          description="Assessments cleared so this trainee could be marked again. Kept whole, and never removed."
        >
          <TableWrap>
            <thead>
              <tr>
                <Th>Voided</Th>
                <Th>By</Th>
                <Th>What it held</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {voids.map((voided) => (
                <tr key={voided.id as string}>
                  <Td className="whitespace-nowrap">
                    {formatTimestamp(voided.voided_at as string)}
                  </Td>
                  <Td>{userById.get(voided.voided_by_id as string)?.name ?? '—'}</Td>
                  <Td>
                    {voided.marks_voided} {voided.marks_voided === 1 ? 'mark' : 'marks'}
                    {voided.reports_voided ? `, ${voided.reports_voided} report` : ''}
                    {(voided.reports_voided as number) > 1 ? 's' : ''}
                    <p className="mt-0.5 text-[12px] text-[#5b6b78]">
                      {voided.result_total != null
                        ? `${voided.result_total} · ${voided.result_pct}% · ${
                            voided.result_grade ?? '—'
                          } · ${voided.result_competent ? 'Competent' : 'Not Competent'}`
                        : 'no result computed'}
                      {voided.was_locked_at ? ' · was locked' : ''}
                    </p>
                  </Td>
                  <Td className="max-w-[24rem]">{voided.reason}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      ) : null}

      {canVoid ? (
        <Card
          title="Void this assessment"
          description="Returns this trainee to “Not yet assessed” so both assessors can mark them again. The marks are archived, not destroyed."
          tone="warning"
        >
          <VoidAssessmentForm
            traineeId={trainee.id}
            disabled={!canWrite}
            target={{
              traineeName: trainee.name,
              track: trainee.track as 'TP' | 'IPT',
              markCount: marks.length,
              submittedMarkCount: submitted.length,
              reportCount: reports.length,
              lockedAt: (result?.locked_at as string | null) ?? null,
              hasResult: Boolean(result),
            }}
          />
        </Card>
      ) : null}

      <Card title="Removing a trainee" tone="warning">
        <div className="space-y-2 p-4 text-[12.5px] leading-relaxed text-[#4d5f6c]">
          <p>
            <strong>If the assessment is wrong, void it above instead.</strong> That is almost
            always what is wanted: it clears the marks and the result, returns the trainee to
            &ldquo;Not yet assessed&rdquo;, and keeps them on the register where their supervisors
            can mark them again. Deleting the register entry loses the person as well as the marks.
          </p>
          <p>
            Deleting a trainee is not offered here, and the database would refuse it if it were:{' '}
            <Code>delete on trainees</Code> is revoked from every signed-in role, deliberately,
            because a trainee delete <strong>cascades to their marks</strong>.
          </p>
          <p>
            A duplicate register entry, or the test rows, are removed by an administrator in the SQL
            editor. The clean-up for test rows, which covers all four shapes including the two with
            no registration number:
          </p>
          <pre className="overflow-x-auto rounded-xl bg-[#eceff0] p-3 font-mono text-[11.5px] text-[#14232e]">
            {TEST_TRAINEE_DELETE_SQL}
          </pre>
          <p>
            Enabling this from the console needs a reviewed migration adding a guarded,
            audit-logging function for it — a change to database permissions, which is never made
            without the College&rsquo;s sign-off.
          </p>
        </div>
      </Card>
    </>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] font-bold uppercase tracking-[0.5px] text-[#5b6b78]">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-bold text-[#14232e]">{value}</dd>
    </div>
  );
}
