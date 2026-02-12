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
  TripMember,
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
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TripPlaceSelectModalComponent } from '../../modals/trip-place-select-modal/trip-place-select-modal.component';
import { TripCreateDayModalComponent } from '../../modals/trip-create-day-modal/trip-create-day-modal.component';
import { TripCreateDayItemModalComponent } from '../../modals/trip-create-day-item-modal/trip-create-day-item-modal.component';
import { debounceTime, distinctUntilChanged, forkJoin, Observable, of, switchMap, take } from 'rxjs';
import { YesNoModalComponent } from '../../modals/yes-no-modal/yes-no-modal.component';
import { UtilsService } from '../../services/utils.service';
import { TripCreateModalComponent } from '../../modals/trip-create-modal/trip-create-modal.component';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MenuItem } from 'primeng/api';
import { Menu, MenuModule } from 'primeng/menu';
import { LinkifyPipe } from '../../shared/pipes/linkify.pipe';
import { PlaceCreateModalComponent } from '../../modals/place-create-modal/place-create-modal.component';
import { Settings } from '../../types/settings';
import { DialogModule } from 'primeng/dialog';
import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import { TooltipModule } from 'primeng/tooltip';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxChangeEvent, CheckboxModule } from 'primeng/checkbox';
import { TripCreatePackingModalComponent } from '../../modals/trip-create-packing-modal/trip-create-packing-modal.component';
import { TripCreateChecklistModalComponent } from '../../modals/trip-create-checklist-modal/trip-create-checklist-modal.component';
import { TripInviteMemberModalComponent } from '../../modals/trip-invite-member-modal/trip-invite-member-modal.component';
import { TripNotesModalComponent } from '../../modals/trip-notes-modal/trip-notes-modal.component';
import { TripArchiveModalComponent } from '../../modals/trip-archive-modal/trip-archive-modal.component';
import { generateTripICSFile } from '../../shared/trip-base/ics';
import { generateTripCSVFile } from '../../shared/trip-base/csv';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileSizePipe } from '../../shared/pipes/filesize.pipe';
import { computeDistLatLng, daterangeToTripDays } from '../../shared/utils';
import { TabList, TabsModule } from 'primeng/tabs';
import { PlaceBoxContentComponent } from '../../shared/place-box-content/place-box-content.component';
import { TripBulkEditModalComponent } from '../../modals/trip-bulk-edit-modal/trip-bulk-edit-modal.component';
import { PlaceListItemComponent } from '../../shared/place-list-item/place-list-item.component';
import { RouteManagerService } from '../../services/route-manager.service';
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

@Component({
  selector: 'app-trip',
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
  templateUrl: './trip.component.html',
  styleUrls: ['./trip.component.scss'],
})
export class TripComponent implements AfterViewInit, OnDestroy {
  @ViewChild('resizeHandle') resizeHandle?: ElementRef<HTMLDivElement>;
  @ViewChild('menuTripActions') menuTripActions!: Menu;
  @ViewChild('menuPlanDayActions') menuPlanDayActions!: Menu;
  @ViewChild('menuSelectedItemActions') menuSelectedItemActions!: Menu;
  @ViewChild('menuSelectedPlaceActions') menuSelectedPlaceActions!: Menu;
  @ViewChild('menuTripDayActions') menuTripDayActions!: Menu;
  @ViewChild('menuSelectedDayActions') menuSelectedDayActions!: Menu;
  @ViewChild('selectedPanel', { read: ElementRef }) selectedPanelRef?: ElementRef;
  @ViewChild('selectedTabListRef') selectedTabListRef: TabList | undefined;

  selectedPanelHeight = signal<number>(0);
  plansSearchInput = new FormControl<string>('');
  apiService: ApiService;
  route: ActivatedRoute;
  router: Router;
  dialogService: DialogService;
  utilsService: UtilsService;
  clipboard: Clipboard;
  routeManager: RouteManagerService;

  trip = signal<Trip | null>(null);
  tripMembers = signal<TripMember[]>([]);
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
  isMultiSelectMode = signal<boolean>(false);
  selectedItemIds = signal<Set<number>>(new Set());
  selectedDay = signal<TripDay | null>(null);

  panelWidth = signal<number | null>(null);
  panelDeltaX = 0;
  panelDeltaWidth = 0;

