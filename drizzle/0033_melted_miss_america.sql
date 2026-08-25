CREATE TABLE "tutor_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"tutor_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tutor_id" integer NOT NULL,
	"learner_id" text NOT NULL,
	"session_id" integer,
	"target_language" varchar(10) NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"status" varchar(20) DEFAULT 'requested' NOT NULL,
	"purpose" varchar(20) DEFAULT 'lesson' NOT NULL,
	"learner_note" text,
	"livekit_room_name" varchar(80) NOT NULL,
	"chat_room_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_bookings_livekit_room_name_unique" UNIQUE("livekit_room_name")
);
--> statement-breakpoint
CREATE TABLE "tutor_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"tutor_id" integer NOT NULL,
	"learner_id" text NOT NULL,
	"session_id" integer,
	"vocabulary_score" integer,
	"grammar_score" integer,
	"fluency_score" integer,
	"cultural_score" integer,
	"task_score" integer,
	"expression_appropriateness_score" integer,
	"agrees_with_ai" varchar(20),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_evaluations_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "tutors" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"headline" varchar(160) NOT NULL,
	"bio" text,
	"languages" text NOT NULL,
	"hourly_rate_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"timezone" varchar(60) DEFAULT 'UTC' NOT NULL,
	"verification_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"is_accepting_bookings" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tutors_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "tutor_availability" ADD CONSTRAINT "tutor_availability_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_chat_room_id_chat_rooms_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_evaluations" ADD CONSTRAINT "tutor_evaluations_booking_id_tutor_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."tutor_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_evaluations" ADD CONSTRAINT "tutor_evaluations_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_evaluations" ADD CONSTRAINT "tutor_evaluations_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_evaluations" ADD CONSTRAINT "tutor_evaluations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutors" ADD CONSTRAINT "tutors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tutor_availability_slot" ON "tutor_availability" USING btree ("tutor_id","day_of_week","start_minute");