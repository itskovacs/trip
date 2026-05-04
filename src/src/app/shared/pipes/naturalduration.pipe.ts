import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

@Pipe({
  name: 'naturalDuration',
  standalone: true,
  pure: false,
})
export class NaturalDurationPipe implements PipeTransform {
  private translocoService = inject(TranslocoService);

  transform(minutes: number | null | undefined): string {
    if (!minutes || minutes === 0) {
      return '-';
    }

    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = Math.floor(minutes % 60);

    const parts: string[] = [];

    if (days > 0) {
      const key = days === 1 ? 'duration.day' : 'duration.days';
      parts.push(this.translocoService.translate(key, { count: days }));
    }

    if (hours > 0) {
      const key = hours === 1 ? 'duration.hour' : 'duration.hours';
      parts.push(this.translocoService.translate(key, { count: hours }));
    }

    if (mins > 0) {
      const key = mins === 1 ? 'duration.min' : 'duration.mins';
      parts.push(this.translocoService.translate(key, { count: mins }));
    }

    return parts.join(', ');
  }
}
