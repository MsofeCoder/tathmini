import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Thirteen tables. ROADMAP.md names eleven; two were added:
 *
 * - `routes` — real data (the September 2026 TP roster) showed a route is
 *   a named, standing thing with two fixed supervisors assigned before any
 *   trainee exists, not something derivable from `assignments` alone. See
 *   MEMORY.md for the decision record. `assignments` stays the RLS and
 *   reassignment source of truth at trainee granularity; `routes` is the
 *   seed template and the Phase 3 admin surface.
 * - `assessment_mark_items` — `assessment_marks` per PLAN.md 0.2 holds "a
 *   submitted assessor slot, with per-criterion scores"; that per-criterion
 *   breakdown is its own child table rather than a jsonb blob so the
 *   complete-form check and the total can be enforced/maintained by
 *   ordinary constraints and triggers instead of application code.
 *
 * Applied to the College's real Supabase project (`azlwxriyhdshfhklonrx`)
 * via migrations 0000–0004 (2026-09-04, see MEMORY.md). Still the source
 * of truth for packages/db/migrations/ — generate new migrations from
 * changes here via `drizzle-kit generate`, per packages/db/README.md.
 */

export const appRoleEnum = pgEnum('app_role', ['supervisor', 'coordinator', 'super_admin']);
export const trackTypeEnum = pgEnum('track_type', ['TP', 'IPT']);
export const assessorSlotEnum = pgEnum('assessor_slot', ['a1', 'a2']);
export const reassignmentStatusEnum = pgEnum('reassignment_status', [
  'requested',
  'accepted',
  'declined',
]);
export const notificationChannelEnum = pgEnum('notification_channel', ['sms', 'whatsapp', 'email']);

// ── Identity ──────────────────────────────────────────────────────

/** Mirrors auth.users; id IS the Supabase Auth uid. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // references auth.users(id), added in the RLS/FK migration
  role: appRoleEnum('role').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  /**
   * Real, reachable address. NOT used for sign-in — `email` above is the
   * synthetic @tathmini.internal identifier that authenticates. Nullable:
   * most accounts have none on file.
   */
  contactEmail: text('contact_email'),
  active: boolean('active').notNull().default(true),
  // True until the holder signs in and sets their own password (accounts
  // are admin-provisioned with a generated one-time password — no
  // self-registration, per CONTEXT.md). Cleared via the
  // clear_own_password_change_flag() RPC (migration 0009), not a direct
  // UPDATE — no RLS grant lets a user write their own row otherwise.
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A route as the College actually organises it: a named group of trainees
 * with two fixed supervisors assigned as assessor slots before any trainee
 * is seeded. Route management (Phase 3) edits this table directly.
 */
