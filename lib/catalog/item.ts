/**
 * A whole catalog item as seed files and submissions describe it, with the
 * checks that span fields: ports that paths refer to, spec entries matching
 * signal types, and so on.
 */
import { z } from "zod";
import {
  itemSpecsSchema,
  portPathSchema,
  portSchema,
  powerInSpecSchema,
  powerOutSpecSchema,
  ROLES,
  routingSchema,
  slugSchema,
  type Port,
  type PortPath,
  type Routing,
  type SignalType,
} from "./schema";

/** Signal types whose ports must describe themselves in `spec`. */
const SPEC_REQUIRED: readonly SignalType[] = [
  "audio",
  "expression",
  "midi",
  "power",
  "usb",
];

const nameSchema = z.string().trim().min(1).max(80);

export const catalogItemSchema = z
  .strictObject({
    /** The brand's slug; seed files list brands separately. */
    brand: slugSchema,
    slug: slugSchema,
    modelName: nameSchema,
    /** A category slug, e.g. `overdrive`. */
    category: slugSchema,
    /** Slug of another item from the same brand that this is a variant of. */
    variantOf: slugSchema.optional(),
    /** e.g. "1982–present". */
    years: z.string().trim().max(40).optional(),
    role: z.enum(ROLES).optional(),
    routing: routingSchema,
    specs: itemSpecsSchema.default({}),
    aliases: z.array(nameSchema).default([]),
    finishes: z.array(nameSchema).default([]),
    /** Where the ports, power and finishes were checked. */
    sourceUrl: z.url({ protocol: /^https$/ }).optional(),
    ports: z.array(portSchema),
    paths: z.array(portPathSchema).default([]),
  })
  .superRefine((item, ctx) => {
    for (const issue of findItemProblems(item)) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: issue.path,
      });
    }
  });

export type CatalogItem = z.output<typeof catalogItemSchema>;
export type CatalogItemInput = z.input<typeof catalogItemSchema>;

type Problem = { message: string; path: (string | number)[] };

type ItemShape = {
  slug: string;
  variantOf?: string;
  routing: Routing;
  aliases: string[];
  finishes: string[];
  ports: Port[];
  paths: PortPath[];
};

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

/**
 * A path carries one signal type through, except that speakers and
 * microphones convert between audio and sound in the air (acoustic).
 */
function canConnect(a: Port, b: Port): boolean {
  if (a.signalTypes.some((type) => b.signalTypes.includes(type))) return true;
  const types = new Set([...a.signalTypes, ...b.signalTypes]);
  return types.has("audio") && types.has("acoustic");
}

