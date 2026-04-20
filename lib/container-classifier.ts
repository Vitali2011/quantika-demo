export type CargoMode = "FCL" | "LCL" | "BULK" | "UNKNOWN";

const LCL_PATTERNS =
  /\b(lcl|less\s+than\s+container\s+load|groupage|part[-\s]load|consolidation)\b/i;

const FCL_PATTERNS =
  /\b(teu|feu|containers?|boxes?|fcl|full\s+container\s+load|20gp|40hc|40rf|20dv|40ot|20fr)\b/i;

const BULK_COMMODITIES =
  /\b(grain|wheat|corn|barley|rice|coal|fertilizer|urea|cement|sugar|ore|potash|clinker|bauxite|gypsum|soybean|salt|scrap)\b/i;

const BULK_PATTERNS = /\bin\s+bulk\b|\bloose\b/i;

export function classifyCargoMode(cargo: string): CargoMode {
  if (!cargo.trim()) return "UNKNOWN";

  if (LCL_PATTERNS.test(cargo)) return "LCL";
  if (FCL_PATTERNS.test(cargo)) return "FCL";
  if (BULK_COMMODITIES.test(cargo) || BULK_PATTERNS.test(cargo)) return "BULK";

  return "UNKNOWN";
}
