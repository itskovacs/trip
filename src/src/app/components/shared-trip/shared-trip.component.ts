import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
  ViewChild,
  untracked,
  ElementRef,
} from '@angular/core';
import { ApiService } from '../../services/api.service';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { FloatLabelModule } from 'primeng/floatlabel';
import * as L from 'leaflet';
import { TableModule } from 'primeng/table';
import {
  Trip,
  TripDay,
  TripItem,
  TripStatus,
  PackingItem,
  ChecklistItem,
  TripAttachment,
  PrintOptions,
} from '../../types/trip';
import { Category, Place } from '../../types/poi';
import {
  createMap,
  placeToMarker,
  createClusterGroup,
  openNavigation,
  tripDayMarker,
  gpxToPolyline,
  toDotMarker,
  getGeolocationLatLng,
} from '../../shared/map';
import { ActivatedRoute, Router } from '@angular/router';
import { DialogService } from 'primeng/dynamicdialog';
import { debounceTime, distinctUntilChanged, Observable, take } from 'rxjs';
import { UtilsService } from '../../services/utils.service';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MenuItem } from 'primeng/api';
import { Menu, MenuModule } from 'primeng/menu';
import { LinkifyPipe } from '../../shared/pipes/linkify.pipe';
import { DialogModule } from 'primeng/dialog';
import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import { TooltipModule } from 'primeng/tooltip';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import { generateTripICSFile } from '../../shared/trip-base/ics';
import { generateTripCSVFile } from '../../shared/trip-base/csv';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileSizePipe } from '../../shared/pipes/filesize.pipe';
import { computeDistLatLng } from '../../shared/utils';
import { TabsModule } from 'primeng/tabs';
import { PlaceBoxContentComponent } from '../../shared/place-box-content/place-box-content.component';
import { PlaceListItemComponent } from '../../shared/place-list-item/place-list-item.component';
import { TripPrettyPrintModalComponent } from '../../modals/trip-pretty-print-modal/trip-pretty-print-modal.component';

interface ViewTripItem extends TripItem {
  status?: TripStatus;
  distance?: number;
}

interface DayViewModel {
  day: TripDay;
  items: ViewTripItem[];
  stats: {
    count: number;
    cost: number;
    hasPlaces: boolean;
  };
}

interface HighlightData {
  paths: { coords: [number, number][]; options: any }[];
  markers: any[];
  gpxData: string[];
  bounds: [number, number][];
}

const HIGHLIGHT_COLORS = [
  '#e6194b',
  '#2c8638',
  '#4363d8',
  '#9a6324',
  '#b56024',
  '#911eb4',
  '#268383',
  '#cb2ac3',
  '#617f06',
  '#906e6e',
  '#008080',
  '#856e93',
  '#7a7a00',
];

const MAX_MAP_INIT_RETRIES = 5;

@Component({
  selector: 'app-shared-trip',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SkeletonModule,
    MenuModule,
    InputTextModule,
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
    FileSizePipe,
    TabsModule,
    PlaceBoxContentComponent,
    PlaceListItemComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shared-trip.component.html',
  styleUrls: ['./shared-trip.component.scss'],
})
export class SharedTripComponent implements AfterViewInit, OnDestroy {
  @ViewChild('resizeHandle') resizeHandle?: ElementRef<HTMLDivElement>;
  @ViewChild('menuTripActions') menuTripActions!: Menu;
  @ViewChild('menuPlanDayActions') menuPlanDayActions!: Menu;
  @ViewChild('menuSelectedItemActions') menuSelectedItemActions!: Menu;
  @ViewChild('menuTripDayActions') menuTripDayActions!: Menu;
  @ViewChild('menuSelectedDayActions') menuSelectedDayActions!: Menu;
  @ViewChild('selectedPanel', { read: ElementRef }) selectedPanelRef?: ElementRef;

  mapInitRetries = 0;
  selectedPanelHeight = signal<number>(0);
  plansSearchInput = new FormControl<string>('');
  apiService: ApiService;
  route: ActivatedRoute;
  router: Router;
  dialogService: DialogService;
  utilsService: UtilsService;
  clipboard: Clipboard;

  trip = signal<Trip | null>(null);
  packingList = signal<PackingItem[]>([]);
  checklistItems = signal<ChecklistItem[]>([]);

