ALTER TABLE "trainees" ALTER COLUMN "registration_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trainees" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trainees" ADD COLUMN "phone" text;