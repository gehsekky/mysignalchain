import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ItemSpecs,
  PortSpec,
  Routing,
  SignalType,
} from "@/lib/catalog/schema";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("display_name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Null until onboarding is finished. See docs/PLAN.md.
    handle: text("handle").unique(),
    // Only the fact that the check passed is kept, never a birth date.
    ageCheckPassedAt: timestamp("age_check_passed_at", { withTimezone: true }),
    // Admins moderate the catalog. Granted by hand in the database.
    role: text("role", { enum: ["user", "admin"] })
      .notNull()
      .default("user"),
    ...timestamps,
  },
  (table) => [
    check(
      "users_handle_format",
      sql`${table.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${table.handle}) BETWEEN 3 AND 30`,
    ),
    check("users_role", sql`${table.role} IN ('user', 'admin')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// ---------------------------------------------------------------------------
// Gear catalog. See "Data model" in docs/PLAN.md; JSONB shapes are defined
// and validated in lib/catalog.
// ---------------------------------------------------------------------------

const slugCheck = (column: AnyPgColumn) =>
  sql`${column} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`;

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [check("brands_slug_format", slugCheck(table.slug))],
);

export const gearCategories = pgTable(
  "gear_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => gearCategories.id,
    ),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    check("gear_categories_slug_format", slugCheck(table.slug)),
    index("gear_categories_parent_id_idx").on(table.parentId),
  ],
);

export const gearItems = pgTable(
  "gear_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    slug: text("slug").notNull(),
    modelName: text("model_name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => gearCategories.id),
    variantOfId: uuid("variant_of_id").references(
      (): AnyPgColumn => gearItems.id,
    ),
    years: text("years"),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Brand, model and aliases, normalized; see buildSearchText.
    searchText: text("search_text").notNull(),
    status: text("status", {
      enum: ["pending", "approved", "rejected", "merged"],
    }).notNull(),
    mergedIntoId: uuid("merged_into_id").references(
      (): AnyPgColumn => gearItems.id,
    ),
    // Null for seeded items, which the catalog sync owns.
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // Shown to the submitter when an item is rejected.
    reviewNote: text("review_note"),
    role: text("role", { enum: ["source", "destination"] }),
    routingModel: text("routing_model", {
      enum: ["fixed", "loop_switcher", "channels", "switch", "programmable"],
    }).notNull(),
    // The rest of the Routing object (everything but `model`).
    routingSpec: jsonb("routing_spec")
      .$type<Omit<Routing, "model">>()
      .notNull()
      .default({}),
    specs: jsonb("specs").$type<ItemSpecs>().notNull().default({}),
    sourceUrl: text("source_url"),
    ...timestamps,
  },
  (table) => [
    unique("gear_items_brand_slug_unique").on(table.brandId, table.slug),
    check("gear_items_slug_format", slugCheck(table.slug)),
    check(
      "gear_items_status",
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'merged')`,
    ),
    check(
      "gear_items_merged_into",
      sql`(${table.status} = 'merged') = (${table.mergedIntoId} IS NOT NULL) AND ${table.mergedIntoId} IS DISTINCT FROM ${table.id}`,
    ),
    check(
      "gear_items_role",
      sql`${table.role} IS NULL OR ${table.role} IN ('source', 'destination')`,
    ),
    check(
      "gear_items_routing_model",
      sql`${table.routingModel} IN ('fixed', 'loop_switcher', 'channels', 'switch', 'programmable')`,
    ),
    index("gear_items_category_id_idx").on(table.categoryId),
    index("gear_items_status_idx").on(table.status),
    index("gear_items_created_by_idx").on(table.createdBy),
    index("gear_items_merged_into_id_idx").on(table.mergedIntoId),
    index("gear_items_search_text_trgm_idx").using(
      "gin",
      sql`${table.searchText} gin_trgm_ops`,
    ),
  ],
);

export const gearPorts = pgTable(
  "gear_ports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gearItemId: uuid("gear_item_id")
      .notNull()
      .references(() => gearItems.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    signalTypes: text("signal_types").array().$type<SignalType[]>().notNull(),
    jackGroup: text("jack_group"),
    spec: jsonb("spec").$type<PortSpec>().notNull().default({}),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [
    unique("gear_ports_item_key_unique").on(table.gearItemId, table.key),
    check("gear_ports_direction", sql`${table.direction} IN ('in', 'out')`),
    check(
      "gear_ports_signal_types",
      sql`cardinality(${table.signalTypes}) > 0 AND ${table.signalTypes} <@ ARRAY['audio', 'acoustic', 'expression', 'control', 'midi', 'power', 'usb']::text[]`,
    ),
  ],
);

export const gearPortPaths = pgTable(
  "gear_port_paths",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gearItemId: uuid("gear_item_id")
      .notNull()
      .references(() => gearItems.id, { onDelete: "cascade" }),
    fromPortKey: text("from_port_key").notNull(),
    toPortKey: text("to_port_key").notNull(),
    activeWhenUnplugged: text("active_when_unplugged"),
  },
  (table) => [
    foreignKey({
      name: "gear_port_paths_from_fk",
      columns: [table.gearItemId, table.fromPortKey],
      foreignColumns: [gearPorts.gearItemId, gearPorts.key],
    }).onDelete("cascade"),
    foreignKey({
      name: "gear_port_paths_to_fk",
      columns: [table.gearItemId, table.toPortKey],
      foreignColumns: [gearPorts.gearItemId, gearPorts.key],
    }).onDelete("cascade"),
    foreignKey({
      name: "gear_port_paths_unplugged_fk",
      columns: [table.gearItemId, table.activeWhenUnplugged],
      foreignColumns: [gearPorts.gearItemId, gearPorts.key],
    }).onDelete("cascade"),
    index("gear_port_paths_gear_item_id_idx").on(table.gearItemId),
  ],
);

export const gearFinishes = pgTable(
  "gear_finishes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gearItemId: uuid("gear_item_id")
      .notNull()
      .references(() => gearItems.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [
    unique("gear_finishes_item_slug_unique").on(table.gearItemId, table.slug),
  ],
);
