import { Trip, TripStatus } from '../../types/trip';

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
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeName = trip.name.replace(/[^a-z0-9]/gi, '_');
  link.href = url;
  link.download = `${safeName}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escape_rfc4180(field: string): string {
  if (!field) return '';
  if (/[",\n\r]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}
