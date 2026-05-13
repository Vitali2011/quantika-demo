import { getDemoVessel, getDemoCargo } from '../../scripts/seed-sample-data';

describe('RC-sample-match: demo data для EconomicsTab', () => {
  it('demo vessel имеет обязательные поля для EconomicsTab', () => {
    const v = getDemoVessel();
    expect(v.dwtSummer?.value).toBeDefined();
    // speedLaden и consumption — строки, могут быть null, но поле должно существовать
    expect('speedLaden' in v).toBe(true);
    expect('consumption' in v).toBe(true);
  });

  it('demo cargo имеет обязательные поля для EconomicsTab', () => {
    const c = getDemoCargo();
    expect(c.weightMt?.value).toBeDefined();
    expect(c.originPort?.value).toBeDefined();
    expect(c.destinationPort?.value).toBeDefined();
  });
});
