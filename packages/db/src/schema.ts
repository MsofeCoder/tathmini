/**
 * Drizzle schema for the eleven Phase 0 tables (ROADMAP.md / CONTEXT.md):
 * users · trainees · instruments · criteria · assignments ·
 * assessment_marks · results · result_revisions · reassignments ·
 * notifications · audit_log
 *
 * NOT YET WRITTEN. PLAN.md 0.2 requires the SQL to be shown and approved
 * before it runs, and two design questions are still open (see MEMORY.md):
 *
 *   1. Where "route" lives — CONTEXT.md and the RLS policies in PLAN.md 0.3
 *      treat a supervisor's route as load-bearing, but it isn't one of the
 *      eleven named tables. Confirm whether it's derived from `assignments`
 *      or needs its own table before this file is written.
 *   2. The TP Practical form's two numbering defects (a repeated "vii." in
 *      section 2, an unnumbered final section) must be resolved before
 *      `criteria` is seeded — AGENTS.md forbids renumbering a VETA section
 *      without confirmation.
 *
 * Do not add tables here speculatively; a schema written to fill this file
 * without those answers is exactly the kind of guess AGENTS.md prohibits.
 */

export {};
