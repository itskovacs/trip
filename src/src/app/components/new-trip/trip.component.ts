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
} from '@angular/core';
import { ApiService } from '../../services/api.service';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { FloatLabelModule } from 'primeng/floatlabel';
import * as L from 'leaflet';
import { antPath } from 'leaflet-ant-path';
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
} from '../../types/trip';
import { Place } from '../../types/poi';
import {
  createMap,
  placeToMarker,
  createClusterGroup,
  openNavigation,
  tripDayMarker,
  gpxToPolyline,
} from '../../shared/map';
import { ActivatedRoute, Router } from '@angular/router';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TripPlaceSelectModalComponent } from '../../modals/trip-place-select-modal/trip-place-select-modal.component';
import { TripCreateDayModalComponent } from '../../modals/trip-create-day-modal/trip-create-day-modal.component';
import { TripCreateDayItemModalComponent } from '../../modals/trip-create-day-item-modal/trip-create-day-item-modal.component';
import { debounceTime, distinctUntilChanged, forkJoin, Subject, switchMap, take } from 'rxjs';
import { YesNoModalComponent } from '../../modals/yes-no-modal/yes-no-modal.component';
import { UtilsService } from '../../services/utils.service';
import { TripCreateModalComponent } from '../../modals/trip-create-modal/trip-create-modal.component';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MenuItem } from 'primeng/api';
import { Menu, MenuModule } from 'primeng/menu';
import { LinkifyPipe } from '../../shared/linkify.pipe';
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
import { generateTripICSFile } from './ics';
import { generateTripCSVFile } from './csv';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileSizePipe } from '../../shared/filesize.pipe';
import { calculateDistanceBetween } from '../../shared/haversine';

interface ViewTripItem extends TripItem {
  status?: TripStatus;
  distance?: number;
}

interface DayViewModel {
  day: TripDay;
  items: ViewTripItem[];
  isVisible: boolean;
  stats: {
    count: number;
    cost: number;
    hasPlaces: boolean;
  };
}

const HIGHLIGHT_COLORS = [
  '#e6194b',
  '#3cb44b',
  '#ffe119',
  '#4363d8',
  '#9a6324',
  '#f58231',
  '#911eb4',
  '#46f0f0',
  '#f032e6',
  '#bcf60c',
  '#fabebe',
  '#008080',
  '#e6beff',
  '#808000',
];

@Component({
  selector: 'app-new-trip',
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trip.component.html',
  styleUrls: ['./trip.component.scss'],
})
export class NewTripComponent implements AfterViewInit, OnDestroy {
  private apiService = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialogService = inject(DialogService);
  private utilsService = inject(UtilsService);
  private clipboard = inject(Clipboard);

  @ViewChild('menuTripActions') menuTripActions!: Menu;
  plansSearchInput = new FormControl<string>('');

  trip = signal<Trip | null>(null);
  tripMembers = signal<TripMember[]>([]);

  private searchQuery = signal<string>('');
  isPlansPanelCollapsed = signal<boolean>(false);

  isFilteringMode = signal<boolean>(false);
  selectedItem = signal<ViewTripItem | null>(null);
  highlightedDayId = signal<number | null>(null);
  private selectedItemMarker: L.Marker | undefined;
  private highlightedMarkerElement: HTMLElement | undefined;

  packingList = signal<PackingItem[]>([]);
  private checklistItems = signal<ChecklistItem[]>([]);
  username: string;

  isPlacesPanelVisible = signal<boolean>(false);
  isDaysPanelVisible = signal<boolean>(false);
  isShareDialogVisible = false;
  isPackingDialogVisible = false;
  isMembersDialogVisible = false;
  isAttachmentsDialogVisible = false;
  isChecklistDialogVisible = false;
  isBetaDialogVisible = true;
  isPrinting = signal<boolean>(false);
  isArchivalReviewDisplayed = signal<boolean>(false);
  tripSharedURL$: Subject<string> = new Subject();
  showOnlyUnplannedPlaces = signal<boolean>(false);

