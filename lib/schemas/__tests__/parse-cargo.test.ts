import { PARSE_CARGO_SCHEMA } from '@/lib/schemas/parse-cargo';

describe('PARSE_CARGO_SCHEMA multi-port fields', () => {
  const itemProps = (PARSE_CARGO_SCHEMA as any).properties.items.items.properties;

  it('includes origin_port_alternatives as ARRAY of STRING', () => {
    expect(itemProps.origin_port_alternatives).toBeDefined();
    expect(itemProps.origin_port_alternatives.type).toBe('ARRAY');
    expect(itemProps.origin_port_alternatives.items.type).toBe('STRING');
  });

  it('includes origin_port_rotation as ARRAY of STRING', () => {
    expect(itemProps.origin_port_rotation).toBeDefined();
    expect(itemProps.origin_port_rotation.type).toBe('ARRAY');
    expect(itemProps.origin_port_rotation.items.type).toBe('STRING');
  });

  it('includes destination_port_alternatives as ARRAY of STRING', () => {
    expect(itemProps.destination_port_alternatives).toBeDefined();
    expect(itemProps.destination_port_alternatives.type).toBe('ARRAY');
    expect(itemProps.destination_port_alternatives.items.type).toBe('STRING');
  });

  it('includes destination_port_rotation as ARRAY of STRING', () => {
    expect(itemProps.destination_port_rotation).toBeDefined();
    expect(itemProps.destination_port_rotation.type).toBe('ARRAY');
    expect(itemProps.destination_port_rotation.items.type).toBe('STRING');
  });

  it('includes weight_per_port as ARRAY of NUMBER', () => {
    expect(itemProps.weight_per_port).toBeDefined();
    expect(itemProps.weight_per_port.type).toBe('ARRAY');
    expect(itemProps.weight_per_port.items.type).toBe('NUMBER');
  });

  it('all new fields are nullable', () => {
    expect(itemProps.origin_port_alternatives.nullable).toBe(true);
    expect(itemProps.origin_port_rotation.nullable).toBe(true);
    expect(itemProps.destination_port_alternatives.nullable).toBe(true);
    expect(itemProps.destination_port_rotation.nullable).toBe(true);
    expect(itemProps.weight_per_port.nullable).toBe(true);
  });
});

describe('PARSE_CARGO_SCHEMA freight_rate_usd field', () => {
  const itemProps = (PARSE_CARGO_SCHEMA as any).properties.items.items.properties;

  it('includes freight_rate_usd as NUMBER', () => {
    expect(itemProps.freight_rate_usd).toBeDefined();
    expect(itemProps.freight_rate_usd.type).toBe('NUMBER');
  });

  it('freight_rate_usd is nullable', () => {
    expect(itemProps.freight_rate_usd.nullable).toBe(true);
  });
});

describe('PARSE_CARGO_SCHEMA charterer_name field (audit A.1)', () => {
  const itemProps = (PARSE_CARGO_SCHEMA as any).properties.items.items.properties;

  it('includes charterer_name as STRING', () => {
    expect(itemProps.charterer_name).toBeDefined();
    expect(itemProps.charterer_name.type).toBe('STRING');
  });

  it('charterer_name is nullable', () => {
    expect(itemProps.charterer_name.nullable).toBe(true);
  });
});