export const routes = pgTable('routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(), // e.g. "ROUTE 1", verbatim from the roster
  label: text('label'),
  supervisorA1Id: uuid('supervisor_a1_id').references(() => users.id),
  supervisorA2Id: uuid('supervisor_a2_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Trainees ──────────────────────────────────────────────────────

/**
 * `email`/`phone` are both nullable, but never both null in practice — see
 * the `trainees_track_contact_check` CHECK constraint in the companion
 * SQL. The real September 2026 rosters showed this is track-dependent,
 * not optional: the TP register has an e-mail column and no phone
 * column; the IPT register has a phone column and no e-mail column. That
 * is also why TP notices go by e-mail and IPT notices go by SMS only —
 * a College data-collection fact, not an arbitrary product choice.
 *
 * `registrationNumber` is nullable because the only IPT source seen so
 * far (a route/assessor planning sheet, not a full register — see
 * MEMORY.md) has no registration-number column at all, even though the
 * printed IPT form itself has a "Registration/Index No." field. Treat a
 * null here as "not yet backfilled from the real register," not as
 * IPT trainees having no registration number.
 */
export const trainees = pgTable(
  'trainees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    registrationNumber: text('registration_number').unique(),
    course: text('course').notNull(), // CAVT / TC-TVTE / OD-TVTE, from the roster
    modeOfStudy: text('mode_of_study'), // In-Campus / ODeL
    occupation: text('occupation').notNull(), // pre-loaded, read-only in the UI; "TRADE" on the IPT roster
    institution: text('institution').notNull(), // VTC name (TP) or industrial firm/"COMPANY" (IPT)
    district: text('district'),
    region: text('region'),
    email: text('email'),
    phone: text('phone'),
    track: trackTypeEnum('track').notNull(),
    routeId: uuid('route_id')
      .notNull()
      .references(() => routes.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('trainees_route_idx').on(t.routeId)],
);

// ── Instruments and criteria ─────────────────────────────────────

export const instruments = pgTable('instruments', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(), // 'tp_theory' | 'tp_practical' | 'ipt'
  version: integer('version').notNull().default(1),
  label: text('label').notNull(),
  track: trackTypeEnum('track').notNull(),
  maxTotal: numeric('max_total', { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Verbatim VETA wording. `sectionCode`/`sectionLabel` and `itemCode` mirror
 * the paper form's own numbering exactly — never renumbered by this schema.
 * A trigger (see the companion RLS/functions SQL) checks that each
 * instrument's section maxima sum to its `maxTotal` at seed time.
 */
export const criteria = pgTable(
  'criteria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instruments.id, { onDelete: 'restrict' }),
    sectionCode: text('section_code').notNull(), // '1' | 'A' etc., verbatim
    sectionLabel: text('section_label').notNull(),
    sectionMax: numeric('section_max', { precision: 5, scale: 2 }).notNull(),
    itemCode: text('item_code').notNull(), // 'i' | '1' etc., verbatim
    itemLabel: text('item_label').notNull(), // verbatim criterion wording
    itemMax: numeric('item_max', { precision: 4, scale: 2 }).notNull(),
    orderIndex: integer('order_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('criteria_instrument_order_idx').on(t.instrumentId, t.orderIndex),
    index('criteria_instrument_idx').on(t.instrumentId),
  ],
);

// ── Assignments (RLS source of truth, trainee-level) ─────────────

/**
 * Which supervisor assesses which trainee, in which slot. Seeded by
 * expanding each route's two supervisors across its trainees, then mutable
 * per-trainee thereafter so a single trainee can be reassigned without
 * moving the rest of the route (see `reassignments`).
 */
export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    traineeId: uuid('trainee_id')
      .notNull()
      .references(() => trainees.id, { onDelete: 'cascade' }),
    supervisorId: uuid('supervisor_id')
      .notNull()
      .references(() => users.id),
    slot: assessorSlotEnum('slot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assignments_trainee_slot_idx').on(t.traineeId, t.slot),
    // A supervisor cannot hold both slots for one trainee.
    uniqueIndex('assignments_trainee_supervisor_idx').on(t.traineeId, t.supervisorId),
    index('assignments_supervisor_idx').on(t.supervisorId),
  ],
);

// ── Marks (append-only) ───────────────────────────────────────────

/**
 * One submitted assessor slot for one instrument. `total` is maintained by
 * a trigger over `assessmentMarkItems`, not written by any client. No
 * UPDATE grant exists for any role — a correction is a new
 * `result_revisions` row, never an edit here.
 */
export const assessmentMarks = pgTable(
  'assessment_marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    traineeId: uuid('trainee_id')
      .notNull()
      .references(() => trainees.id, { onDelete: 'cascade' }),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instruments.id),
    supervisorId: uuid('supervisor_id')
      .notNull()
      .references(() => users.id),
    slot: assessorSlotEnum('slot').notNull(),
    total: numeric('total', { precision: 5, scale: 2 }),
    /**
     * The paper form's SUPERVISOR'S GENERAL COMMENTS block (both TP forms) and
     * the IPT form's Supervisor's Comments. Optional — never required of the
     * supervisor (migration 0019). Settable only in the INSERT that creates
     * this row: `assessment_marks` has no UPDATE grant, so it is append-only
     * like everything else about a mark.
     */
    generalComment: text('general_comment'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assessment_marks_trainee_instrument_slot_idx').on(
      t.traineeId,
      t.instrumentId,
      t.slot,
    ),
    index('assessment_marks_trainee_idx').on(t.traineeId),
    index('assessment_marks_supervisor_idx').on(t.supervisorId),
  ],
);

export const assessmentMarkItems = pgTable(
  'assessment_mark_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentMarkId: uuid('assessment_mark_id')
      .notNull()
      .references(() => assessmentMarks.id, { onDelete: 'cascade' }),
    criterionId: uuid('criterion_id')
      .notNull()
      .references(() => criteria.id),
    score: numeric('score', { precision: 4, scale: 2 }).notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assessment_mark_items_mark_criterion_idx').on(t.assessmentMarkId, t.criterionId),
  ],
);

