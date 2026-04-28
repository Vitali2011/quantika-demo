import { MarketIntelligence } from '../MarketIntelligence';

describe('MarketIntelligence', () => {
  it('renders without crashing', () => {
    const el = MarketIntelligence({});
    expect(el).not.toBeNull();
  });

  it('shows Toepfer TMI KPI', () => {
    const el = MarketIntelligence({});
    const text = JSON.stringify(el);
    expect(text).toMatch(/TMI|Toepfer/);
  });

  it('shows Bunker Rotterdam KPI', () => {
    const el = MarketIntelligence({});
    const text = JSON.stringify(el);
    expect(text).toMatch(/[Bb]unker/);
  });

  it('shows EUA KPI', () => {
    const el = MarketIntelligence({});
    const text = JSON.stringify(el);
    expect(text).toMatch(/EUA|ETS/);
  });

  it('shows BHSI KPI', () => {
    const el = MarketIntelligence({});
    const text = JSON.stringify(el);
    expect(text).toMatch(/BHSI/);
  });

  it('shows empty-state suggestion when no active deals', () => {
    const el = MarketIntelligence({ noActiveDeals: true });
    const text = JSON.stringify(el);
    expect(text).toMatch(/forward.*inquiry|WhatsApp|Gmail/i);
  });
});
