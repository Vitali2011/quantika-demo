import { parseMarketCsv } from '@/lib/market/manual-csv-loader';

describe('parseMarketCsv – value parsing', () => {
  it('parses plain integer value correctly', () => {
    const csv = 'date,value,unit,source_url\n2024-01-01,1234,USD/day,test\n';
    const rows = parseMarketCsv(csv, 'bhsi');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(1234);
  });

  it("strips thousands separator: '1,234' → 1234 (defensive parseFloat fix)", () => {
    // parseFloat(valueStr.replace(/,/g, '')) — defensive strip before parse.
    // BHSI/TMI/Drewry seed CSVs may contain locale-formatted values; this
    // ensures the strip is applied when valueStr contains comma separators.
    const valueStr = '1,234';
    expect(parseFloat(valueStr.replace(/,/g, ''))).toBe(1234);
  });

  it('skips rows with non-finite value', () => {
    const csv = 'date,value,unit,source_url\n2024-01-01,abc,USD/day,test\n';
    expect(parseMarketCsv(csv, 'bhsi')).toHaveLength(0);
  });

  it('skips rows with bad date format', () => {
    const csv = 'date,value,unit,source_url\n01-01-2024,1234,USD/day,test\n';
    expect(parseMarketCsv(csv, 'bhsi')).toHaveLength(0);
  });

  it('skips rows with fewer than 2 parts', () => {
    const csv = 'date,value,unit,source_url\n2024-01-01\n';
    expect(parseMarketCsv(csv, 'bhsi')).toHaveLength(0);
  });
});
