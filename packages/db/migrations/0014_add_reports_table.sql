-- NOTE: drizzle-kit's snapshot chain drifted before this migration (several
-- earlier migrations were hand-written without regenerating a snapshot), so
-- `drizzle-kit generate` proposed a spurious `users.must_change_password`
-- ADD COLUMN here — that column already exists live (migration 0009). Left
-- out. This migration's own snapshot (0014_snapshot.json) is the first
-- accurate one in a while; future `db:generate` runs diff against it.

CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"sha256_hash" text NOT NULL,
	"generated_by_id" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_trainee_id_trainees_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."trainees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_id_users_id_fk" FOREIGN KEY ("generated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ── RLS on reports: same read scope as results (AGENTS.md rule 1 — a row
-- level policy, not a UI filter). Append-only: no update/delete policy for
-- any role, matching assessment_marks' "no UPDATE grant" precedent — a
-- regenerated report is a new row, not an edit to an old one.
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY reports_select ON reports FOR SELECT TO authenticated
  USING (is_coordinator() OR is_super_admin() OR is_assigned_to_trainee(trainee_id));--> statement-breakpoint

-- Insert only by an assigned supervisor (or coordinator/super_admin), and
-- only once the result is actually locked — generating a report from a
-- half-submitted assessment would print marks the other assessor never
-- signed off on.
CREATE POLICY reports_insert ON reports FOR INSERT TO authenticated
  WITH CHECK (
    generated_by_id = auth.uid()
    AND (is_coordinator() OR is_super_admin() OR is_assigned_to_trainee(trainee_id))
    AND EXISTS (
      SELECT 1 FROM results r WHERE r.id = reports.result_id AND r.locked_at IS NOT NULL
    )
  );--> statement-breakpoint

-- ── Storage: a private bucket for generated PDFs, never a public path
-- (AGENTS.md "Never do these" — short-lived signed URLs only). Objects are
-- stored as reports/{trainee_id}/{report_id}.pdf so RLS can key off the
-- first path segment via storage.foldername(), the same is_assigned_to_
-- trainee() scoping as everywhere else — no service-role key needed in the
-- running app to mint a signed URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

CREATE POLICY reports_bucket_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'reports'
    AND (
      is_coordinator() OR is_super_admin()
      OR is_assigned_to_trainee((storage.foldername(name))[1]::uuid)
    )
  );--> statement-breakpoint

CREATE POLICY reports_bucket_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reports'
    AND (
      is_coordinator() OR is_super_admin()
      OR is_assigned_to_trainee((storage.foldername(name))[1]::uuid)
    )
  );