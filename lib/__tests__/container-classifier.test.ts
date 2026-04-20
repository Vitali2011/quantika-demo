import { classifyCargoMode, CargoMode } from "@/lib/container-classifier";

describe("classifyCargoMode", () => {
  // --- FCL ---
  test('returns FCL for "2 x 40HC containers"', () => {
    expect(classifyCargoMode("2 x 40HC containers")).toBe("FCL");
  });

  test('returns FCL for "3 TEU cargo"', () => {
    expect(classifyCargoMode("3 TEU cargo")).toBe("FCL");
  });

  test('returns FCL for "5 FEU"', () => {
    expect(classifyCargoMode("5 FEU")).toBe("FCL");
  });

  test('returns FCL for "FCL shipment"', () => {
    expect(classifyCargoMode("FCL shipment")).toBe("FCL");
  });

  test('returns FCL for "full container load"', () => {
    expect(classifyCargoMode("full container load")).toBe("FCL");
  });

  test('returns FCL for container type code "20GP"', () => {
    expect(classifyCargoMode("20GP")).toBe("FCL");
  });

  test('returns FCL for container type code "40HC"', () => {
    expect(classifyCargoMode("40HC")).toBe("FCL");
  });

  // --- LCL ---
  test('returns LCL for "LCL groupage"', () => {
    expect(classifyCargoMode("LCL groupage")).toBe("LCL");
  });

  test('returns LCL for "part-load"', () => {
    expect(classifyCargoMode("part-load")).toBe("LCL");
  });

  test('returns LCL for "consolidation cargo"', () => {
    expect(classifyCargoMode("consolidation cargo")).toBe("LCL");
  });

  test('returns LCL for "less than container load"', () => {
    expect(classifyCargoMode("less than container load")).toBe("LCL");
  });

  // --- BULK ---
  test('returns BULK for "wheat in bulk"', () => {
    expect(classifyCargoMode("wheat in bulk")).toBe("BULK");
  });

  test('returns BULK for "loose scrap"', () => {
    expect(classifyCargoMode("loose scrap")).toBe("BULK");
  });

  test('returns BULK for "steel scrap loose"', () => {
    expect(classifyCargoMode("steel scrap loose")).toBe("BULK");
  });

  test('returns BULK for "urea"', () => {
    expect(classifyCargoMode("urea")).toBe("BULK");
  });

  test('returns BULK for "10000mt coal"', () => {
    expect(classifyCargoMode("10000mt coal")).toBe("BULK");
  });

  test('returns BULK for "grain cargo"', () => {
    expect(classifyCargoMode("grain cargo")).toBe("BULK");
  });

  // --- UNKNOWN ---
  test('returns UNKNOWN for empty string', () => {
    expect(classifyCargoMode("")).toBe("UNKNOWN");
  });

  test('returns UNKNOWN for whitespace-only string', () => {
    expect(classifyCargoMode("   ")).toBe("UNKNOWN");
  });

  test('returns UNKNOWN for "machinery on flatbed"', () => {
    expect(classifyCargoMode("machinery on flatbed")).toBe("UNKNOWN");
  });

  test('returns UNKNOWN for arbitrary text', () => {
    expect(classifyCargoMode("project cargo with special handling")).toBe("UNKNOWN");
  });

  // --- Case insensitivity ---
  test('is case-insensitive for "CONTAINERS"', () => {
    expect(classifyCargoMode("CONTAINERS")).toBe("FCL");
  });

  test('is case-insensitive for "Groupage"', () => {
    expect(classifyCargoMode("Groupage")).toBe("LCL");
  });

  test('is case-insensitive for "WHEAT"', () => {
    expect(classifyCargoMode("WHEAT")).toBe("BULK");
  });

  // --- Priority: LCL > FCL ---
  test('LCL wins over FCL for "LCL container"', () => {
    expect(classifyCargoMode("LCL container")).toBe("LCL");
  });

  // --- Edge cases ---
  test('FCL for "container of wheat" (has "container", FCL > BULK)', () => {
    expect(classifyCargoMode("container of wheat")).toBe("FCL");
  });

  test('returns FCL for box shipment', () => {
    expect(classifyCargoMode("3 boxes of equipment")).toBe("FCL");
  });

  test('returns BULK for "part load" (space variant)', () => {
    expect(classifyCargoMode("part load shipment")).toBe("LCL");
  });
});
