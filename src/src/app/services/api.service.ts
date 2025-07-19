import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Category, Place } from "../types/poi";
import {
  BehaviorSubject,
  distinctUntilChanged,
  map,
  Observable,
  shareReplay,
  tap,
} from "rxjs";
import { Info } from "../types/info";
import { Settings } from "../types/settings";
import { Trip, TripBase, TripDay, TripItem } from "../types/trip";

@Injectable({
  providedIn: "root",
})
export class ApiService {
  public apiBaseUrl: string = "/api";
  public assetsBaseUrl: string = "/api/assets";

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

  _normalizeTripImage(trip: Trip | TripBase): Trip | TripBase {
    if (trip.image) trip.image = `${this.assetsBaseUrl}/${trip.image}`;
    else trip.image = "cover.webp";
    return trip;
  }

  _normalizePlaceImage(place: Place): Place {
    if (place.image) {
      place.image = `${this.assetsBaseUrl}/${place.image}`;
      place.imageDefault = false;
    } else {
      place.image = `${this.assetsBaseUrl}/${(place.category as Category).image}`;
      place.imageDefault = true;
    }
    return place;
  }

  _categoriesSubjectNext(categories: Category[]) {
    this.categoriesSubject.next(
      categories.sort((categoryA: Category, categoryB: Category) =>
        categoryA.name.localeCompare(categoryB.name),
      ),
    );
  }

  getCategories(): Observable<Category[]> {
    if (!this.categoriesSubject.value) {
      return this.httpClient
        .get<Category[]>(`${this.apiBaseUrl}/categories`)
        .pipe(
          map((resp) => {
            return resp.map((c) => {
              return { ...c, image: `${this.assetsBaseUrl}/${c.image}` };
            });
          }),
          tap((categories) => this._categoriesSubjectNext(categories)),
          distinctUntilChanged(),
          shareReplay(),
        );
    }
    return this.categories$ as Observable<Category[]>;
  }

  postCategory(c: Category): Observable<Category> {
    return this.httpClient
      .post<Category>(this.apiBaseUrl + "/categories", c)
      .pipe(
        map((category) => {
          return {
            ...category,
            image: `${this.assetsBaseUrl}/${category.image}`,
          };
        }),
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
        map((category) => {
          return {
            ...category,
            image: `${this.assetsBaseUrl}/${category.image}`,
          };
        }),
        tap((category) => {
          let categories = this.categoriesSubject.value || [];
          let categoryIndex = categories?.findIndex((c) => c.id == c_id) || -1;
          if (categoryIndex > -1) {
            categories[categoryIndex] = category;
            this._categoriesSubjectNext(categories);
          }
        }),
      );
  }

  deleteCategory(category_id: number): Observable<{}> {
    return this.httpClient
      .delete<{}>(this.apiBaseUrl + `/categories/${category_id}`)
      .pipe(
        tap((_) => {
          let categories = this.categoriesSubject.value || [];
          let categoryIndex =
            categories?.findIndex((c) => c.id == category_id) || -1;
          if (categoryIndex > -1) {
            categories.splice(categoryIndex, 1);
            this._categoriesSubjectNext(categories);
          }
        }),
      );
  }

  getPlaces(): Observable<Place[]> {
    return this.httpClient.get<Place[]>(`${this.apiBaseUrl}/places`).pipe(
      map((resp) => resp.map((p) => this._normalizePlaceImage(p))),
      distinctUntilChanged(),
      shareReplay(),
    );
  }

  postPlace(place: Place): Observable<Place> {
    return this.httpClient
      .post<Place>(`${this.apiBaseUrl}/places`, place)
      .pipe(map((p) => this._normalizePlaceImage(p)));
  }

  postPlaces(places: Partial<Place[]>): Observable<Place[]> {
    return this.httpClient
      .post<Place[]>(`${this.apiBaseUrl}/places/batch`, places)
      .pipe(map((resp) => resp.map((p) => this._normalizePlaceImage(p))));
  }

  putPlace(place_id: number, place: Partial<Place>): Observable<Place> {
    return this.httpClient
      .put<Place>(`${this.apiBaseUrl}/places/${place_id}`, place)
      .pipe(map((p) => this._normalizePlaceImage(p)));
  }

  deletePlace(place_id: number): Observable<null> {
    return this.httpClient.delete<null>(
      `${this.apiBaseUrl}/places/${place_id}`,
    );
  }

