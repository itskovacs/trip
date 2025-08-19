import { AfterViewInit, Component } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
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
  PackingItem,
  ChecklistItem,
  TripMember,
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
  debounceTime,
  forkJoin,
  Observable,
  of,
  switchMap,
  take,
  tap,
} from "rxjs";
import { YesNoModalComponent } from "../../modals/yes-no-modal/yes-no-modal.component";
import { UtilsService } from "../../services/utils.service";
import { TripCreateModalComponent } from "../../modals/trip-create-modal/trip-create-modal.component";
import { AsyncPipe, CommonModule, DecimalPipe } from "@angular/common";
import { MenuItem } from "primeng/api";
import { MenuModule } from "primeng/menu";
import { LinkifyPipe } from "../../shared/linkify.pipe";
import { PlaceCreateModalComponent } from "../../modals/place-create-modal/place-create-modal.component";
import { Settings } from "../../types/settings";
import { DialogModule } from "primeng/dialog";
import { ClipboardModule } from "@angular/cdk/clipboard";
import { TooltipModule } from "primeng/tooltip";
import { MultiSelectModule } from "primeng/multiselect";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CheckboxChangeEvent, CheckboxModule } from "primeng/checkbox";
import { TripCreatePackingModalComponent } from "../../modals/trip-create-packing-modal/trip-create-packing-modal.component";
import { TripCreateChecklistModalComponent } from "../../modals/trip-create-checklist-modal/trip-create-checklist-modal.component";
import { TripInviteMemberModalComponent } from "../../modals/trip-invite-member-modal/trip-invite-member-modal.component";

@Component({
  selector: "app-trip",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SkeletonModule,
    MenuModule,
    InputTextModule,
    AsyncPipe,
    LinkifyPipe,
    FloatLabelModule,
    TableModule,
    ButtonModule,
    DecimalPipe,
    DialogModule,
    TooltipModule,
    ClipboardModule,
    MultiSelectModule,
    CheckboxModule,
  ],
  templateUrl: "./trip.component.html",
  styleUrls: ["./trip.component.scss"],
})
export class TripComponent implements AfterViewInit {
  currency$: Observable<string>;
  tripSharedURL$?: Observable<string>;
  statuses: TripStatus[] = [];
  trip?: Trip;
  places: Place[] = [];
  flattenedTripItems: FlattenedTripItem[] = [];
  selectedItem?: TripItem & { status?: TripStatus };
  tableExpandableMode = false;

  isMapFullscreen = false;
  totalPrice = 0;
  collapsedTripDays = false;
  collapsedTripPlaces = false;
  shareDialogVisible = false;
  packingDialogVisible = false;
  isExpanded = false;
  isFilteringMode = false;
  packingList: PackingItem[] = [];
  dispPackingList: Record<string, PackingItem[]> = {};
  checklistDialogVisible = false;
  checklistItems: ChecklistItem[] = [];
  dispchecklist: ChecklistItem[] = [];
  membersDialogVisible = false;
  tripMembers: TripMember[] = [];

  map?: L.Map;
  markerClusterGroup?: L.MarkerClusterGroup;
  tripMapTemporaryMarker?: L.Marker;
  tripMapHoveredElement?: HTMLElement;
  tripMapAntLayer?: L.FeatureGroup;
  tripMapAntLayerDayID?: number;

