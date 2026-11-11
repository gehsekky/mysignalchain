/**
 * Amps, cabinets, recording gear and guitars. Same rule as pedals.ts: only
 * what the maker states, with gaps listed in `specs.unconfirmed`.
 *
 * A combo's built-in speaker and a cab's speakers are an `acoustic` output,
 * which a microphone's capsule picks up.
 */
import type { CatalogItemInput } from "../item";
import type { Port } from "../schema";
import { audioIn, audioOut, expIn, path, speakerOut } from "./jacks";

const fixed = { model: "fixed" } as const;

const acousticOut = (key = "speaker", label = "Speaker"): Port => ({
  key,
  label,
  direction: "out",
  signalTypes: ["acoustic"],
  spec: { acoustic: {} },
});

const acousticIn = (key = "capsule", label = "Capsule"): Port => ({
  key,
  label,
  direction: "in",
  signalTypes: ["acoustic"],
  spec: { acoustic: {} },
});

const guitarOut = () => audioOut("out", { label: "Output" });

export const amps: CatalogItemInput[] = [
  // ---- Amps -------------------------------------------------------------
  {
    brand: "vox",
    slug: "ac30c2",
    modelName: "AC30C2",
    category: "combo",
    aliases: ["AC30", "AC30 Custom"],
    role: "destination",
    routing: {
      model: "channels",
      channels: [
        { key: "normal", label: "Normal", ports: ["normal_hi", "normal_lo"] },
        {
          key: "top_boost",
          label: "Top Boost",
          ports: ["top_boost_hi", "top_boost_lo"],
        },
      ],
    },
    specs: {
      powerSource: "mains",
      watts: 30,
      speakers: "2 x 12-inch Celestion G12M Greenback",
      notes: "Four EL84 power tubes. Rated at 16 ohms.",
      unconfirmed: [
        "FX loop type and level",
        "impedance of each speaker jack",
        "footswitch jack",
      ],
    },
    sourceUrl: "https://voxamps.com/product/ac30-custom/",
    ports: [
      audioIn("normal_hi", { label: "Normal high" }),
      audioIn("normal_lo", { label: "Normal low" }),
      audioIn("top_boost_hi", { label: "Top Boost high" }),
      audioIn("top_boost_lo", { label: "Top Boost low" }),
      audioOut("send", { label: "FX send", level: undefined }),
      audioIn("return", { label: "FX return", level: undefined }),
      speakerOut("ext_speaker", "External speaker", [16]),
      speakerOut("extension_speaker", "Extension speaker", [16]),
      acousticOut(),
    ],
    paths: [
      ...["normal_hi", "normal_lo", "top_boost_hi", "top_boost_lo"].flatMap(
        (input) => [
          path(input, "send"),
          path(input, "speaker", "return"),
          path(input, "ext_speaker", "return"),
        ],
      ),
      path("return", "speaker"),
      path("return", "ext_speaker"),
      path("return", "extension_speaker"),
    ],
  },
  {
    brand: "marshall",
    slug: "jcm800-2203",
    modelName: "JCM800 2203",
    category: "head",
    aliases: ["JCM800", "2203"],
    routing: fixed,
    specs: {
      powerSource: "mains",
      watts: 100,
      notes:
        "Single channel, high and low inputs. Series FX loop, switchable. Four EL34 power tubes.",
      unconfirmed: ["FX loop level", "footswitch jack"],
    },
    finishes: ["Black and Gold"],
    sourceUrl:
      "https://www.marshall.com/us/en/product/jcm800-2203-vintage-reissue-head?pid=1007097",
    ports: [
      audioIn("in_high", { label: "High input", connector: "ts" }),
      audioIn("in_low", { label: "Low input", connector: "ts" }),
      audioOut("send", { label: "FX send", level: undefined }),
      audioIn("return", { label: "FX return", level: undefined }),
      speakerOut("speaker_1", "Speaker output 1", [4, 8, 16]),
      speakerOut("speaker_2", "Speaker output 2", [4, 8, 16]),
    ],
    paths: [
      ...["in_high", "in_low"].flatMap((input) => [
        path(input, "send"),
        path(input, "speaker_1", "return"),
        path(input, "speaker_2", "return"),
      ]),
      path("return", "speaker_1"),
      path("return", "speaker_2"),
    ],
  },
  {
    brand: "boss",
    slug: "katana-50-gen-3",
    modelName: "Katana-50 Gen 3",
    category: "combo",
    aliases: ["Katana 50", "Katana"],
    role: "destination",
    routing: fixed,
    specs: {
      powerSource: "mains",
      watts: 50,
      speakers: "1 x 12-inch",
      notes:
        "Uses 47 W from the mains. Four stored tone settings. Optional Bluetooth adaptor slot.",
    },
    sourceUrl:
      "https://www.boss.info/us/products/katana-50_gen_3/specifications/",
    ports: [
      audioIn(),
      audioIn("aux_in", { label: "Aux in", channel: "stereo", level: "line" }),
      audioIn("power_amp_in", { label: "Power amp in", level: undefined }),
      {
        key: "ctl",
        label: "CTL CH1/CH2 SOLO",
        direction: "in",
        signalTypes: ["control"],
        spec: {},
      },
      expIn("exp", "EXP pedal"),
      audioOut("phones", {
        label: "Phones",
        channel: "stereo",
        connector: "trs",
        level: undefined,
      }),
      {
        key: "usb",
        label: "USB-C",
        direction: "in",
        signalTypes: ["usb"],
        spec: { usb: { role: "device" } },
      },
      acousticOut(),
    ],
    paths: [
      path("in", "speaker"),
      path("in", "phones"),
      path("power_amp_in", "speaker"),
      path("aux_in", "speaker"),
      path("aux_in", "phones"),
    ],
  },
  {
    brand: "fender",
    slug: "65-deluxe-reverb",
    modelName: "'65 Deluxe Reverb",
    category: "combo",
    aliases: ["Deluxe Reverb"],
    role: "destination",
    routing: fixed,
    specs: {
      powerSource: "mains",
      unconfirmed: [
        "inputs and channels",
        "speaker outputs",
        "power and speaker",
        "footswitch jack",
      ],
    },
    ports: [audioIn(), acousticOut()],
    paths: [path("in", "speaker")],
  },
  {
    brand: "fender",
    slug: "blues-junior-iv",
    modelName: "Blues Junior IV",
    category: "combo",
    aliases: ["Blues Junior", "Blues Jr"],
    role: "destination",
    routing: fixed,
    specs: {
      powerSource: "mains",
      unconfirmed: [
        "inputs",
        "speaker outputs",
        "power and speaker",
        "footswitch jack",
      ],
    },
    ports: [audioIn(), acousticOut()],
    paths: [path("in", "speaker")],
  },

  // ---- Cabinets -----------------------------------------------------------
  {
    brand: "marshall",
    slug: "1960a",
    modelName: "1960A 4x12 Angled Cabinet",
    category: "guitar-cab",
    aliases: ["1960A", "4x12"],
    role: "destination",
    routing: fixed,
    specs: {
      powerSource: "passive",
      speakers: "4 x 12-inch Celestion G12T-75",
      notes:
        "16 or 4 ohms mono, 8 ohms per side in stereo. Handles 300 W mono or 150 W stereo.",
      unconfirmed: ["which input jack does what"],
    },
    finishes: ["Black"],
    sourceUrl:
      "https://www.marshall.com/us/en/product/1960a-4x12-angled-cabinet?pid=1007269",
    ports: [
      audioIn("in_1", {
        label: "Input 1",
        level: "speaker",
        impedanceOhms: [16, 4],
      }),
      audioIn("in_2", {
        label: "Input 2",
        level: "speaker",
        impedanceOhms: [8],
      }),
      acousticOut(),
    ],
    paths: [path("in_1", "speaker"), path("in_2", "speaker")],
  },
  {
    brand: "orange",
    slug: "ppc212",
    modelName: "PPC212",
    category: "guitar-cab",
    aliases: ["2x12"],
    role: "destination",
    routing: fixed,
    specs: {
      powerSource: "passive",
      unconfirmed: ["impedance", "speakers", "power handling"],
    },
    ports: [audioIn("in", { label: "Input", level: "speaker" }), acousticOut()],
    paths: [path("in", "speaker")],
  },

  // ---- Recording ------------------------------------------------------------
  {
    brand: "shure",
    slug: "sm57",
    modelName: "SM57",
    category: "microphone",
    aliases: ["SM-57"],
    routing: fixed,
    specs: {
      powerSource: "passive",
      unconfirmed: ["pickup pattern", "impedance"],
    },
    ports: [
      acousticIn(),
      audioOut("out", { label: "Output", level: "mic", connector: "xlr" }),
    ],
    paths: [path("capsule", "out")],
  },
  {
    brand: "focusrite",
    slug: "scarlett-2i2-4th-gen",
    modelName: "Scarlett 2i2 (4th Gen)",
    category: "audio-interface",
    aliases: ["Scarlett 2i2", "2i2"],
    role: "destination",
    routing: fixed,
    specs: {
      powerSource: "bus",
      notes:
        "Two mic preamps with phantom power, two Hi-Z instrument inputs and two line inputs. USB-C bus powered (900 mA).",
      unconfirmed: ["whether inputs are combo jacks"],
    },
    sourceUrl: "https://focusrite.com/products/scarlett-2i2",
    ports: [
      ...[1, 2].flatMap((n): Port[] => [
        audioIn(`in_${n}_mic`, {
          label: `Input ${n} (mic)`,
          level: "mic",
          jackGroup: `in_${n}`,
        }),
        audioIn(`in_${n}_inst`, {
          label: `Input ${n} (instrument)`,
          jackGroup: `in_${n}`,
        }),
        audioIn(`in_${n}_line`, {
          label: `Input ${n} (line)`,
          level: "line",
          jackGroup: `in_${n}`,
        }),
      ]),
      audioOut("out_l", {
        label: "Line out L",
        channel: "left",
        level: "line",
      }),
      audioOut("out_r", {
        label: "Line out R",
        channel: "right",
        level: "line",
      }),
      audioOut("phones", {
        label: "Headphones",
        channel: "stereo",
        level: undefined,
      }),
      {
        key: "usb",
        label: "USB-C",
        direction: "in",
        signalTypes: ["usb"],
        spec: { usb: { role: "device", carries: ["audio"] } },
      },
    ],
  },

  // ---- Guitars (finishes not yet listed; the makers' sites block us) ------------
  {
    brand: "fender",
    slug: "american-professional-ii-stratocaster",
    modelName: "American Professional II Stratocaster",
    category: "electric-guitar",
    aliases: ["Stratocaster", "Strat"],
    role: "source",
    routing: fixed,
    specs: { powerSource: "passive", unconfirmed: ["finishes", "pickups"] },
    ports: [guitarOut()],
  },
  {
    brand: "fender",
    slug: "american-professional-ii-telecaster",
    modelName: "American Professional II Telecaster",
    category: "electric-guitar",
    aliases: ["Telecaster", "Tele"],
    role: "source",
    routing: fixed,
    specs: { powerSource: "passive", unconfirmed: ["finishes", "pickups"] },
    ports: [guitarOut()],
  },
  {
    brand: "gibson",
    slug: "les-paul-standard-50s",
    modelName: "Les Paul Standard '50s",
    category: "electric-guitar",
    aliases: ["Les Paul", "LP"],
    role: "source",
    routing: fixed,
    specs: { powerSource: "passive", unconfirmed: ["finishes", "pickups"] },
    ports: [guitarOut()],
  },
  {
    // Specs pasted from the PRS page (the site blocks automated reading).
    brand: "prs",
    slug: "se-hollowbody-standard",
    modelName: "SE Hollowbody Standard",
    category: "electric-guitar",
    aliases: ["SE Hollowbody"],
    role: "source",
    routing: fixed,
    specs: {
      notes:
        'Hollowbody, all mahogany, set neck, 25" scale, 22 frets. Two PRS 58/15 LT "S" pickups; volume and tone with a 3-way pickup toggle.',
      unconfirmed: ["finishes", "output jack"],
    },
    sourceUrl:
      "https://prsguitars.com/electrics/model/se_hollowbody_standard_2025",
    ports: [guitarOut()],
  },
];