  searchQuery = signal<string>('');
  isPlansPanelCollapsed = signal<boolean>(false);
  isFilteringMode = signal<boolean>(false);
  selectedPlace = signal<Place | null>(null);
  selectedItem = signal<ViewTripItem | null>(null);
  selectedPlaceActiveTabIndex = signal<number>(0);
  highlightedDayId = signal<number | null>(null);
  isPlacesPanelVisible = signal<boolean>(false);
  isDaysPanelVisible = signal<boolean>(false);
  showOnlyUnplannedPlaces = signal<boolean>(false);
  printOptions = signal<PrintOptions | null>(null);
  isArchivalReviewDisplayed = signal<boolean>(false);
  isArchiveWarningVisible = signal<boolean>(true);
  tooltipCopied = signal(false);
  selectedDay = signal<TripDay | null>(null);

  panelWidth = signal<number | null>(null);
  panelDeltaX = 0;
  panelDeltaWidth = 0;

  token?: string;
  isShareDialogVisible = false;
  isPackingDialogVisible = false;
  isAttachmentsDialogVisible = false;
  isChecklistDialogVisible = false;
  isBetaDialogVisible = true;
  selectedItemProps = signal<string[]>(['place', 'comment', 'price']);

  tripSharedURL$?: Observable<string>;
  username: string;