/** Every rule that spans more than one field. Exported for tests. */
export function findItemProblems(item: ItemShape): Problem[] {
  const problems: Problem[] = [];
  const ports = new Map(item.ports.map((port) => [port.key, port]));

  for (const key of duplicates(item.ports.map((port) => port.key))) {
    problems.push({ message: `Duplicate port key "${key}"`, path: ["ports"] });
  }
  for (const name of duplicates(item.finishes.map((f) => f.toLowerCase()))) {
    problems.push({
      message: `Duplicate finish "${name}"`,
      path: ["finishes"],
    });
  }
  for (const name of duplicates(item.aliases.map((a) => a.toLowerCase()))) {
    problems.push({ message: `Duplicate alias "${name}"`, path: ["aliases"] });
  }
  if (item.variantOf === item.slug) {
    problems.push({
      message: "An item can't be its own variant",
      path: ["variantOf"],
    });
  }

  item.ports.forEach((port, index) => {
    const at = ["ports", index];
    for (const type of duplicates(port.signalTypes)) {
      problems.push({
        message: `Signal type "${type}" listed twice`,
        path: at,
      });
    }
    for (const type of Object.keys(port.spec)) {
      if (!port.signalTypes.includes(type as SignalType)) {
        problems.push({
          message: `Port "${port.key}" has a ${type} spec but doesn't carry ${type}`,
          path: [...at, "spec", type],
        });
      }
    }
    for (const type of port.signalTypes) {
      if (SPEC_REQUIRED.includes(type) && !port.spec[type]) {
        problems.push({
          message: `Port "${port.key}" needs a ${type} spec`,
          path: [...at, "spec"],
        });
      }
    }
    const power = port.spec.power;
    if (power) {
      // An input says what it accepts and draws; an output what it supplies.
      const schema =
        port.direction === "in" ? powerInSpecSchema : powerOutSpecSchema;
      if (!schema.safeParse(power).success) {
        problems.push({
          message: `Port "${port.key}" is an ${port.direction}put but its power spec doesn't describe one`,
          path: [...at, "spec", "power"],
        });
      }
    }
    const audio = port.spec.audio;
    if (audio?.impedanceOhms && audio.level !== "speaker") {
      problems.push({
        message: `Port "${port.key}" lists an impedance but isn't speaker level`,
        path: [...at, "spec", "audio"],
      });
    }
  });

  const groups = new Map<string, number>();
  for (const port of item.ports) {
    if (port.jackGroup) {
      groups.set(port.jackGroup, (groups.get(port.jackGroup) ?? 0) + 1);
    }
  }
  for (const [group, count] of groups) {
    if (count < 2) {
      problems.push({
        message: `Jack group "${group}" has only one port`,
        path: ["ports"],
      });
    }
  }

  const checkPath = (
    path: { from: string; to: string; activeWhenUnplugged?: string },
    at: (string | number)[],
  ) => {
    const from = ports.get(path.from);
    const to = ports.get(path.to);
    if (!from)
      problems.push({
        message: `No port "${path.from}"`,
        path: [...at, "from"],
      });
    if (!to)
      problems.push({ message: `No port "${path.to}"`, path: [...at, "to"] });
    if (from && from.direction !== "in") {
      problems.push({
        message: `A path starts at an input; "${path.from}" is an output`,
        path: [...at, "from"],
      });
    }
    if (to && to.direction !== "out") {
      problems.push({
        message: `A path ends at an output; "${path.to}" is an input`,
        path: [...at, "to"],
      });
    }
    if (from && to && !canConnect(from, to)) {
      problems.push({
        message: `"${path.from}" and "${path.to}" share no signal type`,
        path: at,
      });
    }
    if (path.activeWhenUnplugged && !ports.has(path.activeWhenUnplugged)) {
      problems.push({
        message: `No port "${path.activeWhenUnplugged}"`,
        path: [...at, "activeWhenUnplugged"],
      });
    }
  };

  item.paths.forEach((path, index) => checkPath(path, ["paths", index]));
  const pathKeys = item.paths.map(
    (p) => `${p.from}>${p.to}>${p.activeWhenUnplugged ?? ""}`,
  );
  for (const key of duplicates(pathKeys)) {
    problems.push({ message: `Duplicate path ${key}`, path: ["paths"] });
  }

  const routing = item.routing;
  const expectPort = (
    key: string,
    direction: "in" | "out",
    at: (string | number)[],
  ) => {
    const port = ports.get(key);
    if (!port) problems.push({ message: `No port "${key}"`, path: at });
    else if (port.direction !== direction) {
      problems.push({
        message: `"${key}" should be an ${direction}put`,
        path: at,
      });
    }
  };
  if (routing.model === "loop_switcher") {
    routing.loops.forEach((loop, index) => {
      expectPort(loop.send, "out", ["routing", "loops", index, "send"]);
      expectPort(loop.return, "in", ["routing", "loops", index, "return"]);
    });
  }
  if (routing.model === "channels") {
    routing.channels.forEach((channel, index) => {
      for (const key of channel.ports ?? []) {
        if (!ports.has(key)) {
          problems.push({
            message: `No port "${key}"`,
            path: ["routing", "channels", index, "ports"],
          });
        }
      }
    });
  }
  if (routing.model === "switch") {
    routing.positions.forEach((position, p) =>
      position.paths.forEach((path, index) =>
        checkPath(path, ["routing", "positions", p, "paths", index]),
      ),
    );
  }

  return problems;
}
