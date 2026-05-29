import { sanityCheckRows, type SanityIssue } from '../validators';

describe('sanityCheckRows', () => {
  it('flags NULL_STRING / ZERO_NUMERIC / yob=0 artefacts', () => {
    const rows = [
      { gmail_message_id: 'e1', parse_type: 'recap', result_json: JSON.stringify({ vesselName: { value: 'null' } }) },
      { gmail_message_id: 'e2', parse_type: 'vessel', result_json: JSON.stringify({ dwtSummer: { value: 0, source_text: '' } }) },
      { gmail_message_id: 'e3', parse_type: 'recap', result_json: JSON.stringify({ vessel_yob: 0 }) },
    ];
    const issues: SanityIssue[] = sanityCheckRows(rows);
    expect(issues.map((i) => i.kind)).toEqual(
      expect.arrayContaining(['NULL_STRING', 'ZERO_NUMERIC', 'ZERO_YOB']),
    );
  });

  it('returns no issues for clean rows', () => {
    const rows = [{ gmail_message_id: 'e4', parse_type: 'cargo', result_json: JSON.stringify({ weightMt: { value: 5000, source_text: '5000 mt' } }) }];
    expect(sanityCheckRows(rows)).toEqual([]);
  });

  it('flags ZERO_NUMERIC when source_text is null (not just empty string)', () => {
    const rows = [{ gmail_message_id: 'e5', parse_type: 'vessel', result_json: JSON.stringify({ dwtSummer: { value: 0, source_text: null } }) }];
    expect(sanityCheckRows(rows).map((i) => i.kind)).toContain('ZERO_NUMERIC');
  });
});
