import { AfterViewInit, Component } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { ButtonModule } from "primeng/button";
import { SkeletonModule } from "primeng/skeleton";
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
} from "../../types/trip";
import { Place } from "../../types/poi";
import {
  createMap,
  placeToMarker,
  createClusterGroup,
  tripDayMarker,
} from "../../shared/map";
import { ActivatedRoute } from "@angular/router";
import { debounceTime, Observable, take, tap } from "rxjs";
import { UtilsService } from "../../services/utils.service";
import { AsyncPipe, CommonModule, DecimalPipe } from "@angular/common";
import { MenuItem } from "primeng/api";
import { MenuModule } from "primeng/menu";
import { LinkifyPipe } from "../../shared/linkify.pipe";
import { TooltipModule } from "primeng/tooltip";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MultiSelectModule } from "primeng/multiselect";
import { DialogModule } from "primeng/dialog";
import { CheckboxModule } from "primeng/checkbox";
import { InputTextModule } from "primeng/inputtext";

@Component({
  selector: "app-shared-trip",
  standalone: true,
  imports: [
    CommonModule,
    SkeletonModule,
    MenuModule,
    LinkifyPipe,
    TableModule,
    ButtonModule,
    DecimalPipe,
    TooltipModule,
    DialogModule,
    ReactiveFormsModule,
    InputTextModule,
    FormsModule,
    MultiSelectModule,
    CheckboxModule,
    AsyncPipe,
  ],
  templateUrl: "./shared-trip.component.html",
  styleUrls: ["./shared-trip.component.scss"],
})
export class SharedTripComponent implements AfterViewInit {
  token?: string;
  currency$: Observable<string>;
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
  packingDialogVisible = false;
  isExpanded = false;
  isFilteringMode = false;
  packingList: PackingItem[] = [];
  dispPackingList: Record<string, PackingItem[]> = {};
  checklistDialogVisible = false;
  checklistItems: ChecklistItem[] = [];
  dispchecklist: ChecklistItem[] = [];

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

  dayStatsCache = new Map<number, { price: number; places: number }>();
  placesUsedInTable = new Set<number>();

  constructor(
    private apiService: ApiService,
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
          const token = params.get("token");
          if (token) {
            this.token = token;
            this.loadTripData(token);
          }
        }),
      )
      .subscribe();
  }

  loadTripData(token: string): void {
    this.apiService
      .getSharedTrip(token)
      .pipe(take(1))
      .subscribe({
        next: (trip) => {
          this.trip = trip;
          this.flattenTripDayItems();
          this.updateTotalPrice();
          this.initMap();
        },
      });
  }

  initMap(): void {
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
    setTimeout(() => {
      this.map = createMap(contentMenuItems);
      this.markerClusterGroup = createClusterGroup().addTo(this.map);
      this.setPlacesAndMarkers();
      // this.map.setView([settings.map_lat, settings.map_lng]);
      this.resetMapBounds();
    }, 50); // HACK: Prevent map not found due to @if
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

  toGithub() {
    this.utilsService.toGithubTRIP();
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

  toggleTripDayHighlightPathDay(day_id: number) {
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

  openPackingList() {
    if (!this.token) return;

    if (!this.packingList.length)
      this.apiService
        .getSharedTripPackingList(this.token)
        .pipe(take(1))
        .subscribe({
          next: (items) => {
            this.packingList = [...items];
            this.computeDispPackingList();
          },
        });
    this.packingDialogVisible = true;
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
}
