CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug"),
	CONSTRAINT "brands_slug_format" CHECK ("brands"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "gear_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gear_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "gear_categories_slug_format" CHECK ("gear_categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "gear_finishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gear_item_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gear_finishes_item_slug_unique" UNIQUE("gear_item_id","slug")
);
--> statement-breakpoint
CREATE TABLE "gear_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"model_name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"variant_of_id" uuid,
	"years" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_text" text NOT NULL,
	"status" text NOT NULL,
	"merged_into_id" uuid,
	"created_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"role" text,
	"routing_model" text NOT NULL,
	"routing_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gear_items_brand_slug_unique" UNIQUE("brand_id","slug"),
	CONSTRAINT "gear_items_slug_format" CHECK ("gear_items"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "gear_items_status" CHECK ("gear_items"."status" IN ('pending', 'approved', 'rejected', 'merged')),
	CONSTRAINT "gear_items_merged_into" CHECK (("gear_items"."status" = 'merged') = ("gear_items"."merged_into_id" IS NOT NULL) AND "gear_items"."merged_into_id" IS DISTINCT FROM "gear_items"."id"),
	CONSTRAINT "gear_items_role" CHECK ("gear_items"."role" IS NULL OR "gear_items"."role" IN ('source', 'destination')),
	CONSTRAINT "gear_items_routing_model" CHECK ("gear_items"."routing_model" IN ('fixed', 'loop_switcher', 'channels', 'switch', 'programmable'))
);
--> statement-breakpoint
CREATE TABLE "gear_port_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gear_item_id" uuid NOT NULL,
	"from_port_key" text NOT NULL,
	"to_port_key" text NOT NULL,
	"active_when_unplugged" text
);
--> statement-breakpoint
CREATE TABLE "gear_ports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gear_item_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"direction" text NOT NULL,
	"signal_types" text[] NOT NULL,
	"jack_group" text,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gear_ports_item_key_unique" UNIQUE("gear_item_id","key"),
	CONSTRAINT "gear_ports_direction" CHECK ("gear_ports"."direction" IN ('in', 'out')),
	CONSTRAINT "gear_ports_signal_types" CHECK (cardinality("gear_ports"."signal_types") > 0 AND "gear_ports"."signal_types" <@ ARRAY['audio', 'acoustic', 'expression', 'control', 'midi', 'power', 'usb']::text[])
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "gear_categories" ADD CONSTRAINT "gear_categories_parent_id_gear_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gear_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_finishes" ADD CONSTRAINT "gear_finishes_gear_item_id_gear_items_id_fk" FOREIGN KEY ("gear_item_id") REFERENCES "public"."gear_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_items" ADD CONSTRAINT "gear_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_items" ADD CONSTRAINT "gear_items_category_id_gear_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."gear_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_items" ADD CONSTRAINT "gear_items_variant_of_id_gear_items_id_fk" FOREIGN KEY ("variant_of_id") REFERENCES "public"."gear_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_items" ADD CONSTRAINT "gear_items_merged_into_id_gear_items_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."gear_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_items" ADD CONSTRAINT "gear_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_items" ADD CONSTRAINT "gear_items_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_port_paths" ADD CONSTRAINT "gear_port_paths_gear_item_id_gear_items_id_fk" FOREIGN KEY ("gear_item_id") REFERENCES "public"."gear_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_port_paths" ADD CONSTRAINT "gear_port_paths_from_fk" FOREIGN KEY ("gear_item_id","from_port_key") REFERENCES "public"."gear_ports"("gear_item_id","key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_port_paths" ADD CONSTRAINT "gear_port_paths_to_fk" FOREIGN KEY ("gear_item_id","to_port_key") REFERENCES "public"."gear_ports"("gear_item_id","key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_port_paths" ADD CONSTRAINT "gear_port_paths_unplugged_fk" FOREIGN KEY ("gear_item_id","active_when_unplugged") REFERENCES "public"."gear_ports"("gear_item_id","key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_ports" ADD CONSTRAINT "gear_ports_gear_item_id_gear_items_id_fk" FOREIGN KEY ("gear_item_id") REFERENCES "public"."gear_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gear_categories_parent_id_idx" ON "gear_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "gear_items_category_id_idx" ON "gear_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "gear_items_status_idx" ON "gear_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gear_items_created_by_idx" ON "gear_items" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "gear_items_merged_into_id_idx" ON "gear_items" USING btree ("merged_into_id");--> statement-breakpoint
CREATE INDEX "gear_items_search_text_trgm_idx" ON "gear_items" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "gear_port_paths_gear_item_id_idx" ON "gear_port_paths" USING btree ("gear_item_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role" CHECK ("users"."role" IN ('user', 'admin'));