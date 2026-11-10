import { describe, expect, it } from "vitest";
import { describePortSpec, describeSpecs } from "./describe";

describe("describePortSpec", () => {
  it("describes audio jacks", () => {
    expect(
      describePortSpec(
        {
          audio: {
            channel: "mono",
            level: "speaker",
            impedanceOhms: [4, 8, 16],
          },
        },
        "audio",
      ),
    ).toBe("speaker level · 4 / 8 / 16 Ω");
    expect(
      describePortSpec(
        { audio: { channel: "left", level: "instrument", connector: "ts" } },
        "audio",
      ),
    ).toBe('left · instrument level · 1/4" TS');
  });

  it("describes power inputs and outputs", () => {
    expect(
      describePortSpec(
        {
          power: {
            kind: "dc",
            minVolts: 9,
            maxVolts: 9,
            drawMa: 3.3,
            polarity: "center_negative",
            connector: "barrel_2_1",
          },
        },
        "power",
      ),
    ).toBe("9 V DC · draws 3.3 mA · center negative · 2.1 mm barrel");
    expect(
      describePortSpec(
        { power: { kind: "dc", volts: [9, 12], maxMa: 250, isolated: true } },
        "power",
      ),
    ).toBe("9 / 12 V DC · up to 250 mA · isolated");
    expect(describePortSpec({ power: { kind: "dc" } }, "power")).toBe("DC");
  });

  it("describes MIDI connectors", () => {
    expect(
      describePortSpec({ midi: { connector: "trs", trsType: "a" } }, "midi"),
    ).toBe("TRS type A");
    expect(describePortSpec({ midi: {} }, "midi")).toBe("");
  });
});

describe("describeSpecs", () => {
  it("lists the specs an item has", () => {
    expect(describeSpecs({ watts: 30, bypass: "true", battery: "9V" })).toEqual(
      [
        { label: "Power", value: "30 W" },
        { label: "Battery", value: "9V" },
        { label: "Bypass", value: "True bypass" },
      ],
    );
  });
});
