/**
 * Shorthand for the jacks that seed files describe over and over. Each
 * returns a plain port object, validated later by catalogItemSchema.
 */
import type { Port, PortPath } from "../schema";

type AudioSpec = NonNullable<Port["spec"]["audio"]>;
/** Level defaults to instrument; pass `level: undefined` when unknown. */
type Audio = Partial<AudioSpec> & { label?: string; jackGroup?: string };

function audio(
  key: string,
  direction: "in" | "out",
  defaultLabel: string,
  { label, jackGroup, ...given }: Audio = {},
): Port {
  const spec =
    "level" in given ? given : { ...given, level: "instrument" as const };
  return {
    key,
    label: label ?? defaultLabel,
    direction,
    signalTypes: ["audio"],
    ...(jackGroup ? { jackGroup } : {}),
    spec: {
      audio: {
        channel: spec.channel ?? "mono",
        ...(spec.level === undefined ? {} : { level: spec.level }),
        ...(spec.connector ? { connector: spec.connector } : {}),
        ...(spec.impedanceOhms ? { impedanceOhms: spec.impedanceOhms } : {}),
      },
    },
  };
}

export const audioIn = (key = "in", opts: Audio = {}) =>
  audio(key, "in", key === "in" ? "Input" : key, opts);
export const audioOut = (key = "out", opts: Audio = {}) =>
  audio(key, "out", key === "out" ? "Output" : key, opts);

/** Stereo pedal jacks: left (mono) and right. */
export const stereoIns = (level: AudioSpec["level"] = "instrument") => [
  audioIn("in_l", { label: "Input L (mono)", channel: "left", level }),
  audioIn("in_r", { label: "Input R", channel: "right", level }),
];
export const stereoOuts = (level: AudioSpec["level"] = "instrument") => [
  audioOut("out_l", { label: "Output L (mono)", channel: "left", level }),
  audioOut("out_r", { label: "Output R", channel: "right", level }),
];

/** An amp's series effects loop. */
export const fxLoop = (level: AudioSpec["level"] = "line") => [
  audioOut("send", { label: "FX send", level }),
  audioIn("return", { label: "FX return", level }),
];

/** A speaker output that can drive the given loads. */
export const speakerOut = (key: string, label: string, ohms: number[]) =>
  audioOut(key, { label, level: "speaker", impedanceOhms: ohms });

type DcIn = {
  /** Left out for passive adapters. */
  volts?: number | [number, number];
  /** Current draw; leave out when the maker doesn't state it. */
  ma?: number;
  polarity?: "center_negative" | "center_positive";
  connector?: "barrel_2_1" | "barrel_2_5" | "usb_c";
  kind?: "dc" | "ac";
  key?: string;
  label?: string;
};

export function dcIn({
  volts,
  ma,
  polarity,
  connector,
  kind = "dc",
  key = "dc_in",
  label = kind === "ac" ? "AC in" : "DC in",
}: DcIn): Port {
  const range =
    volts === undefined
      ? {}
      : typeof volts === "number"
        ? { minVolts: volts, maxVolts: volts }
        : { minVolts: volts[0], maxVolts: volts[1] };
  return {
    key,
    label,
    direction: "in",
    signalTypes: ["power"],
    spec: {
      power: {
        kind,
        ...range,
        ...(polarity ? { polarity } : {}),
        ...(ma === undefined ? {} : { drawMa: ma }),
        ...(connector ? { connector } : {}),
      },
    },
  };
}

type DcOut = {
  key: string;
  label: string;
  volts?: number[];
  ma?: number;
  isolated?: boolean;
  polarity?: "center_negative" | "center_positive";
  connector?: "barrel_2_1" | "barrel_2_5" | "dc_cable";
  kind?: "dc" | "ac";
};

export function dcOut({
  key,
  label,
  volts,
  ma,
  isolated,
  polarity,
  connector,
  kind = "dc",
}: DcOut): Port {
  return {
    key,
    label,
    direction: "out",
    signalTypes: ["power"],
    spec: {
      power: {
        kind,
        ...(volts ? { volts: volts as [number, ...number[]] } : {}),
        ...(polarity ? { polarity } : {}),
        ...(ma === undefined ? {} : { maxMa: ma }),
        ...(isolated === undefined ? {} : { isolated }),
        ...(connector ? { connector } : {}),
      },
    },
  };
}

type Wiring = "tip_active" | "ring_active" | "switchable";

export const expIn = (
  key = "exp_in",
  label = "Expression",
  wiring?: Wiring,
): Port => ({
  key,
  label,
  direction: "in",
  signalTypes: ["expression"],
  spec: { expression: wiring ? { wiring } : {} },
});

export const controlIn = (key: string, label: string): Port => ({
  key,
  label,
  direction: "in",
  signalTypes: ["control"],
  spec: {},
});

/** A jack that takes either an expression pedal or footswitches. */
export const expOrControlIn = (
  key: string,
  label: string,
  wiring?: Wiring,
): Port => ({
  key,
  label,
  direction: "in",
  signalTypes: ["expression", "control"],
  spec: { expression: wiring ? { wiring } : {} },
});

type Midi = {
  connector?: "din5" | "trs" | "usb";
  trsType?: "a" | "b" | "switchable";
};

/** Connector left out when the maker doesn't state it. */
function midi(
  key: string,
  label: string,
  direction: "in" | "out",
  { connector, trsType }: Midi,
): Port {
  return {
    key,
    label,
    direction,
    signalTypes: ["midi"],
    spec: {
      midi: {
        ...(connector ? { connector } : {}),
        ...(trsType ? { trsType } : {}),
      },
    },
  };
}

export const midiIn = (opts: Midi = {}, key = "midi_in", label = "MIDI in") =>
  midi(key, label, "in", opts);
export const midiOut = (
  opts: Midi = {},
  key = "midi_out",
  label = "MIDI out",
) => midi(key, label, "out", opts);
/** Thru counts as an outgoing port. */
export const midiThru = (
  opts: Midi = {},
  key = "midi_thru",
  label = "MIDI thru",
) => midi(key, label, "out", opts);

export const usbDevice = (carries: ("audio" | "midi")[] = ["midi"]): Port => ({
  key: "usb",
  label: "USB",
  direction: "in",
  signalTypes: ["usb"],
  spec: { usb: { role: "device", carries } },
});

export const path = (
  from: string,
  to: string,
  activeWhenUnplugged?: string,
): PortPath => ({
  from,
  to,
  ...(activeWhenUnplugged ? { activeWhenUnplugged } : {}),
});

/** In -> out, the path through most pedals. */
export const through = (): PortPath[] => [path("in", "out")];

/** A stereo pedal fed at in_l feeds both outputs while in_r is empty. */
export const stereoThrough = (): PortPath[] => [
  path("in_l", "out_l"),
  path("in_r", "out_r"),
  path("in_l", "out_r", "in_r"),
];

/** A mono-in, stereo-out pedal. */
export const monoToStereo = (): PortPath[] => [
  path("in", "out_l"),
  path("in", "out_r"),
];
