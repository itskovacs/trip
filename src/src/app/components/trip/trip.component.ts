import { AfterViewInit, Component } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SkeletonModule } from "primeng/skeleton";
import { FloatLabelModule } from "primeng/floatlabel";
import * as L from "leaflet";
import { antPath } from "leaflet-ant-path";
import { TableModule } from "primeng/table";
import {
  Trip,
  FlattenedTripItem,
  TripDay,
  TripItem,
  TripStatus,
} from "../../types/trip";
import { Place } from "../../types/poi";
import {
  createMap,
  placeToMarker,
  createClusterGroup,
  tripDayMarker,
} from "../../shared/map";
import { ActivatedRoute, Router } from "@angular/router";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { TripPlaceSelectModalComponent } from "../../modals/trip-place-select-modal/trip-place-select-modal.component";
import { TripCreateDayModalComponent } from "../../modals/trip-create-day-modal/trip-create-day-modal.component";
import { TripCreateDayItemModalComponent } from "../../modals/trip-create-day-item-modal/trip-create-day-item-modal.component";
import { TripCreateItemsModalComponent } from "../../modals/trip-create-items-modal/trip-create-items-modal.component";
import {
  combineLatest,
  forkJoin,
  Observable,
  switchMap,
  take,
  tap,
} from "rxjs";
import { YesNoModalComponent } from "../../modals/yes-no-modal/yes-no-modal.component";
import { UtilsService } from "../../services/utils.service";
import { TripCreateModalComponent } from "../../modals/trip-create-modal/trip-create-modal.component";
import { AsyncPipe } from "@angular/common";
import { MenuItem } from "primeng/api";
import { MenuModule } from "primeng/menu";
import { LinkifyPipe } from "../../shared/linkify.pipe";
import { PlaceCreateModalComponent } from "../../modals/place-create-modal/place-create-modal.component";
import { Settings } from "../../types/settings";

@Component({
  selector: "app-trip",
  standalone: true,
  imports: [
    FormsModule,
    SkeletonModule,
    MenuModule,
    ReactiveFormsModule,
    InputTextModule,
    AsyncPipe,
    LinkifyPipe,
    FloatLabelModule,
    TableModule,
    ButtonModule,
  ],
  templateUrl: "./trip.component.html",
  styleUrls: ["./trip.component.scss"],
})
export class TripComponent implements AfterViewInit {
  currency$: Observable<string>;
  statuses: TripStatus[] = [];
  trip?: Trip;
  places: Place[] = [];
  flattenedTripItems: FlattenedTripItem[] = [];
  selectedItem?: TripItem & { status?: TripStatus };

  isMapFullscreen = false;
  totalPrice = 0;
  collapsedTripDays = false;
  collapsedTripPlaces = false;
  collapsedTripStatuses = false;

  map?: L.Map;
  markerClusterGroup?: L.MarkerClusterGroup;
  hoveredElement?: HTMLElement;
  tripMapAntLayer?: L.FeatureGroup;
  tripMapAntLayerDayID?: number;

  readonly menuTripActionsItems: MenuItem[] = [
    {
      label: "Actions",
      items: [
        {
          label: "Edit",
          icon: "pi pi-pencil",
          iconClass: "text-blue-500!",
          command: () => {
            this.editTrip();
          },
        },
        {
          label: "Archive",
          icon: "pi pi-box",
          iconClass: "text-orange-500!",
          command: () => {
            this.toggleArchiveTrip();
          },
        },
        {
          label: "Delete",
          icon: "pi pi-trash",
          iconClass: "text-red-500!",
          command: () => {
            this.deleteTrip();
          },
        },
      ],
    },
  ];
  readonly menuTripDayActionsItems: MenuItem[] = [
    {
      label: "Actions",
      items: [
        {
          label: "Item",
          icon: "pi pi-plus",
          iconClass: "text-blue-500!",
          command: () => {
            this.addItem();
          },
        },
        {
          label: "Edit",
          icon: "pi pi-pencil",
          command: () => {
            if (!this.selectedTripDayForMenu) return;
            this.editDay(this.selectedTripDayForMenu);
          },
        },
        {
          label: "Delete",
          icon: "pi pi-trash",
          iconClass: "text-red-500!",
          command: () => {
            if (!this.selectedTripDayForMenu) return;
            this.deleteDay(this.selectedTripDayForMenu);
          },
        },
      ],
    },
  ];
  selectedTripDayForMenu?: TripDay;

