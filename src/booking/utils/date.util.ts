export function getCurrentDateTime(): Date {
  return new Date();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600000);
}

export function isExpired(date: Date | null): boolean {
  if (!date) return false;
  return date.getTime() < Date.now();
}

export function getTimeDifferenceInMinutes(startDate: Date, endDate: Date = new Date()): number {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 60000);
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function isTimeInRange(timeStr: string, startTime: string, endTime: string): boolean {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);

  const time = hours * 60 + minutes;
  const start = startHours * 60 + startMinutes;
  const end = endHours * 60 + endMinutes;

  if (start <= end) {
    return time >= start && time <= end;
  } else {
    return time >= start || time <= end;
  }
}

export function getCurrentTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getCurrentDayOfWeek(): number {
  return new Date().getDay();
}
