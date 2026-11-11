CREATE TABLE "gear_item_images" (
	"image_id" uuid PRIMARY KEY NOT NULL,
	"gear_item_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handle_history" (
	"old_handle" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"release_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploader_id" text,
	"widths" integer[] NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"source" text NOT NULL,
	"license" text NOT NULL,
	"attribution" text,
	"source_url" text,
	"status" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "images_source" CHECK ("images"."source" IN ('user_upload', 'brand_provided', 'cc', 'house')),
	CONSTRAINT "images_status" CHECK ("images"."status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "owned_gear" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"gear_item_id" uuid NOT NULL,
	"finish_id" uuid,
	"custom_finish" text,
	"nickname" text,
	"mods" text,
	"notes" text,
	"status" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owned_gear_status" CHECK ("owned_gear"."status" IN ('owned', 'sold', 'wishlist')),
	CONSTRAINT "owned_gear_visibility" CHECK ("owned_gear"."visibility" IN ('private', 'public')),
	CONSTRAINT "owned_gear_one_finish" CHECK ("owned_gear"."finish_id" IS NULL OR "owned_gear"."custom_finish" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "owned_gear_images" (
	"image_id" uuid PRIMARY KEY NOT NULL,
	"owned_gear_id" uuid NOT NULL,
	"offered_for_gear_page" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "gear_item_images" ADD CONSTRAINT "gear_item_images_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_item_images" ADD CONSTRAINT "gear_item_images_gear_item_id_gear_items_id_fk" FOREIGN KEY ("gear_item_id") REFERENCES "public"."gear_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handle_history" ADD CONSTRAINT "handle_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_gear" ADD CONSTRAINT "owned_gear_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_gear" ADD CONSTRAINT "owned_gear_gear_item_id_gear_items_id_fk" FOREIGN KEY ("gear_item_id") REFERENCES "public"."gear_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_gear" ADD CONSTRAINT "owned_gear_finish_id_gear_finishes_id_fk" FOREIGN KEY ("finish_id") REFERENCES "public"."gear_finishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_gear_images" ADD CONSTRAINT "owned_gear_images_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_gear_images" ADD CONSTRAINT "owned_gear_images_owned_gear_id_owned_gear_id_fk" FOREIGN KEY ("owned_gear_id") REFERENCES "public"."owned_gear"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gear_item_images_gear_item_id_idx" ON "gear_item_images" USING btree ("gear_item_id");--> statement-breakpoint
CREATE INDEX "handle_history_user_id_idx" ON "handle_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "images_uploader_id_idx" ON "images" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "images_status_idx" ON "images" USING btree ("status");--> statement-breakpoint
CREATE INDEX "owned_gear_user_id_idx" ON "owned_gear" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "owned_gear_gear_item_id_idx" ON "owned_gear" USING btree ("gear_item_id");--> statement-breakpoint
CREATE INDEX "owned_gear_finish_id_idx" ON "owned_gear" USING btree ("finish_id");--> statement-breakpoint
CREATE INDEX "owned_gear_images_owned_gear_id_idx" ON "owned_gear_images" USING btree ("owned_gear_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_bio_length" CHECK (char_length("users"."bio") <= 160);