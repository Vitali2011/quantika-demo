export function compareNumericField(ref: number | null, model: number | null): boolean {
  if (ref === null && model === null) return true;
  if (ref === null || model === null) return false;
  return ref === model;
}