  places = computed(() => this.trip()?.places ?? []);
  printOptionsPlaces = computed(() => {
    const options = this.printOptions();
    const places: Set<Place> = new Set();
    this.trip()?.days.forEach((d) => {
      if (!options?.days.has(d.id)) return;
      d.items.forEach((i) => {
        if (!i.place) return;
        places.add(i.place);
      });
    });
    return places;
  });
  usedPlaceIds = computed(() => {
    const trip = this.trip();
    if (!trip?.days) return new Set<number>();
    const ids = new Set<number>();
    for (const day of trip.days) {
      for (const item of day.items) {
        if (item.place?.id) ids.add(item.place.id);
      }
    }
    return ids;
  });
  selectedPlaceItems = computed<ViewTripItem[]>(() => {
    const place = this.selectedPlace();
    if (!place) return [];

    return this.tripViewModel()
      .flatMap((vm) => vm.items)
      .filter((item) => item.place?.id === place.id);
  });
  dispSelectedPlace = computed(() => {
    const place = this.selectedPlace();
    if (!place) return null;
    const items = this.selectedPlaceItems();
    return {
      place,
      items,
      count: items.length,
      isUsed: items.length > 0,
    };
  });
  dispSelectedItem = computed(() => {
    const item = this.selectedItem();
    if (!item) return null;

    const trip = this.trip();
    const dayId = item.day_id;
    const dayLabel = dayId && trip?.days?.length ? (trip.days.find((d) => d.id === dayId)?.label ?? '') : '';

    return { ...item, day: dayLabel };
  });
  hasSelection = computed(() => this.selectedPlace() !== null || this.selectedItem() !== null);
  tripViewModel = computed(() => {
    const currentTrip = this.trip();
    if (!currentTrip?.days) return [];

    const query = this.searchQuery().toLowerCase().trim();
    const hasQuery = query.length > 0;
    const statusesMap = new Map(this.utilsService.statuses.map((s) => [s.label, s]));

    return currentTrip.days
      .map((day) => {
        let filteredItems = day.items;

        if (hasQuery) {
          filteredItems = filteredItems.filter(
            (item) =>
              item.text?.toLowerCase().includes(query) ||
              item.place?.name.toLowerCase().includes(query) ||
              item.comment?.toLowerCase().includes(query),
          );
        }

        if (filteredItems.length === 0 && hasQuery) {
          return null;
        }
        filteredItems.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        let prevLat: number | null = null;
        let prevLng: number | null = null;
        let totalCost = 0;
        let hasPlaces = false;

        const items = filteredItems.map((item) => {
          const statusObj =
            typeof item.status === 'string' ? statusesMap.get(item.status) : (item.status as TripStatus | undefined);

          const lat = item.lat ?? item.place?.lat;
          const lng = item.lng ?? item.place?.lng;

          let distance: number | undefined;
          if (lat != null && lng != null) {
            if (prevLat != null && prevLng != null) {
              distance = Math.round(computeDistLatLng(prevLat, prevLng, lat, lng) * 10) / 10;
            }
            prevLat = lat;
            prevLng = lng;
          }

          if (item.price) totalCost += item.price;
          if (item.place) hasPlaces = true;

          return { ...item, status: statusObj, distance };
        });

        return {
          day,
          items,
          stats: {
            count: items.length,
            cost: totalCost,
            hasPlaces,
          },
        };
      })
      .filter((vm) => vm !== null);
  });
  totalPrice = computed(() => {
    const trip = this.trip();
    if (!trip?.days) return 0;

    return trip.days.reduce((total, day) => {
      return (
        total +
        day.items.reduce((dayTotal, item) => {
          return dayTotal + (item.price || 0);
        }, 0)
      );
    }, 0);
  });
  displayedPlaces = computed(() => {
    const allPlaces = this.places();
    if (!this.showOnlyUnplannedPlaces()) return allPlaces;

    const usedIds = this.usedPlaceIds();
    return allPlaces.filter((place) => !usedIds.has(place.id));
  });
  dispPackingList = computed(() => {
    const list = this.packingList();
    const sorted = [...list].sort((a, b) =>
      a.packed !== b.packed ? (a.packed ? 1 : -1) : a.text.localeCompare(b.text),
    );

    return sorted.reduce<Record<string, PackingItem[]>>((acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    }, {});
  });
  dispChecklist = computed(() => {
    const items = this.checklistItems();
    return [...items].sort((a, b) => (a.checked !== b.checked ? (a.checked ? 1 : -1) : b.id - a.id));
  });
  watchlistItems = computed(() => {
    return this.tripViewModel()
      .flatMap((day) => day.items)
      .filter((item) => item.status && ['pending', 'constraint'].includes(item.status.label));
  });
  itemsToPasteCount = computed(() => this.utilsService.packingListToCopy.length);
  highlightLayerData = computed<HighlightData | null>(() => {
    const dayId = this.highlightedDayId();
    const trip = this.trip();
    if (dayId === null || !trip?.days) return null;

    const paths: { coords: [number, number][]; options: any }[] = [];
    const markers: any[] = [];
    const gpxData: string[] = [];
    const bounds: [number, number][] = [];

    const processItems = (items: TripItem[], color: string, isSingleDay: boolean) => {
      const coords: [number, number][] = [];

      for (const item of items) {
        const lat = item.lat || item.place?.lat;
        const lng = item.lng || item.place?.lng;

        if (!lat || !lng) continue;

        if (!item.place) markers.push(item);
        if (item.gpx) gpxData.push(item.gpx);
        bounds.push([lat, lng]);
        coords.push([lat, lng]);
      }

      if (items.length > 2 && coords.length > 0) {
        paths.push({
          coords,
          options: {
            delay: isSingleDay ? 400 : 600,
            weight: 5,
            color,
          },
        });
      }
    };

    if (dayId === -1) {
      trip.days.forEach((day, idx) => {
        const color = HIGHLIGHT_COLORS[idx % HIGHLIGHT_COLORS.length];
        processItems(day.items, color, false);
      });
    } else {
      const day = trip.days.find((d) => d.id === dayId);
      if (day) processItems(day.items, '#0000FF', true);
    }

    return bounds.length >= 2 || paths.length > 0 ? { paths, markers, gpxData, bounds } : null;
  });
  selectedItemPropsSet = computed(() => new Set(this.selectedItemProps()));

  menuTripExportItems: MenuItem[] = [
    {
      label: 'Export',
      items: [
        {
          label: 'Calendar (.ics)',
          icon: 'pi pi-calendar',
          command: () => generateTripICSFile(this.trip()!, this.utilsService),
        },
        {
          label: 'CSV',
          icon: 'pi pi-file',
          command: () => generateTripCSVFile(this.trip()!),
        },
        {
          label: 'Pretty Print',
          icon: 'pi pi-print',
          command: () => this.togglePrint(),
        },
      ],
    },
  ];
  menuTripActionsItems: MenuItem[] = [];
  menuTripPackingItems: MenuItem[] = [];
  menuTripDayActionsItems: MenuItem[] = [];
  menuPlanDayActionsItems: MenuItem[] = [];
  menuSelectedItemActionsItems: MenuItem[] = [];
  menuSelectedDayActionsItems: MenuItem[] = [];
  selectedTripDayForMenu?: TripDay;
  statuses: TripStatus[];
  availableItemProps = ['place', 'comment', 'latlng', 'price', 'status', 'distance'];

