/**
 * Laytime Calculator Page
 *
 * Form for calculating laytime with SHEX/SHINC/FHEX/FHINC modes.
 * Behind NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED flag.
 */

'use client';

import { useState } from 'react';
import type { LaytimeInput, LaytimeResult, DemurrageDespatchResult } from '@/lib/types';

interface LaytimeCalculateRequest extends LaytimeInput {
  demurrageRateUsdPerDay?: number;
  despatchRateUsdPerDay?: number;
}

interface LaytimeCalculateResponse extends LaytimeResult {
  dd?: DemurrageDespatchResult;
}

export default function LaytimePage() {
  const [input, setInput] = useState<LaytimeInput>({
    allowedLaytimeDays: 5,
    mode: 'SHINC',
    commencedAt: '',
    completedAt: '',
    portHolidays: [],
    weatherDelayHours: 0,
  });
  const [demurrageRate, setDemurrageRate] = useState<number | undefined>(undefined);
  const [despatchRate, setDespatchRate] = useState<number | undefined>(undefined);
  const [result, setResult] = useState<LaytimeCalculateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [holidayInput, setHolidayInput] = useState('');
  const [sofText, setSofText] = useState('');
  const [sofParsing, setSofParsing] = useState(false);
  const [sofError, setSofError] = useState<string | null>(null);

  if (process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED !== 'true') {
    return (
      <main className="min-h-screen bg-ds-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">⏱️</div>
          <h1 className="text-xl font-bold text-ds-text">Feature Not Enabled</h1>
          <p className="text-sm text-ds-text-muted">
            Laytime Engine coming soon. Contact your administrator to enable
            NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED.
          </p>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const requestBody: LaytimeCalculateRequest = {
        ...input,
        demurrageRateUsdPerDay: demurrageRate,
        despatchRateUsdPerDay: despatchRate,
      };

      const res = await fetch('/api/laytime/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to calculate laytime');
      }

      const data: LaytimeCalculateResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const addHoliday = () => {
    if (holidayInput && !input.portHolidays?.includes(holidayInput)) {
      setInput({
        ...input,
        portHolidays: [...(input.portHolidays || []), holidayInput],
      });
      setHolidayInput('');
    }
  };

  const removeHoliday = (date: string) => {
    setInput({
      ...input,
      portHolidays: input.portHolidays?.filter((d) => d !== date) || [],
    });
  };

  const handleParseSof = async () => {
    setSofError(null);
    setSofParsing(true);

    try {
      const res = await fetch('/api/laytime/parse-sof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sofText }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to parse SOF');
      }

      const data = await res.json();

      if (data.commencedAt) {
        setInput((prev) => ({ ...prev, commencedAt: data.commencedAt }));
      }
      if (data.completedAt) {
        setInput((prev) => ({ ...prev, completedAt: data.completedAt }));
      }
      if (data.weatherDelayHours > 0) {
        setInput((prev) => ({ ...prev, weatherDelayHours: data.weatherDelayHours }));
      }

      if (data.parseWarnings && data.parseWarnings.length > 0) {
        setSofError(`Parsed with warnings: ${data.parseWarnings.join('; ')}`);
      }
    } catch (err) {
      setSofError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSofParsing(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-ds-border rounded-ds-md text-ds-text bg-ds-surface focus:outline-none focus:ring-2 focus:ring-ds-accent/40 focus:border-ds-accent transition-colors duration-ds-fast';
  const labelClass = 'block text-sm font-medium text-ds-text mb-1';

  return (
    <main className="min-h-screen bg-ds-bg px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-ds-text mb-6">Laytime Calculator</h1>

        <div className="space-y-6">
          {/* SOF Parser */}
          <div className="bg-ds-surface rounded-ds-md border border-ds-border p-6">
            <h2 className="text-lg font-semibold text-ds-text mb-2">Parse Statement of Facts (Optional)</h2>
            <p className="text-sm text-ds-text-muted mb-4">
              Paste a Statement of Facts document to auto-fill the form below.
            </p>
            <div className="space-y-4">
              <textarea
                value={sofText}
                onChange={(e) => setSofText(e.target.value)}
                placeholder="2026-05-01 08:00 - Vessel arrived at anchorage&#10;2026-05-01 14:30 - NOR tendered&#10;2026-05-01 18:00 - NOR accepted, laytime commenced&#10;2026-05-03 22:00 - Completed loading&#10;2026-05-04 06:00 - Vessel departed"
                className={`${inputClass} font-mono`}
                rows={8}
              />
              <button
                type="button"
                onClick={handleParseSof}
                disabled={sofParsing || !sofText}
                className="px-4 py-2 bg-ds-success text-white rounded-ds-md hover:bg-ds-success/90 disabled:opacity-50 disabled:pointer-events-none transition-colors duration-ds-fast touch-target"
              >
                {sofParsing ? 'Parsing...' : 'Parse SOF'}
              </button>
              {sofError && (
                <div className="p-3 bg-ds-warn-soft border border-ds-warn/20 rounded-ds-md text-sm text-ds-warn">
                  {sofError}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input form */}
            <div className="bg-ds-surface rounded-ds-md border border-ds-border p-6">
              <h2 className="text-lg font-semibold text-ds-text mb-4">Input</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={labelClass}>Allowed Laytime (days)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={input.allowedLaytimeDays}
                    onChange={(e) =>
                      setInput({ ...input, allowedLaytimeDays: parseFloat(e.target.value) })
                    }
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Mode</label>
                  <select
                    value={input.mode}
                    onChange={(e) =>
                      setInput({ ...input, mode: e.target.value as LaytimeInput['mode'] })
                    }
                    className={inputClass}
                  >
                    <option value="SHINC">SHINC (Sundays/Holidays Included)</option>
                    <option value="SHEX">SHEX (Sundays/Holidays Excluded)</option>
                    <option value="FHINC">FHINC (Fridays/Holidays Included)</option>
                    <option value="FHEX">FHEX (Fridays/Holidays Excluded)</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Commenced At</label>
                  <input
                    type="datetime-local"
                    value={input.commencedAt.slice(0, 16)}
                    onChange={(e) => setInput({ ...input, commencedAt: e.target.value + ':00Z' })}
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Completed At</label>
                  <input
                    type="datetime-local"
                    value={input.completedAt.slice(0, 16)}
                    onChange={(e) => setInput({ ...input, completedAt: e.target.value + ':00Z' })}
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Weather Delay (hours)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={input.weatherDelayHours || 0}
                    onChange={(e) =>
                      setInput({ ...input, weatherDelayHours: parseFloat(e.target.value) || 0 })
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Port Holidays (YYYY-MM-DD)</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="date"
                      value={holidayInput}
                      onChange={(e) => setHolidayInput(e.target.value)}
                      className={`flex-1 px-3 py-2 border border-ds-border rounded-ds-md text-ds-text bg-ds-surface focus:outline-none focus:ring-2 focus:ring-ds-accent/40 transition-colors duration-ds-fast`}
                    />
                    <button
                      type="button"
                      onClick={addHoliday}
                      className="touch-target px-4 py-2 bg-ds-surface-muted text-ds-text border border-ds-border rounded-ds-md hover:bg-ds-border transition-colors duration-ds-fast"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-1">
                    {input.portHolidays?.map((date) => (
                      <div
                        key={date}
                        className="flex items-center justify-between bg-ds-surface-muted px-3 py-1 rounded-ds-sm"
                      >
                        <span className="text-sm text-ds-text">{date}</span>
                        <button
                          type="button"
                          onClick={() => removeHoliday(date)}
                          className="text-ds-danger text-sm hover:text-ds-danger/80"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-ds-border">
                  <h3 className="text-sm font-semibold text-ds-text mb-3">
                    Demurrage/Despatch (Optional)
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>Demurrage Rate (USD/day)</label>
                      <input
                        type="number"
                        step="100"
                        min="0"
                        value={demurrageRate ?? ''}
                        onChange={(e) =>
                          setDemurrageRate(e.target.value ? parseFloat(e.target.value) : undefined)
                        }
                        placeholder="e.g. 8000"
                        className={inputClass}
                      />
                      <p className="text-xs text-ds-text-muted mt-1">
                        Leave empty to skip demurrage/despatch calculation
                      </p>
                    </div>

                    <div>
                      <label className={labelClass}>Despatch Rate (USD/day)</label>
                      <input
                        type="number"
                        step="100"
                        min="0"
                        value={despatchRate ?? ''}
                        onChange={(e) =>
                          setDespatchRate(e.target.value ? parseFloat(e.target.value) : undefined)
                        }
                        placeholder="Default: half of demurrage rate"
                        className={inputClass}
                      />
                      <p className="text-xs text-ds-text-muted mt-1">
                        Optional. If not specified, defaults to demurrage rate / 2
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 bg-ds-accent text-ds-accent-fg rounded-ds-md hover:bg-ds-accent/90 disabled:opacity-50 disabled:pointer-events-none transition-colors duration-ds-fast touch-target font-medium"
                >
                  {loading ? 'Calculating...' : 'Calculate'}
                </button>

                {error && (
                  <div className="p-3 bg-ds-danger-soft border border-ds-danger/20 rounded-ds-md text-sm text-ds-danger">
                    {error}
                  </div>
                )}
              </form>
            </div>

            {/* Results panel */}
            <div className="bg-ds-surface rounded-ds-md border border-ds-border p-6">
              <h2 className="text-lg font-semibold text-ds-text mb-4">Result</h2>
              {result ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-ds-text-muted">Allowed Laytime</div>
                      <div className="text-xl font-bold text-ds-text">{result.allowedLaytimeHours.toFixed(1)}h</div>
                    </div>
                    <div>
                      <div className="text-sm text-ds-text-muted">Used Laytime</div>
                      <div className="text-xl font-bold text-ds-text">{result.usedLaytimeHours.toFixed(1)}h</div>
                    </div>
                  </div>

                  <div className="p-4 bg-ds-surface-muted rounded-ds-md">
                    <div className="text-sm text-ds-text-muted">Status</div>
                    <div
                      className={`text-lg font-bold ${
                        result.demurrageOrDespatch === 'demurrage'
                          ? 'text-ds-danger'
                          : result.demurrageOrDespatch === 'despatch'
                            ? 'text-ds-success'
                            : 'text-ds-text'
                      }`}
                    >
                      {result.demurrageOrDespatch.toUpperCase()}
                    </div>
                    <div className="text-sm mt-1 text-ds-text-muted">
                      {result.netHours > 0
                        ? `+${result.netHours.toFixed(1)}h demurrage`
                        : result.netHours < 0
                          ? `${result.netHours.toFixed(1)}h despatch`
                          : 'Exactly balanced'}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-ds-text mb-2">Daily Breakdown</div>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {result.breakdown.map((entry) => (
                        <div
                          key={entry.date}
                          className={`flex justify-between items-center px-3 py-2 rounded-ds-sm text-sm ${
                            entry.excluded ? 'bg-ds-danger-soft text-ds-danger' : 'bg-ds-surface-muted text-ds-text'
                          }`}
                        >
                          <span>{entry.date}</span>
                          <span>
                            {entry.excluded ? (
                              <span className="font-medium">
                                Excluded ({entry.reason})
                              </span>
                            ) : (
                              <span>{entry.hours.toFixed(1)}h</span>
                            )}
                          </span>
                        </div>
                      ))}
                      {(result.appliedWeatherDeduction ?? 0) > 0 && (
                        <div className="flex justify-between items-center px-3 py-2 rounded-ds-sm text-sm bg-ds-warn-soft text-ds-warn font-medium">
                          <span>Weather delay deducted</span>
                          <span>−{(result.appliedWeatherDeduction ?? 0).toFixed(1)}h</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {result.dd && (
                    <div className="pt-4 border-t border-ds-border">
                      <h3 className="text-sm font-semibold text-ds-text mb-3">
                        Demurrage/Despatch
                      </h3>
                      <div className="space-y-3">
                        <div className="p-4 bg-ds-surface-muted rounded-ds-md">
                          <div className="text-sm text-ds-text-muted">Status</div>
                          <div
                            className={`text-2xl font-bold ${
                              result.dd.status === 'demurrage'
                                ? 'text-ds-danger'
                                : result.dd.status === 'despatch'
                                  ? 'text-ds-success'
                                  : 'text-ds-text'
                            }`}
                          >
                            {result.dd.status.toUpperCase()}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-ds-text-muted">Demurrage Amount</div>
                            <div className="text-lg font-bold text-ds-danger">
                              ${result.dd.demurrageAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-ds-text-muted">Despatch Amount</div>
                            <div className="text-lg font-bold text-ds-success">
                              ${result.dd.despatchAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                          </div>
                        </div>

                        <div className="p-4 bg-ds-info-soft border border-ds-info/20 rounded-ds-md">
                          <div className="text-sm text-ds-text-muted mb-1">Net Amount</div>
                          <div
                            className={`text-xl font-bold ${
                              result.dd.netAmount > 0
                                ? 'text-ds-danger'
                                : result.dd.netAmount < 0
                                  ? 'text-ds-success'
                                  : 'text-ds-text'
                            }`}
                          >
                            {result.dd.netAmount > 0 ? '+' : ''}
                            ${result.dd.netAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-xs text-ds-text-muted mt-1">
                            {result.dd.netAmount > 0
                              ? 'You pay (demurrage)'
                              : result.dd.netAmount < 0
                                ? 'You earn (despatch)'
                                : 'Balanced'}
                          </div>
                        </div>

                        <div className="text-xs text-ds-text-muted space-y-1">
                          <div>Demurrage Rate: ${result.dd.breakdown.demurrageRate.toLocaleString('en-US')}/day</div>
                          <div>Despatch Rate: ${result.dd.breakdown.despatchRate.toLocaleString('en-US')}/day</div>
                          <div>Demurrage Hours: {result.dd.breakdown.demurrageHours.toFixed(1)}h</div>
                          <div>Despatch Hours: {result.dd.breakdown.despatchHours.toFixed(1)}h</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-ds-text-muted py-12">
                  Enter laytime details and click Calculate to see results.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
