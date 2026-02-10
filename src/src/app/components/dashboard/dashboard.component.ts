import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  catchError,
  combineLatest,
  concatMap,
  debounceTime,
  delay,
  distinctUntilChanged,
  forkJoin,
  from,
  interval,
  map,
  of,
  take,
  takeWhile,
  tap,
  toArray,
} from 'rxjs';
import { Place, Category, ProviderBoundaries } from '../../types/poi';
import { ProviderPlaceResult } from '../../types/provider';
import { ApiService } from '../../services/api.service';
import { PlaceBoxComponent } from '../../shared/place-box/place-box.component';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet-contextmenu';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { PlaceCreateModalComponent } from '../../modals/place-create-modal/place-create-modal.component';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TabsModule } from 'primeng/tabs';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { FloatLabelModule } from 'primeng/floatlabel';
import { UtilsService } from '../../services/utils.service';
import { Info } from '../../types/info';
import {
  createMap,
  placeToMarker,
  createClusterGroup,
  gpxToPolyline,
  isPointInBounds,
  placeToDotMarker,
  openNavigation,
  toDotMarker,
  getGeolocationLatLng,
} from '../../shared/map';
import { ActivatedRoute, Router } from '@angular/router';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TooltipModule } from 'primeng/tooltip';
import { Backup, Settings } from '../../types/settings';
import { MenuItem, SelectItemGroup } from 'primeng/api';
import { YesNoModalComponent } from '../../modals/yes-no-modal/yes-no-modal.component';
import { CategoryCreateModalComponent } from '../../modals/category-create-modal/category-create-modal.component';
import { AuthService } from '../../services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { PlaceGPXComponent } from '../../shared/place-gpx/place-gpx.component';
import { CommonModule, Location } from '@angular/common';
import { FileSizePipe } from '../../shared/pipes/filesize.pipe';
import { TotpVerifyModalComponent } from '../../modals/totp-verify-modal/totp-verify-modal.component';
import { MenuModule } from 'primeng/menu';
import { MultiPlacesCreateModalComponent } from '../../modals/multi-places-create-modal/multi-places-create-modal.component';
import { ProviderMultilineCreateModalComponent } from '../../modals/provider-multiline-create-modal/provider-multiline-create-modal.component';
import { UpdatePasswordModalComponent } from '../../modals/update-password-modal/update-password-modal.component';
import { SettingsViewTokenComponent } from '../../modals/settings-view-token/settings-view-token.component';
import { Trip } from '../../types/trip';
import { PlaceListItemComponent } from '../../shared/place-list-item/place-list-item.component';
import { PopoverModule } from 'primeng/popover';
import { RouteManagerService } from '../../services/route-manager.service';

