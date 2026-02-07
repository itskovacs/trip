import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Category, ProviderBoundaries, Place } from '../types/poi';
import { OSMRoutingQuery, OSMRoutingResponse, ProviderPlaceResult } from '../types/provider';
import { BehaviorSubject, map, Observable, shareReplay, take, tap } from 'rxjs';
import { Info } from '../types/info';
import { Backup, ImportResponse, Settings } from '../types/settings';
import {
  ChecklistItem,
  PackingItem,
  SharedTripURL,
  Trip,
  TripAttachment,
  TripBase,
  TripDay,
  TripInvitation,
  TripItem,
  TripMember,
} from '../types/trip';

const NO_AUTH_HEADER = {
  no_auth: '1',
};

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  public readonly apiBaseUrl: string = '/api';

  private categoriesSubject = new BehaviorSubject<Category[] | null>(null);
  public categories$: Observable<Category[] | null> = this.categoriesSubject.asObservable();

  private settingsSubject = new BehaviorSubject<Settings | null>(null);
  public settings$: Observable<Settings | null> = this.settingsSubject.asObservable();
  private httpClient = inject(HttpClient);

  getInfo(): Observable<Info> {
    return this.httpClient.get<Info>(this.apiBaseUrl + '/info');
  }

  _categoriesSubjectNext(categories: Category[]) {
    this.categoriesSubject.next([...categories].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
  }

  getCategories(): Observable<Category[]> {
    if (!this.categoriesSubject.value) {
      return this.httpClient.get<Category[]>(`${this.apiBaseUrl}/categories`).pipe(
        map((categories) => categories.sort((a, b) => a.name.localeCompare(b.name))),
        tap((categories) => this._categoriesSubjectNext(categories)),
      );
    }
    return this.categories$ as Observable<Category[]>;
  }

  postCategory(c: Category): Observable<Category> {
    return this.httpClient
      .post<Category>(this.apiBaseUrl + '/categories', c)
      .pipe(tap((category) => this._categoriesSubjectNext([...(this.categoriesSubject.value || []), category])));
  }

  putCategory(c_id: number, c: Partial<Category>): Observable<Category> {
    return this.httpClient.put<Category>(this.apiBaseUrl + `/categories/${c_id}`, c).pipe(
      tap((category) => {
        const categories = this.categoriesSubject.value || [];
        const idx = categories?.findIndex((c) => c.id == c_id) || -1;
        if (idx > -1) {
          const updated = [...categories];
          updated[idx] = category;
          this._categoriesSubjectNext(updated);
        }
      }),
    );
  }

  deleteCategory(category_id: number): Observable<{}> {
    return this.httpClient.delete<{}>(this.apiBaseUrl + `/categories/${category_id}`).pipe(
      tap(() => {
        const categories = this.categoriesSubject.value || [];
        const idx = categories?.findIndex((c) => c.id == category_id) || -1;
        if (idx > -1) {
          const updated = categories.filter((_, i) => i != idx);
          this._categoriesSubjectNext(updated);
        }
      }),
    );
  }

  getPlaces(): Observable<Place[]> {
    return this.httpClient.get<Place[]>(`${this.apiBaseUrl}/places`);
  }

  postPlace(place: Place): Observable<Place> {
    return this.httpClient.post<Place>(`${this.apiBaseUrl}/places`, place);
  }

  putPlace(placeId: number, place: Partial<Place>): Observable<Place> {
    return this.httpClient.put<Place>(`${this.apiBaseUrl}/places/${placeId}`, place);
  }

  deletePlace(placeId: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/places/${placeId}`);
  }

  getPlaceGPX(placeId: number): Observable<Place> {
    return this.httpClient.get<Place>(`${this.apiBaseUrl}/places/${placeId}`);
  }

  getTrips(): Observable<TripBase[]> {
    return this.httpClient.get<TripBase[]>(`${this.apiBaseUrl}/trips`);
  }

  getTrip(id: number): Observable<Trip> {
    return this.httpClient.get<Trip>(`${this.apiBaseUrl}/trips/${id}`);
  }

  getTripBalance(id: number): Observable<{ [user: string]: number }> {
    return this.httpClient.get<{ [user: string]: number }>(`${this.apiBaseUrl}/trips/${id}/balance`);
  }

  postTrip(trip: TripBase): Observable<TripBase> {
    return this.httpClient.post<TripBase>(`${this.apiBaseUrl}/trips`, trip);
  }

  deleteTrip(tripId: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${tripId}`);
  }

  putTrip(trip: Partial<Trip>, tripId: number): Observable<Trip> {
    return this.httpClient.put<Trip>(`${this.apiBaseUrl}/trips/${tripId}`, trip);
  }

  postTripDay(tripDay: TripDay, tripId: number): Observable<TripDay> {
    return this.httpClient.post<TripDay>(`${this.apiBaseUrl}/trips/${tripId}/days`, tripDay);
  }

  putTripDay(tripDay: Partial<TripDay>, tripId: number): Observable<TripDay> {
    return this.httpClient.put<TripDay>(`${this.apiBaseUrl}/trips/${tripId}/days/${tripDay.id}`, tripDay);
  }

  deleteTripDay(tripId: number, day_id: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${tripId}/days/${day_id}`);
  }

  postTripDayItem(item: TripItem, tripId: number, day_id: number): Observable<TripItem> {
    return this.httpClient.post<TripItem>(`${this.apiBaseUrl}/trips/${tripId}/days/${day_id}/items`, item);
  }

  putTripDayItem(item: Partial<TripItem>, tripId: number, day_id: number, item_id: number): Observable<TripItem> {
    return this.httpClient.put<TripItem>(`${this.apiBaseUrl}/trips/${tripId}/days/${day_id}/items/${item_id}`, item);
  }

  deleteTripDayItem(tripId: number, day_id: number, item_id: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${tripId}/days/${day_id}/items/${item_id}`);
  }

  getSharedTrip(token: string): Observable<Trip> {
    return this.httpClient.get<Trip>(`${this.apiBaseUrl}/trips/shared/${token}`, { headers: NO_AUTH_HEADER });
  }

  getSharedTripURL(tripId: number): Observable<string> {
    return this.httpClient.get<SharedTripURL>(`${this.apiBaseUrl}/trips/${tripId}/share`).pipe(
      map((t) => window.location.origin + t.url),
      shareReplay(),
    );
  }

  createSharedTrip(tripId: number): Observable<string> {
    return this.httpClient
      .post<SharedTripURL>(`${this.apiBaseUrl}/trips/${tripId}/share`, {})
      .pipe(map((t) => window.location.origin + t.url));
  }

  deleteSharedTrip(tripId: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${tripId}/share`);
  }

  getPackingList(tripId: number): Observable<PackingItem[]> {
    return this.httpClient.get<PackingItem[]>(`${this.apiBaseUrl}/trips/${tripId}/packing`);
  }

  getSharedTripPackingList(token: string): Observable<PackingItem[]> {
    return this.httpClient.get<PackingItem[]>(`${this.apiBaseUrl}/trips/shared/${token}/packing`);
  }

  postPackingItem(tripId: number, p_item: PackingItem): Observable<PackingItem> {
    return this.httpClient.post<PackingItem>(`${this.apiBaseUrl}/trips/${tripId}/packing`, p_item);
  }

  putPackingItem(tripId: number, p_id: number, p_item: Partial<PackingItem>): Observable<PackingItem> {
    return this.httpClient.put<PackingItem>(`${this.apiBaseUrl}/trips/${tripId}/packing/${p_id}`, p_item);
  }

  deletePackingItem(tripId: number, p_id: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${tripId}/packing/${p_id}`);
  }

  getChecklist(tripId: number): Observable<ChecklistItem[]> {
    return this.httpClient.get<ChecklistItem[]>(`${this.apiBaseUrl}/trips/${tripId}/checklist`);
  }

  getSharedTripChecklist(token: string): Observable<ChecklistItem[]> {
    return this.httpClient.get<ChecklistItem[]>(`${this.apiBaseUrl}/trips/shared/${token}/checklist`);
  }

  postChecklistItem(tripId: number, item: ChecklistItem): Observable<ChecklistItem> {
    return this.httpClient.post<ChecklistItem>(`${this.apiBaseUrl}/trips/${tripId}/checklist`, item);
  }

  putChecklistItem(tripId: number, id: number, item: Partial<ChecklistItem>): Observable<ChecklistItem> {
    return this.httpClient.put<ChecklistItem>(`${this.apiBaseUrl}/trips/${tripId}/checklist/${id}`, item);
  }

  deleteChecklistItem(tripId: number, id: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${tripId}/checklist/${id}`);
  }

  getHasTripsInvitations(): Observable<boolean> {
    return this.httpClient.get<boolean>(`${this.apiBaseUrl}/trips/invitations/pending`);
  }

  getTripsInvitations(): Observable<TripInvitation[]> {
    return this.httpClient.get<TripInvitation[]>(`${this.apiBaseUrl}/trips/invitations`);
  }

  getTripMembers(tripId: number): Observable<TripMember[]> {
    return this.httpClient.get<TripMember[]>(`${this.apiBaseUrl}/trips/${tripId}/members`);
  }

  deleteTripMember(tripId: number, username: string): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${tripId}/members/${username}`);
  }

  inviteTripMember(tripId: number, user: string): Observable<TripMember> {
    return this.httpClient.post<TripMember>(`${this.apiBaseUrl}/trips/${tripId}/members`, { user });
  }

  acceptTripMemberInvite(tripId: number): Observable<null> {
    return this.httpClient.post<null>(`${this.apiBaseUrl}/trips/${tripId}/members/accept`, {});
  }

  declineTripMemberInvite(tripId: number): Observable<null> {
    return this.httpClient.post<null>(`${this.apiBaseUrl}/trips/${tripId}/members/decline`, {});
  }

  checkVersion(): Observable<string> {
    return this.httpClient.get<string>(`${this.apiBaseUrl}/settings/checkversion`);
  }

  getSettings(): Observable<Settings> {
    if (!this.settingsSubject.value) {
      return this.httpClient
        .get<Settings>(`${this.apiBaseUrl}/settings`)
        .pipe(tap((settings) => this.settingsSubject.next(settings)));
    }

    return (this.settings$ as Observable<Settings>).pipe(take(1));
  }

  putSettings(settings: Partial<Settings>): Observable<Settings> {
    return this.httpClient
      .put<Settings>(`${this.apiBaseUrl}/settings`, settings)
      .pipe(tap((settings) => this.settingsSubject.next(settings)));
  }

  settingsUserImport(formdata: FormData): Observable<ImportResponse> {
    return this.httpClient.post<ImportResponse>(`${this.apiBaseUrl}/settings/backups/import`, formdata).pipe(
      tap((resp) => {
        if (resp.categories) {
          this._categoriesSubjectNext(resp.categories);
        }
        if (resp.settings) {
          this.settingsSubject.next(resp.settings);
        }
      }),
    );
  }

  postTripAttachment(tripId: number, formdata: FormData): Observable<TripAttachment> {
    return this.httpClient.post<TripAttachment>(`${this.apiBaseUrl}/trips/${tripId}/attachments`, formdata);
  }

  deleteTripAttachment(tripId: number, attachmentId: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${tripId}/attachments/${attachmentId}`);
  }

  downloadTripAttachment(tripId: number, attachmentId: number): Observable<Blob> {
    return this.httpClient.get(`${this.apiBaseUrl}/trips/${tripId}/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    });
  }

  downloadSharedTripAttachment(token: string, attachmentId: number): Observable<Blob> {
    return this.httpClient.get(`${this.apiBaseUrl}/trips/shared/${token}/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    });
  }

  getBackups(): Observable<Backup[]> {
    return this.httpClient.get<Backup[]>(`${this.apiBaseUrl}/settings/backups`);
  }

  createBackup(): Observable<Backup> {
    return this.httpClient.post<Backup>(`${this.apiBaseUrl}/settings/backups`, {});
  }

  deleteBackup(backupId: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/settings/backups/${backupId}`);
  }

  downloadBackup(backupId: number): Observable<Blob> {
    return this.httpClient.get(`${this.apiBaseUrl}/settings/backups/${backupId}/download`, {
      responseType: 'blob',
    });
  }

  enableTOTP(): Observable<{ secret: string }> {
    return this.httpClient.post<{ secret: string }>(this.apiBaseUrl + '/settings/totp', {});
  }

  disableTOTP(code: string): Observable<{}> {
    return this.httpClient.delete<{}>(this.apiBaseUrl + `/settings/totp/${code}`);
  }

  verifyTOTP(code: string): Observable<any> {
    return this.httpClient.post<any>(this.apiBaseUrl + '/settings/totp/verify', { code });
  }

  enableTripApiToken(): Observable<string> {
    return this.httpClient.put<string>(this.apiBaseUrl + '/settings/api_token', {});
  }

  disableTripApiToken(): Observable<{}> {
    return this.httpClient.delete<{}>(this.apiBaseUrl + '/settings/api_token');
  }

  // Completions using provider
  completionSearchText(q: string): Observable<ProviderPlaceResult[]> {
    return this.httpClient.get<ProviderPlaceResult[]>(`${this.apiBaseUrl}/completions/search`, { params: { q } });
  }

  completionNearbySearch(data: any): Observable<ProviderPlaceResult[]> {
    return this.httpClient.post<ProviderPlaceResult[]>(`${this.apiBaseUrl}/completions/nearby`, { ...data });
  }

  completionGeocodeBoundaries(q: string): Observable<ProviderBoundaries> {
    return this.httpClient.get<ProviderBoundaries>(`${this.apiBaseUrl}/completions/geocode`, { params: { q } });
  }

  completionRouting(data: OSMRoutingQuery): Observable<OSMRoutingResponse> {
    return this.httpClient.post<OSMRoutingResponse>(`${this.apiBaseUrl}/completions/route`, data);
  }

  completionBulk(data: string[]): Observable<ProviderPlaceResult[]> {
    return this.httpClient.post<ProviderPlaceResult[]>(`${this.apiBaseUrl}/completions/bulk`, data);
  }

  completionGoogleTakeoutFile(formdata: FormData): Observable<ProviderPlaceResult[]> {
    return this.httpClient.post<ProviderPlaceResult[]>(`${this.apiBaseUrl}/completions/takeout-import`, formdata);
  }

  completionGoogleKmzFile(formdata: FormData): Observable<ProviderPlaceResult[]> {
    return this.httpClient.post<ProviderPlaceResult[]>(`${this.apiBaseUrl}/completions/mymaps-import`, formdata);
  }

  completionGoogleShortlink(id: string): Observable<ProviderPlaceResult> {
    return this.httpClient.get<ProviderPlaceResult>(`${this.apiBaseUrl}/completions/google/resolve-shortlink/${id}`);
  }
}
