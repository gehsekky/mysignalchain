/**
 * Switching, control, power and the modeler. Same rule as pedals.ts: only
 * what the maker states, with gaps listed in `specs.unconfirmed`.
 */
import type { CatalogItemInput } from "../item";
import type { Port } from "../schema";
import {
  audioIn,
  audioOut,
  dcIn,
  dcOut,
  expOrControlIn,
  midiIn,
  midiOut,
  midiThru,
  path,
} from "./jacks";

const fixed = { model: "fixed" } as const;

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// ---- BOSS ES-8 --------------------------------------------------------------

const es8Loops = [
  ...range(1, 6).map((n) => ({ n, send: `send_${n}`, ret: `rtn_${n}` })),
  { n: 7, send: "send_7", ret: "rtn_7l" },
  { n: 8, send: "send_8l", ret: "rtn_8l" },
];

const es8Ports: Port[] = [
  audioIn("in_1", { label: "In 1" }),
  audioIn("in_2", { label: "In 2" }),
  ...range(1, 7).map((n) => audioOut(`send_${n}`, { label: `Send ${n}` })),
  audioOut("send_8l", { label: "Send 8 L", channel: "left" }),
  audioOut("send_8r", { label: "Send 8 R", channel: "right" }),
  audioOut("send_vol", { label: "Send VOL" }),
  ...range(1, 6).map((n) => audioIn(`rtn_${n}`, { label: `Return ${n}` })),
  audioIn("rtn_7l", { label: "Return 7 L", channel: "left" }),
  audioIn("rtn_7r", { label: "Return 7 R", channel: "right" }),
  audioIn("rtn_8l", { label: "Return 8 L", channel: "left" }),
  audioIn("rtn_8r", { label: "Return 8 R", channel: "right" }),
  audioIn("rtn_vol", { label: "Return VOL" }),
  audioOut("out_1", { label: "Out 1/L", channel: "left" }),
  audioOut("out_2", { label: "Out 2/R", channel: "right" }),
  audioOut("tuner", { label: "Tuner" }),
  ...["1_2", "3_4", "5_6"].map((pair): Port => ({
    key: `ctl_out_${pair}`,
    label: `CTL ${pair.replace("_", "/")}`,
    direction: "out",
    signalTypes: ["control"],
    spec: {},
  })),
  ...[1, 2].map((n): Port => ({
    key: `exp_out_${n}`,
    label: `EXP ${n}`,
    direction: "out",
    signalTypes: ["expression"],
    spec: { expression: {} },
  })),
  expOrControlIn("ctl_in_1", "CTL IN EXP 1 / CTL 1/2"),
  expOrControlIn("ctl_in_2", "CTL IN EXP 2 / CTL 3/4"),
  midiIn(),
  midiThru({}, "midi_out", "MIDI out/thru"),
  dcIn({ volts: 9, ma: 400 }),
];

// ---- Morningstar MC6 Pro ------------------------------------------------------

/** Each Omniport is a TRS MIDI out, an expression input or an aux switch input. */
const omniport = (n: number): Port[] =>
  [
    expOrControlIn(`omni_${n}_in`, `Omniport ${n} (EXP / aux)`),
    {
      ...midiOut(
        { connector: "trs" },
        `omni_${n}_midi`,
        `Omniport ${n} (MIDI out)`,
      ),
      jackGroup: `omni_${n}`,
    },
  ].map((port) => ({ ...port, jackGroup: `omni_${n}` }));

// ---- Power -------------------------------------------------------------------

const out = (
  n: number,
  volts: number[],
  ma: number,
  extra: { isolated?: boolean; kind?: "dc" | "ac" } = {},
) =>
  dcOut({ key: `power_out_${n}`, label: `Output ${n}`, volts, ma, ...extra });

