import { inject, Injectable, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { PackingItem, TripStatus } from '../types/trip';
import { ApiService } from './api.service';
import { map } from 'rxjs';

type ToastSeverity = 'info' | 'warn' | 'error' | 'success';
const JWT_USER = 'TRIP_USER';
const DARK_MODE = 'TRIP_DARK_MODE';

@Injectable({
  providedIn: 'root',
})
export class UtilsService {
  private apiService = inject(ApiService);
  currency$ = this.apiService.settings$.pipe(map((s) => s?.currency ?? '€'));
  packingListToCopy: Partial<PackingItem>[] = [];
  readonly loadingMessage = signal<string>('');
  readonly statuses: TripStatus[] = [
    { label: 'pending', color: '#3258A8' },
    { label: 'booked', color: '#00A341' },
    { label: 'constraint', color: '#FFB900' },
    { label: 'optional', color: '#625A84' },
  ];

  constructor(private ngMessageService: MessageService) {}

  get loggedUser(): string {
    return localStorage.getItem(JWT_USER) ?? '';
  }

  toGithubTRIP() {
    window.open('https://github.com/itskovacs/trip', '_blank');
  }

  initDarkMode(): void {
    const isDarkMode = localStorage.getItem(DARK_MODE) === 'true';
    if (isDarkMode) this.toggleDarkMode(true);
  }

  toggleDarkMode(enabled: boolean) {
    localStorage.setItem(DARK_MODE, String(enabled));
    const element = document.querySelector('html');
    element?.classList.toggle('dark', enabled);
  }

  toast(severity: ToastSeverity = 'info', summary = 'Info', detail = '', life = 3000): void {
    this.ngMessageService.add({
      severity,
      summary,
      detail,
      life,
    });
  }

  setLoading(message: string) {
    this.loadingMessage.set(message);
  }

  parseGoogleMapsPlaceUrl(url: string): [place: string, latlng: string] {
    // Look /place/<place>/ and !3d<lat> and !4d<lng>
    const placeMatch = url.match(/\/place\/([^\/]+)/);
    const latMatch = url.match(/!3d([\d\-.]+)/);
    const lngMatch = url.match(/!4d([\d\-.]+)/);

    if (!placeMatch || !latMatch || !lngMatch) {
      this.toast('error', 'Error', 'Unrecognized Google Maps URL format');
      console.error('Unrecognized Google Maps URL format');
      return ['', ''];
    }

    const place = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ').trim());
    const latlng = `${latMatch[1]},${lngMatch[1]}`;
    return [place, latlng];
  }

  parseGoogleMapsShortUrl(url: string) {
    // Look maps.app.goo.gl/<id>/
    const shortLinkMatch = url.match(/^https:\/\/maps.app.goo.gl\/([^?]+)/);
    if (!shortLinkMatch) return null;
    return shortLinkMatch[1];
  }
}
