CREATE TYPE "public"."app_role" AS ENUM('supervisor', 'coordinator', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."assessor_slot" AS ENUM('a1', 'a2');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('sms', 'whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."reassignment_status" AS ENUM('requested', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."track_type" AS ENUM('TP', 'IPT');--> statement-breakpoint
CREATE TABLE "assessment_mark_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_mark_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"score" numeric(4, 2) NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"supervisor_id" uuid NOT NULL,
	"slot" "assessor_slot" NOT NULL,
	"total" numeric(5, 2),
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"supervisor_id" uuid NOT NULL,
	"slot" "assessor_slot" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_table" text NOT NULL,
	"target_id" uuid,
	"detail" text,
	"prev_hash" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"section_code" text NOT NULL,
	"section_label" text NOT NULL,
	"section_max" numeric(5, 2) NOT NULL,
	"item_code" text NOT NULL,
	"item_label" text NOT NULL,
	"item_max" numeric(4, 2) NOT NULL,
	"order_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"label" text NOT NULL,
	"track" "track_type" NOT NULL,
	"max_total" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"sent_by_id" uuid NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reassignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"slot" "assessor_slot" NOT NULL,
	"from_supervisor_id" uuid NOT NULL,
	"to_supervisor_id" uuid NOT NULL,
	"status" "reassignment_status" DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "result_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id" uuid NOT NULL,
	"superseded_total" numeric(5, 2) NOT NULL,
	"new_total" numeric(5, 2) NOT NULL,
	"reason" text NOT NULL,
	"acted_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"track" "track_type" NOT NULL,
	"theory_total" numeric(5, 2),
	"practical_total" numeric(5, 2),
	"total" numeric(5, 2),
	"max" numeric(5, 2) NOT NULL,
	"pct" numeric(5, 2),
	"grade" text,
	"gpa" numeric(3, 2),
	"class_of_award" text,
	"competent" boolean,
	"locked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "results_trainee_id_unique" UNIQUE("trainee_id")
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text,
	"supervisor_a1_id" uuid,
	"supervisor_a2_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "trainees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"registration_number" text NOT NULL,
	"course" text NOT NULL,
	"mode_of_study" text,
	"occupation" text NOT NULL,
	"institution" text NOT NULL,
	"district" text,
	"region" text,
	"email" text NOT NULL,
	"track" "track_type" NOT NULL,
	"route_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainees_registration_number_unique" UNIQUE("registration_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "app_role" NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assessment_mark_items" ADD CONSTRAINT "assessment_mark_items_assessment_mark_id_assessment_marks_id_fk" FOREIGN KEY ("assessment_mark_id") REFERENCES "public"."assessment_marks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_mark_items" ADD CONSTRAINT "assessment_mark_items_criterion_id_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_trainee_id_trainees_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."trainees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_trainee_id_trainees_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."trainees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_trainee_id_trainees_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."trainees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassignments" ADD CONSTRAINT "reassignments_trainee_id_trainees_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."trainees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassignments" ADD CONSTRAINT "reassignments_from_supervisor_id_users_id_fk" FOREIGN KEY ("from_supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassignments" ADD CONSTRAINT "reassignments_to_supervisor_id_users_id_fk" FOREIGN KEY ("to_supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_revisions" ADD CONSTRAINT "result_revisions_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_revisions" ADD CONSTRAINT "result_revisions_acted_by_id_users_id_fk" FOREIGN KEY ("acted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_trainee_id_trainees_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."trainees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_supervisor_a1_id_users_id_fk" FOREIGN KEY ("supervisor_a1_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_supervisor_a2_id_users_id_fk" FOREIGN KEY ("supervisor_a2_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainees" ADD CONSTRAINT "trainees_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_mark_items_mark_criterion_idx" ON "assessment_mark_items" USING btree ("assessment_mark_id","criterion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_marks_trainee_instrument_slot_idx" ON "assessment_marks" USING btree ("trainee_id","instrument_id","slot");--> statement-breakpoint
CREATE INDEX "assessment_marks_trainee_idx" ON "assessment_marks" USING btree ("trainee_id");--> statement-breakpoint
CREATE INDEX "assessment_marks_supervisor_idx" ON "assessment_marks" USING btree ("supervisor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_trainee_slot_idx" ON "assignments" USING btree ("trainee_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_trainee_supervisor_idx" ON "assignments" USING btree ("trainee_id","supervisor_id");--> statement-breakpoint
CREATE INDEX "assignments_supervisor_idx" ON "assignments" USING btree ("supervisor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "criteria_instrument_order_idx" ON "criteria" USING btree ("instrument_id","order_index");--> statement-breakpoint
CREATE INDEX "criteria_instrument_idx" ON "criteria" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "trainees_route_idx" ON "trainees" USING btree ("route_id");