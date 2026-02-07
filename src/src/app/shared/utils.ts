import { TripDay } from '../types/trip';

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

export function daterangeToTripDays(daterange: Date[]): Partial<TripDay>[] {
  const [from, to] = daterange;
  const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

  const tripDays: Partial<TripDay>[] = [];
  const current = new Date(from);
  while (current <= to) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const label = `${day} ${months[current.getMonth()]}`;
    tripDays.push({ label, dt: `${year}-${month}-${day}` });
    current.setDate(current.getDate() + 1);
  }
  return tripDays;
}
