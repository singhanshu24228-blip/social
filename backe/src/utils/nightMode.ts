
export interface NightModeTimeInfo {
  isCurrentlyInNightMode: boolean;
  isInEntryWindow: boolean;
  timeUntilNightMode?: number; // milliseconds until 10 PM
  timeUntilDayMode?: number; // milliseconds until 5 AM
  currentHour: number;
  currentMinute: number;
  message: string;
}
const NIGHT_ENTRY_START = 22; // 10:00 PM
const NIGHT_ENTRY_END_HOUR = 3; // 3:30 AM
const NIGHT_ENTRY_END_MINUTE = 30;
const NIGHT_FULL_END = 5;

const NIGHT_MODE_TIMEZONE =
  process.env.NIGHT_MODE_TIMEZONE ||
  process.env.NIGHT_MODE_TZ ||
  // Default to IST because the product copy/UI uses 10 PM–3:30 AM / 5 AM in local time.
  'Asia/Kolkata';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

function addDaysToYMD(year: number, month: number, day: number, daysToAdd: number) {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const z = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return asUTC - date.getTime();
}

function zonedTimeToUtc(parts: Omit<ZonedParts, 'second'> & { second?: number }, timeZone: string) {
  const second = typeof parts.second === 'number' ? parts.second : 0;
  const utcBase = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second);

  // One to two iterations to handle DST/offset transitions accurately.
  let utc = utcBase - getTimeZoneOffsetMs(new Date(utcBase), timeZone);
  utc = utcBase - getTimeZoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

function isCurrentlyInNightModeAt(date: Date, timeZone: string): boolean {
  const { hour } = getZonedParts(date, timeZone);
  if (hour >= NIGHT_ENTRY_START) return true;
  if (hour < NIGHT_FULL_END) return true;
  return false;
}

function isInNightEntryWindowAt(date: Date, timeZone: string): boolean {
  const { hour, minute } = getZonedParts(date, timeZone);

  // 10 PM to 11:59 PM
  if (hour >= NIGHT_ENTRY_START) return true;

  // Midnight to 3:30 AM (inclusive)
  if (hour < NIGHT_ENTRY_END_HOUR) return true;
  if (hour === NIGHT_ENTRY_END_HOUR && minute <= NIGHT_ENTRY_END_MINUTE) return true;

  return false;
}

export function isCurrentlyInNightMode(): boolean {
  return isCurrentlyInNightModeAt(new Date(), NIGHT_MODE_TIMEZONE);
}
export function isInNightEntryWindow(): boolean {
  return isInNightEntryWindowAt(new Date(), NIGHT_MODE_TIMEZONE);
}


export function isDaytime(): boolean {
  return !isCurrentlyInNightMode();
}
export function getNightModeTimeInfo(): NightModeTimeInfo {
  const now = new Date();
  const nowParts = getZonedParts(now, NIGHT_MODE_TIMEZONE);
  const hour = nowParts.hour;
  const minute = nowParts.minute;

  const isInNight = isCurrentlyInNightModeAt(now, NIGHT_MODE_TIMEZONE);
  const isInEntry = isInNightEntryWindowAt(now, NIGHT_MODE_TIMEZONE);

  let message = '';
  let timeUntilNightMode: number | undefined;
  let timeUntilDayMode: number | undefined;

  if (isInNight) {
    if (hour >= NIGHT_ENTRY_START || hour < NIGHT_FULL_END) {
      const add = hour >= NIGHT_ENTRY_START ? 1 : 0;
      const ymd = addDaysToYMD(nowParts.year, nowParts.month, nowParts.day, add);
      const target = zonedTimeToUtc(
        { year: ymd.year, month: ymd.month, day: ymd.day, hour: NIGHT_FULL_END, minute: 0, second: 0 },
        NIGHT_MODE_TIMEZONE
      );
      timeUntilDayMode = target.getTime() - now.getTime();
      message = `🌙 Night Mode Active - Day mode at 5:00 AM`;
    }
  } else {
    const add = hour >= NIGHT_ENTRY_START ? 1 : 0;
    const ymd = addDaysToYMD(nowParts.year, nowParts.month, nowParts.day, add);
    const target = zonedTimeToUtc(
      { year: ymd.year, month: ymd.month, day: ymd.day, hour: NIGHT_ENTRY_START, minute: 0, second: 0 },
      NIGHT_MODE_TIMEZONE
    );
    timeUntilNightMode = target.getTime() - now.getTime();
    message = `Night mode unlocks at 10:00 PM. Please wait 🌙`;
  }

  return {
    isCurrentlyInNightMode: isInNight,
    isInEntryWindow: isInEntry,
    timeUntilNightMode,
    timeUntilDayMode,
    currentHour: hour,
    currentMinute: minute,
    message,
  };
}


export function canUserEnterNightMode(): boolean {
  return isInNightEntryWindow();
}


export function shouldUserBeInNightMode(
  nightModeEnteredAt: Date | undefined
): boolean {
  if (!nightModeEnteredAt) {
    return false;
  }

  const now = new Date();
  const enteredDate = new Date(nightModeEnteredAt);
  const enteredParts = getZonedParts(enteredDate, NIGHT_MODE_TIMEZONE);
  const nowParts = getZonedParts(now, NIGHT_MODE_TIMEZONE);
  const enteredHour = enteredParts.hour;
  const currentHour = nowParts.hour;

  const enteredDuringWindow = isInNightEntryWindowAt(enteredDate, NIGHT_MODE_TIMEZONE);
  
  if (!enteredDuringWindow) {
    return false;
  }

  const timeSinceEntry = now.getTime() - enteredDate.getTime();
  const maxNightModeDuration = 7 * 60 * 60 * 1000; // 7 hours max (entered at 10 PM, valid until 5 AM)

  if (isCurrentlyInNightMode() && enteredDuringWindow && timeSinceEntry < maxNightModeDuration) {
    return true;
  }

  // If they entered in the evening (10 PM - 11:59 PM) and it's now early morning (before 5 AM)
  if (
    enteredHour >= NIGHT_ENTRY_START &&
    (enteredParts.year !== nowParts.year || enteredParts.month !== nowParts.month || enteredParts.day !== nowParts.day) &&
    currentHour < NIGHT_FULL_END
  ) {
    return true;
  }

  return false;
}

export function formatTimeRemaining(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
