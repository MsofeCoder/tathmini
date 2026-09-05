-- Gives the two comment surfaces the VETA forms actually have a home of their
-- own, replacing the per-sub-criterion comment the app used to force.
--
-- DRAFT - NOT APPLIED. Shown for review first (AGENTS.md: stop and ask on
-- migrations).
--
-- The paper forms, which decided this (College, 2026-09-05):
--   * TP Theory / TP Practical carry a COMMENTS column that is MERGED across
--     each S/N group - one comment per CRITERION, not one per sub-criterion -
--     plus a separate SUPERVISOR'S GENERAL COMMENTS block beneath the table.
--   * The IPT form has no comments column at all. Only Supervisor's Comments
--     at the end. So IPT uses general_comment alone and writes no rows to
--     assessment_mark_section_comments.
--
-- Purely additive. Nothing is dropped, no existing row changes, and
-- assessment_mark_items.comment stays exactly as it is: every assessment
-- submitted before this migration keeps its per-item comments, and
-- apps/web/src/lib/reports/render.ts falls back to joining them when a mark
-- has no section-comment rows. A report generated today must print the same
-- way tomorrow.
--
-- The comment rule itself needed no migration: validate_and_finalize_mark()
-- (migration 0001) only ever checked that every criterion was scored - it has
-- never looked at a comment. The requirement lived solely in
-- packages/shared/src/schemas.ts and has been removed there.

alter table assessment_marks add column if not exists general_comment text;

create table if not exists assessment_mark_section_comments (
  id uuid primary key default gen_random_uuid(),
  assessment_mark_id uuid not null
    references assessment_marks(id) on delete cascade,
  -- criteria.section_code, e.g. '1' on TP Theory or 'A' on IPT. Not a foreign
  -- key: section_code is a label repeated across every criterion in the
  -- section, not a row of its own anywhere.
  section_code text not null,
  comment text not null,
  created_at timestamp with time zone not null default now(),
  constraint assessment_mark_section_comments_mark_section_key
    unique (assessment_mark_id, section_code)
);

alter table assessment_mark_section_comments enable row level security;

-- Read scope is copied verbatim from assessment_mark_items_select, including
-- the submitted_slot_count(...) >= 2 gate. A comment explains a mark and is
-- exactly as revealing as the mark itself, so assessor 2 must not be able to
-- read assessor 1's comments before both have submitted either (CONTEXT.md,
-- "Assessor independence" - enforced in the database, never in React).
create policy assessment_mark_section_comments_select
  on assessment_mark_section_comments for select to authenticated
  using (
    is_coordinator() or is_super_admin()
    or exists (
      select 1 from assessment_marks am
      where am.id = assessment_mark_section_comments.assessment_mark_id
        and (
          am.supervisor_id = auth.uid()
          or (
            am.submitted_at is not null
            and is_assigned_to_trainee(am.trainee_id)
            and submitted_slot_count(am.trainee_id, am.instrument_id) >= 2
          )
        )
    )
  );

-- Insert only by the owning assessor, and only while the mark is still open -
-- same window as assessment_mark_items_insert. This is what forces the write
-- order in apps/web/src/app/actions/submit-assessment.ts: the items insert
-- fires assessment_mark_items_finalize, which stamps submitted_at, so section
-- comments must be written BEFORE the items or this policy rejects them.
create policy assessment_mark_section_comments_insert
  on assessment_mark_section_comments for insert to authenticated
  with check (
    exists (
      select 1 from assessment_marks am
      where am.id = assessment_mark_section_comments.assessment_mark_id
        and am.supervisor_id = auth.uid()
        and am.submitted_at is null
    )
  );

-- No UPDATE or DELETE policy for any role, and the grants below match: a
-- comment is part of the assessment record, as append-only as the marks it
-- explains (AGENTS.md: "No role gets an UPDATE grant on marks"). A correction
-- is a superseding revision, never an edit in place.
revoke update, delete on assessment_mark_section_comments from authenticated;
grant select, insert on assessment_mark_section_comments to authenticated;

-- general_comment rides on assessment_marks, which already has no UPDATE
-- grant, so it is append-only by inheritance: it can only be set in the
-- INSERT that creates the mark row, before any item is written.
