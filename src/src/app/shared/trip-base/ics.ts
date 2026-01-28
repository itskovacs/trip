import { Trip, TripStatus } from '../../types/trip';
import { UtilsService } from '../../services/utils.service';

export function generateTripICSFile(trip: Trip, utilsService: UtilsService): void {
  const tripName = trip.name || 'Trip Calendar';
  const now = new Date();
  const tsz = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trip//Trip Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICSText(tripName)}`,
  ].join('\r\n');

  if (trip.days.some((d) => !d.dt)) {
    utilsService.toast('warn', 'Caution', 'Some days have no date and will be skipped.');
  }

  const allEvents = trip.days
    .filter((day) => !!day.dt)
    .flatMap((day) => {
      const sortedItems = [...day.items].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      return sortedItems.map((item, index) => ({
        item,
        date: day.dt!,
        nextItem: sortedItems[index + 1],
      }));
    });

  allEvents.forEach(({ item, date, nextItem }) => {
    const time = item.time || '00:00';
    const dtStart = formatICSDate(date, time);
    let dtEnd: string;
    if (nextItem && nextItem.time) {
      dtEnd = formatICSDate(date, nextItem.time);
    } else {
      const startObj = new Date(`${date}T${time}`);
      const endObj = new Date(startObj.getTime() + 60 * 60 * 1000);
      dtEnd = endObj.toISOString().replace(/[-:]/g, '').split('.')[0];
    }

    const eventDescription: string[] = [];
    if (item.comment) eventDescription.push(`${item.comment}`);

    const lat = item.lat || item.place?.lat;
    const lng = item.lng || item.place?.lng;

    if (item.place?.name) eventDescription.push(`${item.place.name}`);
    if (lat && lng) {
      eventDescription.push(`https://www.google.com/maps?q=${lat},${lng}`);
    }
    if (item.price) eventDescription.push(`${item.price} ${trip.currency}`);

    const description = eventDescription.join('\\n');
    const location = item.place?.name || (lat && lng ? `${lat}, ${lng}` : '');

    let statusLabel = '';
    if (item.status) {
      statusLabel =
        typeof item.status === 'string' ? item.status.toUpperCase() : (item.status as TripStatus).label.toUpperCase();
    }

    const uid = `TRIP-${trip.id}-${item.id}-${tsz}@trip-planner`;

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
        lat && lng ? `GEO:${lat};${lng}` : '',
        statusLabel ? `STATUS:${statusLabel}` : '',
        'END:VEVENT',
      ]
        .filter(Boolean)
        .join('\r\n');
  });

  icsContent += '\r\nEND:VCALENDAR';

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${tripName.replace(/[^a-z0-9]/gi, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function formatICSDate(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const [hh, mm] = timeStr.split(':');
  const local = new Date(+y, +m - 1, +d, +hh, +mm, 0);
  return local.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICSText(text: string): string {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n').replace(/\r/g, '');
}
