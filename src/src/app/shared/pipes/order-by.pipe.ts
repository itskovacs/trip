import { Pipe, PipeTransform } from '@angular/core';
@Pipe({
  name: 'orderBy',
  pure: true,
  standalone: true,
})
export class orderByPipe implements PipeTransform {
  transform(items: any[], field: string): any[] {
    if (!items || items.length === 0) {
      return items;
    }
    return items.slice().sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0));
  }
}