  tripViewModel = computed<DayViewModel[]>(() => {
    const currentTrip = this.trip();
    if (!currentTrip) return [];

    const query = this.searchQuery().toLowerCase().trim();
    return currentTrip.days
      .map((day) => {
        const matches = day.items.filter((item) => {
          if (!query) return true;
          return (
            item.text?.toLowerCase().includes(query) ||
            item.place?.name.toLowerCase().includes(query) ||
            item.comment?.toLowerCase().includes(query)
          );
        });
        matches.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        let prevLat: number | null = null;
        let prevLng: number | null = null;

        const items = matches.map((item) => {
          const normalizedItem = this.normalizeItem(item);
          const lat = item.lat ?? item.place?.lat;
          const lng = item.lng ?? item.place?.lng;
          let distance: number | undefined;
          if (lat != null && lng != null) {
            if (prevLat != null && prevLng != null) {
              const calculatedDistance = calculateDistanceBetween(prevLat, prevLng, lat, lng);
              distance = Math.round(calculatedDistance * 10) / 10;
            }
            prevLat = lat;
            prevLng = lng;
          }
          return { ...normalizedItem, distance };
        });

        return {
          day,
          items,
          isVisible: !query || matches.length > 0,
          stats: {
            count: matches.length,
            cost: matches.reduce((sum, item) => sum + (item.price || 0), 0),
            hasPlaces: matches.some((i) => !!i.place),
          },
        };
      })
      .filter((vm) => vm.isVisible);
  });
  totalPrice = computed(() => this.tripViewModel().reduce((acc, vm) => acc + vm.stats.cost, 0));
  usedPlaceIds = computed<Set<number>>(() => {
    return new Set(
      this.tripViewModel()
        .flatMap((vm) => vm.items)
        .map((item) => item.place?.id)
        .filter((id): id is number => id != null),
    );
  });
  places = computed(() => this.trip()?.places || []);
  displayedPlaces = computed(() => {
    const allPlaces = this.places();
    const showUnplannedOnly = this.showOnlyUnplannedPlaces();
    if (!showUnplannedOnly) return allPlaces;
    const usedIds = this.usedPlaceIds();
    return allPlaces.filter((place) => !usedIds.has(place.id));
  });
  dispPackingList = computed(() => {
    const sorted = [...this.packingList()].sort((a, b) =>
      a.packed !== b.packed ? (a.packed ? 1 : -1) : a.text.localeCompare(b.text),
    );
    return sorted.reduce<Record<string, PackingItem[]>>((acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    }, {});
  });
  dispChecklist = computed(() =>
    [...this.checklistItems()].sort((a, b) => (a.checked !== b.checked ? (a.checked ? 1 : -1) : b.id - a.id)),
  );
  watchlistItems = computed<ViewTripItem[]>(() => {
    return this.tripViewModel()
      .flatMap((day) => day.items)
      .filter((item) => item.status && ['pending', 'constraint'].includes(item.status.label));
  });
  itemsToPasteCount = computed(() => this.utilsService.packingListToCopy.length);
  dispSelectedItem = computed<({ day: string } & ViewTripItem) | null>(() => {
    const selectedItem = this.selectedItem();
    if (!selectedItem) return null;
    const t = this.trip();
    const dayId = selectedItem.day_id;
    const dayLabel = dayId && t?.days?.length ? (t.days.find((d) => d.id === dayId)?.label ?? '') : '';
    return { ...selectedItem, day: dayLabel };
  });
  highlightLayerData = computed(() => {
    const dayId = this.highlightedDayId();
    const trip = this.trip();
    if (dayId === null || !trip) return null;

    const paths: { coords: [number, number][]; options: any }[] = [];
    const markers: any[] = [];
    const gpxData: string[] = [];
    const bounds: [number, number][] = [];
    const processItems = (items: any[], color: string, isSingleDay: boolean) => {
      const sortedItems = items
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
        .map((item) => {
          const lat = item.lat || item.place?.lat;
          const lng = item.lng || item.place?.lng;
          const isPlace = !!item.place;

          if (!lat || !lng) return undefined;
          if (!isPlace) markers.push(item);
          if (item.gpx) gpxData.push(item.gpx);
          bounds.push([lat, lng]);
          return { lat, lng };
        })
        .filter((n) => n !== undefined);

      const coords = sortedItems.map((i) => [i.lat, i.lng] as [number, number]);
      if (items.length > 2)
        paths.push({
          coords,
          options: {
            delay: isSingleDay ? 400 : 600,
            dashArray: [10, 20],
            weight: 5,
            color: color,
            pulseColor: '#FFFFFF',
            paused: false,
            reverse: false,
            hardwareAccelerated: true,
          },
        });
    };

    if (dayId === -1) {
      // -1 for all ady
      trip.days.forEach((day, idx) => {
        const color = HIGHLIGHT_COLORS[idx % HIGHLIGHT_COLORS.length];
        processItems([...day.items], color, false);
      });
    } else {
      const day = trip.days.find((d) => d.id === dayId);
      if (day) processItems([...day.items], '#0000FF', true);
    }
    return bounds.length >= 2 || paths.length > 0 ? { paths, markers, gpxData, bounds } : null;
  });

