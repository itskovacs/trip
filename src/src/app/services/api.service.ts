import { inject, Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Category, Place } from "../types/poi";
import { BehaviorSubject, map, Observable, shareReplay, tap } from "rxjs";
import { Info } from "../types/info";
import { ImportResponse, Settings } from "../types/settings";
import {
  PackingItem,
  SharedTripURL,
  Trip,
  TripBase,
  TripDay,
  TripItem,
} from "../types/trip";

const NO_AUTH_HEADER = {
  no_auth: "1",
};

@Injectable({
  providedIn: "root",
})
export class ApiService {
  public readonly apiBaseUrl: string = "/api";

  private categoriesSubject = new BehaviorSubject<Category[] | null>(null);
  public categories$: Observable<Category[] | null> =
    this.categoriesSubject.asObservable();

  private settingsSubject = new BehaviorSubject<Settings | null>(null);
  public settings$: Observable<Settings | null> =
    this.settingsSubject.asObservable();
  private httpClient = inject(HttpClient);

  getInfo(): Observable<Info> {
    return this.httpClient.get<Info>(this.apiBaseUrl + "/info");
  }

  _categoriesSubjectNext(categories: Category[]) {
    this.categoriesSubject.next(
      [...categories].sort((categoryA: Category, categoryB: Category) =>
        categoryA.name.localeCompare(categoryB.name),
      ),
    );
  }

  getCategories(): Observable<Category[]> {
    if (!this.categoriesSubject.value) {
      return this.httpClient
        .get<Category[]>(`${this.apiBaseUrl}/categories`)
        .pipe(tap((categories) => this._categoriesSubjectNext(categories)));
    }
    return this.categories$ as Observable<Category[]>;
  }

  postCategory(c: Category): Observable<Category> {
    return this.httpClient
      .post<Category>(this.apiBaseUrl + "/categories", c)
      .pipe(
        tap((category) =>
          this._categoriesSubjectNext([
            ...(this.categoriesSubject.value || []),
            category,
          ]),
        ),
      );
  }

