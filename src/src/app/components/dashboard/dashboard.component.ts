import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import {
  catchError,
  combineLatest,
  concatMap,
  debounceTime,
  delay,
  forkJoin,
  from,
  interval,
  of,
  take,
  takeWhile,
  tap,
  toArray,
} from 'rxjs';
import { Place, Category, GoogleBoundaries, GooglePlaceResult } from '../../types/poi';
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
import { BatchCreateModalComponent } from '../../modals/batch-create-modal/batch-create-modal.component';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlaceGPXComponent } from '../../shared/place-gpx/place-gpx.component';
import { CommonModule, Location } from '@angular/common';
import { FileSizePipe } from '../../shared/filesize.pipe';
import { TotpVerifyModalComponent } from '../../modals/totp-verify-modal/totp-verify-modal.component';
import { MenuModule } from 'primeng/menu';
import { MultiPlacesCreateModalComponent } from '../../modals/multi-places-create-modal/multi-places-create-modal.component';
import { GmapsMultilineCreateModalComponent } from '../../modals/gmaps-multiline-create-modal/gmaps-multiline-create-modal.component';
import { UpdatePasswordModalComponent } from '../../modals/update-password-modal/update-password-modal.component';
import { SettingsViewTokenComponent } from '../../modals/settings-view-token/settings-view-token.component';
import { Trip } from '../../types/trip';

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
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('fileUploadTakeout') fileUploadTakeout!: any;
  @ViewChild('fileUploadKmz') fileUploadKmz!: any;
  gmapsGeocodeFilterInput = new FormControl('');
  boundariesFiltering?: GoogleBoundaries;
  searchInput = new FormControl('');
  info?: Info;
  isLowNetMode = false;
  isGpxInPlaceMode = false;
  isVisitedDisplayedMode = false;
  isMapPositionMode = false;
  loadingMessage? = '';

  viewSettings = false;
  mapParamsExpanded = false;
  displaySettingsExpanded = false;
  dataFiltersExpanded = false;
  accountSecurityExpanded = false;
  accountIntegrationsExpanded = false;
  viewFilters = false;
  viewPlacesList = false;
  expandedPlacesList = false;
  viewPlacesListSearch = false;
  hideOutOfBoundsPlaces = false;
  tabsIndex: number = 0;
  backups: Backup[] = [];
  refreshBackups = false;

  settingsForm: FormGroup;
  hoveredElement?: HTMLElement;

  map?: L.Map;
  markerClusterGroup?: L.MarkerClusterGroup;
  gpxLayerGroup?: L.LayerGroup;
  settings?: Settings;
  doNotDisplayOptions: SelectItemGroup[] = [];

  places: Place[] = [];
  visiblePlaces: Place[] = [];
  selectedPlace?: Place;
  categories: Category[] = [];
  selectedGPX?: Place;

  filter_display_visited = false;
  filter_display_favorite_only = false;
  filter_display_restroom = false;
  filter_dog_only = false;
  activeCategories = new Set<string>();
  collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  readonly menuCreatePlaceItems: MenuItem[] = [
    {
      label: 'Places',
      items: [
        {
          label: 'Batch creation',
          icon: 'pi pi-list',
          command: () => {
            this.batchAddModal();
          },
        },
      ],
    },
    {
      label: 'Google',
      items: [
        {
          label: 'Google KMZ (My Maps)',
          icon: 'pi pi-google',
          command: () => {
            if (!this.settings?.google_apikey) {
              this.utilsService.toast('error', 'Missing Key', 'Google Maps API key not configured');
              return;
            }
            this.fileUploadKmz.nativeElement.click();
          },
        },
        {
          label: 'Google Takeout (Saved)',
          icon: 'pi pi-google',
          command: () => {
            if (!this.settings?.google_apikey) {
              this.utilsService.toast('error', 'Missing Key', 'Google Maps API key not configured');
              return;
            }
            this.fileUploadTakeout.nativeElement.click();
          },
        },
        {
          label: 'Google Maps Bulk',
          icon: 'pi pi-google',
          command: () => {
            if (!this.settings?.google_apikey) {
              this.utilsService.toast('error', 'Missing Key', 'Google Maps API key not configured');
              return;
            }
            this.openGmapsMultilineModal();
          },
        },
      ],
    },
  ];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private utilsService: UtilsService,
    private dialogService: DialogService,
    private router: Router,
    private fb: FormBuilder,
    private location: Location,
    private activatedRoute: ActivatedRoute,
  ) {
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
    });

    // HACK: Subscribe in constructor for takeUntilDestroyed
    this.searchInput.valueChanges.pipe(debounceTime(200), takeUntilDestroyed()).subscribe({
      next: () => this.setVisiblePlaces(),
    });
  }

  ngOnInit(): void {
    this.apiService
      .getInfo()
      .pipe(take(1))
      .subscribe({
        next: (info) => (this.info = info),
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
          this.settings = settings;
          this.isLowNetMode = !!settings.mode_low_network;
          this.isGpxInPlaceMode = !!settings.mode_gpx_in_place;
          this.isVisitedDisplayedMode = !!settings.mode_display_visited;
          this.isMapPositionMode = !!settings.mode_map_position;
          this.utilsService.toggleDarkMode(!!settings.mode_dark);
          this.categories = categories;
          this.sortCategories();
          this.initMap();
          this.places = [...places];
          this.resetFilters();
        }),
      )
      .subscribe();
  }

  initMap(): void {
    if (!this.settings) return;
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
    this.map = createMap(isTouch ? [] : contentMenuItems, this.settings?.tile_layer);
    if (isTouch) {
      this.map.on('contextmenu', (e: any) => {
        this.addPlaceModal(e);
      });
    }
    const mapPosition = this.getMapPosition();
    this.map.setView(L.latLng(mapPosition.lat, mapPosition.lng), mapPosition.zoom);
    this.map.on('moveend zoomend', () => {
      if (this.hideOutOfBoundsPlaces) this.setVisiblePlaces();
      if (this.isMapPositionMode) this.updateUrlWithMapPosition();
    });
    this.markerClusterGroup = createClusterGroup().addTo(this.map);
  }

  getMapPosition(): { lat: number; lng: number; zoom: number } {
    const queryParams = this.activatedRoute.snapshot.queryParams;
    const lat = this.isMapPositionMode && queryParams['lat'] ? parseFloat(queryParams['lat']) : this.settings!.map_lat;
    const lng = this.isMapPositionMode && queryParams['lng'] ? parseFloat(queryParams['lng']) : this.settings!.map_lng;
    const zoom =
      this.isMapPositionMode && queryParams['z'] ? parseInt(queryParams['z'], 10) : this.map?.getZoom() || 13;
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

  setVisiblePlaces() {
    if (!this.viewPlacesList || !this.map) return;
    if (!this.hideOutOfBoundsPlaces) {
      this.visiblePlaces = [...this.filteredPlaces];
    } else {
      const bounds = this.map.getBounds();
      this.visiblePlaces = this.filteredPlaces.filter((p) => bounds.contains([p.lat, p.lng]));
    }

    const searchValue = (this.searchInput.value || '').toLowerCase();
    this.visiblePlaces = this.visiblePlaces.filter((place) => {
      if (this.boundariesFiltering) if (!isPointInBounds(place.lat, place.lng, this.boundariesFiltering)) return false;
      if (!searchValue) return true;
      return place.name.toLowerCase().includes(searchValue) || place.description?.toLowerCase().includes(searchValue);
    });
    this.visiblePlaces.sort((a, b) => this.collator.compare(a.name, b.name));
  }

  resetFilters() {
    this.filter_display_visited = false;
    this.filter_dog_only = false;
    this.filter_display_favorite_only = false;
    this.filter_display_restroom = false;
    this.activeCategories = new Set(this.categories.map((c) => c.name));
    this.settings?.do_not_display.forEach((c) => this.activeCategories.delete(c));
    this.updateMarkersAndClusters();
  }

  updateActiveCategories(c: string) {
    if (this.activeCategories.has(c)) this.activeCategories.delete(c);
    else this.activeCategories.add(c);
    this.updateMarkersAndClusters();
  }

  selectAllCategories() {
    this.categories.forEach((c) => this.activeCategories.add(c.name));
    this.updateMarkersAndClusters();
  }

  deselectAllCategories() {
    this.activeCategories.clear();
    this.updateMarkersAndClusters();
  }

  get filteredPlaces(): Place[] {
    return this.places.filter(
      (p) =>
        (this.filter_display_visited || !p.visited) &&
        (!this.filter_display_favorite_only || p.favorite) &&
        (!this.filter_display_restroom || p.restroom) &&
        (!this.filter_dog_only || p.allowdog) &&
        this.activeCategories.has(p.category.name),
    );
  }

  get visitedFilteredPlaces(): Place[] {
    return this.places.filter(
      (p) =>
        p.visited &&
        (!this.filter_display_favorite_only || p.favorite) &&
        (!this.filter_display_restroom || p.restroom) &&
        (!this.filter_dog_only || p.allowdog) &&
        this.activeCategories.has(p.category.name),
    );
  }

  updateMarkersAndClusters(): void {
    this.markerClusterGroup?.clearLayers();

    this.filteredPlaces.forEach((place) => {
      const marker = this._placeToMarker(place);
      this.markerClusterGroup?.addLayer(marker);
    });

    if (!this.filter_display_visited && this.isVisitedDisplayedMode)
      this.visitedFilteredPlaces.forEach((place) => {
        const marker = this._placeToDot(place);
        this.markerClusterGroup?.addLayer(marker);
      });

    this.setVisiblePlaces();
  }

  _placeToDot(place: Place): L.Marker {
    const marker = placeToDotMarker(place);
    marker
      .on('click', (e) => {
        this.selectedPlace = { ...place };

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
    return marker;
  }

  _placeToMarker(place: Place): L.Marker {
    const marker = placeToMarker(place, this.isLowNetMode, place.visited, this.isGpxInPlaceMode);
    marker
      .on('click', (e) => {
        this.selectedPlace = { ...place };

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
    return marker;
  }

  addPlaceModal(e?: any): void {
    const opts = e ? { data: { place: e.latlng } } : {};
    const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Create Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      width: '40vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
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
            width: '40vw',
            breakpoints: {
              '960px': '75vw',
              '640px': '90vw',
            },
            data: `A possible duplicate place (${duplicate.name}) exists. Create anyway?`,
          })!;

          confirmModal.onClose.pipe(take(1)).subscribe({
            next: (confirmed: boolean) => {
              if (confirmed) {
                this.apiService
                  .postPlace(place)
                  .pipe(take(1))
                  .subscribe({
                    next: (place: Place) => {
                      this.places = [...this.places, place].sort((a, b) => this.collator.compare(a.name, b.name));
                      setTimeout(() => {
                        this.updateMarkersAndClusters();
                      }, 10);
                    },
                  });
              }
            },
          });
        } else {
          this.apiService
            .postPlace(place)
            .pipe(take(1))
            .subscribe({
              next: (place: Place) => {
                this.places = [...this.places, place].sort((a, b) => this.collator.compare(a.name, b.name));
                setTimeout(() => {
                  this.updateMarkersAndClusters();
                }, 10);
              },
            });
        }
      },
    });
  }

  batchAddModal() {
    const modal: DynamicDialogRef = this.dialogService.open(BatchCreateModalComponent, {
      header: 'Create Places',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      width: '40vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (places: string | null) => {
        if (!places) return;

        let parsedPlaces = [];
        try {
          parsedPlaces = JSON.parse(places);
          if (!Array.isArray(parsedPlaces)) throw new Error();
        } catch (err) {
          this.utilsService.toast('error', 'Error', 'Content looks invalid');
          return;
        }

        this.apiService
          .postPlaces(parsedPlaces)
          .pipe(take(1))
          .subscribe((places) => {
            this.places = [...this.places, ...places].sort((a, b) => this.collator.compare(a.name, b.name));
            setTimeout(() => {
              this.updateMarkersAndClusters();
            }, 10);
          });
      },
    });
  }

  resetHoverPlace() {
    if (!this.hoveredElement) return;
    this.hoveredElement.classList.remove('list-hover');
    this.hoveredElement = undefined;
  }

  hoverPlace(p: Place) {
    let marker: L.Marker | undefined;
    this.markerClusterGroup?.eachLayer((layer: any) => {
      if (layer.getLatLng && layer.getLatLng().equals([p.lat, p.lng])) {
        marker = layer;
      }
    });

    if (!marker) return;
    const markerElement = marker.getElement() as HTMLElement; // search for Marker. If 'null', is inside Cluster

    if (markerElement) {
      // marker, not clustered
      markerElement.classList.add('list-hover');
      this.hoveredElement = markerElement;
    } else {
      // marker is clustered
      const parentCluster = (this.markerClusterGroup as any).getVisibleParent(marker);
      if (parentCluster) {
        const clusterEl = parentCluster.getElement();
        if (clusterEl) {
          clusterEl.classList.add('list-hover');
          this.hoveredElement = clusterEl;
        }
      }
    }
  }

  favoritePlace() {
    if (!this.selectedPlace) return;
    const favoriteBool = !this.selectedPlace.favorite;

    this.apiService
      .putPlace(this.selectedPlace.id, { favorite: favoriteBool })
      .pipe(take(1))
      .subscribe({
        next: () => {
          const idx = this.places.findIndex((p) => p.id === this.selectedPlace!.id);
          if (idx !== -1) this.places[idx] = { ...this.places[idx], favorite: favoriteBool };
          this.selectedPlace = { ...this.places[idx] };
          this.updateMarkersAndClusters();
        },
      });
  }

  visitPlace() {
    if (!this.selectedPlace) return;
    const visitedBool = !this.selectedPlace.visited;

    this.apiService
      .putPlace(this.selectedPlace.id, { visited: visitedBool })
      .pipe(take(1))
      .subscribe({
        next: () => {
          const idx = this.places.findIndex((p) => p.id === this.selectedPlace!.id);
          if (idx !== -1) this.places[idx] = { ...this.places[idx], visited: visitedBool };
          this.selectedPlace = { ...this.places[idx] };
          this.updateMarkersAndClusters();
        },
      });
  }

  deletePlace() {
    if (!this.selectedPlace) return;

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Confirm deletion',
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
      data: `Delete ${this.selectedPlace.name} ?`,
    })!;

    modal.onClose.subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deletePlace(this.selectedPlace!.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.places = this.places.filter((p) => p.id !== this.selectedPlace!.id);
              this.closePlaceBox();
              this.updateMarkersAndClusters();
            },
          });
      },
    });
  }

  editPlace(p?: Place) {
    if (!this.selectedPlace && !p) return;
    const _placeToEdit: Place = { ...(this.selectedPlace ?? p)! };

    const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Edit Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      width: '40vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
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
            next: (place: Place) => {
              const places = [...this.places];
              const idx = places.findIndex((p) => p.id == place.id);
              if (idx > -1) places.splice(idx, 1, place);
              places.sort((a, b) => this.collator.compare(a.name, b.name));
              this.places = places;
              if (this.selectedPlace) this.selectedPlace = { ...place };
              setTimeout(() => {
                this.updateMarkersAndClusters();
              }, 10);
            },
          });
      },
    });
  }

  displayGPXOnMap(gpx: string) {
    if (!this.map || !this.selectedPlace) return;
    if (!this.gpxLayerGroup) this.gpxLayerGroup = L.layerGroup().addTo(this.map);
    this.gpxLayerGroup.clearLayers();

    try {
      const gpxPolyline = gpxToPolyline(gpx);
      const selectedPlaceWithGPX = { ...this.selectedPlace, gpx };

      gpxPolyline.on('click', () => {
        this.selectedGPX = selectedPlaceWithGPX;
      });
      this.gpxLayerGroup?.addLayer(gpxPolyline);
      this.map.fitBounds(gpxPolyline.getBounds(), { padding: [20, 20] });
    } catch {
      this.utilsService.toast('error', 'Error', "Couldn't parse GPX data");
    }
    this.closePlaceBox();
  }

  getPlaceGPX() {
    if (!this.selectedPlace) return;
    this.apiService
      .getPlaceGPX(this.selectedPlace.id)
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
    this.viewSettings = !this.viewSettings;
    if (!this.viewSettings || !this.settings) return;

    this.apiService
      .getBackups()
      .pipe(take(1))
      .subscribe({
        next: (backups) => (this.backups = backups),
      });

    this.tabsIndex = 0;
    this.settingsForm.reset(this.settings);
    this.doNotDisplayOptions = [
      {
        label: 'Categories',
        items: this.categories.map((c) => ({ label: c.name, value: c.name })),
      },
    ];
    this.mapParamsExpanded = false;
    this.dataFiltersExpanded = false;
    this.displaySettingsExpanded = false;
  }

  toggleFilters() {
    this.viewFilters = !this.viewFilters;
  }

  togglePlacesList() {
    this.viewPlacesList = !this.viewPlacesList;
    this.viewPlacesListSearch = false;
    this.searchInput.setValue('');
    if (this.viewPlacesList) this.setVisiblePlaces();
  }

  togglePlacesListSearch() {
    this.viewPlacesListSearch = !this.viewPlacesListSearch;
    if (this.viewPlacesListSearch) this.searchInput.setValue('');
  }

  setMapCenterToCurrent() {
    const latlng = this.map?.getCenter();
    if (!latlng) return;
    this.settingsForm.patchValue({ map_lat: latlng.lat, map_lng: latlng.lng });
    this.settingsForm.markAsDirty();
  }

  importData(event: Event): void {
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
          this.places = [...this.places, ...resp.places].sort((a, b) => this.collator.compare(a.name, b.name));
          this.categories = resp.categories;
          this.sortCategories();
          this.activeCategories = new Set(resp.categories.map((c) => c.name));

          this.settings = resp.settings;
          this.isLowNetMode = !!resp.settings.mode_low_network;
          this.isGpxInPlaceMode = !!resp.settings.mode_gpx_in_place;
          this.isVisitedDisplayedMode = !!resp.settings.mode_display_visited;
          this.isMapPositionMode = !!resp.settings.mode_map_position;
          this.utilsService.toggleDarkMode(!!resp.settings.mode_dark);
          this.resetFilters();

          this.map?.remove();
          this.initMap();
          this.updateMarkersAndClusters();
          this.viewSettings = false;
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
          this.backups = backups;
          this.refreshBackups = backups.some((b) => b.status === 'pending' || b.status === 'processing');
        },
      });
  }

  createBackup() {
    this.apiService
      .createBackup()
      .pipe(take(1))
      .subscribe((backup) => {
        this.backups = [...this.backups, backup];
      });

    this.refreshBackups = true;
    interval(1000)
      .pipe(takeWhile(() => this.refreshBackups))
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
        next: () => (this.backups = this.backups.filter((b) => b.id != backup.id)),
      });
  }

  updateSettings() {
    this.apiService
      .putSettings({ ...this.settingsForm.value, google_apikey: this.settingsForm.get('_google_apikey')?.value })
      .pipe(take(1))
      .subscribe({
        next: (settings) => {
          const refreshMap = this.settings?.tile_layer != settings.tile_layer;
          this.settings = settings;
          if (refreshMap) {
            this.map?.remove();
            this.initMap();
            this.updateMarkersAndClusters();
          }
          this.resetFilters();
          this.utilsService.toast('success', 'Success', 'Preferences saved');
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
              this.categories = this.categories.map((cat) => (cat.id === updated.id ? updated : cat));
              this.sortCategories();

              this.activeCategories = new Set(this.categories.map((c) => c.name));
              this.places = this.places.map((p) => {
                if (p.category.id == updated.id) return { ...p, category: updated };
                return p;
              });
              setTimeout(() => {
                this.updateMarkersAndClusters();
              }, 100);
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
            next: (category: Category) => {
              this.categories.push(category);
              this.categories.sort((a, b) => this.collator.compare(a.name, b.name));
              this.activeCategories.add(category.name);
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
      breakpoints: {
        '640px': '90vw',
      },
      data: 'Delete this category ?',
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (bool)
          this.apiService
            .deleteCategory(c_id)
            .pipe(take(1))
            .subscribe({
              next: () => {
                this.categories = this.categories.filter((c) => c.id !== c_id);

                this.activeCategories = new Set(this.categories.map((c) => c.name));
              },
            });
      },
    });
  }

  togglePlaceSelection(p: Place) {
    if (this.selectedPlace && this.selectedPlace.id === p.id) {
      this.selectedPlace = undefined;
      return;
    }
    this.selectedPlace = { ...p };
  }

  sortCategories() {
    this.categories = [...this.categories].sort((a, b) => this.collator.compare(a.name, b.name));
  }

  navigateToTrips() {
    this.router.navigateByUrl('/trips');
  }

  logout() {
    this.authService.logout();
  }

  closePlaceBox() {
    this.selectedPlace = undefined;
  }

  closePlaceGPX() {
    this.selectedGPX = undefined;
  }

  downloadGPX() {
    if (!this.selectedGPX?.gpx) return;
    const dataBlob = new Blob([this.selectedGPX.gpx]);
    const downloadURL = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = downloadURL;
    link.download = `TRIP_${this.selectedGPX.name}.gpx`;
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadURL);
  }

  removeGPX() {
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
          if (!remote_version)
            this.utilsService.toast('success', 'Latest version', "You're running the latest version of TRIP");
          if (this.info && remote_version != this.info?.version) this.info.update = remote_version;
        },
      });
  }

  toggleLowNet() {
    this.apiService
      .putSettings({ mode_low_network: this.isLowNetMode })
      .pipe(take(1))
      .subscribe({
        next: () => {
          setTimeout(() => {
            this.updateMarkersAndClusters();
          }, 100);
        },
      });
  }

  toggleDarkMode() {
    if (!this.settings) return;

    let data: Partial<Settings> = { mode_dark: !this.settings.mode_dark };
    // If user uses default tile, we also update tile_layer to dark/voyager
    if (
      !this.settings.mode_dark &&
      this.settings.tile_layer == 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
    )
      data.tile_layer = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    else if (
      this.settings.mode_dark &&
      this.settings.tile_layer == 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    )
      data.tile_layer = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    this.apiService
      .putSettings(data)
      .pipe(take(1))
      .subscribe({
        next: (settings) => {
          this.utilsService.toggleDarkMode(!!settings.mode_dark);
          const refreshMap = this.settings?.tile_layer != settings.tile_layer;
          this.settings = settings;
          if (refreshMap) {
            this.map?.remove();
            this.initMap();
            this.updateMarkersAndClusters();
          }
        },
      });
  }

  toggleGpxInPlace() {
    this.apiService
      .putSettings({ mode_gpx_in_place: this.isGpxInPlaceMode })
      .pipe(take(1))
      .subscribe({
        next: (_) => {
          this.updateMarkersAndClusters();
        },
      });
  }

  toggleVisitedDisplayed() {
    this.apiService
      .putSettings({ mode_display_visited: this.isVisitedDisplayedMode })
      .pipe(take(1))
      .subscribe({
        next: (_) => {
          this.updateMarkersAndClusters();
        },
      });
  }

  flyTo(latlng?: [number, number]) {
    if (!this.map && !latlng && !this.selectedPlace) return;
    const lat: number = latlng ? latlng[0] : this.selectedPlace!.lat;
    const lng: number = latlng ? latlng[1] : this.selectedPlace!.lng;
    this.map!.flyTo([lat, lng], this.map?.getZoom() || 9, { duration: 2 });
  }

  toggleMapPositionMode() {
    this.apiService
      .putSettings({ mode_map_position: this.isMapPositionMode })
      .pipe(take(1))
      .subscribe({
        next: () => this.utilsService.toast('success', 'Success', 'Preference saved'),
      });
  }

  toggleTOTP() {
    if (this.settings?.totp_enabled) this.disableTOTP();
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
              if (code)
                this.apiService.verifyTOTP(code).subscribe({
                  next: () => (this.settings!.totp_enabled = true),
                });
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

        const modal = this.dialogService.open(YesNoModalComponent, {
          header: 'Confirm',
          modal: true,
          closable: true,
          dismissableMask: true,
          breakpoints: {
            '640px': '90vw',
          },
          data: 'Are you sure you want to disable TOTP?',
        })!;

        modal.onClose.subscribe({
          next: (bool: boolean) => {
            if (!bool) return;
            this.apiService.disableTOTP(code).subscribe({
              next: () => (this.settings!.totp_enabled = false),
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
      data: this.settings?.totp_enabled,
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
    if (!this.settings?.api_token) {
      this.enableTripApiToken();
      return;
    }
    this.disableTripApiToken();
  }

  enableTripApiToken() {
    this.apiService.enableTripApiToken().subscribe({
      next: (token) => {
        if (!token || !this.settings) return;
        this.settings.api_token = !!token;
        this.dialogService.open(SettingsViewTokenComponent, {
          header: 'TRIP API Key',
          modal: true,
          closable: true,
          dismissableMask: true,
          breakpoints: {
            '640px': '90vw',
          },
          data: { token },
        });
      },
    });
  }

  disableTripApiToken() {
    let modal = this.dialogService.open(YesNoModalComponent, {
      header: 'TRIP API Key',
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        '640px': '90vw',
      },
      data: 'Remove your API Token ?',
    })!;

    modal.onClose.subscribe({
      next: (bool) => {
        if (bool)
          this.apiService.disableTripApiToken().subscribe({
            next: () => (this.settings!.api_token = false),
          });
      },
    });
  }

  deleteGoogleApiKey() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Confirm',
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        '640px': '90vw',
      },
      data: 'Are you sure you want to delete GMaps API Key ?',
    })!;

    modal.onClose.subscribe({
      next: (bool: boolean) => {
        if (!bool) return;
        this.apiService.putSettings({ google_apikey: null }).subscribe({
          next: () => (this.settings!.google_apikey = false),
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
            const batchText = [header, ...batch].join('\n');
            const batchBlob = new Blob([batchText], { type: 'text/csv' });
            const batchFile = new File([batchBlob], file.name, { type: 'text/csv' });
            const formdata = new FormData();
            formdata.append('file', batchFile);

            processed += batch.length;
            this.utilsService.setLoading(`Querying Google Maps API... [${processed}/${lines.length}]`);

            return this.apiService.postTakeoutFile(formdata).pipe(
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
            if (lines.length != places.length)
              this.utilsService.toast(
                'warn',
                'Missing a few results',
                `[${places.length}]/[${lines.length}] Google did not return a result for every object`,
              );
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
          .postKmzFile(formdata)
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

  checkDuplicatePlace(newPlace: Place): Place | undefined {
    return this.places.find((p) => {
      const source = newPlace.name.toLowerCase();
      const target = p.name.toLowerCase();
      if (source === target) return true;
      const sourceLength = source.length;
      const targetLength = target.length;
      if (sourceLength === 0) return targetLength;
      if (targetLength === 0) return sourceLength;
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
      const closeName = previousRow[targetLength] < 5;
      const latDiff = Math.abs(p.lat - newPlace.lat);
      const lngDiff = Math.abs(p.lng - newPlace.lng);
      const closeLocation = latDiff < 0.0001 && lngDiff < 0.0001;
      return closeName || closeLocation;
    });
  }

  multiPlaceModal(places: GooglePlaceResult[]) {
    const modal: DynamicDialogRef = this.dialogService.open(MultiPlacesCreateModalComponent, {
      header: 'Create Places',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: false,
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
            next: (places: Place[]) => {
              this.places = [...this.places, ...places].sort((a, b) => this.collator.compare(a.name, b.name));
              setTimeout(() => {
                this.updateMarkersAndClusters();
              }, 10);
              this.utilsService.setLoading('');

              if (data.trip) {
                this.apiService
                  .putTrip(
                    { place_ids: [...data.trip.places.map((p) => p.id), ...places.map((p) => p.id)] },
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
    this.hideOutOfBoundsPlaces = !this.hideOutOfBoundsPlaces;
    this.setVisiblePlaces();
  }

  toggleExpandPlacesList(): void {
    this.expandedPlacesList = !this.expandedPlacesList;
  }

  gmapsGeocodeFilter() {
    const value = this.gmapsGeocodeFilterInput.value;
    if (!value) return;
    if (!this.settings?.google_apikey) {
      this.utilsService.toast('error', 'Missing Key', 'Google Maps API key not configured');
      return;
    }

    this.apiService
      .gmapsGeocodeBoundaries(value)
      .pipe(take(1))
      .subscribe({
        next: (boundaries) => {
          this.boundariesFiltering = boundaries;
          this.gmapsGeocodeFilterInput.disable();
          this.setVisiblePlaces();
        },
      });
  }

  resetGeocodeFilters() {
    this.boundariesFiltering = undefined;
    this.gmapsGeocodeFilterInput.enable();
    this.gmapsGeocodeFilterInput.setValue('');
    this.setVisiblePlaces();
  }

  getCategoryPlacesCount(category: string): number {
    return this.places.filter((place) => place.category.name == category).length;
  }

  openGmapsMultilineModal() {
    const modal: DynamicDialogRef = this.dialogService.open(GmapsMultilineCreateModalComponent, {
      header: 'Create Places from GMaps',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: false,
      width: '50vw',
      breakpoints: {
        '960px': '75vw',
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (content: string[] | null) => {
        if (!content) return;
        this.utilsService.setLoading('Querying Google Maps API...');
        this.apiService
          .postGmapsMultiline(content)
          .pipe(take(1))
          .subscribe({
            next: (places) => {
              this.utilsService.setLoading('');
              if (!places.length) {
                this.utilsService.toast('warn', 'No result', 'Google API did not return any place');
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
    if (!this.selectedPlace) return;
    openNavigation([{ lat: this.selectedPlace.lat, lng: this.selectedPlace.lng }]);
  }

  googleNearbyPlaces(data: L.LeafletMouseEvent) {
    this.utilsService.setLoading(`Querying Google Maps API... `);
    const latlng = { latitude: data.latlng.lat, longitude: data.latlng.lng };
    this.apiService
      .postGmapsNearbySearch(latlng)
      .pipe(take(1))
      .subscribe({
        next: (places) => {
          this.utilsService.setLoading('');
          if (!places.length) {
            this.utilsService.toast('warn', 'No result', 'Google API did not return any place');
            return;
          }
          this.multiPlaceModal(places);
        },
        error: () => this.utilsService.setLoading(''),
      });
  }

  async centerOnMe() {
    const position = await getGeolocationLatLng();
    if (position.err) this.utilsService.toast('error', 'Error', position.err);

    const coords: any = [position.lat!, position.lng!];
    this.map?.flyTo(coords);
    const marker = toDotMarker(coords);
    marker.addTo(this.map!);
    setTimeout(() => {
      marker.remove();
    }, 4000);
  }
}
