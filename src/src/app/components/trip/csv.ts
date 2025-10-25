import { FlattenedTripItem } from '../../types/trip';

export function generateTripCSVFile(tripItems: readonly FlattenedTripItem[], tripName: string = 'Trip Calendar'): void {
  const headers = ['date', 'label', 'time', 'text', 'place', 'comment', 'latlng', 'price', 'status'];

  let csvContent = headers.join(',') + '\n';

  tripItems.forEach((item) => {
    const row = [
      item.td_date ?? '',
      item.td_label,
      item.time ?? '',
      escape_rfc4180(item.text),
      escape_rfc4180(item.comment ?? ''),
      escape_rfc4180(item.place?.name ?? ''),
      item.lat ?? item.place?.lat ?? '',
      item.lng ?? item.place?.lng ?? '',
      item.price ?? '',
      item.status?.label ?? '',
    ];
    csvContent += row.join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${tripName.replace(/\s+/g, '_')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escape_rfc4180(field: string): string {
  if (!field) return '';
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
