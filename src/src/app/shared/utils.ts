import { TripBooking, TripDay } from '../types/trip';

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
