import { AfterViewInit, Component } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SkeletonModule } from "primeng/skeleton";
import { FloatLabelModule } from "primeng/floatlabel";
import * as L from "leaflet";
import { TableModule } from "primeng/table";
import {
  Trip,
  FlattenedTripItem,
  TripDay,
  TripItem,
  TripStatus,
} from "../../types/trip";
import { Place } from "../../types/poi";
import { createMap, placeToMarker, createClusterGroup } from "../../shared/map";
import { ActivatedRoute, Router } from "@angular/router";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { TripPlaceSelectModalComponent } from "../../modals/trip-place-select-modal/trip-place-select-modal.component";
import { TripCreateDayModalComponent } from "../../modals/trip-create-day-modal/trip-create-day-modal.component";
import { TripCreateDayItemModalComponent } from "../../modals/trip-create-day-item-modal/trip-create-day-item-modal.component";
import { TripCreateItemsModalComponent } from "../../modals/trip-create-items-modal/trip-create-items-modal.component";
import { forkJoin, map, Observable } from "rxjs";
import { YesNoModalComponent } from "../../modals/yes-no-modal/yes-no-modal.component";
import { UtilsService } from "../../services/utils.service";
import { TripCreateModalComponent } from "../../modals/trip-create-modal/trip-create-modal.component";
import { AsyncPipe } from "@angular/common";

interface PlaceWithUsage extends Place {
  placeUsage?: boolean;
}

@Component({
  selector: "app-trip",
  standalone: true,
  imports: [
    FormsModule,
    SkeletonModule,
    ReactiveFormsModule,
    InputTextModule,
    AsyncPipe,
    FloatLabelModule,
    TableModule,
    ButtonModule,
  ],
  templateUrl: "./trip.component.html",
  styleUrls: ["./trip.component.scss"],
})
export class TripComponent implements AfterViewInit {
  map: any;
  markerClusterGroup: any;
  selectedItem: (TripItem & { status?: TripStatus }) | undefined;
  statuses: TripStatus[] = [];
  hoveredElement: HTMLElement | undefined;
  currency$: Observable<string>;

  trip: Trip | undefined;
  totalPrice: number = 0;
  dayStatsCache = new Map<number, { price: number; places: number }>();

  places: PlaceWithUsage[] = [];
  flattenedTripItems: FlattenedTripItem[] = [];

  constructor(
    private apiService: ApiService,
    private router: Router,
    private dialogService: DialogService,
    private utilsService: UtilsService,
    private route: ActivatedRoute,
  ) {
    this.currency$ = this.utilsService.currency$;
    this.statuses = this.utilsService.statuses;
  }

  back() {
    this.router.navigateByUrl("/trips");
  }

  printTable() {
    this.selectedItem = undefined;
    setTimeout(() => {
      window.print();
    }, 30);
  }

  ngAfterViewInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get("id");
      if (id) {
        this.apiService.getTrip(+id).subscribe({
          next: (trip) => {
            this.trip = trip;
            this.flattenedTripItems = this.flattenTripDayItems(trip.days);

            this.updateTotalPrice();

            this.map = createMap();
            this.markerClusterGroup = createClusterGroup().addTo(this.map);
            this.setPlacesAndMarkers();

            this.map.setView([48.107, -2.988]);
            this.setMapBounds();
          },
        });
      }
    });
  }

  getDayStats(day: TripDay): { price: number; places: number } {
    if (this.dayStatsCache.has(day.id)) {
      return this.dayStatsCache.get(day.id)!;
    }

    const stats = day.items.reduce(
      (acc, item) => {
        acc.price += item.price || item.place?.price || 0;
        if (item.place) acc.places += 1;
        return acc;
      },
      { price: 0, places: 0 },
    );

    this.dayStatsCache.set(day.id, stats);
    return stats;
  }

  statusToTripStatus(status?: string): TripStatus | undefined {
    if (!status) return undefined;
    return this.statuses.find((s) => s.label == status) as TripStatus;
  }

  flattenTripDayItems(days: TripDay[]): FlattenedTripItem[] {
    return days.flatMap((day) =>
      [...day.items]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((item) => ({
          td_id: day.id,
          td_label: day.label,
          id: item.id,
          time: item.time,
          text: item.text,
          status: this.statusToTripStatus(item.status as string),
          comment: item.comment,
          price: item.price || (item.place ? item.place.price : undefined),
          day_id: item.day_id,
          place: item.place,
          lat: item.lat || (item.place ? item.place.lat : undefined),
          lng: item.lng || (item.place ? item.place.lng : undefined),
        })),
    );
  }

  setPlacesAndMarkers() {
    let usedPlaces = this.flattenedTripItems.map((i) => i.place?.id);
    this.places = (this.trip?.places || []).map((p) => {
      let ret: PlaceWithUsage = { ...p };
      if (usedPlaces.includes(p.id)) ret.placeUsage = true;
      return ret;
    });
    this.places.sort((a, b) => a.name.localeCompare(b.name));

    this.markerClusterGroup?.clearLayers();
    this.places.forEach((p) => {
      const marker = placeToMarker(p);
      this.markerClusterGroup?.addLayer(marker);
    });
  }

  setMapBounds() {
    if (!this.places.length) return;
    this.map.fitBounds(
      this.places.map((p) => [p.lat, p.lng]),
      { padding: [30, 30] },
    );
  }

  updateTotalPrice(n?: number) {
    if (n) this.totalPrice += n;
    else
      this.totalPrice =
        this.trip?.days
          .flatMap((d) => d.items)
          .reduce(
            (price, item) => price + (item.price ?? item.place?.price ?? 0),
            0,
          ) ?? 0;
  }

  resetHighlightMarker() {
    if (this.hoveredElement) {
      this.hoveredElement.classList.remove("listHover");
      this.hoveredElement = undefined;
    }
  }

  highlightMarker(lat: number, lng: number) {
    if (this.hoveredElement) {
      this.hoveredElement.classList.remove("listHover");
      this.hoveredElement = undefined;
    }

    let marker: L.Marker | undefined;
    this.markerClusterGroup?.eachLayer((layer: any) => {
      if (layer.getLatLng && layer.getLatLng().equals([lat, lng])) {
        marker = layer;
      }
    });

    if (!marker) return;
    let markerElement = marker.getElement() as HTMLElement; // search for Marker. If 'null', is inside Cluster

    if (markerElement) {
      // marker, not clustered
      markerElement.classList.add("listHover");
      this.hoveredElement = markerElement;
    } else {
      // marker , clustered
      const parentCluster = (this.markerClusterGroup as any).getVisibleParent(
        marker,
      );
      if (parentCluster) {
        const clusterEl = parentCluster.getElement();
        if (clusterEl) {
          clusterEl.classList.add("listHover");
          this.hoveredElement = clusterEl;
        }
      }
    }
  }

  onRowClick(item: FlattenedTripItem) {
    if (this.selectedItem && this.selectedItem.id === item.id) {
      this.selectedItem = undefined;
      this.resetHighlightMarker();
    } else {
      this.selectedItem = item;
      if (item.lat && item.lng) this.highlightMarker(item.lat, item.lng);
    }
  }

  deleteTrip() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm deletion",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: `Delete ${this.trip?.name} ? This will delete everything.`,
    });

    modal.onClose.subscribe({
      next: (bool) => {
        if (bool)
          this.apiService.deleteTrip(this.trip?.id!).subscribe({
            next: () => {
              this.router.navigateByUrl("/trips");
            },
          });
      },
    });
  }

  editTrip() {
    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateModalComponent,
      {
        header: "Update Trip",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "30vw",
        data: { trip: this.trip },
        breakpoints: {
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (new_trip: Trip | null) => {
        if (!new_trip) return;

        this.apiService.putTrip(new_trip, this.trip?.id!).subscribe({
          next: (trip: Trip) => (this.trip = trip),
        });
      },
    });
  }

  addDay() {
    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateDayModalComponent,
      {
        header: "Create Day",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "30vw",
        data: { days: this.trip?.days },
        breakpoints: {
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (day: TripDay | null) => {
        if (!day) return;

        this.apiService.postTripDay(day, this.trip?.id!).subscribe({
          next: (day) => {
            this.trip?.days.push(day);
            this.flattenedTripItems.push(...this.flattenTripDayItems([day]));
          },
        });
      },
    });
  }

  editDay(day: TripDay) {
    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateDayModalComponent,
      {
        header: "Create Day",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "30vw",
        data: { day: day, days: this.trip?.days },
        breakpoints: {
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (day: TripDay | null) => {
        if (!day) return;

        this.apiService.putTripDay(day, this.trip?.id!).subscribe({
          next: (day) => {
            let index = this.trip?.days.findIndex((d) => d.id == day.id);
            if (index != -1) {
              this.trip?.days.splice(index as number, 1, day);
              this.flattenedTripItems = this.flattenTripDayItems(
                this.trip?.days!,
              );
              this.dayStatsCache.delete(day.id);
            }
          },
        });
      },
    });
  }

  deleteDay(day: TripDay) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm deletion",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: `Delete ${day.label} ? This will delete everything for this day.`,
    });

    modal.onClose.subscribe({
      next: (bool) => {
        if (bool)
          this.apiService.deleteTripDay(this.trip?.id!, day.id).subscribe({
            next: () => {
              let index = this.trip?.days.findIndex((d) => d.id == day.id);
              if (index != -1) {
                this.trip?.days.splice(index as number, 1);
                this.flattenedTripItems = this.flattenTripDayItems(
                  this.trip?.days!,
                );
                this.dayStatsCache.delete(day.id);
              }
            },
          });
      },
    });
  }

  manageTripPlaces() {
    const modal: DynamicDialogRef = this.dialogService.open(
      TripPlaceSelectModalComponent,
      {
        header: "Select Place(s)",
        modal: true,
        appendTo: "body",
        closable: true,
        width: "30vw",
        data: { places: this.places },
        breakpoints: {
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (places: Place[] | null) => {
        if (!places) return;

        this.apiService
          .putTrip({ place_ids: places.map((p) => p.id) }, this.trip?.id!)
          .subscribe({
            next: (trip) => {
              this.trip = trip;
              this.setPlacesAndMarkers();
              this.setMapBounds();
            },
          });
      },
    });
  }

  addItem(day_id?: number) {
    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateDayItemModalComponent,
      {
        header: "Create Item",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "40vw",
        data: {
          places: this.places,
          days: this.trip?.days,
          selectedDay: day_id,
        },
        breakpoints: {
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (item: TripItem | null) => {
        if (!item) return;

        this.apiService
          .postTripDayItem(item, this.trip?.id!, item.day_id)
          .subscribe({
            next: (resp) => {
              let index = this.trip?.days.findIndex((d) => d.id == item.day_id);
              if (index != -1) {
                let td: TripDay = this.trip?.days[index as number]!;
                td.items.push(resp);
                this.flattenedTripItems = this.flattenTripDayItems(
                  this.trip?.days!,
                );
              }
            },
          });
      },
    });
  }

  editItem(item: TripItem) {
    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateDayItemModalComponent,
      {
        header: "Update Item",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "40vw",
        data: {
          places: this.places,
          days: this.trip?.days,
          item: item,
        },
        breakpoints: {
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (it: TripItem | null) => {
        if (!it) return;

        this.apiService
          .putTripDayItem(it, this.trip?.id!, item.day_id, item.id)
          .subscribe({
            next: (item) => {
              let index = this.trip?.days.findIndex((d) => d.id == item.day_id);
              if (index != -1) {
                let td: TripDay = this.trip?.days[index as number]!;
                td.items.splice(
                  td.items.findIndex((i) => i.id == item.id),
                  1,
                  item,
                );
                this.flattenedTripItems = this.flattenTripDayItems(
                  this.trip?.days!,
                );
                if (this.selectedItem && this.selectedItem.id === item.id)
                  this.selectedItem = {
                    ...item,
                    status: item.status
                      ? this.statusToTripStatus(item.status as string)
                      : undefined,
                  };
                this.dayStatsCache.delete(item.day_id);
              }

              const updatedPrice = -(item.price || 0) + (it.price || 0);
              this.updateTotalPrice(updatedPrice);
            },
          });
      },
    });
  }

  deleteItem(item: TripItem) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm deletion",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: `Delete ${item.text.substring(0, 50)} ? This will delete everything for this day.`,
    });

    modal.onClose.subscribe({
      next: (bool) => {
        if (bool)
          this.apiService
            .deleteTripDayItem(this.trip?.id!, item.day_id, item.id)
            .subscribe({
              next: () => {
                let index = this.trip?.days.findIndex(
                  (d) => d.id == item.day_id,
                );
                if (index != -1) {
                  let td: TripDay = this.trip?.days[index as number]!;
                  td.items.splice(
                    td.items.findIndex((i) => i.id == item.id),
                    1,
                  );
                  this.flattenedTripItems = this.flattenTripDayItems(
                    this.trip?.days!,
                  );
                  this.dayStatsCache.delete(item.day_id);
                  this.selectedItem = undefined;
                  this.resetHighlightMarker();
                }
              },
            });
      },
    });
  }

  addItems() {
    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateItemsModalComponent,
      {
        header: "Create Items",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "40vw",
        data: { days: this.trip?.days },
        breakpoints: {
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (items: TripItem[] | null) => {
        if (!items?.length) return;
        const day_id = items[0].day_id;

        const obs$ = items.map((item) =>
          this.apiService.postTripDayItem(item, this.trip?.id!, item.day_id),
        );

        forkJoin(obs$)
          .pipe(
            map((items) => {
              let index = this.trip?.days.findIndex((d) => d.id == day_id);
              if (index != -1) {
                let td: TripDay = this.trip?.days[index as number]!;
                td.items.push(...items);
                this.flattenedTripItems = this.flattenTripDayItems(
                  this.trip?.days!,
                );
              }
            }),
          )
          .subscribe();
      },
    });
  }
}