  map?: L.Map;
  markerClusterGroup?: L.MarkerClusterGroup;
  tripMapAntLayer?: L.FeatureGroup;
  markers = new Map<number, L.Marker>();
  selectedItemMarker?: L.Marker;
  highlightedMarkerElement?: HTMLElement;

  constructor() {
    this.apiService = inject(ApiService);
    this.route = inject(ActivatedRoute);
    this.router = inject(Router);
    this.dialogService = inject(DialogService);
    this.utilsService = inject(UtilsService);
    this.clipboard = inject(Clipboard);

    this.statuses = this.utilsService.statuses;
    this.username = this.utilsService.loggedUser;

    this.plansSearchInput.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.searchQuery.set(value || ''));

    effect(() => {
      const vm = this.tripViewModel();
      untracked(() => {
        if (this.map && this.trip()) this.updateMapVisualization(vm);
      });
    });

    effect(() => {
      const data = this.highlightLayerData();

      untracked(() => {
        if (this.tripMapAntLayer) {
          this.map?.removeLayer(this.tripMapAntLayer);
          this.tripMapAntLayer = undefined;
        }

        if (!data || !this.map) return;

        const layerGroup = L.featureGroup();
        data.paths.forEach((p) => {
          const polyline = L.polyline(p.coords, {
            color: p.options.color,
            weight: p.options.weight,
            className: 'animated-path',
            smoothFactor: 1.5,
          });
          layerGroup.addLayer(polyline);
        });
        data.markers.forEach((item) => {
          const marker = tripDayMarker(item);
          marker.on('click', () => {
            if (this.selectedItem()?.id === item.id) {
              this.selectedItem.set(null);
              this.selectedPlace.set(null);
              this.selectedDay.set(null);
              return;
            }
            this.selectedItem.set(this.normalizeItem(item));
            this.selectedPlace.set(null);
            this.selectedDay.set(null);
          });
          layerGroup.addLayer(marker);
        });
        data.gpxData.forEach((gpx) => layerGroup.addLayer(gpxToPolyline(gpx)));

        this.tripMapAntLayer = layerGroup;

        requestAnimationFrame(() => {
          if (this.tripMapAntLayer && this.map) {
            this.tripMapAntLayer.addTo(this.map);
            this.map.fitBounds(data.bounds, { padding: [30, 30], maxZoom: 16 });
          }
        });
      });
    });

    effect(() => {
      const place = this.selectedPlace();
      const item = this.selectedItem();
      const _ = this.selectedDay(); //Force recompute height on day toggle
      const __ = this.selectedPlaceActiveTabIndex(); //Force recompute height on tab change

      //RAF for angular CD
      requestAnimationFrame(() => {
        if (this.selectedPanelRef?.nativeElement) {
          const height = this.selectedPanelRef.nativeElement.offsetHeight;
          this.selectedPanelHeight.set(height);
        } else this.selectedPanelHeight.set(0);
      });

      untracked(() => {
        this.clearSelectedItemHighlight();
        if (!this.map) return;
        if (place) {
          const existingMarker = this.markers.get(place.id);
          if (existingMarker) this.highlightExistingMarker(existingMarker);
          return;
        } else if (item) {
          const lat = item.lat;
          const lng = item.lng;
          if (lat && lng) {
            this.selectedItemMarker = tripDayMarker(item);
            this.selectedItemMarker.addTo(this.map);
          }
        }
      });
    });

    const plansPanelWidth = localStorage.getItem('plansPanelWidth');
    if (plansPanelWidth) this.panelWidth.set(parseInt(plansPanelWidth));

