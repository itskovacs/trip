import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'naturalDuration',
  standalone: true,
})
export class NaturalDurationPipe implements PipeTransform {
  transform(minutes: number | null | undefined): string {
    if (!minutes || minutes === 0) {
      return '-';
    }

    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = Math.floor(minutes % 60);

    const parts: string[] = [];

    if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'min' : 'mins'}`);
    return parts.join(', ');
  }
}
