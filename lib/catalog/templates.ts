/**
 * Port templates for user submissions. A submitter picks one and adds power
 * and extra jacks, instead of describing every port by hand. Admins can still
 * reject or merge what comes in.
 */
import type { CatalogItemInput } from "./item";
import type { Port, PortPath } from "./schema";
import {
  audioIn,
  audioOut,
  controlIn,
  dcIn,
  expIn,
  midiIn,
  midiOut,
  path,
  stereoIns,
  stereoOuts,
  stereoThrough,
  through,
} from "./seed/jacks";

export const TEMPLATES = {
  mono_pedal: "Mono pedal (in, out)",
  stereo_pedal: "Stereo pedal (two ins, two outs)",
  amp: "Amp without an FX loop",
  amp_fx_loop: "Amp with an FX loop",
  cab: "Speaker cabinet",
  source: "Instrument (output only)",
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

export type Extras = {
  expression?: boolean;
  tap?: boolean;
  midiIn?: boolean;
  midiOut?: boolean;
};

export type Power = {
  volts: number;
  ma?: number;
  polarity?: "center_negative" | "center_positive";
};

const speaker = (): Port => ({
  key: "speaker",
  label: "Speaker",
  direction: "out",
  signalTypes: ["acoustic"],
  spec: { acoustic: {} },
});

function amp(withLoop: boolean, combo: boolean) {
  const ports: Port[] = [audioIn()];
  const paths: PortPath[] = [];
  const outputs = combo ? ["speaker"] : ["speaker_out"];
  if (withLoop) {
    ports.push(
      audioOut("send", { label: "FX send", level: undefined }),
      audioIn("return", { label: "FX return", level: undefined }),
    );
    paths.push(path("in", "send"));
    for (const out of outputs) {
      paths.push(path("return", out), path("in", out, "return"));
    }
  } else {
    for (const out of outputs) paths.push(path("in", out));
  }
  ports.push(
    combo
      ? speaker()
      : audioOut("speaker_out", { label: "Speaker out", level: "speaker" }),
  );
  return { ports, paths };
}

/**
 * Ports, paths and role for a template. Amps in the combo category get a
 * built-in speaker and count as a destination; heads get a speaker output.
 */
export function buildFromTemplate(
  template: TemplateKey,
  {
    combo = false,
    power,
    extras = {},
  }: { combo?: boolean; power?: Power; extras?: Extras } = {},
): Pick<CatalogItemInput, "ports" | "paths" | "role"> {
  let ports: Port[];
  let paths: PortPath[] = [];
  let role: CatalogItemInput["role"];

  switch (template) {
    case "mono_pedal":
      ports = [audioIn(), audioOut()];
      paths = through();
      break;
    case "stereo_pedal":
      ports = [...stereoIns(), ...stereoOuts()];
      paths = stereoThrough();
      break;
    case "amp":
    case "amp_fx_loop":
      ({ ports, paths } = amp(template === "amp_fx_loop", combo));
      if (combo) role = "destination";
      break;
    case "cab":
      ports = [audioIn("in", { label: "Input", level: "speaker" }), speaker()];
      paths = [path("in", "speaker")];
      role = "destination";
      break;
    case "source":
      ports = [audioOut()];
      role = "source";
      break;
  }

  if (extras.expression) ports.push(expIn());
  if (extras.tap) ports.push(controlIn("tap", "Tap"));
  if (extras.midiIn) ports.push(midiIn());
  if (extras.midiOut) ports.push(midiOut());
  if (power) {
    ports.push(
      dcIn({ volts: power.volts, ma: power.ma, polarity: power.polarity }),
    );
  }

  return { ports, paths, ...(role ? { role } : {}) };
}
