/**
 * The shape of catalog data: ports, port paths, routing and item specs.
 * Used to validate seed files, user submissions and anything read back from
 * the JSONB columns. Plain TypeScript, no database or framework code.
 *
 * See "Port specs by signal type" and "Loops, routing models and scenes" in
 * docs/PLAN.md.
 */
import { z } from "zod";

export const SIGNAL_TYPES = [
  "audio",
  "acoustic",
  "expression",
  "control",
  "midi",
  "power",
  "usb",
] as const;
export const signalTypeSchema = z.enum(SIGNAL_TYPES);
export type SignalType = z.infer<typeof signalTypeSchema>;

export const ROLES = ["source", "destination"] as const;
export const ROUTING_MODELS = [
  "fixed",
  "loop_switcher",
  "channels",
  "switch",
  "programmable",
] as const;
export const ITEM_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "merged",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Lowercase letters, digits and underscores, e.g. `in`, `power_out_1`. */
export const keySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, digits and underscores")
  .max(40);

/** Lowercase letters, digits and single hyphens, e.g. `ts9`, `big-muff-pi`. */
export const slugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use lowercase letters, digits and hyphens",
  )
  .max(80);

// ---------------------------------------------------------------------------
// Port specs, one object per signal type the port carries
// ---------------------------------------------------------------------------

const ohms = z.number().int().positive().max(64);

export const audioSpecSchema = z.strictObject({
  channel: z.enum(["mono", "left", "right", "stereo"]),
  /** Left out when the maker doesn't state it. */
  level: z.enum(["instrument", "line", "mic", "speaker"]).optional(),
  connector: z.enum(["ts", "trs", "xlr", "combo", "speakon"]).optional(),
  /** Speaker ports: the loads an output can drive, or a cab's impedance. */
  impedanceOhms: z.array(ohms).nonempty().optional(),
});

export const acousticSpecSchema = z.strictObject({});

export const expressionSpecSchema = z.strictObject({
  wiring: z.enum(["tip_active", "ring_active", "switchable"]).optional(),
});

export const controlSpecSchema = z.strictObject({
  mode: z.enum(["momentary", "latching", "either"]).optional(),
  polarity: z.enum(["normally_open", "normally_closed", "either"]).optional(),
});

export const midiSpecSchema = z
  .strictObject({
    connector: z.enum(["din5", "trs", "usb"]).optional(),
    trsType: z.enum(["a", "b", "switchable"]).optional(),
  })
  .refine((spec) => spec.connector === "trs" || spec.trsType === undefined, {
    message: "trsType applies only to TRS MIDI jacks",
    path: ["trsType"],
  });

const volts = z.number().positive().max(250);
const milliamps = z.number().nonnegative().max(100_000);
const powerConnector = z.enum([
  "barrel_2_1",
  "barrel_2_5",
  "usb_c",
  "iec",
  "dc_cable",
]);
const polarity = z.enum(["center_negative", "center_positive"]);

/** A power input: what the device accepts and draws. */
export const powerInSpecSchema = z
  .strictObject({
    kind: z.enum(["dc", "ac"]),
    /** Both left out for passive adapters, which pass any voltage through. */
    minVolts: volts.optional(),
    maxVolts: volts.optional(),
    /** Not needed for AC inputs or USB-C. */
    polarity: polarity.optional(),
    /** Optional: left out when the maker doesn't state it. */
    drawMa: milliamps.optional(),
    connector: powerConnector.optional(),
  })
  .refine(
    (spec) =>
      (spec.minVolts === undefined) === (spec.maxVolts === undefined) &&
      (spec.minVolts === undefined || spec.minVolts <= spec.maxVolts!),
    {
      message: "Give both minVolts and maxVolts, with min no higher than max",
      path: ["maxVolts"],
    },
  );

/** A power output: what a supply, doubler or pedal's DC out provides. */
export const powerOutSpecSchema = z.strictObject({
  kind: z.enum(["dc", "ac"]),
  /** One value when fixed; several when selectable. Left out for passive adapters. */
  volts: z.array(volts).nonempty().optional(),
  polarity: polarity.optional(),
  /** Left out when the maker doesn't state it. */
  maxMa: milliamps.optional(),
  /** Optional: left out when the maker doesn't state it. */
  isolated: z.boolean().optional(),
  connector: powerConnector.optional(),
});

