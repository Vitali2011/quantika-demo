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
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">⏱️</div>
          <h1 className="text-xl font-bold text-gray-900">Feature Not Enabled</h1>
          <p className="text-sm text-gray-500">
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

      // Fill form with parsed data
      if (data.commencedAt) {
        setInput((prev) => ({ ...prev, commencedAt: data.commencedAt }));
      }
      if (data.completedAt) {
        setInput((prev) => ({ ...prev, completedAt: data.completedAt }));
      }
      if (data.weatherDelayHours > 0) {
        setInput((prev) => ({ ...prev, weatherDelayHours: data.weatherDelayHours }));
      }

      // Show warnings if any
      if (data.parseWarnings && data.parseWarnings.length > 0) {
        setSofError(`Parsed with warnings: ${data.parseWarnings.join('; ')}`);
      }
    } catch (err) {
      setSofError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSofParsing(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Laytime Calculator</h1>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Parse Statement of Facts (Optional)</h2>
            <p className="text-sm text-gray-600 mb-4">
              Paste a Statement of Facts document to auto-fill the form below.
            </p>
            <div className="space-y-4">
              <textarea
                value={sofText}
                onChange={(e) => setSofText(e.target.value)}
                placeholder="2026-05-01 08:00 - Vessel arrived at anchorage&#10;2026-05-01 14:30 - NOR tendered&#10;2026-05-01 18:00 - NOR accepted, laytime commenced&#10;2026-05-03 22:00 - Completed loading&#10;2026-05-04 06:00 - Vessel departed"
                className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                rows={8}
              />
              <button
                type="button"
                onClick={handleParseSof}
                disabled={sofParsing || !sofText}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 touch-target"
              >
                {sofParsing ? 'Parsing...' : 'Parse SOF'}
              </button>
              {sofError && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
                  {sofError}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Input</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allowed Laytime (days)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={input.allowedLaytimeDays}
                  onChange={(e) =>
                    setInput({ ...input, allowedLaytimeDays: parseFloat(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
                <select
                  value={input.mode}
                  onChange={(e) =>
                    setInput({ ...input, mode: e.target.value as LaytimeInput['mode'] })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="SHINC">SHINC (Sundays/Holidays Included)</option>
                  <option value="SHEX">SHEX (Sundays/Holidays Excluded)</option>
                  <option value="FHINC">FHINC (First Half Included)</option>
                  <option value="FHEX">FHEX (First Half Excluded)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Commenced At
                </label>
                <input
                  type="datetime-local"
                  value={input.commencedAt.slice(0, 16)}
                  onChange={(e) => setInput({ ...input, commencedAt: e.target.value + ':00Z' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Completed At
                </label>
                <input
                  type="datetime-local"
                  value={input.completedAt.slice(0, 16)}
                  onChange={(e) => setInput({ ...input, completedAt: e.target.value + ':00Z' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weather Delay (hours)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={input.weatherDelayHours || 0}
                  onChange={(e) =>
                    setInput({ ...input, weatherDelayHours: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Port Holidays (YYYY-MM-DD)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="date"
                    value={holidayInput}
                    onChange={(e) => setHolidayInput(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={addHoliday}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-1">
                  {input.portHolidays?.map((date) => (
                    <div
                      key={date}
                      className="flex items-center justify-between bg-gray-50 px-3 py-1 rounded"
                    >
                      <span className="text-sm">{date}</span>
                      <button
                        type="button"
                        onClick={() => removeHoliday(date)}
                        className="text-red-600 text-sm hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Demurrage/Despatch (Optional)
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Demurrage Rate (USD/day)
                    </label>
                    <input
                      type="number"
                      step="100"
                      min="0"
                      value={demurrageRate ?? ''}
                      onChange={(e) =>
                        setDemurrageRate(e.target.value ? parseFloat(e.target.value) : undefined)
                      }
                      placeholder="e.g. 8000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Leave empty to skip demurrage/despatch calculation
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Despatch Rate (USD/day)
                    </label>
                    <input
                      type="number"
                      step="100"
                      min="0"
                      value={despatchRate ?? ''}
                      onChange={(e) =>
                        setDespatchRate(e.target.value ? parseFloat(e.target.value) : undefined)
                      }
                      placeholder="Default: half of demurrage rate"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Optional. If not specified, defaults to demurrage rate / 2
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 touch-target"
              >
                {loading ? 'Calculating...' : 'Calculate'}
              </button>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                  {error}
                </div>
              )}
            </form>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Result</h2>
            {result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Allowed Laytime</div>
                    <div className="text-xl font-bold">{result.allowedLaytimeHours.toFixed(1)}h</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Used Laytime</div>
                    <div className="text-xl font-bold">{result.usedLaytimeHours.toFixed(1)}h</div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-md">
                  <div className="text-sm text-gray-600">Status</div>
                  <div
                    className={`text-lg font-bold ${
                      result.demurrageOrDespatch === 'demurrage'
                        ? 'text-red-600'
                        : result.demurrageOrDespatch === 'despatch'
                          ? 'text-green-600'
                          : 'text-gray-900'
                    }`}
                  >
                    {result.demurrageOrDespatch.toUpperCase()}
                  </div>
                  <div className="text-sm mt-1">
                    {result.netHours > 0
                      ? `+${result.netHours.toFixed(1)}h demurrage`
                      : result.netHours < 0
                        ? `${result.netHours.toFixed(1)}h despatch`
                        : 'Exactly balanced'}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Daily Breakdown</div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {result.breakdown.map((entry) => (
                      <div
                        key={entry.date}
                        className={`flex justify-between items-center px-3 py-2 rounded text-sm ${
                          entry.excluded ? 'bg-red-50 text-red-800' : 'bg-gray-50'
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
                  </div>
                </div>

                {result.dd && (
                  <div className="pt-4 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">
                      Demurrage/Despatch
                    </h3>
                    <div className="space-y-3">
                      <div className="p-4 bg-gray-50 rounded-md">
                        <div className="text-sm text-gray-600">Status</div>
                        <div
                          className={`text-2xl font-bold ${
                            result.dd.status === 'demurrage'
                              ? 'text-red-600'
                              : result.dd.status === 'despatch'
                                ? 'text-green-600'
                                : 'text-gray-900'
                          }`}
                        >
                          {result.dd.status.toUpperCase()}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-gray-600">Demurrage Amount</div>
                          <div className="text-lg font-bold text-red-600">
                            ${result.dd.demurrageAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Despatch Amount</div>
                          <div className="text-lg font-bold text-green-600">
                            ${result.dd.despatchAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                        <div className="text-sm text-gray-600 mb-1">Net Amount</div>
                        <div
                          className={`text-xl font-bold ${
                            result.dd.netAmount > 0
                              ? 'text-red-600'
                              : result.dd.netAmount < 0
                                ? 'text-green-600'
                                : 'text-gray-900'
                          }`}
                        >
                          {result.dd.netAmount > 0 ? '+' : ''}
                          ${result.dd.netAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {result.dd.netAmount > 0
                            ? 'You pay (demurrage)'
                            : result.dd.netAmount < 0
                              ? 'You earn (despatch)'
                              : 'Balanced'}
                        </div>
                      </div>

                      <div className="text-xs text-gray-500 space-y-1">
                        <div>Demurrage Rate: ${result.dd.breakdown.demurrageRate.toLocaleString()}/day</div>
                        <div>Despatch Rate: ${result.dd.breakdown.despatchRate.toLocaleString()}/day</div>
                        <div>Demurrage Hours: {result.dd.breakdown.demurrageHours.toFixed(1)}h</div>
                        <div>Despatch Hours: {result.dd.breakdown.despatchHours.toFixed(1)}h</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
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