export interface ContextMenuItem {
  text: string;
  index?: number;
  icon?: string;
  callback?: any;
}
export interface MapOptions extends L.MapOptions {
  contextmenu: boolean;
  contextmenuItems: ContextMenuItem[];
}
export interface MarkerOptions extends L.MarkerOptions {
  contextmenu: boolean;
  contextmenuItems: ContextMenuItem[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    PlaceBoxComponent,
    PlaceGPXComponent,
    FormsModule,
    SkeletonModule,
    ToggleSwitchModule,
    MultiSelectModule,
    ReactiveFormsModule,
    InputTextModule,
    TooltipModule,
    FloatLabelModule,
    SelectModule,
    TabsModule,
    ButtonModule,
    CommonModule,
    FileSizePipe,
    MenuModule,
    PlaceListItemComponent,
    PopoverModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, AfterViewInit {
  fileUploadTakeout = viewChild<ElementRef>('fileUploadTakeout');
  fileUploadKmz = viewChild<ElementRef>('fileUploadKmz');

  apiService: ApiService;
  authService: AuthService;
  utilsService: UtilsService;
  dialogService: DialogService;
  router: Router;
  fb: FormBuilder;
  location: Location;
  activatedRoute: ActivatedRoute;
  routeManager: RouteManagerService;

  info = signal<Info | null>(null);
  places = signal<Place[]>([]);
  categories = signal<Category[]>([]);
  selectedPlaceId = signal<number | null>(null);
  selectedPlaceGPX = signal<Place | null>(null);
  settings = signal<Settings | null>(null);
  backups = signal<Backup[]>([]);
  mapBounds = signal<L.LatLngBounds | null>(null);

  viewSettings = signal(false);
  mapParamsExpanded = signal(false);
  displaySettingsExpanded = signal(false);
  dataFiltersExpanded = signal(false);
  accountSecurityExpanded = signal(false);
  accountIntegrationsExpanded = signal(false);
  viewFilters = signal(false);
  viewPlacesList = signal(false);
  viewPlacesListFiltering = signal(false);
  hideOutOfBoundsPlaces = signal(false);
  tabsIndex = 0;
  refreshBackups = signal(false);
  activeCategories = signal<Set<string>>(new Set());
  loadingMessage = signal<string | null>(null);

  isLowNetMode = signal(false);
  isGPXInPlaceMode = signal(false);
  isVisitedMode = signal(false);
  isMapPositionMode = signal(false);
  filter_display_visited = signal(false);
  filter_display_favorite_only = signal(false);
  filter_display_restroom = signal(false);
  filter_dog_only = signal(false);
  boundariesFiltering = signal<ProviderBoundaries | null>(null);
  hoveredElement = signal<HTMLElement | null>(null);
  providers: { disp: string; value: string }[] = [
    { disp: 'OpenStreetMap API', value: 'osm' },
    { disp: 'Google API', value: 'google' },
  ];
  geocodeFilterInput = new FormControl('');
  searchInput = new FormControl('');
  settingsForm: FormGroup;
  searchValue = toSignal(
    this.searchInput.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      map((v) => (v || '').toLowerCase()),
    ),
    { initialValue: '' },
  );

  map?: L.Map;
  markerClusterGroup?: L.MarkerClusterGroup;
  gpxLayerGroup?: L.LayerGroup;

  selectedPlace = computed(() => {
    const id = this.selectedPlaceId();
    return this.places().find((p) => p.id === id) || null;
  });
  filteredPlaces = computed(() => {
    const places = this.places();
    const activeCategories = this.activeCategories();
    const isVisitedMode = this.isVisitedMode();
    const filters = {
      visited: this.filter_display_visited(),
      favorite: this.filter_display_favorite_only(),
      restroom: this.filter_display_restroom(),
      dog: this.filter_dog_only(),
    };

    return places.filter(
      (p) =>
        (filters.visited || isVisitedMode || !p.visited) &&
        (!filters.favorite || p.favorite) &&
        (!filters.restroom || p.restroom) &&
        (!filters.dog || p.allowdog) &&
        activeCategories.has(p.category.name),
    );
  });
  mapDisplayPlaces = computed(() => {
    const places = this.filteredPlaces();
    const search = this.searchValue();
    const bounds = this.mapBounds();
    const hideOutOfBounds = this.hideOutOfBoundsPlaces();
    const geoFilter = this.boundariesFiltering();

    return places.filter((p) => {
      if (geoFilter && !isPointInBounds(p.lat, p.lng, geoFilter)) return false;
      if (hideOutOfBounds && bounds && !bounds.contains({ lat: p.lat, lng: p.lng })) return false;
      if (!search) return true;
      return p.name.toLowerCase().includes(search) || p.description?.toLowerCase().includes(search);
    });
  });
  visiblePlaces = computed(() => {
    if (!this.viewPlacesList()) return [];
    return [...this.mapDisplayPlaces()].sort((a, b) => this.collator.compare(a.name, b.name));
  });
  doNotDisplayOptions = computed<SelectItemGroup[]>(() => [
    {
      label: 'Categories',
      items: this.categories().map((c) => ({ label: c.name, value: c.name })),
    },
  ]);
  collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  menuCreatePlaceItems: MenuItem[] = [
    {
      label: 'Provider',
      items: [
        {
          label: 'Google KMZ (My Maps)',
          icon: 'pi pi-google',
          command: () => {
            if (!this.settings()?.google_apikey) {
              this.utilsService.toast('error', 'Missing Key', 'Google Maps API key not configured');
              return;
            }
            this.fileUploadKmz()?.nativeElement.click();
          },
        },
        {
          label: 'Google Takeout (Saved)',
          icon: 'pi pi-google',
          command: () => {
            if (!this.settings()?.google_apikey) {
              this.utilsService.toast('error', 'Missing Key', 'Google Maps API key not configured');
              return;
            }
            this.fileUploadTakeout()?.nativeElement.click();
          },
        },
        {
          label: 'Bulk',
          icon: 'pi pi-list',
          command: () => this.openProviderMultilineModal(),
        },
      ],
    },
  ];

  constructor() {
    this.apiService = inject(ApiService);
    this.authService = inject(AuthService);
    this.utilsService = inject(UtilsService);
    this.dialogService = inject(DialogService);
    this.router = inject(Router);
    this.fb = inject(FormBuilder);
    this.location = inject(Location);
    this.activatedRoute = inject(ActivatedRoute);
    this.routeManager = inject(RouteManagerService);

    this.settingsForm = this.fb.group({
      map_lat: [
        '',
        {
          validators: [Validators.required, Validators.pattern('-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)')],
        },
      ],
      map_lng: [
        '',
        {
          validators: [
            Validators.required,
            Validators.pattern('-?(180(\\.0+)?|1[0-7]\\d(\\.\\d+)?|[1-9]?\\d(\\.\\d+)?)'),
          ],
        },
      ],
      currency: ['', Validators.required],
      do_not_display: [],
      tile_layer: ['', Validators.required],
      _google_apikey: [null, { validators: [Validators.pattern('AIza[0-9A-Za-z\\-_]{35}')] }],
      map_provider: [],
      duplicate_dist: [null, { validators: [Validators.min(0)] }],
    });

    effect(() => {
      const placesToDisplay = this.mapDisplayPlaces();
      // triggers
      const isVisitedMode = this.isVisitedMode();
      const isVisitedFilter = this.filter_display_visited();
      const isLowNetMode = this.isLowNetMode();
      const isGPXInPlaceMode = this.isGPXInPlaceMode();

      untracked(() => {
        if (!this.map || !this.markerClusterGroup) return;
        this.diffAndRenderMarkers(placesToDisplay);
      });
    });
  }

  ngOnInit(): void {
    this.apiService
      .getInfo()
      .pipe(take(1))
      .subscribe({
        next: (info) => this.info.set(info),
      });
  }

  ngAfterViewInit(): void {
    combineLatest({
      categories: this.apiService.getCategories(),
      places: this.apiService.getPlaces(),
      settings: this.apiService.getSettings(),
    })
      .pipe(
        take(1),
        tap(({ categories, places, settings }) => {
          this.settings.set(settings);
          this.isLowNetMode.set(!!settings.mode_low_network);
          this.isGPXInPlaceMode.set(!!settings.mode_gpx_in_place);
          this.isVisitedMode.set(!!settings.mode_display_visited);
          this.isMapPositionMode.set(!!settings.mode_map_position);
          this.utilsService.toggleDarkMode(!!settings.mode_dark);

          this.categories.set(this.sortCategoriesArray(categories));
          this.initMap();
          this.places.set(places);
          this.resetFilters();
        }),
      )
      .subscribe();
  }

  initMap(): void {
    const settings = this.settings();
    if (!settings) return;

    const isTouch = 'ontouchstart' in window;
    const contentMenuItems = [
      {
        text: 'Add Point of Interest',
        callback: (e: any) => {
          this.addPlaceModal(e);
        },
      },
      {
        text: 'Find nearby places (Google API)',
        callback: (e: any) => {
          this.googleNearbyPlaces(e);
        },
      },
    ];
    this.map = createMap(isTouch ? [] : contentMenuItems, settings.tile_layer);
    if (isTouch) this.map.on('contextmenu', (e: any) => this.addPlaceModal(e));

    const mapPosition = this.getMapPosition();
    this.map.setView(L.latLng(mapPosition.lat, mapPosition.lng), mapPosition.zoom);

    this.map.on('moveend zoomend', () => {
      this.mapBounds.set(this.map!.getBounds());
      if (this.isMapPositionMode()) this.updateUrlWithMapPosition();
    });
    this.mapBounds.set(this.map.getBounds());
    this.markerClusterGroup = createClusterGroup().addTo(this.map);
  }

  diffAndRenderMarkers(newPlaces: Place[]) {
    const group = this.markerClusterGroup!;
    const currentLayers = group.getLayers() as any[];

    const isLowNet = this.isLowNetMode();
    const isGpxMode = this.isGPXInPlaceMode();

    const shouldBeDot = (p: Place) => p.visited && this.isVisitedMode() && !this.filter_display_visited();

    const newPlacesMap = new Map(newPlaces.map((p) => [p.id, p]));
    const toRemove = currentLayers.filter((layer) => {
      const p = newPlacesMap.get(layer.options.placeId);
      if (!p) return true;
      const targetIsDot = shouldBeDot(p);
      const currentIsDot = layer.options.isDot;
      if (targetIsDot !== currentIsDot) return true;
      if (!targetIsDot) {
        if (layer.options.createdLowNet !== isLowNet) return true;
        if (layer.options.createdGpxMode !== isGpxMode) return true;
        if (layer.options.imageId !== p.image_id) return true;
        if (
          layer.options.category.color !== p.category.color ||
          layer.options.category.image_id !== p.category.image_id
        )
          return true;
      }
      return false;
    });
    if (toRemove.length > 0) group.removeLayers(toRemove);

    const existingIds = new Set(group.getLayers().map((l: any) => l.options.placeId));
    const toAdd = newPlaces
      .filter((p) => !existingIds.has(p.id))
      .map((p) => {
        const isSupposedToBeDot = shouldBeDot(p);
        const marker = isSupposedToBeDot ? this.createDotMarker(p) : this.createPlaceMarker(p);
        Object.assign(marker.options, {
          placeId: p.id,
          isDot: isSupposedToBeDot,
          createdLowNet: isLowNet,
          createdGpxMode: isGpxMode,
          category: p.category,
          imageId: p.image_id,
        });
        return marker;
      });

    if (toAdd.length > 0) group.addLayers(toAdd);
  }

  getMapPosition(): { lat: number; lng: number; zoom: number } {
    const queryParams = this.activatedRoute.snapshot.queryParams;
    const settings = this.settings()!;
    const isMapPosMode = this.isMapPositionMode();

    const lat = isMapPosMode && queryParams['lat'] ? parseFloat(queryParams['lat']) : settings.map_lat;
    const lng = isMapPosMode && queryParams['lng'] ? parseFloat(queryParams['lng']) : settings.map_lng;
    const zoom = isMapPosMode && queryParams['z'] ? parseInt(queryParams['z'], 10) : this.map?.getZoom() || 13;
    return { lat, lng, zoom };
  }

  updateUrlWithMapPosition(): void {
    if (!this.map) return;
    const center = this.map.getCenter();
    const lat = center.lat.toFixed(4);
    const lng = center.lng.toFixed(4);
    const zoom = this.map.getZoom();
    const queryString = `lat=${lat}&lng=${lng}&z=${zoom}`;
    const path = this.location.path().split('?')[0];
    this.location.replaceState(path, queryString);
  }

  resetFilters() {
    this.filter_display_visited.set(false);
    this.filter_dog_only.set(false);
    this.filter_display_favorite_only.set(false);
    this.filter_display_restroom.set(false);

    const categoryNames = new Set(this.categories().map((c) => c.name));
    this.settings()?.do_not_display.forEach((c) => categoryNames.delete(c));
    this.activeCategories.set(categoryNames);
  }

  updateActiveCategories(c: string) {
    this.activeCategories.update((current) => {
      const updated = new Set(current);
      if (updated.has(c)) updated.delete(c);
      else updated.add(c);
      return updated;
    });
  }

  selectAllCategories() {
    this.activeCategories.set(new Set(this.categories().map((c) => c.name)));
  }

  deselectAllCategories() {
    this.activeCategories.set(new Set());
  }

  createDotMarker(place: Place): L.Marker {
    const marker = placeToDotMarker(place);
    this.addEventsToMarker(marker, place);
    return marker;
  }

  createPlaceMarker(place: Place): L.Marker {
    const marker = placeToMarker(place, this.isLowNetMode(), place.visited, this.isGPXInPlaceMode(), () =>
      this.markerToMarkerRouting(place),
    );
    this.addEventsToMarker(marker, place);
    return marker;
  }

  addEventsToMarker(marker: L.Marker, place: Place) {
    marker
      .on('click', (e) => {
        this.selectedPlaceId.set(place.id);

        let toView = { ...e.latlng };
        if ('ontouchstart' in window) {
          const pixelPoint = this.map!.latLngToContainerPoint(e.latlng);
          pixelPoint.y += 75;
          toView = this.map!.containerPointToLatLng(pixelPoint);
        }

        marker.closeTooltip();
        this.map?.setView(toView);
      })
      .on('contextmenu', () => {
        if (this.map && (this.map as any).contextmenu) (this.map as any).contextmenu.hide();
      });
  }

  addPlaceModal(e?: any): void {
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

        const duplicate = this.checkDuplicatePlace(place);
        if (duplicate) {
          const confirmModal = this.dialogService.open(YesNoModalComponent, {
            header: 'Possible duplicate',
            modal: true,
            closable: true,
            dismissableMask: true,
            draggable: false,
            resizable: false,
            width: '40vw',
            breakpoints: {
              '960px': '75vw',
              '640px': '90vw',
            },
            data: `A possible duplicate place (${duplicate.name}) exists. Create anyway?`,
          })!;

          confirmModal.onClose.pipe(take(1)).subscribe({
            next: (confirmed: boolean) => {
              if (confirmed) this.createPlace(place);
            },
          });
        } else this.createPlace(place);
      },
    });
  }

  createPlace(place: Place) {
    this.apiService
      .postPlace(place)
      .pipe(take(1))
      .subscribe({
        next: (newPlace: Place) => {
          this.places.update((places) => {
            const updated = [...places, newPlace];
            updated.sort((a, b) => this.collator.compare(a.name, b.name));
            return updated;
          });
        },
      });
  }

  resetHoverPlace() {
    if (!this.hoveredElement()) return;
    this.hoveredElement()?.classList.remove('list-hover');
    this.hoveredElement.set(null);
  }

  hoverPlace(p: Place) {
    let marker: L.Marker | undefined;
    this.markerClusterGroup?.eachLayer((layer: any) => {
      if (layer.getLatLng && layer.getLatLng().equals([p.lat, p.lng])) marker = layer;
    });

    if (!marker) return;
    const markerElement = marker.getElement() as HTMLElement; // search for Marker. If 'null', is inside Cluster

    if (markerElement) {
      // marker, not clustered
      markerElement.classList.add('list-hover');
      this.hoveredElement.set(markerElement);
    } else {
      // marker is clustered
      const parentCluster = (this.markerClusterGroup as any).getVisibleParent(marker);
      if (parentCluster) {
        const clusterEl = parentCluster.getElement();
        if (clusterEl) {
          clusterEl.classList.add('list-hover');
          this.hoveredElement.set(clusterEl);
        }
      }
    }
  }

  favoritePlace() {
    const selected = this.selectedPlace();
    if (!selected) return;

    const favoriteBool = !selected.favorite;
    this.apiService
      .putPlace(selected.id, { favorite: favoriteBool })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.updatePlaceInList(selected.id, { favorite: favoriteBool });
        },
      });
  }

  visitPlace() {
    const selected = this.selectedPlace();
    if (!selected) return;

    const visitedBool = !selected.visited;
    this.apiService
      .putPlace(selected.id, { visited: visitedBool })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.updatePlaceInList(selected.id, { visited: visitedBool });
        },
      });
  }

  updatePlaceInList(id: number, updates: Partial<Place>): void {
    this.places.update((places) => places.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }

  deletePlace() {
    const selected = this.selectedPlace();
    if (!selected) return;

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Confirm deletion',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
      data: `Delete ${selected.name} ?`,
    })!;

    modal.onClose.subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deletePlace(selected.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.places.update((places) => places.filter((p) => p.id !== selected.id));
              this.closePlaceBox();
            },
          });
      },
    });
  }

  editPlace(p?: Place) {
    const selected = this.selectedPlace();
    const target = selected || p;
    if (!target) return;
    const _placeToEdit: Place = { ...target };

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
        place: {
          ..._placeToEdit,
          category: _placeToEdit.category.id,
        },
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (place: Place | null) => {
        if (!place) return;

        this.apiService
          .putPlace(place.id, place)
          .pipe(take(1))
          .subscribe({
            next: (updatedPlace: Place) => {
              this.places.update((places) => {
                const updated = places.map((p) => (p.id === updatedPlace.id ? updatedPlace : p));
                updated.sort((a, b) => this.collator.compare(a.name, b.name));
                return updated;
              });
            },
          });
      },
    });
  }

  displayGPXOnMap(gpx: string) {
    const selected = this.selectedPlace();
    if (!this.map || !selected) return;

    if (!this.gpxLayerGroup) {
      this.gpxLayerGroup = L.layerGroup().addTo(this.map);
    }
    this.gpxLayerGroup.clearLayers();

    try {
      const gpxPolyline = gpxToPolyline(gpx);
      const selectedPlaceWithGPX = { ...selected, gpx };

      gpxPolyline.on('click', () => {
        this.selectedPlaceGPX.set(selectedPlaceWithGPX);
      });
      this.gpxLayerGroup?.addLayer(gpxPolyline);
      this.map.fitBounds(gpxPolyline.getBounds(), { padding: [20, 20] });
    } catch {
      this.utilsService.toast('error', 'Error', "Couldn't parse GPX data");
    }
    this.closePlaceBox();
  }

  getPlaceGPX() {
    const selected = this.selectedPlace();
    if (!selected) return;

    this.apiService
      .getPlaceGPX(selected.id)
      .pipe(take(1))
      .subscribe({
        next: (p) => {
          if (!p.gpx) {
            this.utilsService.toast('error', 'Error', "Couldn't retrieve GPX data");
            return;
          }
          this.displayGPXOnMap(p.gpx);
        },
      });
  }

  toggleSettings() {
    const state = !this.viewSettings();
    this.viewSettings.set(state);
    if (!state || !this.settings()) return;

    this.apiService
      .getBackups()
      .pipe(take(1))
      .subscribe({
        next: (backups) => this.backups.set(backups),
      });

    this.tabsIndex = 0;
    this.settingsForm.reset(this.settings());
    this.mapParamsExpanded.set(false);
    this.dataFiltersExpanded.set(false);
    this.displaySettingsExpanded.set(false);
  }

  toggleFilters() {
    this.viewFilters.update((v) => !v);
  }

  togglePlacesList() {
    this.viewPlacesList.update((v) => !v);
    this.hideOutOfBoundsPlaces.set(false);
    this.viewPlacesListFiltering.set(false);
    this.searchInput.setValue('');
    this.resetGeocodeFilters();
  }

  togglePlacesListFiltering() {
    this.viewPlacesListFiltering.update((v) => !v);
    if (!this.viewPlacesListFiltering()) {
      this.searchInput.setValue('');
      this.resetGeocodeFilters();
    }
  }

  setMapCenterToCurrent() {
    const latlng = this.map?.getCenter();
    if (!latlng) return;
    this.settingsForm.patchValue({ map_lat: latlng.lat, map_lng: latlng.lng });
    this.settingsForm.markAsDirty();
  }

  importData(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const formdata = new FormData();
    formdata.append('file', input.files[0]);

    this.utilsService.setLoading('Ingesting your backup...');
    this.apiService
      .settingsUserImport(formdata)
      .pipe(take(1))
      .subscribe({
        next: (resp) => {
          this.places.update((places) => {
            const updated = [...places, ...resp.places];
            updated.sort((a, b) => this.collator.compare(a.name, b.name));
            return updated;
          });

          const sortedCategories = this.sortCategoriesArray(resp.categories);
          this.categories.set(sortedCategories);
          this.activeCategories.set(new Set(sortedCategories.map((c) => c.name)));

          this.settings.set(resp.settings);
          this.isLowNetMode.set(!!resp.settings.mode_low_network);
          this.isGPXInPlaceMode.set(!!resp.settings.mode_gpx_in_place);
          this.isVisitedMode.set(!!resp.settings.mode_display_visited);
          this.isMapPositionMode.set(!!resp.settings.mode_map_position);
          this.utilsService.toggleDarkMode(!!resp.settings.mode_dark);
          this.resetFilters();

          this.map?.remove();
          this.initMap();
          this.viewSettings.set(false);
          this.utilsService.setLoading('');
        },
        error: () => this.utilsService.setLoading(''),
      });
  }

  getBackups() {
    this.apiService
      .getBackups()
      .pipe(take(1))
      .subscribe({
        next: (backups) => {
          this.backups.set(backups);
          this.refreshBackups.set(backups.some((b) => b.status === 'pending' || b.status === 'processing'));
        },
      });
  }

  createBackup() {
    this.apiService
      .createBackup()
      .pipe(take(1))
      .subscribe((backup) => {
        this.backups.update((backups) => [...backups, backup]);
      });

    this.refreshBackups.set(true);
    interval(1000)
      .pipe(takeWhile(() => this.refreshBackups()))
      .subscribe(() => {
        this.getBackups();
      });
  }

  downloadBackup(backup: Backup) {
    this.apiService
      .downloadBackup(backup.id)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          const blob = new Blob([data], { type: 'application/zip' });
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.download = backup.filename!;
          anchor.href = url;

          document.body.appendChild(anchor);
          anchor.click();

          document.body.removeChild(anchor);
          window.URL.revokeObjectURL(url);
        },
      });
  }

  deleteBackup(backup: Backup) {
    this.apiService
      .deleteBackup(backup.id)
      .pipe(take(1))
      .subscribe({
        next: () => this.backups.set(this.backups().filter((b) => b.id !== backup.id)),
      });
  }

  updateSettings() {
    const data = { ...this.settingsForm.value };
    delete data['_google_apikey'];
    if (!this.settingsForm.get('duplicate_dist')?.value) data['duplicate_dist'] = 0;
    if (!this.settings()?.google_apikey && this.settingsForm.get('_google_apikey')?.value) {
      data['google_apikey'] = this.settingsForm.get('_google_apikey')?.value;
    }

    this.apiService
      .putSettings(data)
      .pipe(take(1))
      .subscribe({
        next: (settings) => {
          const refreshMap = this.settings()?.tile_layer !== settings.tile_layer;
          this.settings.set(settings);

          if (refreshMap) {
            this.map?.remove();
            this.initMap();
          }
          this.resetFilters();
          this.utilsService.toast('success', 'Success', 'Preferences saved');
          this.settingsForm.reset(settings);
          this.settingsForm.markAsPristine();
        },
      });
  }

  editCategory(c: Category) {
    const modal: DynamicDialogRef = this.dialogService.open(CategoryCreateModalComponent, {
      header: 'Update Category',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: { category: c },
      width: '30vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (category: Category | null) => {
        if (!category) return;

        this.apiService
          .putCategory(c.id, category)
          .pipe(take(1))
          .subscribe({
            next: (updated) => {
              this.categories.update((categories) => {
                const updatedCategories = categories.map((cat) => (cat.id === updated.id ? updated : cat));
                return this.sortCategoriesArray(updatedCategories);
              });

              this.activeCategories.set(new Set(this.categories().map((c) => c.name)));

              this.places.update((places) =>
                places.map((p) => (p.category.id === updated.id ? { ...p, category: updated } : p)),
              );
            },
          });
      },
    });
  }

  addCategory() {
    const modal: DynamicDialogRef = this.dialogService.open(CategoryCreateModalComponent, {
      header: 'Create Category',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '30vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (category: Category | null) => {
        if (!category) return;

        this.apiService
          .postCategory(category)
          .pipe(take(1))
          .subscribe({
            next: (newCategory: Category) => {
              this.categories.update((categories) => {
                const updated = [...categories, newCategory];
                updated.sort((a, b) => this.collator.compare(a.name, b.name));
                return updated;
              });
              this.activeCategories.update((cats) => new Set([...cats, newCategory.name]));
            },
          });
      },
    });
  }

  deleteCategory(c_id: number) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Confirm deletion',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: 'Delete this category ?',
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;

        this.apiService
          .deleteCategory(c_id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.categories.update((categories) => categories.filter((c) => c.id !== c_id));
              this.activeCategories.set(new Set(this.categories().map((c) => c.name)));
            },
          });
      },
    });
  }

  togglePlaceSelection(p: Place) {
    const current = this.selectedPlace();
    if (current && current.id === p.id) {
      this.selectedPlaceId.set(null);
      return;
    }
    this.selectedPlaceId.set(p.id);
  }

  sortCategoriesArray(categories: Category[]): Category[] {
    return [...categories].sort((a, b) => this.collator.compare(a.name, b.name));
  }

  navigateToTrips() {
    this.router.navigateByUrl('/trips');
  }

  logout() {
    this.authService.logout();
  }

  closePlaceBox() {
    this.selectedPlaceId.set(null);
  }

  closePlaceGPX() {
    this.selectedPlaceGPX.set(null);
  }

  downloadPlaceGPX() {
    const selected = this.selectedPlaceGPX();
    if (!selected?.gpx) return;

    const dataBlob = new Blob([selected.gpx]);
    const downloadURL = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = downloadURL;
    link.download = `TRIP_${this.selectedPlaceGPX.name}.gpx`;
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadURL);
  }

  removePlaceGPX() {
    if (!this.gpxLayerGroup) return;
    this.gpxLayerGroup.clearLayers();
    this.closePlaceGPX();
  }

  toGithub() {
    this.utilsService.toGithubTRIP();
  }

  checkUpdate() {
    this.apiService
      .checkVersion()
      .pipe(take(1))
      .subscribe({
        next: (remote_version) => {
          const currentInfo = this.info();
          if (!remote_version)
            this.utilsService.toast('success', 'Latest version', "You're running the latest version of TRIP");
          else if (currentInfo && remote_version !== currentInfo.version)
            this.info.set({ ...currentInfo, update: remote_version });
        },
      });
  }

  toggleLowNet() {
    this.apiService
      .putSettings({ mode_low_network: this.isLowNetMode() })
      .pipe(take(1))
      .subscribe({
        next: () => this.utilsService.toast('success', 'Success', 'Preference saved'),
      });
  }

  toggleDarkMode() {
    const settings = this.settings();
    if (!settings) return;

    let data: Partial<Settings> = { mode_dark: !settings.mode_dark };

    // If user uses default tile, we also update tile_layer to dark/voyager
    if (
      !settings.mode_dark &&
      settings.tile_layer === 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
    ) {
      data.tile_layer = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    } else if (
      settings.mode_dark &&
      settings.tile_layer === 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    ) {
      data.tile_layer = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    }

    this.apiService
      .putSettings(data)
      .pipe(take(1))
      .subscribe({
        next: (updatedSettings) => {
          this.utilsService.toggleDarkMode(!!updatedSettings.mode_dark);
          const refreshMap = settings.tile_layer !== updatedSettings.tile_layer;
          this.settings.set(updatedSettings);

          if (!refreshMap) return;
          this.map?.remove();
          this.initMap();
        },
      });
  }

  toggleGPXInPlace() {
    this.apiService
      .putSettings({ mode_gpx_in_place: this.isGPXInPlaceMode() })
      .pipe(take(1))
      .subscribe({
        next: () => this.utilsService.toast('success', 'Success', 'Preference saved'),
      });
  }

  toggleVisitedDisplayed() {
    this.apiService
      .putSettings({ mode_display_visited: this.isVisitedMode() })
      .pipe(take(1))
      .subscribe({
        next: () => this.utilsService.toast('success', 'Success', 'Preference saved'),
      });
  }

  flyTo(latlng?: [number, number]) {
    const selected = this.selectedPlace();
    if (!this.map || (!latlng && !selected)) return;

    const lat: number = latlng ? latlng[0] : selected!.lat;
    const lng: number = latlng ? latlng[1] : selected!.lng;
    this.map.flyTo([lat, lng], this.map.getZoom() || 9, { duration: 2 });
  }

  toggleMapPositionMode() {
    this.apiService
      .putSettings({ mode_map_position: this.isMapPositionMode() })
      .pipe(take(1))
      .subscribe({
        next: () => this.utilsService.toast('success', 'Success', 'Preference saved'),
      });
  }

  toggleTOTP() {
    if (this.settings()?.totp_enabled) this.disableTOTP();
    else this.enableTOTP();
  }

  enableTOTP() {
    this.apiService
      .enableTOTP()
      .pipe(take(1))
      .subscribe({
        next: (secret) => {
          let modal = this.dialogService.open(TotpVerifyModalComponent, {
            header: 'Verify TOTP',
            modal: true,
            closable: true,
            breakpoints: {
              '640px': '90vw',
            },
            data: {
              message:
                "Add this secret to your authentication app.\nEnter the generated code below to verify it's correct",
              token: secret.secret,
            },
          })!;

          modal.onClose.subscribe({
            next: (code: string) => {
              if (code) {
                this.apiService.verifyTOTP(code).subscribe({
                  next: () =>
                    this.settings.update((settings) => (settings ? { ...settings, totp_enabled: true } : settings)),
                });
              }
            },
            error: () => this.utilsService.toast('error', 'Error', 'Error enabling TOTP'),
          });
        },
      });
  }

  disableTOTP() {
    const modal = this.dialogService.open(TotpVerifyModalComponent, {
      header: 'Verify TOTP',
      modal: true,
      closable: true,
      breakpoints: {
        '640px': '90vw',
      },
    })!;

    modal.onClose.subscribe({
      next: (code: string) => {
        if (!code) return;

        const confirmModal = this.dialogService.open(YesNoModalComponent, {
          header: 'Confirm',
          modal: true,
          closable: true,
          dismissableMask: true,
          draggable: false,
          resizable: false,
          breakpoints: {
            '640px': '90vw',
          },
          data: 'Are you sure you want to disable TOTP?',
        })!;

        confirmModal.onClose.subscribe({
          next: (bool: boolean) => {
            if (!bool) return;

            this.apiService.disableTOTP(code).subscribe({
              next: () =>
                this.settings.update((settings) => (settings ? { ...settings, totp_enabled: false } : settings)),
              error: () => this.utilsService.toast('error', 'Error', 'Error disabling TOTP'),
            });
          },
        });
      },
    });
  }

  updatePassword() {
    const modal = this.dialogService.open(UpdatePasswordModalComponent, {
      header: 'Update Password',
      modal: true,
      closable: true,
      width: '30vw',
      breakpoints: {
        '640px': '90vw',
      },
      data: this.settings()?.totp_enabled,
    })!;

    modal.onClose.subscribe({
      next: (data: any | null) => {
        if (!data) return;

        this.authService
          .updatePassword(data)
          .pipe(take(1))
          .subscribe({
            next: () => this.utilsService.toast('success', 'Success', 'Password updated'),
            error: () =>
              this.utilsService.toast(
                'error',
                'Error',
                'Could not update the password. Ensure the current password is correct.',
              ),
          });
      },
    });
  }

  toggleTripApiToken() {
    if (!this.settings()?.api_token) {
      this.enableTripApiToken();
      return;
    }
    this.disableTripApiToken();
  }

  enableTripApiToken() {
    this.apiService.enableTripApiToken().subscribe({
      next: (token) => {
        const settings = this.settings();
        if (!token || !settings) return;

        this.settings.update((settings) => (settings ? { ...settings, api_token: !!token } : settings));
        this.dialogService.open(SettingsViewTokenComponent, {
          header: 'TRIP API Key',
          modal: true,
          closable: true,
          dismissableMask: true,
          draggable: false,
          resizable: false,
          breakpoints: {
            '640px': '90vw',
          },
          data: { token },
        });
      },
    });
  }

  disableTripApiToken() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'TRIP API Key',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: 'Remove your API Token ?',
    })!;

    modal.onClose.subscribe({
      next: (bool) => {
        if (bool) {
          this.apiService.disableTripApiToken().subscribe({
            next: () => this.settings.update((settings) => (settings ? { ...settings, api_token: false } : settings)),
          });
        }
      },
    });
  }

  deleteGoogleApiKey() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Confirm',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: 'Are you sure you want to delete GMaps API Key ?',
    })!;

    modal.onClose.subscribe({
      next: (bool: boolean) => {
        if (!bool) return;

        this.apiService.putSettings({ google_apikey: null }).subscribe({
          next: () => this.settings.update((settings) => (settings ? { ...settings, google_apikey: false } : settings)),
          error: () => this.utilsService.toast('error', 'Error', 'Error deleting GMaps API key'),
        });
      },
    });
  }

  onGoogleTakeoutInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.utilsService.toast('error', 'Unsupported file', 'Expected .csv file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const text = e.target?.result as string;
      const header = text.split('\n')[0];
      const lines = text.split('\n').filter((line) => line.includes('!1s'));
      let processed = 0;

      this.utilsService.setLoading(`Querying Google Maps API... [0/${lines.length}]`);
      const batches: string[][] = [];
      for (let i = 0; i < lines.length; i += 10) {
        batches.push(lines.slice(i, i + 10));
      }

      from(batches)
        .pipe(
          concatMap((batch, batchIndex) => {
            const text = [header, ...batch].join('\n');
            const blob = new Blob([text], { type: 'text/csv' });
            const fp = new File([blob], file.name, { type: 'text/csv' });

            const formdata = new FormData();
            formdata.append('file', fp);

            processed += batch.length;
            this.utilsService.setLoading(`Querying Google Maps API... [${processed}/${lines.length}]`);

            return this.apiService.completionGoogleTakeoutFile(formdata).pipe(
              delay(batchIndex === batches.length - 1 ? 0 : 2500),
              catchError((err) => {
                this.utilsService.toast(
                  'error',
                  'Error',
                  `Google API returned an error for lines ${processed} to ${processed + 10}`,
                );
                console.error(`Batch ${batchIndex + 1} failed:`, err);
                return of([]);
              }),
            );
          }),
          toArray(),
        )
        .subscribe({
          next: (results) => {
            const places = results.flat();
            this.utilsService.setLoading('');

            if (!places.length) {
              this.utilsService.toast('warn', 'No result', 'Google API did not return any place');
              return;
            }

            if (lines.length !== places.length) {
              this.utilsService.toast(
                'warn',
                'Missing a few results',
                `[${places.length}]/[${lines.length}] Google did not return a result for every object`,
              );
            }

            this.multiPlaceModal(places);
          },
          error: () => {
            this.utilsService.setLoading('');
          },
        });
    };

    reader.onerror = () => {
      alert('Error reading file.');
      this.utilsService.setLoading('');
    };

    reader.readAsText(file);
  }

  onGoogleKmzInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    if (!file.name.toLowerCase().endsWith('.kmz')) {
      this.utilsService.toast('error', 'Unsupported file', 'Expected .kmz file');
      return;
    }

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Confirm',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: 'Import KMZ (MyMaps) ? Ensure it does not exceed your quota (10.000 requests/month by default)',
    })!;

    modal.onClose.subscribe({
      next: (bool: boolean) => {
        if (!bool) return;

        this.utilsService.setLoading('Querying Google Maps API...');
        const formdata = new FormData();
        formdata.append('file', file);

        this.apiService
          .completionGoogleKmzFile(formdata)
          .pipe(take(1))
          .subscribe({
            next: (places) => {
              this.utilsService.setLoading('');

              if (!places.length) {
                this.utilsService.toast('warn', 'No result', 'Your KMZ does not contain any Google Maps places');
                return;
              }

              this.multiPlaceModal(places);
            },
            error: () => this.utilsService.setLoading(''),
          });
      },
    });
  }

  checkDuplicatePlace(newPlace: Place): Place | null {
    const settings = this.settings();
    if (!settings || settings.duplicate_dist === 0) return null;

    const duplicate_dist = settings.duplicate_dist || 5;

    return (
      this.places().find((p) => {
        const source = newPlace.name.toLowerCase();
        const target = p.name.toLowerCase();

        if (source === target) return true;

        const sourceLength = source.length;
        const targetLength = target.length;

        if (sourceLength === 0) return targetLength === 0;
        if (targetLength === 0) return false;

        let previousRow = Array.from({ length: targetLength + 1 }, (_, i) => i);
        let currentRow = new Array<number>(targetLength + 1);

        for (let i = 1; i <= sourceLength; i++) {
          currentRow[0] = i;
          for (let j = 1; j <= targetLength; j++) {
            const substitutionCost = source[i - 1] === target[j - 1] ? 0 : 1;
            currentRow[j] = Math.min(previousRow[j] + 1, currentRow[j - 1] + 1, previousRow[j - 1] + substitutionCost);
          }
          [previousRow, currentRow] = [currentRow, previousRow];
        }

        const closeName = previousRow[targetLength] < duplicate_dist;
        const latDiff = Math.abs(p.lat - newPlace.lat);
        const lngDiff = Math.abs(p.lng - newPlace.lng);
        const closeLocation = latDiff < 0.0001 && lngDiff < 0.0001;

        return closeName || closeLocation;
      }) ?? null
    );
  }

  multiPlaceModal(places: ProviderPlaceResult[]) {
    const modal: DynamicDialogRef = this.dialogService.open(MultiPlacesCreateModalComponent, {
      header: 'Create Places',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: false,
      draggable: false,
      width: '50vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
      data: { places },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (data: { places: Place[]; trip: Trip | null } | null) => {
        if (!data) return;

        const obs$ = data.places.map((p) => this.apiService.postPlace(p));
        this.utilsService.setLoading('Creating places...');

        forkJoin(obs$)
          .pipe(take(1))
          .subscribe({
            next: (newPlaces: Place[]) => {
              this.places.update((places) => {
                const updated = [...places, ...newPlaces];
                updated.sort((a, b) => this.collator.compare(a.name, b.name));
                return updated;
              });
              this.utilsService.setLoading('');

              if (data.trip) {
                this.apiService
                  .putTrip(
                    { place_ids: [...data.trip.places.map((p) => p.id), ...newPlaces.map((p) => p.id)] },
                    data.trip.id,
                  )
                  .pipe(take(1))
                  .subscribe({
                    next: (trip) => this.utilsService.toast('success', 'Success', `Added places to ${trip.name}`),
                  });
              }
            },
            error: () => {
              this.utilsService.setLoading('');
            },
          });
      },
    });
  }

  toggleOutOfBoundsPlaces() {
    this.hideOutOfBoundsPlaces.update((v) => !v);
  }
  geocodeFilter() {
    const value = this.geocodeFilterInput.value;
    if (!value) return;

    if (!this.settings()?.google_apikey) {
      this.utilsService.toast('error', 'Missing Key', 'Google Maps API key not configured');
      return;
    }

    this.apiService
      .completionGeocodeBoundaries(value)
      .pipe(take(1))
      .subscribe({
        next: (boundaries) => {
          this.boundariesFiltering.set(boundaries);
          this.geocodeFilterInput.disable();
        },
      });
  }

  resetGeocodeFilters() {
    this.boundariesFiltering.set(null);
    this.geocodeFilterInput.enable();
    this.geocodeFilterInput.setValue('');
  }

  getCategoryPlacesCount(category: string): number {
    return this.places().filter((place) => place.category.name === category).length;
  }

  openProviderMultilineModal() {
    const modal: DynamicDialogRef = this.dialogService.open(ProviderMultilineCreateModalComponent, {
      header: 'Create multiple Places',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: false,
      draggable: false,
      width: '50vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (content: string[] | null) => {
        if (!content) return;

        this.utilsService.setLoading('Querying Provider API...');
        this.apiService
          .completionBulk(content)
          .pipe(take(1))
          .subscribe({
            next: (places) => {
              this.utilsService.setLoading('');
              if (!places.length) {
                this.utilsService.toast('warn', 'No result', 'Provider API did not return any place');
                return;
              }

              this.multiPlaceModal(places);
            },
            error: () => this.utilsService.setLoading(''),
          });
      },
    });
  }

  toNavigation() {
    const selected = this.selectedPlace();
    if (!selected) return;

    openNavigation([{ lat: selected.lat, lng: selected.lng }]);
  }

  googleNearbyPlaces(data: L.LeafletMouseEvent) {
    this.utilsService.setLoading('Querying Provider API... ');
    const latlng = { latitude: data.latlng.lat, longitude: data.latlng.lng };

    this.apiService
      .completionNearbySearch(latlng)
      .pipe(take(1))
      .subscribe({
        next: (places) => {
          this.utilsService.setLoading('');
          if (!places.length) {
            this.utilsService.toast('warn', 'No result', 'Provider did not return any place');
            return;
          }

          this.multiPlaceModal(places);
        },
        error: () => this.utilsService.setLoading(''),
      });
  }

  async centerOnMe() {
    const position = await getGeolocationLatLng();
    if (position.err) {
      this.utilsService.toast('error', 'Error', position.err);
      return;
    }

    const coords: [number, number] = [position.lat!, position.lng!];
    this.map?.flyTo(coords);
    const marker = toDotMarker(coords);
    marker.addTo(this.map!);

    setTimeout(() => {
      marker.remove();
    }, 4000);
  }

  markerToMarkerRouting(to: Place) {
    const from = this.selectedPlace();
    if (!from) return;

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
            id: this.routeManager.createRouteId([from.lat, from.lng], [to.lat, to.lng], profile),
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