  readonly menuTripActionsItems: MenuItem[] = [
    {
      label: "Actions",
      items: [
        {
          label: "Packing",
          icon: "pi pi-briefcase",
          iconClass: "text-purple-500!",
          command: () => {
            this.openPackingList();
          },
        },
        {
          label: "Checklist",
          icon: "pi pi-check-square",
          iconClass: "text-purple-500!",
          command: () => {
            this.openChecklist();
          },
        },
        {
          label: "Members",
          icon: "pi pi-users",
          iconClass: "text-blue-500!",
          command: () => {
            this.openMembersDialog();
          },
        },
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
          label: "Share",
          icon: "pi pi-share-alt",
          command: () => {
            this.shareDialogVisible = true;
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
  readonly menuTripTableActionsItems: MenuItem[] = [
    {
      label: "Actions",
      items: [
        {
          label: "Directions",
          icon: "pi pi-directions",
          command: () => {
            this.toggleTripDaysHighlight();
          },
        },
        {
          label: "Navigation",
          icon: "pi pi-car",
          command: () => {
            this.tripToNavigation();
          },
        },
        {
          label: "Filter",
          icon: "pi pi-filter",
          command: () => {
            this.toggleFiltering();
          },
        },
        {
          label: "Expand / Group",
          icon: "pi pi-arrow-down-left-and-arrow-up-right-to-center",
          command: () => {
            this.tableExpandableMode = !this.tableExpandableMode;
          },
        },
        {
          label: "Print",
          icon: "pi pi-print",
          command: () => {
            this.printTable();
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
  readonly tripTableColumns: string[] = [
    "day",
    "time",
    "text",
    "place",
    "comment",
    "LatLng",
    "price",
    "status",
  ];
  tripTableSelectedColumns: string[] = [
    "day",
    "time",
    "text",
    "place",
    "comment",
  ];
  tripTableSearchInput = new FormControl("");
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
    this.tripTableSearchInput.valueChanges
      .pipe(takeUntilDestroyed(), debounceTime(300))
      .subscribe({
        next: (value) => {
          if (value) this.flattenTripDayItems(value.toLowerCase());
          else this.flattenTripDayItems();
        },
      });
  }

  ngAfterViewInit(): void {
    this.route.paramMap
      .pipe(
        take(1),
        tap((params) => {
          const id = params.get("id");
          if (id) {
            this.loadTripData(+id);
            this.tripSharedURL$ = this.apiService.getSharedTripURL(+id);
          }
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
    }, 100);
  }

  sortTripDays() {
    this.trip?.days.sort((a, b) => a.label.localeCompare(b.label));
  }

  toggleFiltering() {
    this.isFilteringMode = !this.isFilteringMode;
    if (!this.isFilteringMode) this.flattenTripDayItems();
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

  flattenTripDayItems(searchValue?: string) {
    this.sortTripDays();
    this.flattenedTripItems = this.trip!.days.flatMap((day) =>
      [...day.items]
        .filter((item) =>
          searchValue
            ? item.text.toLowerCase().includes(searchValue) ||
              item.place?.name.toLowerCase().includes(searchValue) ||
              item.comment?.toLowerCase().includes(searchValue)
            : true,
        )
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
    if (!this.places.length) {
      this.map?.fitBounds(
        this.flattenedTripItems
          .filter((i) => i.lat != null && i.lng != null)
          .map((i) => [i.lat!, i.lng!]),
        { padding: [30, 30] },
      );
      return;
    }

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
        .reduce((price, item) => price + (item.price ?? 0), 0) ?? 0;
  }

  resetPlaceHighlightMarker() {
    if (this.tripMapHoveredElement) {
      this.tripMapHoveredElement.classList.remove("listHover");
      this.tripMapHoveredElement = undefined;
    }

    if (this.tripMapTemporaryMarker) {
      this.map?.removeLayer(this.tripMapTemporaryMarker);
      this.tripMapTemporaryMarker = undefined;
    }
    this.resetMapBounds();
  }

  placeHighlightMarker(lat: number, lng: number) {
    if (this.tripMapHoveredElement || this.tripMapTemporaryMarker)
      this.resetPlaceHighlightMarker();

    let marker: L.Marker | undefined;
    this.markerClusterGroup?.eachLayer((layer: any) => {
      if (layer.getLatLng && layer.getLatLng().equals([lat, lng])) {
        marker = layer;
      }
    });

    if (!marker) {
      // TripItem without place, but latlng
      const item = {
        text: this.selectedItem?.text || "",
        lat: lat,
        lng: lng,
        time: this.selectedItem?.time || "",
      };
      this.tripMapTemporaryMarker = tripDayMarker(item).addTo(this.map!);
      this.map?.fitBounds([[lat, lng]], { padding: [60, 60] });
      return;
    }

    let targetLatLng: L.LatLng | null = null;
    const markerElement = marker.getElement() as HTMLElement; // search for Marker. If 'null', is inside Cluster
    if (markerElement) {
      // marker, not clustered
      markerElement.classList.add("listHover");
      this.tripMapHoveredElement = markerElement;
      targetLatLng = marker.getLatLng();
    } else {
      // marker is clustered
      const parentCluster = (this.markerClusterGroup as any).getVisibleParent(
        marker,
      );
      if (parentCluster) {
        const clusterEl = parentCluster.getElement();
        if (clusterEl) {
          clusterEl.classList.add("listHover");
          this.tripMapHoveredElement = clusterEl;
        }
        targetLatLng = parentCluster.getLatLng();
      }
    }

    if (targetLatLng && this.map) {
      const currentBounds = this.map.getBounds();

      // If point is not inside map bounsd, move map w/o touching zoom
      if (!currentBounds.contains(targetLatLng)) {
        setTimeout(() => {
          this.map!.setView(targetLatLng, this.map!.getZoom());
        }, 50);
      }
    }
  }

  resetDayHighlight() {
    this.map?.removeLayer(this.tripMapAntLayer!);
    this.tripMapAntLayerDayID = undefined;
    this.tripMapAntLayer = undefined;
    this.resetMapBounds();
  }

  toggleTripDaysHighlight() {
    if (this.tripMapAntLayerDayID == -1) {
      this.resetDayHighlight();
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
              time: item.time,
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
    let prevPoint: [number, number] | null = null;

    Object.values(dayGroups).forEach((group, idx) => {
      const coords = group.map((day: any) => [day.lat, day.lng]);
      const pathOptions = {
        delay: 600,
        dashArray: [10, 20],
        weight: 5,
        color: COLORS[idx % COLORS.length],
        pulseColor: "#FFFFFF",
        paused: false,
        reverse: false,
        hardwareAccelerated: true,
      };

      if (coords.length >= 2) {
        const path = antPath(coords, pathOptions);
        layGroup.addLayer(path);
        prevPoint = coords[coords.length - 1];
      } else if (coords.length === 1 && prevPoint) {
        const path = antPath([prevPoint, coords[0]], pathOptions);
        layGroup.addLayer(path);
        prevPoint = coords[0];
      } else if (coords.length === 1) {
        prevPoint = coords[0];
      }

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

  toggleTripDayHighlight(day_id: number) {
    // Click on the currently displayed day: remove
    if (this.tripMapAntLayerDayID == day_id) {
      this.resetDayHighlight();
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
            time: item.time,
          };
        if (item.place && item.place)
          return {
            text: item.text,
            lat: item.place.lat,
            lng: item.place.lng,
            isPlace: true,
            time: item.time,
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

  itemToNavigation() {
    if (!this.selectedItem) return;
    // TODO: More services
    // const url = `http://maps.apple.com/?daddr=${this.selectedItem.lat},${this.selectedItem.lng}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${this.selectedItem.lat},${this.selectedItem.lng}`;
    window.open(url, "_blank");
  }

  tripToNavigation() {
    // TODO: More services
    const items = this.flattenedTripItems.filter(
      (item) => item.lat && item.lng,
    );
    if (!items.length) return;

    const waypoints = items.map((item) => `${item.lat},${item.lng}`).join("/");
    const url = `https://www.google.com/maps/dir/${waypoints}`;
    window.open(url, "_blank");
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
      next: (item: (TripItem & { day_id: number[] }) | null) => {
        if (!item) return;

        const obs$ = item.day_id.map((day_id) =>
          this.apiService.postTripDayItem(
            { ...item, day_id },
            this.trip!.id!,
            day_id,
          ),
        );

        forkJoin(obs$)
          .pipe(take(1))
          .subscribe({
            next: (items: TripItem[]) => {
              items.forEach((item) => {
                const idx = this.trip!.days.findIndex(
                  (d) => d.id == item.day_id,
                );
                if (idx === -1) return;

                const td: TripDay = this.trip!.days[idx];
                td.items.push(item);

                this.dayStatsCache.delete(item.day_id);
                if (item.price) this.updateTotalPrice(item.price);
                if (item.place?.id) {
                  this.placesUsedInTable.add(item.place.id);
                  this.setPlacesAndMarkers();
                }
              });

              this.flattenTripDayItems();
              this.setPlacesAndMarkers();
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

        forkJoin(obs$)
          .pipe(take(1))
          .subscribe({
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

    if (old.day_id !== updated.day_id) {
      const oldDay = this.trip.days.find((d) => d.id === old.day_id);
      if (oldDay) {
        oldDay.items = oldDay.items.filter((i) => i.id !== old.id);
        this.dayStatsCache.delete(old.day_id);
      }
    }

    const newDay = this.trip.days.find((d) => d.id === updated.day_id);
    if (newDay) {
      const itemIdx = newDay.items.findIndex((i) => i.id === updated.id);
      if (itemIdx !== -1) {
        newDay.items[itemIdx] = updated;
      } else {
        newDay.items.push(updated);
      }
      this.dayStatsCache.delete(updated.day_id);
    }
    this.flattenTripDayItems();
    this.computePlacesUsedInTable();
    const updatedPrice = (updated.price || 0) - (old.price || 0);
    this.updateTotalPrice(updatedPrice);
    if (this.tripMapAntLayerDayID) this.resetDayHighlight();
    if (updated.place?.id || old.place?.id) this.setPlacesAndMarkers();

    if (this.selectedItem && this.selectedItem.id === old.id) {
      this.selectedItem = {
        ...updated,
        status: updated.status
          ? this.statusToTripStatus(updated.status as string)
          : undefined,
      };
    }
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

  getSharedTripURL() {
    if (!this.trip) return;
    this.apiService.getSharedTripURL(this.trip?.id!).pipe(take(1)).subscribe();
  }

  shareTrip() {
    if (!this.trip) return;
    this.apiService
      .createSharedTrip(this.trip?.id!)
      .pipe(take(1))
      .subscribe({
        next: (url) => {
          this.trip!.shared = true;
          this.tripSharedURL$ = of(url);
        },
      });
  }

  unshareTrip() {
    if (!this.trip) return;

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm deletion",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: `Stop sharing ${this.trip.name} ?`,
    });

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteSharedTrip(this.trip?.id!)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.trip!.shared = false;
              this.shareDialogVisible = false;
            },
          });
      },
    });
  }

  openPackingList() {
    if (!this.trip) return;

    if (!this.packingList.length)
      this.apiService
        .getPackingList(this.trip.id)
        .pipe(take(1))
        .subscribe({
          next: (items) => {
            this.packingList = [...items];
            this.computeDispPackingList();
          },
        });
    this.packingDialogVisible = true;
  }

  addPackingItem() {
    if (!this.trip) return;

    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreatePackingModalComponent,
      {
        header: "Create Packing",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "40vw",
        breakpoints: {
          "1260px": "70vw",
          "600px": "90vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (item: PackingItem | null) => {
        if (!item) return;

        this.apiService
          .postPackingItem(this.trip!.id, item)
          .pipe(take(1))
          .subscribe({
            next: (item) => {
              this.packingList.push(item);
              this.computeDispPackingList();
            },
          });
      },
    });
  }

  onCheckPackingItem(e: CheckboxChangeEvent, id: number) {
    if (!this.trip) return;
    this.apiService
      .putPackingItem(this.trip.id, id, { packed: e.checked })
      .pipe(take(1))
      .subscribe({
        next: (item) => {
          const i = this.packingList.find((p) => p.id == item.id);
          if (i) i.packed = item.packed;
          this.computeDispPackingList();
        },
      });
  }

  deletePackingItem(item: PackingItem) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm deletion",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: `Delete ${item.text.substring(0, 50)} ?`,
    });

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deletePackingItem(this.trip!.id, item.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              const index = this.packingList.findIndex((p) => p.id == item.id);
              if (index > -1) this.packingList.splice(index, 1);
              this.computeDispPackingList();
            },
          });
      },
    });
  }

  computeDispPackingList() {
    const sorted: PackingItem[] = [...this.packingList].sort((a, b) =>
      a.packed !== b.packed
        ? a.packed
          ? 1
          : -1
        : a.text.localeCompare(b.text),
    );

    this.dispPackingList = sorted.reduce<Record<string, PackingItem[]>>(
      (acc, item) => {
        (acc[item.category] ??= []).push(item);
        return acc;
      },
      {},
    );
  }

  openChecklist() {
    if (!this.trip) return;

    if (!this.checklistItems.length)
      this.apiService
        .getChecklist(this.trip.id)
        .pipe(take(1))
        .subscribe({
          next: (items) => {
            this.checklistItems = [...items];
          },
        });
    this.checklistDialogVisible = true;
  }

  addChecklistItem() {
    if (!this.trip) return;

    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateChecklistModalComponent,
      {
        header: "Create item",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "40vw",
        breakpoints: {
          "1260px": "70vw",
          "600px": "90vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (item: ChecklistItem | null) => {
        if (!item) return;

        this.apiService
          .postChecklistItem(this.trip!.id, item)
          .pipe(take(1))
          .subscribe({
            next: (item) => {
              this.checklistItems = [...this.checklistItems, item];
            },
          });
      },
    });
  }

  onCheckChecklistItem(e: CheckboxChangeEvent, id: number) {
    if (!this.trip) return;
    this.apiService
      .putChecklistItem(this.trip.id, id, { checked: e.checked })
      .pipe(take(1))
      .subscribe({
        next: (item) => {
          const i = this.checklistItems.find((p) => p.id == item.id);
          if (i) i.checked = item.checked;
        },
      });
  }

  deleteChecklistItem(item: ChecklistItem) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm deletion",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: `Delete ${item.text.substring(0, 50)} ?`,
    });

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteChecklistItem(this.trip!.id, item.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              const index = this.checklistItems.findIndex(
                (p) => p.id == item.id,
              );
              if (index > -1) this.checklistItems.splice(index, 1);
            },
          });
      },
    });
  }

  openMembersDialog() {
    if (!this.trip) return;

    if (!this.tripMembers.length)
      this.apiService
        .getTripMembers(this.trip.id)
        .pipe(take(1))
        .subscribe({
          next: (items) => {
            this.tripMembers = [...items];
          },
        });
    this.membersDialogVisible = true;
  }

  addMember() {
    if (!this.trip) return;

    const modal: DynamicDialogRef = this.dialogService.open(
      TripInviteMemberModalComponent,
      {
        header: "Invite member",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "40vw",
        breakpoints: {
          "1260px": "70vw",
          "600px": "90vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (user: string | null) => {
        if (!user) return;

        this.apiService
          .inviteTripMember(this.trip!.id, user)
          .pipe(take(1))
          .subscribe({
            next: (member) => {
              this.tripMembers = [...this.tripMembers, member];
            },
          });
      },
    });
  }

  deleteMember(username: string) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm deletion",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: `Delete ${username.substring(0, 50)} from Trip ?`,
    });

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteTripMember(this.trip!.id, username)
          .pipe(take(1))
          .subscribe({
            next: () => {
              const index = this.tripMembers.findIndex(
                (p) => p.user == username,
              );
              if (index > -1) this.tripMembers.splice(index, 1);
            },
          });
      },
    });
  }
}