export const usbSpecSchema = z.strictObject({
  role: z.enum(["host", "device"]),
  carries: z.array(z.enum(["audio", "midi"])).optional(),
});

/** The spec of one port: an entry for each signal type it carries. */
export const portSpecSchema = z.strictObject({
  audio: audioSpecSchema.optional(),
  acoustic: acousticSpecSchema.optional(),
  expression: expressionSpecSchema.optional(),
  control: controlSpecSchema.optional(),
  midi: midiSpecSchema.optional(),
  power: z.union([powerInSpecSchema, powerOutSpecSchema]).optional(),
  usb: usbSpecSchema.optional(),
});
export type PortSpec = z.infer<typeof portSpecSchema>;

export const portSchema = z.strictObject({
  key: keySchema,
  label: z.string().trim().min(1).max(40),
  direction: z.enum(["in", "out"]),
  signalTypes: z.array(signalTypeSchema).nonempty(),
  /** Logical ports on one physical jack share a group, e.g. a TRS insert. */
  jackGroup: keySchema.optional(),
  spec: portSpecSchema,
});
export type Port = z.infer<typeof portSchema>;

export const portPathSchema = z.strictObject({
  from: keySchema,
  to: keySchema,
  /** The path applies only while this jack is empty (a normalled jack). */
  activeWhenUnplugged: keySchema.optional(),
});
export type PortPath = z.infer<typeof portPathSchema>;

// ---------------------------------------------------------------------------
// Routing specs, one shape per routing model
// ---------------------------------------------------------------------------

const labelled = { key: keySchema, label: z.string().trim().min(1).max(40) };

export const routingSchema = z.discriminatedUnion("model", [
  z.strictObject({ model: z.literal("fixed") }),
  z.strictObject({
    model: z.literal("loop_switcher"),
    loops: z
      .array(
        z.strictObject({ ...labelled, send: keySchema, return: keySchema }),
      )
      .nonempty(),
    reorderable: z.boolean(),
    parallel: z.boolean(),
  }),
  z.strictObject({
    model: z.literal("channels"),
    channels: z
      .array(
        z.strictObject({
          ...labelled,
          /** Ports used only by this channel, if any. */
          ports: z.array(keySchema).optional(),
        }),
      )
      .min(2),
  }),
  z.strictObject({
    model: z.literal("switch"),
    positions: z
      .array(
        z.strictObject({
          ...labelled,
          paths: z.array(z.strictObject({ from: keySchema, to: keySchema })),
        }),
      )
      .min(2),
  }),
  z.strictObject({ model: z.literal("programmable") }),
]);
export type Routing = z.infer<typeof routingSchema>;

// ---------------------------------------------------------------------------
// Item-level specs
// ---------------------------------------------------------------------------

export const itemSpecsSchema = z.strictObject({
  /** How the device is powered, when it has no DC input port to say so. */
  powerSource: z
    .enum(["mains", "battery", "passive", "phantom", "bus"])
    .optional(),
  /** Batteries it can also run on, e.g. "9V". */
  battery: z.string().max(40).optional(),
  /** Total current a supply can deliver across all outputs. */
  totalMaxMa: milliamps.optional(),
  /** Amplifier output power. */
  watts: z.number().positive().max(10_000).optional(),
  /** e.g. "4 x 12-inch Celestion G12T-75". */
  speakers: z.string().max(80).optional(),
  bypass: z.enum(["true", "buffered", "selectable", "none"]).optional(),
  stereo: z.boolean().optional(),
  notes: z.string().max(500).optional(),
  /**
   * What hasn't been confirmed with the maker, e.g. "current draw". Shown on
   * the gear page; never filled in from memory.
   */
  unconfirmed: z.array(z.string().max(60)).optional(),
});
export type ItemSpecs = z.infer<typeof itemSpecsSchema>;
