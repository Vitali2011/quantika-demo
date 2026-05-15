import { compareNumericField } from "../score-fields";

describe("compareNumericField", () => {
  it("both null = match", () => expect(compareNumericField(null, null)).toBe(true));
  it("null vs number = mismatch", () => {
    expect(compareNumericField(null, 5)).toBe(false);
    expect(compareNumericField(5, null)).toBe(false);
  });
  it("equal numbers = match", () => expect(compareNumericField(5293, 5293)).toBe(true));
  it("unequal numbers = mismatch", () => expect(compareNumericField(5293, 5300)).toBe(false));
  it("1.25 vs 1.25 = match", () => expect(compareNumericField(1.25, 1.25)).toBe(true));
});