/**
 * One comment per CRITERION, which is what the TP forms' merged COMMENTS
 * column actually is — the cell spans every sub-criterion row in an S/N
 * group (migration 0019). TP only: the IPT form has no comments column, so an
 * IPT assessment writes nothing here and uses `generalComment` alone.
 *
 * `sectionCode` is `criteria.section_code` ('1' on TP Theory, 'A' on IPT), not
 * a foreign key — a section is a label repeated across its criteria, not a row
 * anywhere. Append-only: no UPDATE or DELETE grant, matching the marks these
 * comments explain.
 */
export const assessmentMarkSectionComments = pgTable(
  'assessment_mark_section_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentMarkId: uuid('assessment_mark_id')
      .notNull()
      .references(() => assessmentMarks.id, { onDelete: 'cascade' }),
    sectionCode: text('section_code').notNull(),
    comment: text('comment').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assessment_mark_section_comments_mark_section_key').on(
      t.assessmentMarkId,
      t.sectionCode,
    ),
  ],
);

// ── Results (generated, never client-written) ─────────────────────

/**
 * The official per-trainee outcome. `pct`/`grade`/`gpa`/`classOfAward`/
 * `competent` are maintained by a trigger (`recompute_result()` in
 * 0001_rls_and_functions.sql) calling the same `veta_*` SQL functions the
 * generated-column expressions would otherwise need — Postgres forbids a
 * generated column from referencing another generated column, which ruled
 * out layering pct → grade → gpa as GENERATED ALWAYS AS columns directly.
 * Either way, AGENTS.md rule 3 is satisfied: computed in Postgres, never
 * accepted from a client. `total`/`theoryTotal`/`practicalTotal` are
 * likewise trigger-maintained from the average of submitted
 * `assessmentMarks` rows for the trainee's track.
 */