  readonly menuTripExportItems: MenuItem[] = [
    {
      label: 'Export',
      items: [
        {
          label: 'Calendar (.ics)',
          icon: 'pi pi-calendar',
          command: () => {
            generateTripICSFile(this.trip()!, this.utilsService);
          },
        },
        {
          label: 'CSV',
          icon: 'pi pi-file',
          command: () => {
            generateTripCSVFile(this.trip()!);
          },
        },
        {
          label: 'Pretty Print',
          icon: 'pi pi-print',
          command: () => {
            this.togglePrint();
          },
        },
      ],
    },
  ];
  menuTripActionsItems: MenuItem[] = [];
  menuTripPackingItems: MenuItem[] = [];
  statuses = this.utilsService.statuses;
  tooltipCopied = signal(false);
  onCoordsCopied() {
    this.tooltipCopied.set(true);
    setTimeout(() => this.tooltipCopied.set(false), 1200);
  }

  readonly availableItemProps: string[] = ['place', 'comment', 'latlng', 'price', 'status', 'distance'];
  selectedItemProps = signal<string[]>(['place', 'comment', 'price', 'status']);
  selectedItemPropsSet = computed<Set<string>>(() => new Set(this.selectedItemProps()));

  private map: L.Map | undefined;
  private markerClusterGroup: L.MarkerClusterGroup | undefined;
  private tripMapAntLayer: L.FeatureGroup | undefined;
  private markers: Map<number, L.Marker> = new Map();
  readonly menuTripDayActionsItems: MenuItem[] = [
    {
      label: 'Actions',
      items: [
        {
          label: 'Item',
          icon: 'pi pi-plus',
          iconClass: 'text-blue-500!',
          command: () => {
            this.addItem();
          },
        },
        {
          label: 'Edit',
          icon: 'pi pi-pencil',
          command: () => {
            if (!this.selectedTripDayForMenu) return;
            this.editDay(this.selectedTripDayForMenu);
          },
        },
        {
          label: 'Delete',
          icon: 'pi pi-trash',
          iconClass: 'text-red-500!',
          command: () => {
            if (!this.selectedTripDayForMenu) return;
            this.deleteDay(this.selectedTripDayForMenu);
          },
        },
      ],
    },
  ];
  selectedTripDayForMenu?: TripDay;

