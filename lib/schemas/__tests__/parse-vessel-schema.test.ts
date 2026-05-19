import { PARSE_VESSEL_SCHEMA } from '@/lib/schemas/parse-vessel';

describe('PARSE_VESSEL_SCHEMA — vesselItemSchema required fields', () => {
  const itemSchema = (PARSE_VESSEL_SCHEMA as any).properties.items.items;

  it('vesselItemSchema has a required array', () => {
    expect(Array.isArray(itemSchema.required)).toBe(true);
  });

  it('required includes vessel_name', () => {
    expect(itemSchema.required).toContain('vessel_name');
  });

  it('required includes built', () => {
    expect(itemSchema.required).toContain('built');
  });

  it('required includes dwt_summer', () => {
    expect(itemSchema.required).toContain('dwt_summer');
  });

  it('required includes flag', () => {
    expect(itemSchema.required).toContain('flag');
  });

  it('required includes open_position', () => {
    expect(itemSchema.required).toContain('open_position');
  });

  it('all required fields are defined in properties', () => {
    for (const field of itemSchema.required as string[]) {
      expect(itemSchema.properties[field]).toBeDefined();
    }
  });
});