export const rig: CatalogItemInput[] = [
  // ---- Switching -----------------------------------------------------------
  {
    brand: "boss",
    slug: "ls-2",
    modelName: "LS-2 Line Selector",
    category: "switcher",
    aliases: ["Line Selector"],
    routing: {
      model: "switch",
      positions: [
        {
          key: "a",
          label: "A",
          paths: [path("in", "send_a"), path("return_a", "out")],
        },
        {
          key: "b",
          label: "B",
          paths: [path("in", "send_b"), path("return_b", "out")],
        },
      ],
    },
    specs: {
      battery: "9V",
      bypass: "buffered",
      notes: "Six modes; only A and B are modelled so far.",
      unconfirmed: [
        "power polarity",
        "TS or TRS jacks",
        "the other four modes",
      ],
    },
    sourceUrl: "https://www.boss.info/us/products/ls-2/specifications/",
    ports: [
      audioIn(),
      audioOut("send_a", { label: "Send A" }),
      audioIn("return_a", { label: "Return A" }),
      audioOut("send_b", { label: "Send B" }),
      audioIn("return_b", { label: "Return B" }),
      audioOut(),
      { ...dcIn({ volts: 9, ma: 30, label: "DC in/out" }), jackGroup: "dc" },
      {
        ...dcOut({ key: "dc_out", label: "DC in/out (out)" }),
        jackGroup: "dc",
      },
    ],
    paths: [path("dc_in", "dc_out")],
  },
  {
    brand: "radial",
    slug: "bigshot-aby",
    modelName: "BigShot ABY",
    category: "switcher",
    aliases: ["ABY", "A/B/Y"],
    routing: {
      model: "switch",
      positions: [
        { key: "a", label: "A", paths: [path("in", "out_a")] },
        { key: "b", label: "B", paths: [path("in", "out_b")] },
        {
          key: "both",
          label: "A + B",
          paths: [path("in", "out_a"), path("in", "out_b")],
        },
      ],
    },
    specs: {
      powerSource: "passive",
      bypass: "true",
      notes:
        "Passive audio path. An ISO switch puts a transformer on output B; also has 180° polarity reverse and ground lift. 9 V power only lights the LEDs.",
    },
    sourceUrl: "https://www.radialeng.com/product/bigshot-aby/specifications/",
    ports: [
      audioIn(),
      audioOut("out_a", { label: "Out A" }),
      audioOut("out_b", { label: "Out B" }),
      audioOut("tuner", { label: "Tuner" }),
      dcIn({ volts: 9, polarity: "center_negative" }),
    ],
    paths: [path("in", "tuner")],
  },
  {
    brand: "boss",
    slug: "es-8",
    modelName: "ES-8 Effects Switching System",
    category: "loop-switcher",
    aliases: ["ES8"],
    routing: {
      model: "loop_switcher",
      loops: [
        ...es8Loops.map(({ n, send, ret }) => ({
          key: `loop_${n}`,
          label: `Loop ${n}`,
          send,
          return: ret,
        })),
        {
          key: "volume",
          label: "Volume loop",
          send: "send_vol",
          return: "rtn_vol",
        },
      ],
      reorderable: true,
      parallel: true,
    },
    specs: {
      notes:
        "Loop 7 has stereo returns and loop 8 is fully stereo; only the left side is listed as the loop. Buffers switch per input and output.",
      unconfirmed: ["power polarity", "MIDI connector"],
    },
    sourceUrl: "https://www.boss.info/us/products/es-8/specifications/",
    ports: es8Ports,
    paths: [path("in_1", "out_1"), path("in_2", "out_2")],
  },

  // ---- Controllers -----------------------------------------------------------
  {
    brand: "morningstar",
    slug: "mc6-pro",
    modelName: "MC6 Pro",
    category: "midi-controller",
    aliases: ["MC6"],
    routing: fixed,
    specs: {
      notes:
        "Needs at least 500 mA (600 mA when using the relay ports), 9–12 V. Can also run from USB bus power.",
    },
    sourceUrl: "https://www.morningstar.io/mc6-pro",
    ports: [
      midiOut({ connector: "din5" }),
      midiIn({ connector: "din5" }),
      midiIn({ connector: "trs" }, "midi_in_trs", "TRS MIDI in"),
      midiThru({ connector: "trs" }, "midi_out_trs", "TRS MIDI out/thru"),
      {
        key: "usb",
        label: "USB-C device",
        direction: "in",
        signalTypes: ["usb"],
        spec: { usb: { role: "device", carries: ["midi"] } },
      },
      {
        key: "usb_host",
        label: "USB-C host",
        direction: "out",
        signalTypes: ["usb"],
        spec: { usb: { role: "host", carries: ["midi"] } },
      },
      ...[1, 2, 3, 4].flatMap(omniport),
      ...[1, 2].map((n): Port => ({
        key: `relay_${n}`,
        label: `Relay port ${n}`,
        direction: "out",
        signalTypes: ["control"],
        spec: {},
      })),
      dcIn({ volts: [9, 12], polarity: "center_negative" }),
    ],
  },
  {
    brand: "mission-engineering",
    slug: "ep1",
    modelName: "EP1 Expression Pedal",
    category: "expression-pedal",
    aliases: ["EP-1", "expression pedal"],
    routing: fixed,
    specs: { powerSource: "passive", unconfirmed: ["TRS wiring", "pot value"] },
    ports: [
      {
        key: "exp_out",
        label: "Output",
        direction: "out",
        signalTypes: ["expression"],
        spec: { expression: {} },
      },
    ],
  },

  // ---- Modeler -----------------------------------------------------------------
  {
    brand: "line-6",
    slug: "hx-stomp",
    modelName: "HX Stomp",
    category: "modeler",
    aliases: ["Helix Stomp"],
    routing: { model: "programmable" },
    specs: {
      stereo: true,
      notes:
        "Ships with its own power supply. Analog bypass is switchable. The returns can also work as an always-on aux input.",
      unconfirmed: ["power requirements", "MIDI connector", "input jack types"],
    },
    sourceUrl:
      "https://line6.com/data/6/0a000f7104886a8f76368dedc/application/pdf/HX%20Stomp%203.80%20Owner's%20Manual%20-%20English%20.pdf",
    ports: [
      audioIn("in_l", { label: "Input L/mono", channel: "left" }),
      audioIn("in_r", { label: "Input R", channel: "right" }),
      audioOut("out_l", {
        label: "Output L/mono",
        channel: "left",
        level: undefined,
      }),
      audioOut("out_r", {
        label: "Output R",
        channel: "right",
        level: undefined,
      }),
      audioOut("send", {
        label: "Send (stereo TRS)",
        channel: "stereo",
        connector: "trs",
        level: undefined,
      }),
      audioIn("return_l", {
        label: "Return L",
        channel: "left",
        level: undefined,
      }),
      audioIn("return_r", {
        label: "Return R",
        channel: "right",
        level: undefined,
      }),
      audioOut("phones", {
        label: "Phones",
        channel: "stereo",
        level: undefined,
      }),
      expOrControlIn("exp", "EXP 1/2, FS 4/5"),
      midiIn(),
      midiThru({}, "midi_out", "MIDI out/thru"),
      {
        key: "usb",
        label: "USB",
        direction: "in",
        signalTypes: ["usb"],
        spec: { usb: { role: "device", carries: ["audio", "midi"] } },
      },
    ],
  },

  // ---- Power -------------------------------------------------------------------
  {
    brand: "truetone",
    slug: "1-spot-pro-cs6",
    modelName: "1 Spot Pro CS6",
    category: "power-supply",
    aliases: ["CS6"],
    routing: fixed,
    specs: {
      powerSource: "mains",
      notes:
        "100–240 V AC mains. Every output is galvanically isolated and filtered.",
      unconfirmed: ["output polarity", "output connector"],
    },
    sourceUrl: "https://truetone.com/CS6/",
    ports: [
      out(1, [9], 500, { isolated: true }),
      out(2, [9], 500, { isolated: true }),
      out(3, [9, 18], 100, { isolated: true }),
      out(4, [9, 18], 100, { isolated: true }),
      out(5, [9, 12], 200, { isolated: true }),
      out(6, [9, 12], 200, { isolated: true }),
    ],
  },
  {
    brand: "truetone",
    slug: "1-spot-pro-cs12",
    modelName: "1 Spot Pro CS12",
    category: "power-supply",
    aliases: ["CS12"],
    routing: fixed,
    specs: {
      powerSource: "mains",
      notes:
        "115/230 V AC mains, set by a rear switch. Voltages are set with DIP switches. Output 7 can also give a variable 4–9 V.",
      unconfirmed: ["output polarity", "output connector"],
    },
    sourceUrl: "https://truetone.com/CS12/",
    ports: [
      out(1, [18], 100, { isolated: true }),
      out(2, [18], 100, { isolated: true }),
      ...range(3, 6).map((n) => out(n, [9, 12], 100, { isolated: true })),
      out(7, [9], 100, { isolated: true }),
      out(8, [9], 250, { isolated: true }),
      out(9, [9], 250, { isolated: true }),
      out(10, [9], 500, { isolated: true }),
      out(11, [9], 500, { isolated: true }),
      out(12, [9], 800, { isolated: true, kind: "ac" }),
    ],
  },
  {
    brand: "truetone",
    slug: "1-spot",
    modelName: "1 Spot",
    category: "power-supply",
    aliases: ["One Spot"],
    routing: fixed,
    specs: {
      powerSource: "mains",
      notes:
        "A single 9 V adaptor, 100–240 V AC; daisy-chains up to 10 pedals.",
    },
    sourceUrl: "https://truetone.com/1SPOT/",
    ports: [
      dcOut({
        key: "power_out_1",
        label: "Output",
        volts: [9],
        ma: 1700,
        polarity: "center_negative",
        connector: "barrel_2_1",
      }),
    ],
  },
  {
    brand: "voodoo-lab",
    slug: "pedal-power-2-plus",
    modelName: "Pedal Power 2 Plus",
    category: "power-supply",
    aliases: ["PP2+", "Pedal Power 2+"],
    routing: fixed,
    specs: {
      powerSource: "mains",
      notes:
        "Outputs 5 and 6 switch between regulated and unregulated; outputs 7 and 8 have a Sag control (4–9 V). Doubler cables give 18 or 24 V, or up to 500 mA. Includes an AC courtesy outlet.",
    },
    sourceUrl: "https://voodoolab.com/product/pedal-power-2-plus/",
    ports: [
      ...range(1, 4).map((n) =>
        dcOut({
          key: `power_out_${n}`,
          label: `Output ${n}`,
          volts: [9, 12],
          ma: 100,
          isolated: true,
          polarity: "center_negative",
          connector: "barrel_2_1",
        }),
      ),
      ...[5, 6].map((n) =>
        dcOut({
          key: `power_out_${n}`,
          label: `Output ${n}`,
          volts: [9, 12],
          ma: 250,
          isolated: true,
          polarity: "center_negative",
          connector: "barrel_2_1",
        }),
      ),
      ...[7, 8].map((n) =>
        dcOut({
          key: `power_out_${n}`,
          label: `Output ${n} (Sag)`,
          volts: [9],
          ma: 100,
          isolated: true,
          polarity: "center_negative",
          connector: "barrel_2_1",
        }),
      ),
    ],
  },
  {
    brand: "voodoo-lab",
    slug: "current-doubler-adapter",
    modelName: "Current Doubler Adapter",
    category: "power-adapter",
    aliases: ["PPAP", "current doubler"],
    routing: fixed,
    specs: {
      powerSource: "passive",
      notes:
        "Combines the current of two supply outputs for one pedal. The voltage is not combined; both outputs must be the same voltage.",
    },
    sourceUrl: "https://voodoolab.com/product/current-doubler-adapter/",
    ports: [
      dcIn({
        key: "power_in_1",
        label: "From supply 1",
        connector: "barrel_2_1",
      }),
      dcIn({
        key: "power_in_2",
        label: "From supply 2",
        connector: "barrel_2_1",
      }),
      dcOut({ key: "power_out", label: "To pedal", connector: "barrel_2_1" }),
    ],
    paths: [path("power_in_1", "power_out"), path("power_in_2", "power_out")],
  },
  {
    brand: "voodoo-lab",
    slug: "reverse-polarity-cable",
    modelName: "Reverse Polarity Cable",
    category: "power-adapter",
    aliases: ["PPREV", "polarity reverser"],
    routing: fixed,
    specs: {
      powerSource: "passive",
      notes:
        "Feeds center-positive pedals from a center-negative supply output.",
    },
    sourceUrl: "https://voodoolab.com/product/2-1mm-straight-barrel-cable/",
    ports: [
      dcIn({
        key: "power_in",
        label: "From supply",
        polarity: "center_negative",
        connector: "barrel_2_1",
      }),
      dcOut({
        key: "power_out",
        label: "To pedal",
        polarity: "center_positive",
        connector: "barrel_2_1",
      }),
    ],
    paths: [path("power_in", "power_out")],
  },
];
