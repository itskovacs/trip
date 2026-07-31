import { Trip, TripStatus } from '../../types/trip';
import { saveBlobAs, tripFilename } from '../utils';

export function generateTripCSVFile(trip: Trip): void {
  const headers = ['Date', 'Day', 'Time', 'Activity', 'Comment', 'Place', 'Latitude', 'Longitude', 'Price', 'Status'];
  const rows: string[] = [headers.join(',')];
  trip.days.forEach((day) => {
    const sortedItems = [...day.items].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    sortedItems.forEach((item) => {
      let statusLabel = '';
      if (typeof item.status === 'string') {
        statusLabel = item.status;
      } else if (item.status) {
        statusLabel = (item.status as TripStatus).label;
      }

      const lat = item.lat ?? item.place?.lat ?? '';
      const lng = item.lng ?? item.place?.lng ?? '';

      const rowData = [
        day.dt ?? '',
        escape_rfc4180(day.label),
        item.time ?? '',
        escape_rfc4180(item.text),
        escape_rfc4180(item.comment ?? ''),
        escape_rfc4180(item.place?.name ?? ''),
        lat,
        lng,
        item.price ?? '',
        escape_rfc4180(statusLabel),
      ];

      rows.push(rowData.join(','));
    });
  });

  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveBlobAs(blob, tripFilename(trip.name, 'csv'));
}

function escape_rfc4180(field: string): string {
  if (!field) return '';
  if (/^[=+\-@\t\r]/.test(field)) field = "'" + field;
  if (/[",\n\r]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}