  dayStatsCache = new Map<number, { price: number; places: number }>();
  placesUsedInTable = new Set<number>();

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

  ngAfterViewInit(): void {
    this.route.paramMap
      .pipe(
        take(1),
        tap((params) => {
          const id = params.get("id");
          if (id) this.loadTripData(+id);
        }),
      )
      .subscribe();
  }

  loadTripData(id: number): void {
    combineLatest({
      trip: this.apiService.getTrip(+id),
      settings: this.apiService.getSettings(),
    })
      .pipe(
        take(1),
        tap(({ trip, settings }) => {
          this.trip = trip;
          this.flattenTripDayItems();
          this.updateTotalPrice();
          this.initMap(settings);
        }),
      )
      .subscribe();
  }

  initMap(settings: Settings): void {
    const contentMenuItems = [
      {
        text: "Copy coordinates",
        callback: (e: any) => {
          const latlng = e.latlng;
          navigator.clipboard.writeText(
            `${parseFloat(latlng.lat).toFixed(5)}, ${parseFloat(latlng.lng).toFixed(5)}`,
          );
        },
      },
    ];
    this.map = createMap(contentMenuItems, settings.tile_layer);
    this.markerClusterGroup = createClusterGroup().addTo(this.map);
    this.setPlacesAndMarkers();

    this.map.setView([settings.map_lat, settings.map_lng]);
    this.resetMapBounds();
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

  sortTripDays() {
    this.trip?.days.sort((a, b) => a.label.localeCompare(b.label));
  }

  getDayStats(day: TripDay): { price: number; places: number } {
    if (this.dayStatsCache.has(day.id)) return this.dayStatsCache.get(day.id)!;

    const stats = day.items.reduce(
      (acc, item) => {
        acc.price += item.price || 0;
        if (item.place) acc.places += 1;
        return acc;
      },
      { price: 0, places: 0 },
    );
    this.dayStatsCache.set(day.id, stats);
    return stats;
  }

  get getWatchlistData(): (TripItem & { status: TripStatus })[] {
    if (!this.trip?.days) return [];

    return this.trip.days
      .flatMap((day) =>
        day.items.filter((item) =>
          ["constraint", "pending"].includes(item.status as string),
        ),
      )
      .map((item) => ({
        ...item,
        status: this.statusToTripStatus(item.status as string),
      })) as (TripItem & { status: TripStatus })[];
  }

  isPlaceUsed(id: number): boolean {
    return this.placesUsedInTable.has(id);
  }

  statusToTripStatus(status?: string): TripStatus | undefined {
    if (!status) return undefined;
    return this.statuses.find((s) => s.label == status);
  }

  flattenTripDayItems() {
    this.sortTripDays();
    this.flattenedTripItems = this.trip!.days.flatMap((day) =>
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
          price: item.price || undefined,
          day_id: item.day_id,
          place: item.place,
          lat: item.lat || (item.place ? item.place.lat : undefined),
          lng: item.lng || (item.place ? item.place.lng : undefined),
        })),
    );
  }

  computePlacesUsedInTable() {
    this.placesUsedInTable.clear();
    this.flattenedTripItems.forEach((item) => {
      if (item.place?.id) this.placesUsedInTable.add(item.place.id);
    });
  }

  setPlacesAndMarkers() {
    this.computePlacesUsedInTable();
    this.places = [...(this.trip?.places ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    this.markerClusterGroup?.clearLayers();
    this.places.forEach((p) => {
      const marker = placeToMarker(p, false, !this.placesUsedInTable.has(p.id));
      this.markerClusterGroup?.addLayer(marker);
    });
  }

  resetMapBounds() {
    if (!this.places.length) return;
    this.map?.fitBounds(
      this.places.map((p) => [p.lat, p.lng]),
      { padding: [30, 30] },
    );
  }

  toggleMapFullscreen() {
    this.isMapFullscreen = !this.isMapFullscreen;
    document.body.classList.toggle("overflow-hidden");

    setTimeout(() => {
      this.map?.invalidateSize();
      if (!this.tripMapAntLayer) this.resetMapBounds();
      else this.map?.fitBounds(this.tripMapAntLayer.getBounds());
    }, 10);
  }

  updateTotalPrice(n?: number) {
    if (n) {
      this.totalPrice += n;
      return;
    }
    this.totalPrice =
      this.trip?.days
        .flatMap((d) => d.items)
        .reduce(
          (price, item) => price + (item.price ?? item.place?.price ?? 0),
          0,
        ) ?? 0;
  }

  resetPlaceHighlightMarker() {
    if (!this.hoveredElement) return;
    this.hoveredElement.classList.remove("listHover");
    this.hoveredElement = undefined;
  }

  placeHighlightMarker(lat: number, lng: number) {
    this.resetPlaceHighlightMarker();

    let marker: L.Marker | undefined;
    this.markerClusterGroup?.eachLayer((layer: any) => {
      if (layer.getLatLng && layer.getLatLng().equals([lat, lng])) {
        marker = layer;
      }
    });

    if (!marker) return;
    const markerElement = marker.getElement() as HTMLElement; // search for Marker. If 'null', is inside Cluster
    if (markerElement) {
      // marker, not clustered
      markerElement.classList.add("listHover");
      this.hoveredElement = markerElement;
    } else {
      // marker is clustered
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

  toggleTripDaysHighlight() {
    if (this.tripMapAntLayerDayID == -1) {
      this.map?.removeLayer(this.tripMapAntLayer!);
      this.tripMapAntLayerDayID = undefined;
      this.tripMapAntLayer = undefined;
      this.resetMapBounds();
      return;
    }
    if (!this.trip) return;

    const items = this.trip.days
      .flatMap((day, idx) =>
        day.items
          .sort((a, b) => a.time.localeCompare(b.time))
          .map((item) => {
            let data = {
              text: item.text,
              isPlace: !!item.place,
              idx: idx,
            };

            if (item.lat && item.lng)
              return {
                ...data,
                lat: item.lat,
                lng: item.lng,
              };
            if (item.place)
              return {
                ...data,
                lat: item.place.lat,
                lng: item.place.lng,
              };
            return undefined;
          }),
      )
      .filter((n) => n !== undefined);

    if (items.length < 2) {
      this.utilsService.toast(
        "info",
        "Info",
        "Not enough values to map an itinerary",
      );
      return;
    }

    const dayGroups: { [idx: number]: any } = {};
    items.forEach((item) => {
      if (!dayGroups[item.idx]) dayGroups[item.idx] = [];
      dayGroups[item.idx].push(item);
    });

    const layGroup = L.featureGroup();
    const COLORS: string[] = [
      "#e6194b",
      "#3cb44b",
      "#ffe119",
      "#4363d8",
      "#9a6324",
      "#f58231",
      "#911eb4",
      "#46f0f0",
      "#f032e6",
      "#bcf60c",
      "#fabebe",
      "#008080",
      "#e6beff",
      "#808000",
    ];
    Object.values(dayGroups).forEach((group, idx) => {
      const path = antPath(
        group.map((day: any) => [day.lat, day.lng]),
        {
          delay: 600,
          dashArray: [10, 20],
          weight: 5,
          color: COLORS[idx % 14],
          pulseColor: "#FFFFFF",
          paused: false,
          reverse: false,
          hardwareAccelerated: true,
        },
      );

      layGroup.addLayer(path);
      group.forEach((day: any) => {
        if (!day.isPlace) layGroup.addLayer(tripDayMarker(day));
      });
    });

    this.map?.fitBounds(
      items.map((c) => [c.lat, c.lng]),
      { padding: [30, 30] },
    );

    if (this.tripMapAntLayer) {
      this.map?.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayerDayID = undefined;
    }

    setTimeout(() => {
      layGroup.addTo(this.map!);
    }, 200);

    this.tripMapAntLayer = layGroup;
    this.tripMapAntLayerDayID = -1; //Hardcoded value for global trace
  }

  toggleTripDayHighlightPathDay(day_id: number) {
    // Click on the currently displayed day: remove
    if (this.tripMapAntLayerDayID == day_id) {
      this.map?.removeLayer(this.tripMapAntLayer!);
      this.tripMapAntLayerDayID = undefined;
      this.tripMapAntLayer = undefined;
      this.resetMapBounds();
      return;
    }

    const idx = this.trip?.days.findIndex((d) => d.id === day_id);
    if (!this.trip || idx === undefined || idx == -1) return;
    const data = this.trip.days[idx].items.sort((a, b) =>
      a.time.localeCompare(b.time),
    );
    const items = data
      .map((item) => {
        if (item.lat && item.lng)
          return {
            text: item.text,
            lat: item.lat,
            lng: item.lng,
            isPlace: !!item.place,
          };
        if (item.place && item.place)
          return {
            text: item.text,
            lat: item.place.lat,
            lng: item.place.lng,
            isPlace: true,
          };
        return undefined;
      })
      .filter((n) => n !== undefined);

    if (items.length < 2) {
      this.utilsService.toast(
        "info",
        "Info",
        "Not enough values to map an itinerary",
      );
      return;
    }

    this.map?.fitBounds(
      items.map((c) => [c.lat, c.lng]),
      { padding: [30, 30] },
    );

    const path = antPath(
      items.map((c) => [c.lat, c.lng]),
      {
        delay: 400,
        dashArray: [10, 20],
        weight: 5,
        color: "#0000FF",
        pulseColor: "#FFFFFF",
        paused: false,
        reverse: false,
        hardwareAccelerated: true,
      },
    );

    const layGroup = L.featureGroup();
    layGroup.addLayer(path);
    items.forEach((item) => {
      if (!item.isPlace) layGroup.addLayer(tripDayMarker(item));
    });

    if (this.tripMapAntLayer) {
      this.map?.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayerDayID = undefined;
    }

    setTimeout(() => {
      layGroup.addTo(this.map!);
    }, 200);

    this.tripMapAntLayer = layGroup;
    this.tripMapAntLayerDayID = day_id;
  }

  onRowClick(item: FlattenedTripItem) {
    if (this.selectedItem && this.selectedItem.id === item.id) {
      this.selectedItem = undefined;
      this.resetPlaceHighlightMarker();
    } else {
      this.selectedItem = item;
      if (item.lat && item.lng) this.placeHighlightMarker(item.lat, item.lng);
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

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (bool)
          this.apiService
            .deleteTrip(this.trip?.id!)
            .pipe(take(1))
            .subscribe({
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
        width: "50vw",
        breakpoints: {
          "640px": "80vw",
        },
        data: { trip: this.trip },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (new_trip: Trip | null) => {
        if (!new_trip) return;

        this.apiService
          .putTrip(new_trip, this.trip?.id!)
          .pipe(take(1))
          .subscribe({
            next: (trip: Trip) => (this.trip = trip),
          });
      },
    });
  }

  toggleArchiveTrip() {
    const currentArchiveStatus = this.trip?.archived;
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm Action",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: `${currentArchiveStatus ? "Restore" : "Archive"} ${this.trip?.name} ?${currentArchiveStatus ? "" : " This will make everything read-only."}`,
    });

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (bool)
          this.apiService
            .putTrip({ archived: !currentArchiveStatus }, this.trip?.id!)
            .pipe(take(1))
            .subscribe({
              next: () => {
                this.trip!.archived = !currentArchiveStatus;
              },
            });
      },
    });
  }

  addDay() {
    if (!this.trip) return;

    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateDayModalComponent,
      {
        header: "Create Day",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "50vw",
        data: { days: this.trip.days },
        breakpoints: {
          "640px": "80vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (day: TripDay | null) => {
        if (!day) return;

        this.apiService
          .postTripDay(day, this.trip?.id!)
          .pipe(take(1))
          .subscribe({
            next: (day) => {
              this.trip!.days.push(day);
              this.flattenTripDayItems();
            },
          });
      },
    });
  }

  editDay(day: TripDay) {
    if (!this.trip) return;

    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateDayModalComponent,
      {
        header: "Create Day",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "50vw",
        data: { day: day, days: this.trip.days },
        breakpoints: {
          "640px": "80vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (day: TripDay | null) => {
        if (!day) return;

        this.apiService
          .putTripDay(day, this.trip?.id!)
          .pipe(take(1))
          .subscribe({
            next: (day) => {
              const idx = this.trip!.days.findIndex((d) => d.id == day.id);
              if (idx != -1) {
                this.trip?.days.splice(idx, 1, day);
                this.flattenTripDayItems();
              }
            },
          });
      },
    });
  }

  deleteDay(day: TripDay) {
    if (!this.trip) return;

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

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (bool)
          this.apiService
            .deleteTripDay(this.trip?.id!, day.id)
            .pipe(take(1))
            .subscribe({
              next: () => {
                const idx = this.trip!.days.findIndex((d) => d.id == day.id);
                if (idx != -1) {
                  this.trip!.days.splice(idx, 1);
                  this.flattenTripDayItems();
                  this.setPlacesAndMarkers();
                }
              },
            });
      },
    });
  }

  manageTripPlaces() {
    if (!this.trip) return;

    const modal: DynamicDialogRef = this.dialogService.open(
      TripPlaceSelectModalComponent,
      {
        header: "Select Place(s)",
        modal: true,
        appendTo: "body",
        closable: true,
        width: "50vw",
        data: { places: this.places },
        breakpoints: {
          "960px": "80vw",
          "640px": "90vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (places: Place[] | null) => {
        if (!places) return;

        this.apiService
          .putTrip({ place_ids: places.map((p) => p.id) }, this.trip!.id)
          .pipe(take(1))
          .subscribe({
            next: (trip) => {
              this.trip = trip;
              this.setPlacesAndMarkers();
              this.resetMapBounds();
            },
          });
      },
    });
  }

  addItem(day_id?: number) {
    if (!this.trip) return;

    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateDayItemModalComponent,
      {
        header: "Create Item",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "75vw",
        breakpoints: {
          "1260px": "90vw",
        },
        data: {
          places: this.places,
          days: this.trip.days,
          selectedDay: day_id,
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (item: TripItem | null) => {
        if (!item) return;

        this.apiService
          .postTripDayItem(item, this.trip!.id!, item.day_id)
          .pipe(take(1))
          .subscribe({
            next: (resp) => {
              const idx = this.trip!.days.findIndex((d) => d.id == item.day_id);
              if (idx === -1) return;

              const td: TripDay = this.trip!.days[idx];
              td.items.push(resp);
              this.flattenTripDayItems();

              this.dayStatsCache.delete(resp.day_id);
              if (resp.price) this.updateTotalPrice(resp.price);
              if (resp.place?.id) {
                this.placesUsedInTable.add(resp.place.id);
                this.setPlacesAndMarkers();
              }
            },
          });
      },
    });
  }

  editItem(item: TripItem) {
    if (!this.trip) return;

    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateDayItemModalComponent,
      {
        header: "Update Item",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "75vw",
        breakpoints: {
          "1260px": "90vw",
        },
        data: {
          places: this.places,
          days: this.trip?.days,
          item: {
            ...item,
            status: item.status ? (item.status as TripStatus).label : null,
          },
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (updated: TripItem | null) => {
        if (!updated) return;
        if (item.place?.id) this.placesUsedInTable.delete(item.place.id);

        this.apiService
          .putTripDayItem(updated, this.trip!.id, item.day_id, item.id)
          .pipe(take(1))
          .subscribe({
            next: (new_item) => this.updateItemFromTrip(item, new_item),
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

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteTripDayItem(this.trip?.id!, item.day_id, item.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.removeItemFromTrip(item);
            },
          });
      },
    });
  }

  addItems() {
    if (!this.trip) return;

    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateItemsModalComponent,
      {
        header: "Create Items",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "75vw",
        breakpoints: {
          "1260px": "90vw",
        },
        data: { days: this.trip.days },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (items: TripItem[] | null) => {
        if (!items?.length) return;
        const day_id = items[0].day_id;
        const obs$ = items.map((item) =>
          this.apiService.postTripDayItem(item, this.trip!.id!, item.day_id),
        );

        forkJoin(obs$).subscribe({
          next: (items: TripItem[]) => {
            const index = this.trip!.days.findIndex((d) => d.id == day_id);
            if (index === -1) return;

            const td: TripDay = this.trip!.days[index]!;
            td.items.push(...items);
            this.flattenTripDayItems();
          },
        });
      },
    });
  }

  addPlace() {
    const modal: DynamicDialogRef = this.dialogService.open(
      PlaceCreateModalComponent,
      {
        header: "Create Place",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "55vw",
        breakpoints: {
          "1920px": "70vw",
          "1260px": "90vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (place: Place | null) => {
        if (!place) return;

        this.apiService
          .postPlace(place)
          .pipe(
            switchMap((createdPlace: Place) =>
              this.apiService.putTrip(
                { place_ids: [createdPlace, ...this.places].map((p) => p.id) },
                this.trip?.id!,
              ),
            ),
            take(1),
          )
          .subscribe({
            next: (trip) => {
              this.trip = trip;
              this.setPlacesAndMarkers();
              this.resetMapBounds();
            },
          });
      },
    });
  }

  updateItemFromTrip(old: TripItem, updated: TripItem): void {
    if (!this.trip) return;

    if (old.day_id != updated.day_id) {
      const prevDayIdx = this.trip.days.findIndex((d) => d.id == old.day_id);
      if (prevDayIdx === -1) {
        const prevDay = this.trip.days[prevDayIdx];
        const prevItemIdx = prevDay.items.findIndex((i) => i.id == updated.id);
        if (prevItemIdx != -1) prevDay.items.splice(prevItemIdx, 1);
        this.dayStatsCache.delete(old.day_id);
      }
    }

    const dayIdx = this.trip.days.findIndex((d) => d.id == updated.day_id);
    if (dayIdx != -1) {
      const day = this.trip.days[dayIdx];
      const itemIdx = day.items.findIndex((i) => i.id === updated.id);
      if (itemIdx !== -1) {
        day.items[itemIdx] = updated;
      }
    }

    this.flattenTripDayItems();

    if (this.selectedItem && this.selectedItem.id === old.id)
      this.selectedItem = {
        ...updated,
        status: updated.status
          ? this.statusToTripStatus(updated.status as string)
          : undefined,
      };
    this.dayStatsCache.delete(updated.day_id);
    this.computePlacesUsedInTable();

    const updatedPrice = (updated.price || 0) - (old.price || 0);
    this.updateTotalPrice(updatedPrice);

    if (this.tripMapAntLayerDayID == updated.day_id)
      this.toggleTripDayHighlightPathDay(updated.day_id);

    if (updated.place?.id || old.place?.id) this.setPlacesAndMarkers();
  }

  removeItemFromTrip(item: TripItem): void {
    if (!this.trip) return;
    const dayIndex = this.trip.days.findIndex((d) => d.id === item.day_id);
    if (dayIndex === -1) return;

    const day = this.trip.days[dayIndex];
    const itemIndex = day.items.findIndex((i) => i.id === item.id);
    if (itemIndex != -1) {
      day.items.splice(itemIndex, 1);
      this.flattenTripDayItems();
    }

    if (item.price) this.updateTotalPrice(-item.price);
    if (item.place?.id) {
      this.placesUsedInTable.delete(item.place.id);
      this.setPlacesAndMarkers();
    }
    this.dayStatsCache.delete(item.day_id);
    this.selectedItem = undefined;
    this.resetPlaceHighlightMarker();
  }
}