    effect(() => {
      const currentTrip = this.trip();

      untracked(() => {
        if (!this.map && currentTrip) requestAnimationFrame(() => this.initMap());
      });
    });
  }

  ngAfterViewInit() {
    this.route.paramMap.pipe(take(1)).subscribe((params) => {
      const token = params.get('token');
      if (!token) return;
      this.token = token;
      this.loadTripData(token);
    });
  }

  ngOnDestroy() {
    this.cleanupMap();
  }

  cleanupMap() {
    if (this.tripMapAntLayer) {
      this.map?.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayer = undefined;
    }

    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();

    if (this.markerClusterGroup) {
      this.markerClusterGroup.clearLayers();
      this.markerClusterGroup = undefined;
    }

    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
  }

  getItemDayLabel(item: ViewTripItem): string {
    const trip = this.trip();
    if (!trip?.days) return '';
    const day = trip.days.find((d) => d.id === item.day_id);
    return day?.label || '';
  }

  loadTripData(token: string) {
    this.apiService
      .getSharedTrip(token)
      .pipe(take(1))
      .subscribe({
        next: (trip) => this.trip.set(trip),
      });
  }

  initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      if (this.mapInitRetries < MAX_MAP_INIT_RETRIES) {
        this.mapInitRetries++;
        setTimeout(() => this.initMap(), 100 + this.mapInitRetries * 100);
      } else {
        console.error('Failed to initialize map: container not found');
        this.utilsService.toast('error', 'Error', 'Error during map rendering');
      }
      return;
    }
    this.mapInitRetries = 0;

    this.cleanupMap();
    const contextMenuItems = [
      {
        text: 'Copy coordinates',
        callback: (e: any) => {
          const { lat, lng } = e.latlng;
          navigator.clipboard.writeText(`${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`);
        },
      },
    ];

    this.map = createMap(contextMenuItems);
    this.markerClusterGroup = createClusterGroup().addTo(this.map);
    this.updateMapVisualization(this.tripViewModel());
    this.resetMapBounds();
  }

  updateMapVisualization(viewModels: DayViewModel[]) {
    if (!this.map || !this.markerClusterGroup) return;

    this.markerClusterGroup.clearLayers();
    this.markers.clear();

    if (this.tripMapAntLayer) {
      this.map.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayer = undefined;
    }

    const usedIds = this.usedPlaceIds();
    const allPlaces = this.places();
    const markersToAdd: L.Marker[] = [];

    const itemsByPlaceId = new Map<number, ViewTripItem[]>();
    viewModels.forEach((vm) => {
      vm.items.forEach((item) => {
        if (item.place?.id) {
          if (!itemsByPlaceId.has(item.place.id)) {
            itemsByPlaceId.set(item.place.id, []);
          }
          itemsByPlaceId.get(item.place.id)!.push(item);
        }
      });
    });

    allPlaces.forEach((place) => {
      const isUsed = usedIds.has(place.id);
      const marker = placeToMarker(place, false, !isUsed);
      const itemsUsingPlace = itemsByPlaceId.get(place.id) || [];

      marker.on('click', () => {
        this.selectedPlace.set(place);
        this.selectedItem.set(null);
        this.selectedDay.set(null);
        this.selectedPlaceActiveTabIndex.set(itemsUsingPlace.length > 0 ? itemsUsingPlace.length : 0);
      });

      this.markers.set(place.id, marker);
      markersToAdd.push(marker);
    });

    if (markersToAdd.length) {
      this.markerClusterGroup.addLayers(markersToAdd);
    }
  }

  resetMapBounds() {
    const allPlaces = this.places();

    if (!allPlaces.length) {
      const trip = this.trip();
      if (!trip?.days.length) return;

      const itemsWithCoordinates = this.tripViewModel()
        .flatMap((dayVM) => dayVM.items)
        .filter((i) => i.lat != null && i.lng != null);

      if (!itemsWithCoordinates.length) return;
      this.map?.fitBounds(
        itemsWithCoordinates.map((i) => [i.lat!, i.lng!]),
        { padding: [15, 15] },
      );
      return;
    }

    this.map?.fitBounds(
      allPlaces.map((p) => [p.lat, p.lng]),
      { padding: [15, 15] },
    );
  }

  normalizeItem(item: TripItem): ViewTripItem {
    const statusObj =
      typeof item.status === 'string'
        ? this.utilsService.statuses.find((s) => s.label === item.status)
        : (item.status as TripStatus | undefined);

    return { ...item, status: statusObj };
  }

  toGithub() {
    this.utilsService.toGithubTRIP();
  }

  openMenuSelectedItemActions(event: any, item: any) {
    this.menuSelectedItemActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Open Navigation',
            icon: 'pi pi-car',
            command: () => this.itemToNavigation(),
          },
        ],
      },
    ];
    this.menuSelectedItemActions.toggle(event);
  }

  openMenuPlanDayActionsItems(event: any, d: TripDay) {
    this.menuPlanDayActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Summary',
            icon: 'pi pi-minus',
            command: () => this.onDayClick(d),
          },
          {
            label: 'Highlight',
            icon: 'pi pi-directions',
            command: () => this.toggleTripDayHighlight(d.id),
          },
          {
            label: 'Open Navigation',
            icon: 'pi pi-car',
            command: () => this.tripDayToNavigation(d.id),
          },
        ],
      },
    ];
    this.menuPlanDayActions.toggle(event);
  }

  openMenuTripActionsItems(event: any) {
    const lists = {
      label: 'Lists',
      items: [
        {
          label: 'Attachments',
          icon: 'pi pi-paperclip',
          command: () => {
            this.openAttachmentsModal();
          },
        },
        {
          label: 'Checklist',
          icon: 'pi pi-list-check',
          command: () => {
            this.openChecklist();
          },
        },
        {
          label: 'Packing list',
          icon: 'pi pi-briefcase',
          command: () => {
            this.openPackingList();
          },
        },
      ],
    };
    const actions = {
      label: 'Trip',
      items: [
        {
          label: 'Pretty Print',
          icon: 'pi pi-print',
          command: () => {
            this.togglePrint();
          },
        },
      ],
    };

    this.menuTripActionsItems = [lists, actions];
    this.menuTripActions.toggle(event);
  }

  openMenuSelectedDayActions(event: any, d: TripDay) {
    this.menuSelectedDayActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Open Navigation',
            icon: 'pi pi-car',
            command: () => this.tripDayToNavigation(d.id),
          },
          {
            label: 'Highlight',
            icon: 'pi pi-directions',
            command: () => this.toggleTripDayHighlight(d.id),
          },
        ],
      },
    ];
    this.menuSelectedDayActions.toggle(event);
  }

  toggleTripDayHighlight(newValue: number | null) {
    this.highlightedDayId.update((current) => (current === newValue ? null : newValue));
  }

  toggleTripDaysHighlight() {
    this.highlightedDayId.update((current) => (current === -1 ? null : -1));
  }

  back() {
    this.router.navigate(['/trips']);
  }

  togglePrint() {
    const trip = this.trip();
    if (!trip || !trip.days.length) return;

    const modal = this.dialogService.open(TripPrettyPrintModalComponent, {
      header: 'Print options',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '20vw',
      breakpoints: {
        '960px': '70vw',
        '640px': '90vw',
      },
      data: {
        props: this.availableItemProps,
        selectedProps: this.selectedItemProps(),
        days: trip.days,
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((data: PrintOptions | null) => {
      if (!data) return;
      this.printOptions.set(data);

      setTimeout(() => {
        window.print();
        this.printOptions.set(null);
      }, 400); //increased after primeng21 migration
    });
  }

  toggleFiltering() {
    this.isFilteringMode.update((v) => !v);
  }

  togglePlansPanel() {
    this.isPlansPanelCollapsed.update((v) => !v);
  }

  togglePlacesPanel() {
    this.isPlacesPanelVisible.update((v) => !v);
  }

  toggleDaysPanel() {
    this.isDaysPanelVisible.update((v) => !v);
  }

  toggleUnplannedPlacesFilter() {
    this.showOnlyUnplannedPlaces.update((v) => !v);
  }

  toggleArchiveReview() {
    this.isArchivalReviewDisplayed.update((v) => !v);
  }

  getDayAttachments(day: TripDay): TripAttachment[] {
    const attachments = new Map<number, TripAttachment>();
    day.items.forEach((item) => {
      if (!item.attachments) return;
      item.attachments.forEach((attachment) => {
        attachments.set(attachment.id, attachment);
      });
    });
    return Array.from(attachments.values());
  }

  getDayPlaces(day: TripDay): Place[] {
    const places = new Map<number, Place>();
    day.items.forEach((item) => {
      if (item.place) {
        places.set(item.place.id, item.place);
      }
    });
    return Array.from(places.values());
  }

  getCategoriesFromPlaces(places: Set<Place>): Category[] {
    const categories = new Map<number, Category>();
    places.forEach((p) => categories.set(p.category.id, p.category));
    return Array.from(categories.values());
  }

  resetPlansWidth() {
    this.panelWidth.set(null);
    localStorage.removeItem('plansPanelWidth');
  }

  onPlansResizeStart(event: PointerEvent): void {
    event.preventDefault();

    const section = (event.target as HTMLElement).closest('section');
    this.panelDeltaX = event.clientX;
    this.panelDeltaWidth = section?.offsetWidth || 512;

    const handle = event.target as HTMLElement;
    handle.setPointerCapture(event.pointerId);

    const onMove = (e: PointerEvent) => {
      const newWidth = Math.max(320, Math.min(800, this.panelDeltaWidth + (e.clientX - this.panelDeltaX)));
      this.panelWidth.set(newWidth);
    };

    const onUp = (e: PointerEvent) => {
      handle.releasePointerCapture(e.pointerId);
      localStorage.setItem('plansPanelWidth', this.panelWidth()!.toString());
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  onCoordsCopied() {
    this.tooltipCopied.set(true);
    setTimeout(() => this.tooltipCopied.set(false), 1200);
  }

  onDayClick(day: TripDay) {
    this.toggleTripDayHighlight(null);
    if (this.selectedDay()?.id === day.id) {
      this.selectedPlace.set(null);
      this.selectedItem.set(null);
      this.selectedDay.set(null);
      return;
    }

    this.selectedDay.set(day);
    this.selectedPlace.set(null);
    this.selectedItem.set(null);
    this.toggleTripDayHighlight(day.id);
  }

  onPlaceClick(place: Place) {
    if (this.selectedPlace()?.id === place.id) {
      this.selectedPlace.set(null);
      this.selectedItem.set(null);
      this.selectedDay.set(null);
      this.selectedPlaceActiveTabIndex.set(0);
      return;
    }

    this.selectedPlace.set(place);
    this.selectedItem.set(null);
    this.selectedDay.set(null);
    const itemCount = this.selectedPlaceItems().length;
    this.selectedPlaceActiveTabIndex.set(itemCount);
  }

  onRowClick(item: ViewTripItem) {
    if (item.place) {
      const currentSelection = this.selectedPlace();
      // compute tab index for items
      const placeItems = this.tripViewModel()
        .flatMap((vm) => vm.items)
        .filter((i) => i.place?.id === item.place?.id);

      const newTabIndex = placeItems.findIndex((i) => i.id === item.id);
      const targetTabIndex = newTabIndex >= 0 ? newTabIndex : 0;
      if (currentSelection?.id === item.place.id) {
        const currentTabIndex = this.selectedPlaceActiveTabIndex();

        if (currentTabIndex === targetTabIndex) {
          this.selectedPlace.set(null);
          this.selectedItem.set(null);
          this.selectedDay.set(null);
          this.selectedPlaceActiveTabIndex.set(0);
          return;
        }

        this.selectedPlaceActiveTabIndex.set(targetTabIndex);
        this.selectedItem.set(null);
        return;
      }

      this.selectedPlace.set(item.place);
      this.selectedItem.set(null);
      this.selectedDay.set(null);
      this.selectedPlaceActiveTabIndex.set(targetTabIndex);
      return;
    }

    const currentItem = this.selectedItem();
    if (currentItem?.id === item.id) {
      this.selectedItem.set(null);
      this.selectedPlace.set(null);
      this.selectedDay.set(null);
      return;
    }

    this.selectedItem.set(item);
    this.selectedPlace.set(null);
    this.selectedDay.set(null);
  }

  onRowEnter(item: ViewTripItem) {
    if (this.selectedPlace() || this.selectedItem()) return;
    this.clearSelectedItemHighlight();

    const placeId = item?.place?.id;
    if (!placeId) return;

    const marker = this.markers.get(placeId);
    if (marker) this.highlightExistingMarker(marker);
  }

  onRowLeave() {
    if (this.selectedPlace() || this.selectedItem()) return;
    this.clearSelectedItemHighlight();
  }

  async centerOnMe() {
    const position = await getGeolocationLatLng();
    if (position.err) {
      this.utilsService.toast('error', 'Error', position.err);
      return;
    }

    const coords: any = [position.lat!, position.lng!];
    this.map?.flyTo(coords);
    const marker = toDotMarker(coords);
    marker.addTo(this.map!);
    setTimeout(() => {
      marker.remove();
    }, 4000);
  }

  highlightExistingMarker(marker: L.Marker) {
    if (!this.markerClusterGroup) return;
    const markerElement = marker.getElement() as HTMLElement;
    if (markerElement) {
      markerElement.classList.add('list-hover');
      this.highlightedMarkerElement = markerElement;
    } else {
      const parentCluster = (this.markerClusterGroup as any).getVisibleParent(marker);
      if (parentCluster) {
        const clusterEl = parentCluster.getElement();
        if (clusterEl) {
          clusterEl.classList.add('list-hover');
          this.highlightedMarkerElement = clusterEl;
        }
      }
    }
  }

  clearSelectedItemHighlight() {
    if (this.selectedItemMarker) {
      this.map?.removeLayer(this.selectedItemMarker);
      this.selectedItemMarker = undefined;
    }

    if (this.highlightedMarkerElement) {
      this.highlightedMarkerElement.classList.remove('list-hover');
      this.highlightedMarkerElement = undefined;
    }
  }

  openPackingList() {
    if (!this.token) return;
    this.apiService.getSharedTripPackingList(this.token).subscribe((items) => {
      this.packingList.set(items);
      this.isPackingDialogVisible = !this.isPackingDialogVisible;
      this.computeMenuTripPackingItems();
    });
  }

  computeMenuTripPackingItems() {
    this.menuTripPackingItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Copy to clipboard (text)',
            icon: 'pi pi-clipboard',
            command: () => this.copyPackingListToClipboard(),
          },
        ],
      },
    ];
  }

  copyPackingListToClipboard() {
    const content = this.packingList()
      .sort((a, b) =>
        a.category !== b.category
          ? a.category.localeCompare(b.category)
          : a.text < b.text
            ? -1
            : a.text > b.text
              ? 1
              : 0,
      )
      .map((item) => `[${item.category}] ${item.qt ? item.qt + ' ' : ''}${item.text}`)
      .join('\n');
    const success = this.clipboard.copy(content);
    if (success) this.utilsService.toast('success', 'Success', `Content copied to clipboard`);
    else this.utilsService.toast('error', 'Error', 'Content could not be copied to clipboard');
  }

  openChecklist() {
    if (!this.token) return;
    this.apiService.getSharedTripChecklist(this.token).subscribe((items) => {
      this.checklistItems.set(items);
      this.isChecklistDialogVisible = !this.isChecklistDialogVisible;
    });
  }

  openAttachmentsModal() {
    this.isAttachmentsDialogVisible = !this.isAttachmentsDialogVisible;
  }

  downloadItemGPX() {
    const item = this.selectedItem();
    const placeItems = this.selectedPlaceItems();
    const gpx = this.selectedItem()?.gpx || this.selectedPlaceItems()[this.selectedPlaceActiveTabIndex()]?.gpx;
    if (!gpx) return;

    const itemName = item?.text || placeItems[this.selectedPlaceActiveTabIndex()]?.text || 'item';
    const dataBlob = new Blob([gpx]);
    const downloadURL = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = downloadURL;
    link.download = `TRIP_${this.trip()!.name}_${itemName}.gpx`;
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadURL);
  }

  itemToNavigation() {
    const item = this.selectedItem();
    const placeItems = this.selectedPlaceItems();
    const target = item || placeItems[this.selectedPlaceActiveTabIndex()];
    if (!target?.lat || !target?.lng) return;

    openNavigation([{ lat: target.lat, lng: target.lng }]);
  }

  tripDayToNavigation(dayId: number) {
    const idx = this.trip()?.days.findIndex((d) => d.id === dayId);
    if (!this.trip() || idx === undefined || idx == -1) return;
    const data = this.trip()!.days[idx].items.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    const items = data.filter((item) => item.lat && item.lng);
    if (!items.length) return;
    openNavigation(items.map((item) => ({ lat: item.lat!, lng: item.lng! })));
  }

  tripToNavigation() {
    const items = this.tripViewModel()
      .flatMap((d) => d.items)
      .filter((item) => item.lat && item.lng);
    if (!items.length) return;
    openNavigation(items.map((item) => ({ lat: item.lat!, lng: item.lng! })));
  }

  downloadAttachment(attachment: TripAttachment) {
    if (!this.token) return;
    this.apiService
      .downloadSharedTripAttachment(this.token, attachment.id)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          const blob = new Blob([data], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.download = attachment.filename;
          anchor.href = url;

          document.body.appendChild(anchor);
          anchor.click();

          document.body.removeChild(anchor);
          window.URL.revokeObjectURL(url);
        },
      });
  }

  flyTo(latlng?: [number, number]) {
    const selected = this.selectedItem() || this.selectedPlace();
    if (!this.map || (!latlng && (!selected || !selected.lat || !selected.lng))) return;

    const lat: number = latlng ? latlng[0] : selected!.lat!;
    const lng: number = latlng ? latlng[1] : selected!.lng!;
    this.map.flyTo([lat, lng], this.map.getZoom() || 9, { duration: 2 });
  }
}