  isShareDialogVisible = false;
  isPackingDialogVisible = false;
  isMembersDialogVisible = false;
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
  selectedItemsCount = computed(() => this.selectedItemIds().size);
  selectedPlaceItems = computed<ViewTripItem[]>(() => {
    const place = this.selectedPlace();
    if (!place) return [];

    return this.tripViewModel()
      .flatMap((vm) => vm.items)
      .filter((item) => item.place?.id === place.id);
  });
  selectedItems = computed(() => {
    const ids = this.selectedItemIds();
    return this.tripViewModel()
      .flatMap((vm) => vm.items)
      .filter((item) => ids.has(item.id));
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
  menuSelectedPlaceActionsItems: MenuItem[] = [];
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
    this.routeManager = inject(RouteManagerService);

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
      // fix p-tabs scroll state issues
      const selection = this.dispSelectedPlace();
      const activeIndex = this.selectedPlaceActiveTabIndex();

      if (!selection || !this.selectedTabListRef) return;
      requestAnimationFrame(() => {
        (this.selectedTabListRef as any).updateButtonState();
        const element = document.querySelector('[data-pc-name="tab"][data-p-active="true"]');
        element?.scrollIntoView?.({ block: 'nearest' });
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
  }

  ngAfterViewInit() {
    this.route.paramMap.pipe(take(1)).subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.loadTripData(+id);
        this.tripSharedURL$ = this.apiService.getSharedTripURL(+id);
      } else {
        this.router.navigate(['/trips']);
      }
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

  loadTripData(id: number) {
    forkJoin({
      trip: this.apiService.getTrip(id),
      settings: this.apiService.getSettings(),
      members: this.apiService.getTripMembers(id),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ trip, settings, members }) => {
          this.trip.set(trip);
          this.tripMembers.set(members);
          if (!this.map) this.initMap(settings);
        },
        error: () => {
          this.utilsService.toast('error', 'Error', 'Could not load trip');
          this.router.navigate(['/trips']);
        },
      });
  }

  initMap(settings: Settings) {
    this.cleanupMap();

    const contextMenuItems = [
      {
        text: 'Add Point of Interest',
        callback: (e: any) => {
          this.addPlace(e);
        },
      },
      {
        text: 'Copy coordinates',
        callback: (e: any) => {
          const { lat, lng } = e.latlng;
          navigator.clipboard.writeText(`${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`);
        },
      },
    ];

    this.map = createMap(contextMenuItems, settings.tile_layer);
    this.markerClusterGroup = createClusterGroup().addTo(this.map);
    this.map.setView([settings.map_lat, settings.map_lng]);
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
      const marker = placeToMarker(place, false, !isUsed, false, () => this.markerRightClickFn(place));
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

  openMenuTripDayActions(event: any, day: TripDay) {
    this.menuTripDayActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Plan',
            icon: 'pi pi-plus',
            command: () => this.addItem(),
          },
          {
            label: 'Edit',
            icon: 'pi pi-pencil',
            command: () => this.editDay(day),
          },
          {
            label: 'Delete',
            icon: 'pi pi-trash',
            iconClass: 'text-red-500!',
            command: () => this.deleteDay(day),
          },
        ],
      },
    ];
    this.menuTripDayActions.toggle(event);
  }

  openMenuSelectedItemActions(event: any, item: any) {
    this.menuSelectedItemActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Open Navigation',
            icon: 'pi pi-directions',
            command: () => this.itemToNavigation(),
          },
          {
            label: 'Edit',
            icon: 'pi pi-pencil',
            disabled: this.trip()!.archived,
            command: () => this.editItem(item),
          },
          {
            label: 'Delete',
            icon: 'pi pi-trash',
            disabled: this.trip()!.archived,
            command: () => this.deleteItem(item),
          },
        ],
      },
    ];
    this.menuSelectedItemActions.toggle(event);
  }

  openMenuSelectedPlaceActions(event: any, place: Place) {
    this.menuSelectedPlaceActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Create Plan',
            icon: 'pi pi-link',
            disabled: this.trip()!.archived,
            command: () => this.addItem(undefined, place.id),
          },
          {
            label: 'Edit',
            icon: 'pi pi-pencil',
            disabled: this.trip()!.archived,
            command: () => this.editPlace(place),
          },
          {
            label: 'Unlink Place',
            icon: 'pi pi-trash',
            disabled: this.trip()!.archived,
            command: () => this.unlinkPlaceFromTrip(place.id),
          },
        ],
      },
    ];
    this.menuSelectedPlaceActions.toggle(event);
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
            icon: 'pi pi-wave-pulse',
            command: () => this.toggleTripDayHighlight(d.id),
          },
          {
            label: 'Routing',
            icon: 'pi pi-car',
            command: () => this.dayRouting(d),
          },
          {
            label: 'Open Navigation',
            icon: 'pi pi-directions',
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
    const collaboration = {
      label: 'Collaboration',
      items: [
        {
          label: 'Members',
          icon: 'pi pi-users',
          command: () => {
            this.openMembersDialog();
          },
        },
        {
          label: 'Share',
          icon: 'pi pi-share-alt',
          command: () => {
            this.isShareDialogVisible = !this.isShareDialogVisible;
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
        {
          label: 'Notes',
          icon: 'pi pi-info-circle',
          command: () => {
            this.openTripNotesModal();
          },
        },
        {
          label: this.trip()!.archived ? 'Unarchive' : 'Archive',
          icon: 'pi pi-box',
          command: () => {
            this.toggleArchiveTrip();
          },
        },
        {
          label: 'Edit',
          icon: 'pi pi-pencil',
          disabled: this.trip()!.archived,
          command: () => {
            this.editTrip();
          },
        },
        {
          label: 'Delete',
          icon: 'pi pi-trash',
          disabled: this.trip()!.archived,
          command: () => {
            this.deleteTrip();
          },
        },
      ],
    };

    this.menuTripActionsItems = [lists, collaboration, actions];
    this.menuTripActions.toggle(event);
  }

  openMenuSelectedDayActions(event: any, d: TripDay) {
    this.menuSelectedDayActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Open Navigation',
            icon: 'pi pi-directions',
            command: () => this.tripDayToNavigation(d.id),
          },
          {
            label: 'Highlight',
            icon: 'pi pi-wave-pulse',
            command: () => this.toggleTripDayHighlight(d.id),
          },
          {
            label: 'Edit',
            icon: 'pi pi-pencil',
            disabled: this.trip()!.archived,
            command: () => this.editDay(d),
          },
          {
            label: 'Delete',
            icon: 'pi pi-trash',
            disabled: this.trip()!.archived,
            command: () => this.deleteDay(d),
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
      width: '30vw',
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

  toggleArchiveTrip() {
    if (this.trip()!.archived) this.openUnarchiveTripModal();
    else this.openArchiveTripModal();
  }

  toggleArchiveReview() {
    this.isArchivalReviewDisplayed.update((v) => !v);
  }

  toggleMultiSelectMode() {
    this.isMultiSelectMode.update((v) => !v);
    if (!this.isMultiSelectMode()) this.clearMultiSelectSelection();
    else {
      this.selectedPlace.set(null);
      this.selectedItem.set(null);
    }
  }

  clearMultiSelectSelection() {
    this.selectedItemIds.set(new Set());
  }

  toggleItemSelection(itemId: number) {
    this.selectedItemIds.update((ids) => {
      const newIds = new Set(ids);
      if (newIds.has(itemId)) newIds.delete(itemId);
      else newIds.add(itemId);
      return newIds;
    });
  }

  unlinkPlaceFromTrip(placeId: number) {
    if (this.usedPlaceIds().has(placeId)) {
      this.utilsService.toast('error', 'Place in use', 'This place is referenced by at least one plan');
      return;
    }

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Unlink Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: 'Remove the place from this Trip?',
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;
      const new_places = this.trip()
        ?.places.map((p) => p.id)
        .filter((id) => id !== placeId);
      this.apiService
        .putTrip({ place_ids: new_places }, this.trip()!.id)
        .pipe(take(1))
        .subscribe({
          next: (trip) => {
            this.trip.set(trip);
            this.selectedPlace.set(null);
            this.selectedPlaceActiveTabIndex.set(0);
          },
        });
    });
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
    if (this.isMultiSelectMode()) {
      this.toggleItemSelection(item.id);
      return;
    }

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

  addItem(dayId?: number, placeId?: number) {
    const modal = this.dialogService.open(TripCreateDayItemModalComponent, {
      header: 'Add Item',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: {
        trip: this.trip(),
        selectedDayId: dayId,
        selectedPlaceId: placeId,
        places: this.places(),
        members: this.tripMembers(),
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((newItem: (TripItem & { day_id: number[] }) | null) => {
      if (!newItem) return;

      const obs$ = newItem.day_id.map((day_id) =>
        this.apiService.postTripDayItem({ ...newItem, day_id }, this.trip()!.id, day_id),
      );

      forkJoin(obs$)
        .pipe(take(1))
        .subscribe({
          next: (items: TripItem[]) => {
            this.trip.update((currentTrip) => {
              if (!currentTrip) return null;

              const newItemsByDay = items.reduce(
                (acc, item) => {
                  (acc[item.day_id] ??= []).push(item);
                  return acc;
                },
                {} as Record<number, TripItem[]>,
              );

              const updatedDays = currentTrip.days.map((day) =>
                newItemsByDay[day.id] ? { ...day, items: [...day.items, ...newItemsByDay[day.id]] } : day,
              );

              return { ...currentTrip, days: updatedDays };
            });
          },
        });
    });
  }

  editItem(item: TripItem) {
    const modal = this.dialogService.open(TripCreateDayItemModalComponent, {
      header: 'Update Item',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: {
        trip: this.trip(),
        item: { ...item, status: item.status ? (item.status as TripStatus)?.label : null },
        places: this.places(),
        members: this.tripMembers(),
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((updated: TripItem | null) => {
      if (!updated) return;

      this.apiService.putTripDayItem(updated, this.trip()!.id, item.day_id, item.id).subscribe((newItem) => {
        this.trip.update((current) => {
          if (!current) return null;

          let days = [...current.days];

          if (item.day_id !== newItem.day_id) {
            days = days.map((d) =>
              d.id === item.day_id ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d,
            );
          }

          days = days.map((d) => {
            if (d.id === newItem.day_id) {
              const exists = d.items.some((i) => i.id === newItem.id);
              const newItems = exists ? d.items.map((i) => (i.id === newItem.id ? newItem : i)) : [...d.items, newItem];
              return { ...d, items: newItems };
            }
            return d;
          });

          return { ...current, days };
        });
        const normalizedItem = this.normalizeItem(newItem);
        if (this.selectedItem()?.id === item.id) this.selectedItem.set(normalizedItem);
        if (this.selectedPlace()?.id === item.place?.id || this.selectedPlace()?.id === newItem.place?.id) {
          const currentPlace = this.selectedPlace();
          if (currentPlace) this.selectedPlace.set({ ...currentPlace });
        }
      });
    });
  }

  deleteItem(item: TripItem) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Item',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: `Delete ${item.text.substring(0, 50)}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;
      this.apiService.deleteTripDayItem(this.trip()!.id, item.day_id, item.id).subscribe(() => {
        this.trip.update((current) => {
          if (!current) return null;
          const days = current.days.map((d) =>
            d.id === item.day_id ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d,
          );
          return { ...current, days };
        });
        if (this.selectedItem()?.id === item.id) this.selectedItem.set(null);
        if (this.selectedPlace()?.id === item.place?.id) {
          const remainingItems = this.selectedPlaceItems().filter((i) => i.id !== item.id);
          if (remainingItems.length === 0) this.selectedPlaceActiveTabIndex.set(0);
        }
      });
    });
  }

  addDay() {
    const modal = this.dialogService.open(TripCreateDayModalComponent, {
      header: 'Add Day(s)',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: { days: this.trip()!.days },
      breakpoints: {
        '640px': '80vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((data: TripDay | { daterange: Date[]; notes?: string[] } | null) => {
      if (!data) return;

      if ('daterange' in data && data.daterange && data.daterange.length === 2) {
        const tripDays = daterangeToTripDays(data.daterange);
        const obs$ = tripDays.map((td) =>
          this.apiService.postTripDay({ id: -1, label: td.label!, dt: td.dt, items: [] }, this.trip()!.id),
        );

        forkJoin(obs$)
          .pipe(take(1))
          .subscribe((newDays: TripDay[]) => {
            this.trip.update((t) => {
              if (!t) return null;
              const days = [...t.days, ...newDays].sort((a, b) => (a.dt || '').localeCompare(b.dt || ''));
              return { ...t, days };
            });
          });
      } else {
        const newDay = data as TripDay;
        this.apiService.postTripDay(newDay, this.trip()!.id).subscribe((createdDay) => {
          this.trip.update((t) => {
            if (!t) return null;
            const days = [...t.days, createdDay].sort((a, b) => (a.dt || '').localeCompare(b.dt || ''));
            return { ...t, days };
          });
        });
      }
    });
  }

  editDay(day: TripDay) {
    const modal = this.dialogService.open(TripCreateDayModalComponent, {
      header: 'Edit Day',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: { day, days: this.trip()!.days },
      breakpoints: {
        '640px': '80vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((newDay: TripDay | null) => {
      if (!newDay) return;
      this.apiService.putTripDay(newDay, this.trip()!.id).subscribe((updated) => {
        this.trip.update((t) => {
          if (!t) return null;
          const days = t.days
            .map((d) => (d.id === updated.id ? { ...d, ...updated } : d))
            .sort((a, b) => (a.dt || '').localeCompare(b.dt || ''));
          return { ...t, days };
        });

        if (this.selectedDay()?.id === updated.id) this.selectedDay.set(updated);
      });
    });
  }

  deleteDay(day: TripDay) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Day',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${day.label} and associated plans?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;
      this.apiService.deleteTripDay(this.trip()!.id, day.id).subscribe(() => {
        this.trip.update((t) => {
          if (!t) return null;
          return { ...t, days: t.days.filter((d) => d.id !== day.id) };
        });
        if (this.selectedDay()?.id === day.id) this.selectedDay.set(null);
      });
    });
  }

  addPlace(e?: any) {
    const opts = e ? { data: { place: e.latlng } } : {};
    const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Create Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '55vw',
      breakpoints: {
        '1920px': '70vw',
        '1260px': '90vw',
      },
      ...opts,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (place: Place | null) => {
        if (!place) return;

        this.apiService
          .postPlace(place)
          .pipe(
            switchMap((createdPlace: Place) =>
              this.apiService.putTrip(
                { place_ids: [createdPlace.id, ...this.places().map((p) => p.id)] },
                this.trip()!.id,
              ),
            ),
            take(1),
          )
          .subscribe({
            next: (trip) => this.trip.set(trip),
          });
      },
    });
  }

  editPlace(pEdit: Place) {
    const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Edit Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '55vw',
      breakpoints: {
        '1920px': '70vw',
        '1260px': '90vw',
      },
      data: {
        place: { ...pEdit, category: pEdit.category.id },
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (updatedPlace: Place | null) => {
        if (!updatedPlace) return;

        this.apiService
          .putPlace(updatedPlace.id, updatedPlace)
          .pipe(take(1))
          .subscribe({
            next: (place: Place) => {
              this.trip.update((t) => {
                if (!t) return null;
                const places = t.places.map((p) => (p.id === place.id ? place : p));
                const days = t.days.map((d) => ({
                  ...d,
                  items: d.items.map((i) => (i.place?.id === place.id ? { ...i, place: place } : i)),
                }));

                return { ...t, places, days };
              });
              if (this.selectedPlace()?.id === place.id) this.selectedPlace.set(place);
              const selItem = this.selectedItem();
              if (selItem?.place?.id === place.id)
                this.selectedItem.update((curr) => (curr ? { ...curr, place } : null));
            },
          });
      },
    });
  }

  manageTripPlaces() {
    const modal: DynamicDialogRef = this.dialogService.open(TripPlaceSelectModalComponent, {
      header: 'Attached Places',
      modal: true,
      appendTo: 'body',
      closable: true,
      width: '50vw',
      data: {
        places: this.places(),
        usedPlaces: this.usedPlaceIds(),
      },
      breakpoints: {
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (places: Place[] | null) => {
        if (!places) return;

        this.apiService
          .putTrip({ place_ids: places.map((p) => p.id) }, this.trip()!.id)
          .pipe(take(1))
          .subscribe({
            next: (trip) => {
              this.trip.set(trip);
              if (this.selectedPlace() && !trip.places.some((p) => p.id == this.selectedPlace()!.id))
                this.selectedPlace.set(null);
            },
          });
      },
    });
  }

  editTrip() {
    const modal: DynamicDialogRef = this.dialogService.open(TripCreateModalComponent, {
      header: 'Update Trip',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '50vw',
      breakpoints: {
        '640px': '90vw',
      },
      data: { trip: this.trip() },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (new_trip: Trip | null) => {
        if (!new_trip) return;
        this.apiService
          .putTrip(new_trip, this.trip()!.id)
          .pipe(take(1))
          .subscribe((trip) => this.trip.set(trip));
      },
    });
  }

  deleteTrip() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Trip',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${this.trip()!.name}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (bool)
          this.apiService
            .deleteTrip(this.trip()!.id)
            .pipe(take(1))
            .subscribe({
              next: () => this.router.navigate(['/trips']),
            });
      },
    });
  }

  openPackingList() {
    this.apiService.getPackingList(this.trip()!.id).subscribe((items) => {
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
          {
            label: 'Quick Copy',
            icon: 'pi pi-copy',
            command: () => this.copyPackingListToService(),
          },
          {
            label: `Quick Paste (${this.utilsService.packingListToCopy.length})`,
            icon: 'pi pi-copy',
            command: () => this.pastePackingList(),
            disabled: this.trip()?.archived || !this.utilsService.packingListToCopy.length,
          },
        ],
      },
    ];
  }

  addPackingItem() {
    const modal: DynamicDialogRef = this.dialogService.open(TripCreatePackingModalComponent, {
      header: 'Add Packing',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (item: PackingItem | null) => {
        if (!item) return;

        this.apiService
          .postPackingItem(this.trip()!.id, item)
          .pipe(take(1))
          .subscribe({
            next: (item) => this.packingList.update((l) => [...l, item]),
          });
      },
    });
  }

  onCheckPackingItem(e: CheckboxChangeEvent, id: number) {
    this.apiService
      .putPackingItem(this.trip()!.id, id, { packed: e.checked })
      .pipe(take(1))
      .subscribe({
        next: (updated) => this.packingList.update((l) => l.map((i) => (i.id === id ? updated : i))),
      });
  }

  deletePackingItem(item: PackingItem) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Item',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${item.text.substring(0, 50)}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deletePackingItem(this.trip()!.id, item.id)
          .pipe(take(1))
          .subscribe({
            next: () => this.packingList.update((l) => l.filter((i) => i.id !== item.id)),
          });
      },
    });
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

  copyPackingListToService() {
    const content: Partial<PackingItem>[] = this.packingList().map((item) => ({
      qt: item.qt,
      text: item.text,
      category: item.category,
    }));
    this.utilsService.packingListToCopy = content;
    this.utilsService.toast(
      'success',
      'Ready to Paste',
      `${content.length} item${content.length > 1 ? 's' : ''}  copied. Go to another Trip and use Quick Paste`,
    );
  }

  pastePackingList() {
    const content: Partial<PackingItem>[] = this.utilsService.packingListToCopy;
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Confirm Paste',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Paste ${content.length} items?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;

        const obs$ = content.map((packingItem) =>
          this.apiService.postPackingItem(this.trip()!.id, packingItem as PackingItem),
        );

        forkJoin(obs$)
          .pipe(take(1))
          .subscribe({
            next: (newItems: PackingItem[]) => {
              this.packingList.update((l) => [...l, ...newItems]);
              this.utilsService.packingListToCopy = [];
              this.utilsService.toast('success', 'Success', 'Items pasted');
            },
          });
      },
    });
  }

  openChecklist() {
    this.apiService.getChecklist(this.trip()!.id).subscribe((items) => {
      this.checklistItems.set(items);
      this.isChecklistDialogVisible = !this.isChecklistDialogVisible;
    });
  }

  addChecklistItem() {
    const modal: DynamicDialogRef = this.dialogService.open(TripCreateChecklistModalComponent, {
      header: 'Add Checklist',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (item: ChecklistItem | null) => {
        if (!item) return;

        this.apiService
          .postChecklistItem(this.trip()!.id, item)
          .pipe(take(1))
          .subscribe({
            next: (created) => this.checklistItems.update((l) => [...l, created]),
          });
      },
    });
  }

  onCheckChecklistItem(e: CheckboxChangeEvent, id: number) {
    this.apiService
      .putChecklistItem(this.trip()!.id, id, { checked: e.checked })
      .pipe(take(1))
      .subscribe({
        next: (updated) => this.checklistItems.update((l) => l.map((i) => (i.id === id ? updated : i))),
      });
  }

  deleteChecklistItem(item: ChecklistItem) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Item',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${item.text.substring(0, 50)}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteChecklistItem(this.trip()!.id, item.id)
          .pipe(take(1))
          .subscribe({
            next: () => this.checklistItems.update((l) => l.filter((i) => i.id !== item.id)),
          });
      },
    });
  }

  openAttachmentsModal() {
    this.isAttachmentsDialogVisible = !this.isAttachmentsDialogVisible;
  }

  onFileUploadInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const formdata = new FormData();
    formdata.append('file', input.files[0]);

    this.apiService
      .postTripAttachment(this.trip()!.id, formdata)
      .pipe(take(1))
      .subscribe({
        next: (attachment) =>
          this.trip.update((t) => ({ ...t!, attachments: [...(t!.attachments || []), attachment] })),
      });
  }

  downloadAttachment(attachment: TripAttachment) {
    this.apiService
      .downloadTripAttachment(this.trip()!.id, attachment.id)
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

  deleteAttachment(attachmentId: number) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Attachment',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: 'Delete attachment? This cannot be undone.',
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;

        this.apiService
          .deleteTripAttachment(this.trip()!.id, attachmentId)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.trip.update((t) => {
                const attachments = t!.attachments?.filter((a) => a.id !== attachmentId);
                const days = t!.days.map((day) => ({
                  ...day,
                  items: day.items.map((item) => ({
                    ...item,
                    attachments: item.attachments?.filter((a) => a.id !== attachmentId),
                  })),
                }));
                return { ...t, attachments, days } as Trip;
              });

              if (this.selectedItem()?.attachments)
                this.selectedItem.update((curr) =>
                  curr ? { ...curr, attachments: curr.attachments?.filter((a) => a.id !== attachmentId) ?? [] } : null,
                );
            },
          });
      },
    });
  }

  openUnarchiveTripModal() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Restore Trip',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Restore ${this.trip()!.name}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .putTrip({ archived: false }, this.trip()!.id!)
          .pipe(take(1))
          .subscribe({
            next: (trip) => this.trip.set(trip),
          });
      },
    });
  }

  openArchiveTripModal() {
    const modal = this.dialogService.open(TripArchiveModalComponent, {
      header: `Archive ${this.trip()!.name}`,
      modal: true,
      closable: true,
      appendTo: 'body',
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: this.trip(),
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (review: string) => {
        if (review === undefined) return;
        this.apiService
          .putTrip({ archived: true, archival_review: review }, this.trip()!.id!)
          .pipe(take(1))
          .subscribe({
            next: (trip) => this.trip.set(trip),
          });
      },
    });
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

  getSharedTripURL() {
    this.apiService.getSharedTripURL(this.trip()!.id).pipe(take(1)).subscribe();
  }

  shareTrip() {
    this.apiService
      .createSharedTrip(this.trip()!.id)
      .pipe(take(1))
      .subscribe({
        next: (url) => {
          this.trip.update((t) => (t ? { ...t, shared: true } : null));
          this.tripSharedURL$ = of(url);
        },
      });
  }

  unshareTrip() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Disable Share',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Stop sharing ${this.trip()!.name}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteSharedTrip(this.trip()!.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.trip.update((t) => (t ? { ...t, shared: false } : null));
              this.isShareDialogVisible = !this.isShareDialogVisible;
            },
          });
      },
    });
  }

  openMembersDialog() {
    this.apiService
      .getTripMembers(this.trip()!.id)
      .pipe(take(1))
      .subscribe({
        next: (members) => {
          this.tripMembers.set(members);

          if (members.length > 1) {
            this.apiService.getTripBalance(this.trip()!.id).subscribe({
              next: (balances) =>
                this.tripMembers.update((current) => current.map((m) => ({ ...m, balance: balances[m.user] ?? 0 }))),
            });
          }
          this.isMembersDialogVisible = !this.isMembersDialogVisible;
        },
      });
  }

  addMember() {
    const modal: DynamicDialogRef = this.dialogService.open(TripInviteMemberModalComponent, {
      header: 'Invite member',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (user: string | null) => {
        if (!user) return;

        this.apiService
          .inviteTripMember(this.trip()!.id, user)
          .pipe(take(1))
          .subscribe({
            next: (member) => this.tripMembers.update((list) => [...list, member]),
          });
      },
    });
  }

  deleteMember(username: string) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Remove Member',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${username.substring(0, 50)} from Trip ?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteTripMember(this.trip()!.id, username)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.tripMembers.update((list) => list.filter((m) => m.user !== username));

              this.trip.update((t) => {
                if (!t) return null;
                const days = t.days.map((d) => ({
                  ...d,
                  items: d.items.map((i) => (i.paid_by === username ? { ...i, paid_by: undefined } : i)),
                }));
                return { ...t, days };
              });
            },
          });
      },
    });
  }

  openTripNotesModal() {
    const modal = this.dialogService.open(TripNotesModalComponent, {
      header: 'Notes',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '30vw',
      breakpoints: {
        '640px': '90vw',
      },
      data: this.trip(),
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (notes: string) => {
        if (notes === undefined) return;
        this.apiService
          .putTrip({ notes }, this.trip()!.id)
          .pipe(take(1))
          .subscribe({
            next: (trip) => this.trip.set(trip),
          });
      },
    });
  }

  bulkDeleteItems() {
    const items = this.selectedItems();
    if (!items.length) return;

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Plans',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: `Delete ${items.length} plan${items.length > 1 ? 's' : ''}? This cannot be undone.`,
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;

      const obs$ = items.map((item) => this.apiService.deleteTripDayItem(this.trip()!.id, item.day_id, item.id));
      forkJoin(obs$)
        .pipe(take(1))
        .subscribe({
          next: () => {
            const idsToDelete = new Set(items.map((i) => i.id));
            this.trip.update((current) => {
              if (!current) return null;
              const days = current.days.map((day) => ({
                ...day,
                items: day.items.filter((item) => !idsToDelete.has(item.id)),
              }));
              return { ...current, days };
            });
            this.toggleMultiSelectMode();
          },
        });
    });
  }

  bulkDuplicateItems() {
    const items = this.selectedItems();
    if (!items.length) return;

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Duplicate Plans',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: `Duplicate ${items.length} plan${items.length > 1 ? 's' : ''}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;
      const obs$ = items.map((item) => {
        const data: any = {
          ...item,
          status: item.status ? item.status.label : null,
          attachments: item.attachments ? item.attachments.map((a) => a.id) : [],
          place: item.place ? item.place.id : null,
        };
        return this.apiService.postTripDayItem(data, this.trip()!.id, item.day_id);
      });

      forkJoin(obs$)
        .pipe(take(1))
        .subscribe({
          next: (items: TripItem[]) => {
            this.trip.update((currentTrip) => {
              if (!currentTrip) return null;

              const newItemsByDay = items.reduce(
                (acc, item) => {
                  (acc[item.day_id] ??= []).push(item);
                  return acc;
                },
                {} as Record<number, TripItem[]>,
              );

              const updatedDays = currentTrip.days.map((day) =>
                newItemsByDay[day.id] ? { ...day, items: [...day.items, ...newItemsByDay[day.id]] } : day,
              );

              return { ...currentTrip, days: updatedDays };
            });
            this.toggleMultiSelectMode();
          },
        });
    });
  }

  bulkEditItems() {
    const items = this.selectedItems();
    if (!items.length) return;

    const modal = this.dialogService.open(TripBulkEditModalComponent, {
      header: `Edit ${items.length} Plan${items.length > 1 ? 's' : ''}`,
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: {
        trip: this.trip(),
        members: this.tripMembers(),
        statuses: this.utilsService.statuses,
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((editData) => {
      if (!editData) return;
      const obs$ = items.map((item) =>
        this.apiService.putTripDayItem({ ...editData }, this.trip()!.id, item.day_id, item.id),
      );
      forkJoin(obs$)
        .pipe(take(1))
        .subscribe({
          next: (updatedItems: TripItem[]) => {
            this.trip.update((currentTrip) => {
              if (!currentTrip) return null;
              const itemsById = Object.fromEntries(updatedItems.map((item) => [item.id, item]));
              const updatedDays = currentTrip.days.map((day) => ({
                ...day,
                items: [
                  ...day.items.filter((item) => !itemsById[item.id]),
                  ...updatedItems.filter((item) => item.day_id === day.id),
                ],
              }));

              return { ...currentTrip, days: updatedDays };
            });
            this.toggleMultiSelectMode();
            this.utilsService.toast('success', 'Success', `${updatedItems.length} items updated`);
          },
          error: (err) => {
            this.utilsService.toast('error', 'Error', 'Bulk edition failed, check console for details');
            console.error('Bulk edit failed:', err);
          },
        });
    });
  }

  dayRouting(day: TripDay) {
    const coords: [number, number][] = [];
    const markers: any[] = [];

    day.items.forEach((item) => {
      const lat = item.lat || item.place?.lat;
      const lng = item.lng || item.place?.lng;
      if (!lat || !lng) return;
      coords.push([lat, lng]);
      if (!item.place) markers.push(item);
    });

    if (coords.length < 2) {
      this.utilsService.toast('warn', 'Not enough values', 'Not enough values to route');
      return;
    }

    this.utilsService.setLoading(`Calculating routes (0/${coords.length - 1})...`);
    const routeSegments: Array<{ start: [number, number]; end: [number, number] }> = [];
    for (let i = 0; i < coords.length - 1; i++) {
      routeSegments.push({
        start: coords[i],
        end: coords[i + 1],
      });
    }

    const layerGroup = L.featureGroup();
    markers.forEach((item) => {
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

    this.tripMapAntLayer = layerGroup;
    requestAnimationFrame(() => {
      if (!this.tripMapAntLayer || !this.map) return;
      this.tripMapAntLayer.addTo(this.map);
    });

    let completedRoutes = 0;
    routeSegments.forEach((segment, index) => {
      const profile = this.routeManager.getProfile(segment.start, segment.end);
      this.apiService
        .completionRouting({
          coordinates: [
            { lat: segment.start[0], lng: segment.start[1] },
            { lat: segment.end[0], lng: segment.end[1] },
          ],
          profile,
        })
        .subscribe({
          next: (resp) => {
            completedRoutes++;
            this.utilsService.setLoading(
              completedRoutes === routeSegments.length
                ? ''
                : `Calculating routes (${completedRoutes}/${routeSegments.length})...`,
            );

            const layer = this.routeManager.addRoute({
              id: this.routeManager.createRouteId(segment.start, segment.end, profile),
              geometry: resp.geometry,
              distance: resp.distance ?? 0,
              duration: resp.duration ?? 0,
              profile,
            });

            const currentMap = this.map;
            if (currentMap) layer.addTo(currentMap);
          },
          error: (err) => {
            completedRoutes++;
            if (completedRoutes === routeSegments.length) this.utilsService.setLoading('');
            this.utilsService.toast('error', 'Routing error', 'Route computation failed');
            console.error(`Routing error for segment ${index + 1}:`, err);
          },
        });
    });
  }

  flyTo(latlng?: [number, number]) {
    const selected = this.selectedItem() || this.selectedPlace();
    if (!this.map || (!latlng && (!selected || !selected.lat || !selected.lng))) return;

    const lat: number = latlng ? latlng[0] : selected!.lat!;
    const lng: number = latlng ? latlng[1] : selected!.lng!;
    this.map.flyTo([lat, lng], this.map.getZoom() || 9, { duration: 2 });
  }

  markerRightClickFn(to: Place) {
    if (this.selectedItem() || this.selectedPlace()) return this.markerToMarkerRouting(to);
    return this.addItem(undefined, to.id);
  }

  markerToMarkerRouting(to: Place) {
    const from = this.selectedItem() || this.selectedPlace();
    if (!from || !from.lat || !from.lng) return;

    const profile = this.routeManager.getProfile([from.lat, from.lng], [to.lat, to.lng]);
    this.utilsService.setLoading('Calculating route...');
    this.apiService
      .completionRouting({
        coordinates: [
          { lng: from.lng, lat: from.lat },
          { lng: to.lng, lat: to.lat },
        ],
        profile,
      })
      .subscribe({
        next: (resp) => {
          this.utilsService.setLoading('');
          const layer = this.routeManager.addRoute({
            id: this.routeManager.createRouteId([from.lat!, from.lng!], [to.lat, to.lng], profile),
            geometry: resp.geometry,
            distance: resp.distance ?? 0,
            duration: resp.duration ?? 0,
            profile,
          });
          const currentMap = this.map;
          if (currentMap) layer.addTo(currentMap);
        },
        error: (err) => {
          this.utilsService.setLoading('');
          console.error('Routing error:', err);
        },
      });
  }
}
