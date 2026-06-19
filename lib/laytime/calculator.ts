import type { LaytimeInput, LaytimeResult, LaytimeBreakdownEntry, LaytimeMode } from '../types';

const VALID_MODES: LaytimeMode[] = ['SHEX', 'SHINC', 'FHEX', 'FHINC'];

export function isSunday(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new TypeError('dateStr must be a non-empty string');
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new TypeError(`Invalid date string: ${dateStr}`);
  }
  return date.getUTCDay() === 0;
}

export function isHoliday(dateStr: string, holidays: string[]): boolean {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new TypeError('dateStr must be a non-empty string');
  }
  if (!Array.isArray(holidays)) {
    throw new TypeError('holidays must be an array');
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new TypeError(`Invalid date string: ${dateStr}`);
  }
  return holidays.some(h => {
    const holidayDate = new Date(h);
    if (isNaN(holidayDate.getTime())) {
      return false;
    }
    return h === dateStr;
  });
}

export function isExcluded(dateStr: string, mode: LaytimeMode, holidays: string[]): boolean {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new TypeError('dateStr must be a non-empty string');
  }
  if (!VALID_MODES.includes(mode)) {
    throw new TypeError(`Invalid mode: ${mode}. Must be one of ${VALID_MODES.join(', ')}`);
  }
  if (!Array.isArray(holidays)) {
    throw new TypeError('holidays must be an array');
  }

  if (mode === 'SHINC' || mode === 'FHINC') {
    return false;
  }

  if (mode === 'SHEX' || mode === 'FHEX') {
    return isSunday(dateStr) || isHoliday(dateStr, holidays);
  }

  return false;
}

export function calculateLaytime(input: LaytimeInput): LaytimeResult {
  if (!input || typeof input !== 'object') {
    throw new TypeError('input must be a non-null object');
  }

  const { allowedLaytimeDays, mode, commencedAt, completedAt, portHolidays = [], weatherDelayHours = 0 } = input;

  if (!Number.isFinite(allowedLaytimeDays)) {
    throw new RangeError('allowedLaytimeDays must be a finite number');
  }
  if (allowedLaytimeDays <= 0) {
    throw new RangeError('allowedLaytimeDays must be greater than 0');
  }

  if (weatherDelayHours !== undefined && (!Number.isFinite(weatherDelayHours) || weatherDelayHours < 0)) {
    throw new RangeError('weatherDelayHours must be a finite number >= 0');
  }

  const commencedDate = new Date(commencedAt);
  if (isNaN(commencedDate.getTime())) {
    throw new TypeError(`Invalid commencedAt date: ${commencedAt}`);
  }

  const completedDate = new Date(completedAt);
  if (isNaN(completedDate.getTime())) {
    throw new TypeError(`Invalid completedAt date: ${completedAt}`);
  }

  if (commencedDate > completedDate) {
    throw new RangeError('commencedAt must be before or equal to completedAt');
  }

  const totalMinutes = (completedDate.getTime() - commencedDate.getTime()) / (1000 * 60);
  const breakdown: LaytimeBreakdownEntry[] = [];

  let currentDate = new Date(commencedDate);
  let minutesCounted = 0;

  while (currentDate <= completedDate) {
    const dateStr = currentDate.toISOString().split('T')[0];

    const minutesInDay = calculateMinutesInDay(currentDate, commencedDate, completedDate);

    const excluded = isExcluded(dateStr, mode, portHolidays);
    const reason = excluded
      ? isSunday(dateStr)
        ? 'sunday'
        : 'holiday'
      : undefined;

    const hoursInDay = minutesInDay / 60;

    if (!excluded) {
      minutesCounted += minutesInDay;
    }

    breakdown.push({
      date: dateStr,
      hours: hoursInDay,
      excluded,
      reason,
    });

    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    currentDate.setUTCHours(0, 0, 0, 0);
  }

  const grossCountedHours = minutesCounted / 60;
  // Actual deduction can never exceed gross counted time. Rendering this
  // (instead of the raw weatherDelayHours) keeps the UI reconciliation line
  // honest at the clamp boundary: grossSum − appliedWeatherDeduction === used.
  const appliedWeatherDeduction = Math.min(weatherDelayHours, grossCountedHours);
  let usedLaytimeHours = grossCountedHours - weatherDelayHours;
  usedLaytimeHours = Math.max(0, usedLaytimeHours);

  const allowedLaytimeHours = allowedLaytimeDays * 24;
  const netHours = usedLaytimeHours - allowedLaytimeHours;

  const EPSILON = 0.01;
  let demurrageOrDespatch: 'demurrage' | 'despatch' | 'balanced';
  if (netHours > EPSILON) {
    demurrageOrDespatch = 'demurrage';
  } else if (netHours < -EPSILON) {
    demurrageOrDespatch = 'despatch';
  } else {
    demurrageOrDespatch = 'balanced';
  }

  return {
    allowedLaytimeHours,
    usedLaytimeHours,
    appliedWeatherDeduction,
    demurrageOrDespatch,
    netHours,
    breakdown,
  };
}

function calculateMinutesInDay(
  currentDate: Date,
  commencedDate: Date,
  completedDate: Date
): number {
  const dayStart = new Date(currentDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(currentDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const effectiveStart = dayStart < commencedDate ? commencedDate : dayStart;
  const effectiveEnd = dayEnd > completedDate ? completedDate : dayEnd;

  if (effectiveStart > effectiveEnd) {
    return 0;
  }

  const minutes = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
  return Math.max(0, Math.round(minutes));
}
