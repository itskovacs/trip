import { FlattenedTripItem } from '../../types/trip';
import { UtilsService } from '../../services/utils.service';

export function generateTripICSFile(
  tripItems: FlattenedTripItem[],
  tripName: string = 'Trip Calendar',
  utilsService: UtilsService,
): void {
  const now = new Date();
  const tsz = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trip//Trip Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${tripName}`,
    'X-WR-TIMEZONE:Europe/Paris',
  ].join('\r\n');

  if (tripItems.some((i) => !i.td_date))
    utilsService.toast('warn', 'Caution', 'You have date-less days, they will not be included in your export');

  tripItems.forEach((item, index) => {
    if (!item.td_date) return;

    const eventDate = item.td_date;
    const eventTime = item.time ?? '00:00';
    const [year, month, day] = eventDate.split('-');
    const [hours, minutes] = eventTime.split(':');
    const dtStart = `${year}${month}${day}T${hours.padStart(2, '0')}${minutes.padStart(2, '0')}00`;

    const startDateTime = new Date(`${eventDate}T${eventTime}`);
    const nextItemSameDay = tripItems.slice(index + 1).find((i) => i.td_date === item.td_date && i.time);

    const endDateTime = nextItemSameDay?.time
      ? new Date(`${nextItemSameDay.td_date}T${nextItemSameDay.time}`)
      : new Date(startDateTime.getTime() + 60 * 60 * 1000);
    const dtEnd = endDateTime.toISOString().replace(/[-:]/g, '').split('.')[0];

    const eventDescription: string[] = [];
    if (item.comment) eventDescription.push(`Comment: ${item.comment}`);
    if (item.place?.name) eventDescription.push(`Place: ${item.place.name}`);

    const lat = item.lat ?? item.place?.lat;
    const lng = item.lng ?? item.place?.lng;
    if (lat && lng) {
      eventDescription.push(`Coordinates: ${lat}, ${lng}`);
      eventDescription.push(`GMaps: https://www.google.com/maps?q=${lat},${lng}`);
    }

    if (item.price) eventDescription.push(`Price: ${item.price}€`);

    const description = eventDescription.join('\\n').replace(/\n/g, '\\n');
    const location = item.place?.name ?? (lat && lng ? `${lat}, ${lng}` : '');
    const geo = lat && lng ? `GEO:${lat};${lng}` : '';
    const uid = `Trip-${tripName.replace(/[^a-zA-Z0-9-_]/g, '_')}-item-${item.id}-${tsz}`;

    icsContent +=
      '\r\n' +
      [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${tsz}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${escapeICSText(item.text)}`,
        description ? `DESCRIPTION:${escapeICSText(description)}` : '',
        location ? `LOCATION:${escapeICSText(location)}` : '',
        geo,
        item.status ? `STATUS:${item.status.label.toUpperCase()}` : '',
        'END:VEVENT',
      ]
        .filter((line) => line)
        .join('\r\n');
  });

  icsContent += '\r\n' + 'END:VCALENDAR';
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${tripName.replace(/\s+/g, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function escapeICSText(text: string): string {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n').replace(/\r/g, '');
}
