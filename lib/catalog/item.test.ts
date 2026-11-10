import { describe, expect, it } from "vitest";
import { catalogItemSchema, type CatalogItemInput } from "./item";
import { audioIn, audioOut, dcIn, dcOut, path } from "./seed/jacks";

const pedal: CatalogItemInput = {
  brand: "acme",
  slug: "drive",
  modelName: "Drive",
  category: "overdrive",
  routing: { model: "fixed" },
  ports: [audioIn(), audioOut(), dcIn({ volts: 9, ma: 10 })],
  paths: [path("in", "out")],
};

function problems(item: CatalogItemInput): string[] {
  const result = catalogItemSchema.safeParse(item);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("catalogItemSchema", () => {
  it("accepts a plain pedal", () => {
    expect(problems(pedal)).toEqual([]);
  });

  it("rejects duplicate port keys and finishes", () => {
    expect(
      problems({
        ...pedal,
        ports: [...pedal.ports, audioIn()],
        finishes: ["Red", "red"],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Duplicate port key "in"',
        'Duplicate finish "red"',
      ]),
    );
  });

  it("checks that paths run from an input to an output that exist", () => {
    expect(problems({ ...pedal, paths: [path("out", "in")] })).toEqual(
      expect.arrayContaining([
        'A path starts at an input; "out" is an output',
        'A path ends at an output; "in" is an input',
      ]),
    );
    expect(problems({ ...pedal, paths: [path("in", "nope")] })).toContain(
      'No port "nope"',
    );
    expect(
      problems({ ...pedal, paths: [path("in", "out", "ghost")] }),
    ).toContain('No port "ghost"');
  });

  it("blocks paths between unrelated signal types, but lets speakers turn audio into sound", () => {
    expect(problems({ ...pedal, paths: [path("dc_in", "out")] })).toContain(
      '"dc_in" and "out" share no signal type',
    );
    const cab: CatalogItemInput = {
      ...pedal,
      ports: [
        audioIn("in", { level: "speaker", impedanceOhms: [16] }),
        {
          key: "speaker",
          label: "Speaker",
          direction: "out",
          signalTypes: ["acoustic"],
          spec: { acoustic: {} },
        },
      ],
      paths: [path("in", "speaker")],
    };
    expect(problems(cab)).toEqual([]);
  });

  it("requires a spec for audio, MIDI and power ports, matching the port's direction", () => {
    expect(
      problems({
        ...pedal,
        ports: [
          {
            key: "in",
            label: "In",
            direction: "in",
            signalTypes: ["audio"],
            spec: {},
          },
        ],
        paths: [],
      }),
    ).toContain('Port "in" needs a audio spec');
    expect(
      problems({
        ...pedal,
        ports: [
          ...pedal.ports,
          {
            ...dcOut({ key: "x", label: "X", volts: [9], ma: 100 }),
            direction: "in",
          },
        ],
      }),
    ).toContain(`Port "x" is an input but its power spec doesn't describe one`);
  });

  it("rejects an impedance on a non-speaker port and a lone jack group", () => {
    expect(
      problems({
        ...pedal,
        ports: [
          audioIn("in", { impedanceOhms: [8], jackGroup: "solo" }),
          audioOut(),
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        `Port "in" lists an impedance but isn't speaker level`,
        'Jack group "solo" has only one port',
      ]),
    );
  });

  it("checks loop switcher sends and returns", () => {
    expect(
      problems({
        ...pedal,
        routing: {
          model: "loop_switcher",
          loops: [
            { key: "loop_1", label: "Loop 1", send: "in", return: "out" },
          ],
          reorderable: false,
          parallel: false,
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        '"in" should be an output',
        '"out" should be an input',
      ]),
    );
  });
});
