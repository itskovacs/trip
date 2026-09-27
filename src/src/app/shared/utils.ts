import { ChecklistItem, TripBooking, TripDay } from '../types/trip';

export function computeDistLatLng(lat1: number, lon1: number, lat2: number, lon2: number) {
  // returns d in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const R = 6371;
  return R * c;
}

export function bookingTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    flight: '✈️',
    car: '🚗',
    hotel: '🏨',
    activity: '🎪',
    train: '🚆',
    boat: '⛴️',
    generic: '📋',
  };
  return icons[type] ?? '📋';
}

export function bookingTypeClass(type: string): string {
  const classes: Record<string, string> = {
    flight: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    car: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    hotel: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    activity: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    train: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    boat: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
    generic: 'bg-primary-100 text-primary-600 dark:bg-primary-800 dark:text-primary-300',
  };
  return classes[type] ?? classes['generic'];
}

const BOOKING_TYPE_ORDER: string[] = ['activity', 'generic', 'car', 'flight', 'train', 'boat', 'hotel'];

export function sortBookings<T extends Pick<TripBooking, 'type'>>(bookings: T[]): T[] {
  return [...bookings].sort((a, b) => {
    const aIndex = BOOKING_TYPE_ORDER.indexOf(a.type);
    const bIndex = BOOKING_TYPE_ORDER.indexOf(b.type);
    return (aIndex === -1 ? BOOKING_TYPE_ORDER.length : aIndex) - (bIndex === -1 ? BOOKING_TYPE_ORDER.length : bIndex);
  });
}

export type ChecklistGroupKey = 'week' | 'month' | 'year' | 'undated';

export interface ChecklistGroup {
  key: ChecklistGroupKey;
  labelKey: string;
  items: ChecklistItem[];
}

const CHECKLIST_GROUP_KEYS: ChecklistGroupKey[] = ['week', 'month', 'year', 'undated'];

function checklistReminderTime(item: ChecklistItem): number | null {
  return item.notify_dt ? new Date(item.notify_dt + 'Z').getTime() : null;
}

export function sortChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    const at = checklistReminderTime(a);
    const bt = checklistReminderTime(b);
    if (at === bt) return b.id - a.id;
    if (at === null) return 1;
    if (bt === null) return -1;
    return at - bt;
  });
}

export function groupChecklistItems(items: ChecklistItem[]): ChecklistGroup[] {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + ((7 - now.getDay()) % 7));
  endOfWeek.setHours(23, 59, 59, 999);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // 'week' also holds overdue reminders, 'year' everything past this month (incl. later years)
  const bucketOf = (item: ChecklistItem): ChecklistGroupKey => {
    const t = checklistReminderTime(item);
    if (t === null) return 'undated';
    if (t <= endOfWeek.getTime()) return 'week';
    if (t <= endOfMonth.getTime()) return 'month';
    return 'year';
  };

  const sorted = sortChecklistItems(items);
  return CHECKLIST_GROUP_KEYS.map((key) => ({
    key,
    labelKey: `entities.checklist.groups.${key}`,
    items: sorted.filter((item) => bucketOf(item) === key),
  })).filter((group) => group.items.length > 0);
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number; pct: number } {
  const total = items.length;
  const done = items.filter((i) => i.checked).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function isOverdueReminder(item: ChecklistItem): boolean {
  const t = checklistReminderTime(item);
  return !item.checked && t !== null && t <= Date.now();
}

export function saveBlobAs(data: Blob, filename: string): void {
  const url = window.URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();

  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

export function tripFilename(name: string, extension: string | null = null): string {
  let resp = (name || 'trip').replace(/[^a-z0-9]/gi, '_');
  if (extension) resp += `.${extension}`;
  return resp;
}

export function daterangeToTripDays(daterange: Date[], locale?: string): Partial<TripDay>[] {
  const [from, to] = daterange;

  const tripDays: Partial<TripDay>[] = [];
  const current = new Date(from);
  while (current <= to) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const monthAbbr = current.toLocaleString(locale ?? 'default', { month: 'short' });
    const label = `${day} ${monthAbbr}`;
    tripDays.push({ label, dt: `${year}-${month}-${day}` });
    current.setDate(current.getDate() + 1);
  }
  return tripDays;
}