export const results = pgTable('results', {
  id: uuid('id').primaryKey().defaultRandom(),
  traineeId: uuid('trainee_id')
    .notNull()
    .unique()
    .references(() => trainees.id, { onDelete: 'cascade' }),
  track: trackTypeEnum('track').notNull(),
  theoryTotal: numeric('theory_total', { precision: 5, scale: 2 }),
  practicalTotal: numeric('practical_total', { precision: 5, scale: 2 }),
  total: numeric('total', { precision: 5, scale: 2 }),
  max: numeric('max', { precision: 5, scale: 2 }).notNull(),
  pct: numeric('pct', { precision: 5, scale: 2 }),
  grade: text('grade'), // 'A' | 'B' | 'C' | 'D' | 'F'
  gpa: numeric('gpa', { precision: 3, scale: 2 }),
  classOfAward: text('class_of_award'), // 'First Class' | 'Second Class' | 'Pass' | null
  competent: boolean('competent'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const resultRevisions = pgTable('result_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  resultId: uuid('result_id')
    .notNull()
    .references(() => results.id, { onDelete: 'cascade' }),
  supersededTotal: numeric('superseded_total', { precision: 5, scale: 2 }).notNull(),
  newTotal: numeric('new_total', { precision: 5, scale: 2 }).notNull(),
  reason: text('reason').notNull(), // CHECK (length(trim(reason)) > 0) in the companion SQL
  actedById: uuid('acted_by_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per generated PDF, never updated or deleted — a trainee's result
 * can be regenerated (e.g. after a `result_revisions` correction), and every
 * past copy stays on record with its own hash, matching the 24-month VETA
 * audit retention in CONTEXT.md. `storagePath` points into the private
 * `reports` Storage bucket; RLS on `storage.objects` mirrors `resultsSelect`
 * below, so a signed URL is only ever mintable by someone who could already
 * read that trainee's result.
 */
export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  traineeId: uuid('trainee_id')
    .notNull()
    .references(() => trainees.id, { onDelete: 'cascade' }),
  resultId: uuid('result_id')
    .notNull()
    .references(() => results.id, { onDelete: 'cascade' }),
  storagePath: text('storage_path').notNull(),
  sha256Hash: text('sha256_hash').notNull(),
  generatedById: uuid('generated_by_id')
    .notNull()
    .references(() => users.id),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Reassignment ────────────────────────────────────────────────

export const reassignments = pgTable('reassignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  traineeId: uuid('trainee_id')
    .notNull()
    .references(() => trainees.id, { onDelete: 'cascade' }),
  slot: assessorSlotEnum('slot').notNull(),
  fromSupervisorId: uuid('from_supervisor_id')
    .notNull()
    .references(() => users.id),
  toSupervisorId: uuid('to_supervisor_id')
    .notNull()
    .references(() => users.id),
  status: reassignmentStatusEnum('status').notNull().default('requested'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

// ── Notifications and audit ────────────────────────────────────────

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  traineeId: uuid('trainee_id')
    .notNull()
    .references(() => trainees.id, { onDelete: 'cascade' }),
  channel: notificationChannelEnum('channel').notNull(),
  sentById: uuid('sent_by_id')
    .notNull()
    .references(() => users.id),
  providerMessageId: text('provider_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only, hash-chained. No DELETE grant for any role (companion SQL). */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  targetTable: text('target_table').notNull(),
  targetId: uuid('target_id'),
  detail: text('detail'),
  prevHash: text('prev_hash'),
  hash: text('hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Relations (for query ergonomics; RLS is what actually enforces access) ──

export const routesRelations = relations(routes, ({ many, one }) => ({
  trainees: many(trainees),
  supervisorA1: one(users, { fields: [routes.supervisorA1Id], references: [users.id] }),
  supervisorA2: one(users, { fields: [routes.supervisorA2Id], references: [users.id] }),
}));

export const traineesRelations = relations(trainees, ({ many, one }) => ({
  route: one(routes, { fields: [trainees.routeId], references: [routes.id] }),
  assignments: many(assignments),
  result: one(results, { fields: [trainees.id], references: [results.traineeId] }),
}));

export const instrumentsRelations = relations(instruments, ({ many }) => ({
  criteria: many(criteria),
}));

export const criteriaRelations = relations(criteria, ({ one }) => ({
  instrument: one(instruments, { fields: [criteria.instrumentId], references: [instruments.id] }),
}));

export const assessmentMarksRelations = relations(assessmentMarks, ({ many, one }) => ({
  items: many(assessmentMarkItems),
  trainee: one(trainees, { fields: [assessmentMarks.traineeId], references: [trainees.id] }),
  instrument: one(instruments, {
    fields: [assessmentMarks.instrumentId],
    references: [instruments.id],
  }),
}));

export const assessmentMarkItemsRelations = relations(assessmentMarkItems, ({ one }) => ({
  mark: one(assessmentMarks, {
    fields: [assessmentMarkItems.assessmentMarkId],
    references: [assessmentMarks.id],
  }),
  criterion: one(criteria, {
    fields: [assessmentMarkItems.criterionId],
    references: [criteria.id],
  }),
}));

export const resultsRelations = relations(results, ({ many, one }) => ({
  trainee: one(trainees, { fields: [results.traineeId], references: [trainees.id] }),
  revisions: many(resultRevisions),
  reports: many(reports),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  trainee: one(trainees, { fields: [reports.traineeId], references: [trainees.id] }),
  result: one(results, { fields: [reports.resultId], references: [results.id] }),
}));
