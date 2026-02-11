
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
const NIGHT_ENTRY_END_HOUR = 5; // 3:30 AM
const NIGHT_ENTRY_END_MINUTE = 30;
const NIGHT_FULL_END = 5; 
export function isCurrentlyInNightMode(): boolean {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= NIGHT_ENTRY_START) {
    return true;
  }
  if (hour < NIGHT_FULL_END) {
    
    return true;
  }
  return false;
}
export function isInNightEntryWindow(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // 10 PM to 11:59 PM
  if (hour >= NIGHT_ENTRY_START) {
    return true;
  }
  // Midnight (hour 0) to 3:30 AM
  if (hour < NIGHT_ENTRY_END_HOUR || (hour === NIGHT_ENTRY_END_HOUR && minute <= NIGHT_ENTRY_END_MINUTE)) {
    return true;
  }
  return false;
}


export function isDaytime(): boolean {
  return !isCurrentlyInNightMode();
}
export function getNightModeTimeInfo(): NightModeTimeInfo {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  const isInNight = isCurrentlyInNightMode();
  const isInEntry = isInNightEntryWindow();

  let message = '';
  let timeUntilNightMode: number | undefined;
  let timeUntilDayMode: number | undefined;

  if (isInNight) {
    if (hour >= NIGHT_ENTRY_START || hour < NIGHT_FULL_END) {
      const nextDay = new Date(now);
      nextDay.setHours(NIGHT_FULL_END, 0, 0, 0);
      if (now >= nextDay) {
        nextDay.setDate(nextDay.getDate() + 1);
      }
      timeUntilDayMode = nextDay.getTime() - now.getTime();
      message = `🌙 Night Mode Active - Day mode at 5:00 AM`;
    }
  } else {
    const nextNight = new Date(now);
    nextNight.setHours(NIGHT_ENTRY_START, 0, 0, 0);
    if (now >= nextNight) {
      nextNight.setDate(nextNight.getDate() + 1);
    }
    timeUntilNightMode = nextNight.getTime() - now.getTime();
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
  const enteredHour = enteredDate.getHours();
  const currentHour = now.getHours();

  const enteredDuringWindow = enteredHour >= NIGHT_ENTRY_START || enteredHour < NIGHT_ENTRY_END_HOUR;
  
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
    enteredDate.toDateString() !== now.toDateString() &&
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
