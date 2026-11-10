/** Plain-language descriptions of ports, paths and specs for gear pages. */
import type { ItemSpecs, PortSpec, SignalType } from "./schema";

export const SIGNAL_TYPE_NAMES: Record<SignalType, string> = {
  audio: "Audio",
  acoustic: "Sound",
  expression: "Expression",
  control: "Control",
  midi: "MIDI",
  power: "Power",
  usb: "USB",
};

/** The order sections appear on a gear page. */
export const SIGNAL_TYPE_ORDER: SignalType[] = [
  "audio",
  "acoustic",
  "expression",
  "control",
  "midi",
  "usb",
  "power",
];

const LEVELS = {
  instrument: "instrument level",
  line: "line level",
  mic: "mic level",
  speaker: "speaker level",
};
const CONNECTORS = {
  ts: '1/4" TS',
  trs: '1/4" TRS',
  xlr: "XLR",
  combo: 'XLR/1/4" combo',
  speakon: "Speakon",
  barrel_2_1: "2.1 mm barrel",
  barrel_2_5: "2.5 mm barrel",
  usb_c: "USB-C",
  iec: "IEC",
  dc_cable: "DC cable",
};
const POLARITY = {
  center_negative: "center negative",
  center_positive: "center positive",
};

const ma = (value: number) => `${Number(value.toFixed(1))} mA`;

function volts(list: readonly number[]): string {
  return `${list.join(" / ")} V`;
}

/** e.g. "Mono · instrument level · 1/4" TS" or "9 V DC · 10 mA · center negative". */
export function describePortSpec(spec: PortSpec, type: SignalType): string {
  const parts: string[] = [];
  switch (type) {
    case "audio": {
      const audio = spec.audio;
      if (!audio) break;
      if (audio.channel !== "mono") parts.push(audio.channel);
      if (audio.level) parts.push(LEVELS[audio.level]);
      if (audio.connector) parts.push(CONNECTORS[audio.connector]);
      if (audio.impedanceOhms)
        parts.push(`${audio.impedanceOhms.join(" / ")} Ω`);
      break;
    }
    case "expression": {
      const wiring = spec.expression?.wiring;
      if (wiring)
        parts.push(
          wiring.replace("_", " ").replace("switchable", "switchable tip/ring"),
        );
      break;
    }
    case "control":
      if (spec.control?.mode) parts.push(spec.control.mode);
      break;
    case "midi": {
      const midi = spec.midi;
      if (midi?.connector === "din5") parts.push("5-pin DIN");
      if (midi?.connector === "trs")
        parts.push(
          `TRS${midi.trsType ? ` type ${midi.trsType.toUpperCase()}` : ""}`,
        );
      if (midi?.connector === "usb") parts.push("USB");
      break;
    }
    case "usb": {
      const usb = spec.usb;
      if (usb) parts.push(usb.role);
      if (usb?.carries?.length)
        parts.push(
          `carries ${usb.carries.join(" and ").replace("midi", "MIDI")}`,
        );
      break;
    }
    case "power": {
      const power = spec.power;
      if (!power) break;
      if ("minVolts" in power || "drawMa" in power) {
        const p = power as {
          kind: string;
          minVolts?: number;
          maxVolts?: number;
          drawMa?: number;
        };
        if (p.minVolts !== undefined) {
          parts.push(
            `${p.minVolts === p.maxVolts ? p.minVolts : `${p.minVolts}–${p.maxVolts}`} V ${p.kind.toUpperCase()}`,
          );
        } else parts.push(p.kind.toUpperCase());
        if (p.drawMa !== undefined) parts.push(`draws ${ma(p.drawMa)}`);
      } else {
        const p = power as {
          kind: string;
          volts?: number[];
          maxMa?: number;
          isolated?: boolean;
        };
        parts.push(
          p.volts
            ? `${volts(p.volts)} ${p.kind.toUpperCase()}`
            : p.kind.toUpperCase(),
        );
        if (p.maxMa !== undefined) parts.push(`up to ${ma(p.maxMa)}`);
        if (p.isolated) parts.push("isolated");
      }
      if (power.polarity) parts.push(POLARITY[power.polarity]);
      if (power.connector) parts.push(CONNECTORS[power.connector]);
      break;
    }
    case "acoustic":
      break;
  }
  return parts.join(" · ");
}

export function describeSpecs(
  specs: ItemSpecs,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (specs.watts) rows.push({ label: "Power", value: `${specs.watts} W` });
  if (specs.speakers) rows.push({ label: "Speakers", value: specs.speakers });
  if (specs.totalMaxMa)
    rows.push({ label: "Total current", value: ma(specs.totalMaxMa) });
  if (specs.powerSource) {
    const names = {
      mains: "Mains",
      battery: "Battery",
      passive: "None (passive)",
      phantom: "Phantom power",
      bus: "USB bus power",
    };
    rows.push({ label: "Powered by", value: names[specs.powerSource] });
  }
  if (specs.battery) rows.push({ label: "Battery", value: specs.battery });
  if (specs.bypass) {
    const names = {
      true: "True bypass",
      buffered: "Buffered",
      selectable: "Selectable",
      none: "None",
    };
    rows.push({ label: "Bypass", value: names[specs.bypass] });
  }
  if (specs.stereo) rows.push({ label: "Stereo", value: "Yes" });
  return rows;
}