  getPlaceGPX(place_id: number): Observable<Place> {
    return this.httpClient
      .get<Place>(`${this.apiBaseUrl}/places/${place_id}`)
      .pipe(map((p) => this._normalizePlaceImage(p)));
  }

  getTrips(): Observable<TripBase[]> {
    return this.httpClient.get<TripBase[]>(`${this.apiBaseUrl}/trips`).pipe(
      map((resp) => {
        return resp.map((trip: TripBase) => {
          trip = this._normalizeTripImage(trip) as TripBase;
          return trip;
        });
      }),
      distinctUntilChanged(),
      shareReplay(),
    );
  }

  getTrip(id: number): Observable<Trip> {
    return this.httpClient.get<Trip>(`${this.apiBaseUrl}/trips/${id}`).pipe(
      map((trip) => {
        trip = this._normalizeTripImage(trip) as Trip;
        trip.places = trip.places.map((p) => this._normalizePlaceImage(p));
        trip.days.map((day) => {
          day.items.forEach((item) => {
            if (item.place) this._normalizePlaceImage(item.place);
          });
        });
        return trip;
      }),
      distinctUntilChanged(),
      shareReplay(),
    );
  }

  postTrip(trip: TripBase): Observable<TripBase> {
    return this.httpClient
      .post<TripBase>(`${this.apiBaseUrl}/trips`, trip)
      .pipe(
        map((trip) => {
          trip = this._normalizeTripImage(trip) as TripBase;
          return trip;
        }),
      );
  }

  deleteTrip(trip_id: number): Observable<null> {
    return this.httpClient.delete<null>(`${this.apiBaseUrl}/trips/${trip_id}`);
  }

  putTrip(trip: Partial<Trip>, trip_id: number): Observable<Trip> {
    return this.httpClient
      .put<Trip>(`${this.apiBaseUrl}/trips/${trip_id}`, trip)
      .pipe(
        map((trip) => {
          trip = this._normalizeTripImage(trip) as Trip;
          trip.places = trip.places.map((p) => this._normalizePlaceImage(p));
          trip.days.map((day) => {
            day.items.forEach((item) => {
              if (item.place) this._normalizePlaceImage(item.place);
            });
          });
          return trip;
        }),
      );
  }

  postTripDay(tripDay: TripDay, trip_id: number): Observable<TripDay> {
    return this.httpClient.post<TripDay>(
      `${this.apiBaseUrl}/trips/${trip_id}/days`,
      tripDay,
    );
  }

  putTripDay(tripDay: Partial<TripDay>, trip_id: number): Observable<TripDay> {
    return this.httpClient
      .put<TripDay>(
        `${this.apiBaseUrl}/trips/${trip_id}/days/${tripDay.id}`,
        tripDay,
      )
      .pipe(
        map((td) => {
          td.items.forEach((item) => {
            if (item.place) this._normalizePlaceImage(item.place);
          });
          return td;
        }),
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
    return this.httpClient
      .post<TripItem>(
        `${this.apiBaseUrl}/trips/${trip_id}/days/${day_id}/items`,
        item,
      )
      .pipe(
        map((item) => {
          if (item.place) item.place = this._normalizePlaceImage(item.place);
          return item;
        }),
      );
  }

  putTripDayItem(
    item: Partial<TripItem>,
    trip_id: number,
    day_id: number,
    item_id: number,
  ): Observable<TripItem> {
    return this.httpClient
      .put<TripItem>(
        `${this.apiBaseUrl}/trips/${trip_id}/days/${day_id}/items/${item_id}`,
        item,
      )
      .pipe(
        map((item) => {
          if (item.place) item.place = this._normalizePlaceImage(item.place);
          return item;
        }),
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

  settingsUserImport(formdata: FormData): Observable<Place[]> {
    const headers = { enctype: "multipart/form-data" };
    return this.httpClient
      .post<
        Place[]
      >(`${this.apiBaseUrl}/settings/import`, formdata, { headers: headers })
      .pipe(
        map((resp) => {
          return resp.map((c) => {
            if (c.image) c.image = `${this.assetsBaseUrl}/${c.image}`;
            else {
              c.image = `${this.assetsBaseUrl}/${(c.category as Category).image}`;
              c.imageDefault = true;
            }
            return c;
          });
        }),
      );
  }
}
