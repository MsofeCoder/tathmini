import Link from 'next/link';
import {
  changeField,
  fieldLabel,
  hasDrifted,
  requestStatusStyle,
  type RequestStatus,
} from '@/lib/admin/change-requests';
import { formatTimestamp } from '@/lib/admin/format';
import { loadTrainees, loadUsers, type AdminTraineeRow } from '@/lib/admin/queries';
import { requireAdmin } from '@/lib/admin/session';
import { Badge, Card, Code, PageHeader } from '../ui';
import { DecisionForms } from './decision-forms';

export const dynamic = 'force-dynamic';

interface RequestRow {
  id: string;
  trainee_id: string;
  field: string;
  current_value: string | null;
  requested_value: string | null;
  reason: string;
  status: RequestStatus;
  requested_by_id: string;
  decided_by_id: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
}

/**
 * Correction requests raised by supervisors (ROADMAP.md Phase 3).
 *
 * The register is the College's record and only a Super Administrator writes to
 * it — but the person who knows a particular is wrong is the supervisor in the
 * field. This is where those two meet: they ask, an administrator decides, and
 * the decision is on the record either way.
 */
export default async function AdminRequestsPage() {
  const { supabase, canWrite } = await requireAdmin();

  const [requestsRes, trainees, users] = await Promise.all([
    supabase
      .from('trainee_change_requests')
      .select(
        'id, trainee_id, field, current_value, requested_value, reason, status, requested_by_id, decided_by_id, decision_note, created_at, decided_at',
      )
      .order('created_at', { ascending: false })
      .limit(200),
    loadTrainees(supabase),
    loadUsers(supabase),
  ]);

  // The table only exists once migration 0030 is applied. Saying so is more use
  // than an empty list that looks like nobody has asked for anything.
  const notEnabled =
    requestsRes.error?.code === '42P01' ||
    (requestsRes.error?.message.includes('trainee_change_requests') ?? false);

  const requests = (requestsRes.data ?? []) as RequestRow[];
  const traineeById = new Map(trainees.map((t) => [t.id, t]));
  const userNameById = new Map(users.map((u) => [u.id, u.name]));

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  return (
    <>
      <PageHeader
        title="Correction requests"
        subtitle="A supervisor cannot change the register. They can tell you what is wrong with it — this is where those requests arrive."
        action={
          pending.length > 0 ? (
            <Badge bg="#e6eefc" fg="#243f7a">
              {pending.length} waiting
            </Badge>
          ) : null
        }
      />

      {notEnabled ? (
        <Card tone="warning">
          <div className="space-y-2 p-4 text-[13px] leading-relaxed text-[#5a4212]">
            <p className="font-bold">Not switched on yet.</p>
            <p>
              This needs migration <Code>0030_trainee_change_requests.sql</Code>, which has not been
              applied to the database. Until it is, the supervisors&rsquo; &ldquo;Report a
              correction&rdquo; button tells them to speak to you directly, and nothing is lost.
            </p>
          </div>
        </Card>
      ) : null}

      {!notEnabled && requests.length === 0 ? (
        <Card>
          <p className="px-4 py-8 text-center text-[13px] text-[#5b6b78]">
            No corrections have been requested.
          </p>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[14px] font-bold text-[#14232e]">Waiting for you</h2>
          {pending.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              traineeName={traineeById.get(request.trainee_id)?.name ?? '(trainee removed)'}
              currentInRegister={currentValue(traineeById.get(request.trainee_id), request.field)}
              requesterName={userNameById.get(request.requested_by_id) ?? 'a supervisor'}
              deciderName={null}
              canWrite={canWrite}
            />
          ))}
        </section>
      ) : null}

      {decided.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[14px] font-bold text-[#14232e]">Already decided</h2>
          {decided.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              traineeName={traineeById.get(request.trainee_id)?.name ?? '(trainee removed)'}
              currentInRegister={currentValue(traineeById.get(request.trainee_id), request.field)}
              requesterName={userNameById.get(request.requested_by_id) ?? 'a supervisor'}
              deciderName={
                request.decided_by_id ? (userNameById.get(request.decided_by_id) ?? null) : null
              }
              canWrite={canWrite}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

/** What the register holds for that field right now, whatever field it is. */
function currentValue(trainee: AdminTraineeRow | undefined, fieldKey: string): string | null {
  const field = changeField(fieldKey);
  if (!trainee || !field) return null;
  const value = (trainee as unknown as Record<string, unknown>)[field.column];
  return value === null || value === undefined ? null : String(value);
}

function RequestCard({
  request,
  traineeName,
  currentInRegister,
  requesterName,
  deciderName,
  canWrite,
}: {
  request: RequestRow;
  traineeName: string;
  currentInRegister: string | null;
  requesterName: string;
  deciderName: string | null;
  canWrite: boolean;
}) {
  const style = requestStatusStyle(request.status);
  const label = fieldLabel(request.field);
  const drifted =
    request.status === 'pending' && hasDrifted(request.current_value, currentInRegister);

  return (
    <Card tone={drifted ? 'warning' : 'plain'}>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge bg={style.bg} fg={style.fg}>
            {style.label}
          </Badge>
          <Link
            href={`/admin/trainees/${request.trainee_id}`}
            className="focus:outline-accent text-[14px] font-bold text-[#0d4a43] underline focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            {traineeName}
          </Link>
          <span className="text-[13px] text-[#5b6b78]">· {label}</span>
          <span className="ml-auto text-[12px] text-[#5b6b78]">
            {requesterName}, {formatTimestamp(request.created_at)}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Value label="Register holds" value={currentInRegister} />
          <Value label="Asked to become" value={request.requested_value} emphasis />
        </div>

        {drifted ? (
          <p className="text-[12.5px] leading-relaxed text-[#8a5a12]">
            <strong>Careful:</strong> when this was raised the register held{' '}
            {request.current_value ? <Code>{request.current_value}</Code> : 'nothing'} — it has
            changed since. Applying this will overwrite whatever changed it.
          </p>
        ) : null}

        <p className="text-[13px] leading-relaxed text-[#3c4c58]">
          <span className="font-semibold text-[#5b6b78]">Because: </span>
          {request.reason}
        </p>

        {request.status === 'pending' ? (
          <DecisionForms
            requestId={request.id}
            fieldLabel={label}
            requestedDisplay={request.requested_value ?? 'nothing'}
            drifted={drifted}
            disabled={!canWrite}
          />
        ) : (
          <p className="text-[12.5px] leading-relaxed text-[#5b6b78]">
            {style.label} by {deciderName ?? 'an administrator'},{' '}
            {formatTimestamp(request.decided_at)}
            {request.decision_note ? ` — ${request.decision_note}` : ''}
          </p>
        )}
      </div>
    </Card>
  );
}

function Value({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string | null;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl bg-[#f6f8f8] px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#5b6b78]">{label}</p>
      <p
        className={`mt-0.5 break-all text-[13.5px] ${
          emphasis ? 'font-bold text-[#0d4a43]' : 'text-[#14232e]'
        }`}
      >
        {value ?? <span className="italic text-[#5b6b78]">nothing on file</span>}
      </p>
    </div>
  );
}