  putCategory(c_id: number, c: Partial<Category>): Observable<Category> {
    return this.httpClient
      .put<Category>(this.apiBaseUrl + `/categories/${c_id}`, c)
      .pipe(
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
    return this.httpClient
      .delete<{}>(this.apiBaseUrl + `/categories/${category_id}`)
      .pipe(
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

  postPlaces(places: Partial<Place[]>): Observable<Place[]> {
    return this.httpClient.post<Place[]>(
      `${this.apiBaseUrl}/places/batch`,
      places,
    );
  }

  putPlace(place_id: number, place: Partial<Place>): Observable<Place> {
    return this.httpClient.put<Place>(
      `${this.apiBaseUrl}/places/${place_id}`,
      place,
    );
  }

  deletePlace(place_id: number): Observable<null> {
    return this.httpClient.delete<null>(
      `${this.apiBaseUrl}/places/${place_id}`,
    );
  }

  getPlaceGPX(place_id: number): Observable<Place> {
    return this.httpClient.get<Place>(`${this.apiBaseUrl}/places/${place_id}`);
  }

  getTrips(): Observable<TripBase[]> {
    return this.httpClient.get<TripBase[]>(`${this.apiBaseUrl}/trips`);
  }

  getTrip(id: number): Observable<Trip> {
    return this.httpClient.get<Trip>(`${this.apiBaseUrl}/trips/${id}`);
  }

  postTrip(trip: TripBase): Observable<TripBase> {
    return this.httpClient.post<TripBase>(`${this.apiBaseUrl}/trips`, trip);
  }

  deleteTrip(trip_id: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${trip_id}`);
  }

  putTrip(trip: Partial<Trip>, trip_id: number): Observable<Trip> {
    return this.httpClient.put<Trip>(
      `${this.apiBaseUrl}/trips/${trip_id}`,
      trip,
    );
  }

  postTripDay(tripDay: TripDay, trip_id: number): Observable<TripDay> {
    return this.httpClient.post<TripDay>(
      `${this.apiBaseUrl}/trips/${trip_id}/days`,
      tripDay,
    );
  }

  putTripDay(tripDay: Partial<TripDay>, trip_id: number): Observable<TripDay> {
    return this.httpClient.put<TripDay>(
      `${this.apiBaseUrl}/trips/${trip_id}/days/${tripDay.id}`,
      tripDay,
    );
  }

  deleteTripDay(trip_id: number, day_id: number): Observable<null> {
    return this.httpClient.delete<null>(
      `${this.apiBaseUrl}/trips/${trip_id}/days/${day_id}`,
    );
  }

  postTripDayItem(
    item: TripItem,
    trip_id: number,
    day_id: number,
  ): Observable<TripItem> {
    return this.httpClient.post<TripItem>(
      `${this.apiBaseUrl}/trips/${trip_id}/days/${day_id}/items`,
      item,
    );
  }

  putTripDayItem(
    item: Partial<TripItem>,
    trip_id: number,
    day_id: number,
    item_id: number,
  ): Observable<TripItem> {
    return this.httpClient.put<TripItem>(
      `${this.apiBaseUrl}/trips/${trip_id}/days/${day_id}/items/${item_id}`,
      item,
    );
  }

  deleteTripDayItem(
    trip_id: number,
    day_id: number,
    item_id: number,
  ): Observable<null> {
    return this.httpClient.delete<null>(
      `${this.apiBaseUrl}/trips/${trip_id}/days/${day_id}/items/${item_id}`,
    );
  }

  getSharedTrip(token: string): Observable<Trip> {
    return this.httpClient.get<Trip>(
      `${this.apiBaseUrl}/trips/shared/${token}`,
      { headers: NO_AUTH_HEADER },
    );
  }

  getSharedTripURL(trip_id: number): Observable<string> {
    return this.httpClient
      .get<SharedTripURL>(`${this.apiBaseUrl}/trips/${trip_id}/share`)
      .pipe(
        map((t) => window.location.origin + t.url),
        shareReplay(),
      );
  }

  createSharedTrip(trip_id: number): Observable<string> {
    return this.httpClient
      .post<SharedTripURL>(`${this.apiBaseUrl}/trips/${trip_id}/share`, {})
      .pipe(map((t) => t.url));
  }

  deleteSharedTrip(trip_id: number): Observable<null> {
    return this.httpClient.delete<null>(
      `${this.apiBaseUrl}/trips/${trip_id}/share`,
    );
  }

  getPackingList(trip_id: number): Observable<PackingItem[]> {
    return this.httpClient.get<PackingItem[]>(
      `${this.apiBaseUrl}/trips/${trip_id}/packing`,
    );
  }

  getSharedTripPackingList(token: string): Observable<PackingItem[]> {
    return this.httpClient.get<PackingItem[]>(
      `${this.apiBaseUrl}/trips/shared/${token}/packing`,
    );
  }

  postPackingItem(
    trip_id: number,
    p_item: PackingItem,
  ): Observable<PackingItem> {
    return this.httpClient.post<PackingItem>(
      `${this.apiBaseUrl}/trips/${trip_id}/packing`,
      p_item,
    );
  }

  putPackingItem(
    trip_id: number,
    p_id: number,
    p_item: Partial<PackingItem>,
  ): Observable<PackingItem> {
    return this.httpClient.put<PackingItem>(
      `${this.apiBaseUrl}/trips/${trip_id}/packing/${p_id}`,
      p_item,
    );
  }

  deletePackingItem(trip_id: number, p_id: number): Observable<null> {
    return this.httpClient.delete<null>(
      `${this.apiBaseUrl}/trips/${trip_id}/packing/${p_id}`,
    );
  }

  checkVersion(): Observable<string> {
    return this.httpClient.get<string>(
      `${this.apiBaseUrl}/settings/checkversion`,
    );
  }

  getSettings(): Observable<Settings> {
    if (!this.settingsSubject.value) {
      return this.httpClient
        .get<Settings>(`${this.apiBaseUrl}/settings`)
        .pipe(tap((settings) => this.settingsSubject.next(settings)));
    }

    return this.settings$ as Observable<Settings>;
  }

  putSettings(settings: Partial<Settings>): Observable<Settings> {
    return this.httpClient
      .put<Settings>(`${this.apiBaseUrl}/settings`, settings)
      .pipe(tap((settings) => this.settingsSubject.next(settings)));
  }

  settingsUserExport(): Observable<any> {
    return this.httpClient.get<any>(`${this.apiBaseUrl}/settings/export`);
  }

  settingsUserImport(formdata: FormData): Observable<ImportResponse> {
    const headers = { enctype: "multipart/form-data" };
    return this.httpClient
      .post<ImportResponse>(`${this.apiBaseUrl}/settings/import`, formdata, {
        headers: headers,
      })
      .pipe(
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
}
