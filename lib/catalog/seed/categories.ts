/**
 * The category tree. Top-level categories also choose the illustration a
 * gear page shows until it has photos (see components/gear/category-icon).
 */
export type SeedCategory = {
  slug: string;
  name: string;
  children?: { slug: string; name: string }[];
};

export const categories: SeedCategory[] = [
  {
    slug: "instrument",
    name: "Instruments",
    children: [{ slug: "electric-guitar", name: "Electric guitars" }],
  },
  {
    slug: "pedal",
    name: "Pedals",
    children: [
      { slug: "overdrive", name: "Overdrive" },
      { slug: "distortion", name: "Distortion" },
      { slug: "fuzz", name: "Fuzz" },
      { slug: "compressor", name: "Compressors" },
      { slug: "wah", name: "Wah" },
      { slug: "chorus", name: "Chorus" },
      { slug: "phaser", name: "Phasers" },
      { slug: "modulation", name: "Multi-modulation" },
      { slug: "delay", name: "Delay" },
      { slug: "reverb", name: "Reverb" },
      { slug: "pitch", name: "Pitch" },
      { slug: "tuner", name: "Tuners" },
      { slug: "looper", name: "Loopers" },
      { slug: "volume", name: "Volume pedals" },
    ],
  },
  {
    slug: "multi-effects",
    name: "Multi-effects",
    children: [{ slug: "modeler", name: "Modelers" }],
  },
  {
    slug: "amp",
    name: "Amps",
    children: [
      { slug: "head", name: "Heads" },
      { slug: "combo", name: "Combos" },
    ],
  },
  {
    slug: "cab",
    name: "Cabinets",
    children: [{ slug: "guitar-cab", name: "Guitar cabinets" }],
  },
  {
    slug: "utility",
    name: "Utilities",
    children: [
      { slug: "switcher", name: "A/B and A/B/Y boxes" },
      { slug: "loop-switcher", name: "Loop switchers" },
    ],
  },
  {
    slug: "controller",
    name: "Controllers",
    children: [
      { slug: "expression-pedal", name: "Expression pedals" },
      { slug: "midi-controller", name: "MIDI controllers" },
    ],
  },
  {
    slug: "power",
    name: "Power",
    children: [
      { slug: "power-supply", name: "Power supplies" },
      { slug: "power-adapter", name: "Power adapters" },
    ],
  },
  {
    slug: "recording",
    name: "Recording",
    children: [
      { slug: "microphone", name: "Microphones" },
      { slug: "audio-interface", name: "Audio interfaces" },
    ],
  },
];
