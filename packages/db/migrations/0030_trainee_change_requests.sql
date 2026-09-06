-- A supervisor asks for a trainee's particulars to be corrected; a Super
-- Administrator applies or declines it.
--
-- NOT APPLIED. Review, then apply in the SQL editor. Until it is applied the
-- console's Requests tab and the supervisor's "Report a correction" button both
-- say so plainly and do nothing.
--
-- WHY THIS EXISTS
--
-- Only a Super Administrator may write to `trainees` (`trainees_admin_write`,
-- migration 0001), and that is correct: the register is the College's record and
-- the particulars print on a VETA certificate. But the person who NOTICES a
-- wrong e-mail address is the supervisor standing in front of the trainee, and
-- until now they had nowhere to put that knowledge — the console could correct
-- anything, and nobody could tell it what needed correcting.
--
-- Today's live example: two real trainees on TP ROUTE 1 and TP ROUTE 2 share one
-- e-mail address that matches neither of their names. Their own supervisors
-- would know within a minute which address is wrong. This is the table that lets
-- them say so.
--
-- WHAT IT IS NOT
--
-- Not a way around the write policy. A request is a piece of text asking for a
-- change; applying it is still a Super Administrator writing to `trainees`
-- through `trainees_admin_write`, and the application re-validates the value at
-- that moment rather than trusting what was typed days earlier. A request that
-- is never decided changes nothing.
--
-- Marks, results, routes and assessor assignments are deliberately NOT
-- requestable: `field` is constrained to the register particulars. A mark is
-- append-only (AGENTS.md rule 2) and a route change moves who may assess —
-- neither belongs in a free-text request from the field.

create type change_request_status as enum ('pending', 'applied', 'declined');

create table trainee_change_requests (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references trainees(id) on delete cascade,
  -- Which particular is wrong. Constrained, not free text: an unknown column
  -- name here would be a request nobody can apply.
  field text not null,
  -- What the register held when the request was made. Kept for the audit trail
  -- and so the administrator can see whether it has since changed underneath
  -- them — it is never written back to `trainees`.
  current_value text,
  -- What the supervisor believes it should be. Nullable: "this address belongs
  -- to nobody, clear it" is a legitimate request.
  requested_value text,
  reason text not null,
  status change_request_status not null default 'pending',
  requested_by_id uuid not null references users(id),
  decided_by_id uuid references users(id),
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,

  constraint trainee_change_requests_field_check check (
    field in (
      'name', 'registration_number', 'course', 'occupation', 'institution',
      'mode_of_study', 'district', 'region', 'email', 'phone'
    )
  ),
  constraint trainee_change_requests_reason_check check (length(trim(reason)) > 0),
  -- A decided request must say who decided it and when; a pending one must not.
  constraint trainee_change_requests_decision_check check (
    (status = 'pending' and decided_by_id is null and decided_at is null)
    or (status <> 'pending' and decided_by_id is not null and decided_at is not null)
  )
);

create index trainee_change_requests_status_idx on trainee_change_requests (status);
create index trainee_change_requests_trainee_idx on trainee_change_requests (trainee_id);

alter table trainee_change_requests enable row level security;

-- A supervisor sees their own requests and no one else's; the Coordinator and
-- Super Administrator see every request. Same shape as `reassignments`.
create policy trainee_change_requests_select on trainee_change_requests for select to authenticated
  using (requested_by_id = auth.uid() or is_coordinator() or is_super_admin());

-- Raised only by someone actually assessing that trainee, only in their own
-- name, and only as pending. The `status = 'pending'` clause is what stops a
-- crafted request from arriving pre-approved.
create policy trainee_change_requests_insert on trainee_change_requests for insert to authenticated
  with check (
    requested_by_id = auth.uid()
    and status = 'pending'
    and (is_assigned_to_trainee(trainee_id) or is_super_admin())
  );

-- Deciding is the Super Administrator's alone. Note there is no policy that lets
-- a requester edit their own row after the fact: a request is a record of what
-- was asked, not a draft.
create policy trainee_change_requests_decide on trainee_change_requests for update to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- No role deletes a request, for the same reason no role deletes an audit entry:
-- a declined request is the record of a correction the College considered and
-- did not make.
revoke delete on trainee_change_requests from authenticated;

create trigger trainee_change_requests_audit
  after insert or update on trainee_change_requests
  for each row execute function log_audit();

-- ══════════════════════════════════════════════════════════════════════
-- Prove it worked
-- ══════════════════════════════════════════════════════════════════════
--
--   select count(*) from trainee_change_requests;  -- expect 0
--
--   select policyname, cmd from pg_policies
--   where tablename = 'trainee_change_requests' order by policyname;
--   -- expect three: _decide (UPDATE), _insert (INSERT), _select (SELECT)
--
--   select has_table_privilege('authenticated', 'trainee_change_requests', 'delete');
--   -- expect false