  constructor() {
    effect(() => {
      const vm = this.tripViewModel();
      if (this.map && this.trip()) this.updateMapVisualization(vm);
    });

    effect(() => {
      const data = this.highlightLayerData();
      if (this.tripMapAntLayer) {
        this.map?.removeLayer(this.tripMapAntLayer);
        this.tripMapAntLayer = undefined;
      }
      if (!data || !this.map) return;

      const layerGroup = L.featureGroup();
      data.paths.forEach((p) => layerGroup.addLayer(antPath(p.coords, p.options)));
      data.markers.forEach((item) => {
        const marker = tripDayMarker(item);
        marker.on('click', () => this.selectedItem.set(this.normalizeItem(item)));
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

    effect(() => {
      const item = this.selectedItem();
      this.clearSelectedItemHighlight();
      if (!item || !this.map) return;

      const lat = item.lat ?? item.place?.lat;
      const lng = item.lng ?? item.place?.lng;
      if (!lat || !lng) return;

      const existingMarker = this.markers.get(item.id);
      if (existingMarker) {
        this.highlightExistingMarker(existingMarker);
        return;
      }
      this.selectedItemMarker = tripDayMarker(item);
      this.selectedItemMarker.addTo(this.map);
    });

    this.username = this.utilsService.loggedUser;
    this.plansSearchInput.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.searchQuery.set(value || '');
      });
  }

  toLegacy() {
    this.router.navigate([`/trips/${this.trip()?.id}`]);
  }

  ngAfterViewInit(): void {
    this.route.paramMap.pipe(take(1)).subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.loadTripData(+id);
      } else {
        this.router.navigate(['/trips']);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
  }

  loadTripData(id: number): void {
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

  initMap(settings: Settings): void {
    if (this.map) this.map.remove();
    const contextMenuItems = [
      {
        text: 'Copy coordinates',
        callback: (e: any) => {
          const latlng = e.latlng;
          navigator.clipboard.writeText(`${parseFloat(latlng.lat).toFixed(5)}, ${parseFloat(latlng.lng).toFixed(5)}`);
        },
      },
    ];
    this.map = createMap(contextMenuItems, settings.tile_layer);
    this.markerClusterGroup = createClusterGroup().addTo(this.map);
    this.map.setView([settings.map_lat, settings.map_lng]);
    this.updateMapVisualization(this.tripViewModel());
  }

  updateMapVisualization(viewModels: DayViewModel[]) {
    if (!this.map || !this.markerClusterGroup) return;

    this.markerClusterGroup.clearLayers();
    this.markers.clear();

    if (this.tripMapAntLayer) {
      this.map.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayer = undefined;
    }

    const markersToAdd: L.Marker[] = [];
    const usedIds = this.usedPlaceIds();

    const allPlaces = this.places();

    allPlaces.forEach((place) => {
      const isUsed = usedIds.has(place.id);
      const grayscale = !isUsed;
      const marker = placeToMarker(place, false, grayscale);
      const itemUsingPlace = viewModels.flatMap((vm) => vm.items).find((item) => item.place?.id === place.id);

      if (itemUsingPlace) {
        marker.on('click', () => this.selectedItem.set(itemUsingPlace));
        this.markers.set(itemUsingPlace.id, marker);
      } else {
        marker.on('click', () => {
          this.selectedItem.set(null);
          this.utilsService.toast('info', 'Unplanned Place', `${place.name} is not used in plan`);
        });
      }
      markersToAdd.push(marker);
    });

    if (markersToAdd.length) {
      this.markerClusterGroup.addLayers(markersToAdd);
    }
    this.resetMapBounds();
  }

  resetMapBounds() {
    const allPlaces = this.places();

    if (!allPlaces.length) {
      if (!this.trip()?.days.length) return;
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
    let statusObj: TripStatus | undefined;
    if (typeof item.status === 'string') {
      statusObj = this.utilsService.statuses.find((s) => s.label === item.status);
    } else {
      statusObj = item.status as TripStatus;
    }
    return { ...item, status: statusObj };
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

  toggleTripDayHighlight(dayId: number) {
    this.highlightedDayId.update((current) => (current === dayId ? null : dayId));
  }

  toggleTripDaysHighlight() {
    this.highlightedDayId.update((current) => (current === -1 ? null : -1));
  }

  back() {
    this.router.navigate(['/trips']);
  }

  togglePrint() {
    this.isPrinting.update((v) => !v);
    setTimeout(() => {
      window.print();
      this.isPrinting.update((v) => !v);
    }, 100);
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

  toggleUnplannedPlacesFilter(): void {
    this.showOnlyUnplannedPlaces.update((v) => !v);
  }

  onRowClick(item: ViewTripItem) {
    if (this.selectedItem()?.id === item.id) {
      this.selectedItem.set(null);
      return;
    }
    this.selectedItem.set(item);
  }

  highlightExistingMarker(marker: L.Marker): void {
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

  clearSelectedItemHighlight(): void {
    if (this.selectedItemMarker) {
      this.map?.removeLayer(this.selectedItemMarker);
      this.selectedItemMarker = undefined;
    }

    if (this.highlightedMarkerElement) {
      this.highlightedMarkerElement.classList.remove('list-hover');
      this.highlightedMarkerElement = undefined;
    }
  }

  addItem(dayId?: number) {
    const modal = this.dialogService.open(TripCreateDayItemModalComponent, {
      header: 'Add Item',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      breakpoints: {
        '1260px': '90vw',
      },
      data: {
        trip: this.trip(),
        selectedDayId: dayId,
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
                  (acc[item.day_id] = acc[item.day_id] || []).push(item);
                  return acc;
                },
                {} as Record<number, TripItem[]>,
              );

              const updatedDays = currentTrip.days.map((day) => {
                if (newItemsByDay[day.id]) {
                  return {
                    ...day,
                    items: [...day.items, ...newItemsByDay[day.id]],
                  };
                }
                return day;
              });

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
        if (this.selectedItem()?.id === item.id) this.selectedItem.set(this.normalizeItem(newItem));
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
        this.selectedItem.set(null);
      });
    });
  }

  addDay() {
    const modal = this.dialogService.open(TripCreateDayModalComponent, {
      header: 'Add Day',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      data: { days: this.trip()!.days },
      breakpoints: {
        '640px': '80vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((newDay: TripDay | null) => {
      if (!newDay) return;
      this.apiService.postTripDay(newDay, this.trip()!.id).subscribe((newDay) => {
        this.trip.update((t) => {
          if (!t) return null;
          const days = [...t.days, newDay].sort((a, b) => (a.dt || '').localeCompare(b.dt || ''));
          return { ...t, days };
        });
      });
    });
  }

  editDay(day: TripDay) {
    const modal = this.dialogService.open(TripCreateDayModalComponent, {
      header: 'Edit Day',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
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
      });
    });
  }

  deleteDay(day: TripDay) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Day',
      modal: true,
      closable: true,
      dismissableMask: true,
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
      });
    });
  }

  addPlace() {
    const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Create Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      breakpoints: {
        '640px': '90vw',
      },
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
      breakpoints: {
        '640px': '90vw',
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

              const sel = this.selectedItem();
              if (sel?.place?.id === place.id) {
                this.selectedItem.update((curr) => (curr ? { ...curr, place: place } : null));
              }
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
            next: (trip) => this.trip.set(trip),
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
    if (!this.trip) return;
    this.apiService
      .deleteTripAttachment(this.trip()!.id, attachmentId)
      .pipe(take(1))
      .subscribe({
        next: () =>
          this.trip.update((t) => ({ ...t!, attachments: t!.attachments?.filter((a) => a.id !== attachmentId) })),
      });
  }

  toggleArchiveTrip() {
    if (this.trip()!.archived) this.openUnarchiveTripModal();
    else this.openArchiveTripModal();
  }

  toggleArchiveReview() {
    this.isArchivalReviewDisplayed.update((v) => !v);
  }

  openUnarchiveTripModal() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Restore Trip',
      modal: true,
      closable: true,
      dismissableMask: true,
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
    if (!this.selectedItem() || !this.selectedItem()!.gpx) return;
    const dataBlob = new Blob([this.selectedItem()!.gpx as string]);
    const downloadURL = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = downloadURL;
    link.download = `TRIP_${this.trip()!.name}_${this.selectedItem()!.text}.gpx`;
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadURL);
  }

  itemToNavigation() {
    const selectedItem = this.selectedItem();
    if (!selectedItem || !selectedItem.lat || !selectedItem.lng) return;
    openNavigation([{ lat: selectedItem.lat, lng: selectedItem.lng }]);
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
          this.tripSharedURL$.next(url);
        },
      });
  }

  unshareTrip() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Disable Share',
      modal: true,
      closable: true,
      dismissableMask: true,
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
}
