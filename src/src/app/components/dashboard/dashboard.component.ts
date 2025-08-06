import { AfterViewInit, Component, OnInit } from "@angular/core";
import { combineLatest, debounceTime, take, tap } from "rxjs";
import { Place, Category } from "../../types/poi";
import { ApiService } from "../../services/api.service";
import { PlaceBoxComponent } from "../../shared/place-box/place-box.component";
import * as L from "leaflet";
import "leaflet.markercluster";
import "leaflet-contextmenu";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { PlaceCreateModalComponent } from "../../modals/place-create-modal/place-create-modal.component";
import { InputTextModule } from "primeng/inputtext";
import { SkeletonModule } from "primeng/skeleton";
import { TabsModule } from "primeng/tabs";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { FloatLabelModule } from "primeng/floatlabel";
import { BatchCreateModalComponent } from "../../modals/batch-create-modal/batch-create-modal.component";
import { UtilsService } from "../../services/utils.service";
import { Info } from "../../types/info";
import {
  createMap,
  placeToMarker,
  createClusterGroup,
  gpxToPolyline,
} from "../../shared/map";
import { Router } from "@angular/router";
import { SelectModule } from "primeng/select";
import { MultiSelectModule } from "primeng/multiselect";
import { TooltipModule } from "primeng/tooltip";
import { Settings } from "../../types/settings";
import { SelectItemGroup } from "primeng/api";
import { YesNoModalComponent } from "../../modals/yes-no-modal/yes-no-modal.component";
import { CategoryCreateModalComponent } from "../../modals/category-create-modal/category-create-modal.component";
import { AuthService } from "../../services/auth.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

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
  selector: "app-dashboard",
  standalone: true,
  imports: [
    PlaceBoxComponent,
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
  ],
  templateUrl: "./dashboard.component.html",
  styleUrls: ["./dashboard.component.scss"],
})
export class DashboardComponent implements OnInit, AfterViewInit {
  searchInput = new FormControl("", { nonNullable: true });
  info?: Info;
  isLowNet = false;
  isDarkMode = false;
  isGpxInPlaceMode = false;

  viewSettings = false;
  viewFilters = false;
  viewMarkersList = false;
  viewMarkersListSearch = false;

  settingsForm: FormGroup;
  hoveredElement?: HTMLElement;

  map?: L.Map;
  markerClusterGroup?: L.MarkerClusterGroup;
  gpxLayerGroup?: L.LayerGroup;
  settings?: Settings;
  currencySigns = UtilsService.currencySigns();
  doNotDisplayOptions: SelectItemGroup[] = [];

  places: Place[] = [];
  visiblePlaces: Place[] = [];
  selectedPlace?: Place;
  categories: Category[] = [];

  filter_display_visited = false;
  filter_display_favorite_only = false;
  filter_dog_only = false;
  activeCategories = new Set<string>();

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private utilsService: UtilsService,
    private dialogService: DialogService,
    private router: Router,
    private fb: FormBuilder,
  ) {
    this.currencySigns = UtilsService.currencySigns();

    this.settingsForm = this.fb.group({
      map_lat: [
        "",
        {
          validators: [
            Validators.required,
            Validators.pattern("-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)"),
          ],
        },
      ],
      map_lng: [
        "",
        {
          validators: [
            Validators.required,
            Validators.pattern(
              "-?(180(\\.0+)?|1[0-7]\\d(\\.\\d+)?|[1-9]?\\d(\\.\\d+)?)",
            ),
          ],
        },
      ],
      currency: ["", Validators.required],
      do_not_display: [],
      tile_layer: ["", Validators.required],
    });

    // HACK: Subscribe in constructor for takeUntilDestroyed
    this.searchInput.valueChanges
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe({
        next: () => this.setVisibleMarkers(),
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
          this.initMap();

          this.categories = categories;
          this.activeCategories = new Set(categories.map((c) => c.name));

          this.isLowNet = !!settings.mode_low_network;
          this.isDarkMode = !!settings.mode_dark;
          this.isGpxInPlaceMode = !!settings.mode_gpx_in_place;
          if (this.isDarkMode) this.utilsService.toggleDarkMode();
          this.resetFilters();

          this.places = [...places];
          this.updateMarkersAndClusters(); //Not optimized as I could do it on the forEach, but it allows me to modify only one function instead of multiple places
        }),
      )
      .subscribe();
  }

  initMap(): void {
    if (!this.settings) return;

    const contentMenuItems = [
      {
        text: "Add Point of Interest",
        icon: "add-location.png",
        callback: (e: any) => {
          this.addPlaceModal(e);
        },
      },
    ];
    this.map = createMap(contentMenuItems, this.settings?.tile_layer);
    this.map.setView(L.latLng(this.settings.map_lat, this.settings.map_lng));
    this.map.on("moveend zoomend", () => this.setVisibleMarkers());
    this.markerClusterGroup = createClusterGroup().addTo(this.map);
  }

  setVisibleMarkers() {
    if (!this.viewMarkersList || !this.map) return;
    const bounds = this.map.getBounds();

    this.visiblePlaces = this.filteredPlaces.filter((p) =>
      bounds.contains([p.lat, p.lng]),
    );

    const searchValue = this.searchInput.value?.toLowerCase() ?? "";
    if (searchValue)
      this.visiblePlaces.filter(
        (p) =>
          p.name.toLowerCase().includes(searchValue) ||
          p.description?.toLowerCase().includes(searchValue),
      );

    this.visiblePlaces.sort((a, b) => a.name.localeCompare(b.name));
  }

  resetFilters() {
    this.filter_display_visited = false;
    this.filter_display_favorite_only = false;
    this.activeCategories = new Set(this.categories.map((c) => c.name));
    this.settings?.do_not_display.forEach((c) =>
      this.activeCategories.delete(c),
    );
    this.updateMarkersAndClusters();
    if (this.viewMarkersList) this.setVisibleMarkers();
  }

  updateActiveCategories(c: string) {
    if (this.activeCategories.has(c)) this.activeCategories.delete(c);
    else this.activeCategories.add(c);
    this.updateMarkersAndClusters();
    if (this.viewMarkersList) this.setVisibleMarkers();
  }

  get filteredPlaces(): Place[] {
    return this.places.filter(
      (p) =>
        (this.filter_display_visited || !p.visited) &&
        (!this.filter_display_favorite_only || p.favorite) &&
        (!this.filter_dog_only || p.allowdog) &&
        this.activeCategories.has(p.category.name),
    );
  }

  updateMarkersAndClusters(): void {
    this.markerClusterGroup?.clearLayers();

    this.filteredPlaces.forEach((place) => {
      const marker = this.placeToMarker(place);
      this.markerClusterGroup?.addLayer(marker);
    });
  }

  placeToMarker(place: Place): L.Marker {
    const marker = placeToMarker(
      place,
      this.isLowNet,
      place.visited,
      this.isGpxInPlaceMode,
    );
    marker
      .on("click", (e) => {
        this.selectedPlace = { ...place };

        let toView = { ...e.latlng };
        if ("ontouchstart" in window) toView.lat = toView.lat - 0.0175;

        marker.closeTooltip();
        this.map?.setView(toView);
      })
      .on("contextmenu", () => {
        if (this.map && (this.map as any).contextmenu)
          (this.map as any).contextmenu.hide();
      });
    return marker;
  }

  addPlaceModal(e?: any): void {
    const opts = e ? { data: { place: e.latlng } } : {};
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
        ...opts,
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (place: Place | null) => {
        if (!place) return;

        this.apiService
          .postPlace(place)
          .pipe(take(1))
          .subscribe({
            next: (place: Place) => {
              this.places = [...this.places, place].sort((a, b) =>
                a.name.localeCompare(b.name),
              );
              setTimeout(() => {
                this.updateMarkersAndClusters();
              }, 10);
            },
          });
      },
    });
  }

  batchAddModal() {
    const modal: DynamicDialogRef = this.dialogService.open(
      BatchCreateModalComponent,
      {
        header: "Create Places",
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
      next: (places: string | null) => {
        if (!places) return;

        let parsedPlaces = [];
        try {
          parsedPlaces = JSON.parse(places);
          if (!Array.isArray(parsedPlaces)) throw new Error();
        } catch (err) {
          this.utilsService.toast("error", "Error", "Content looks invalid");
          return;
        }

        this.apiService
          .postPlaces(parsedPlaces)
          .pipe(take(1))
          .subscribe((places) => {
            this.places = [...this.places, ...places].sort((a, b) =>
              a.name.localeCompare(b.name),
            );
            setTimeout(() => {
              this.updateMarkersAndClusters();
            }, 10);
          });
      },
    });
  }

  resetHoverPlace() {
    if (!this.hoveredElement) return;
    this.hoveredElement.classList.remove("listHover");
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

  favoritePlace() {
    if (!this.selectedPlace) return;
    const favoriteBool = !this.selectedPlace.favorite;

    this.apiService
      .putPlace(this.selectedPlace.id, { favorite: favoriteBool })
      .pipe(take(1))
      .subscribe({
        next: () => {
          const idx = this.places.findIndex(
            (p) => p.id === this.selectedPlace!.id,
          );
          if (idx !== -1)
            this.places[idx] = { ...this.places[idx], favorite: favoriteBool };
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
          const idx = this.places.findIndex(
            (p) => p.id === this.selectedPlace!.id,
          );
          if (idx !== -1)
            this.places[idx] = { ...this.places[idx], visited: visitedBool };
          this.selectedPlace = { ...this.places[idx] };
          this.updateMarkersAndClusters();
        },
      });
  }

  deletePlace() {
    if (!this.selectedPlace) return;

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm deletion",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: `Delete ${this.selectedPlace.name} ?`,
    });

    modal.onClose.subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deletePlace(this.selectedPlace!.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.places = this.places.filter(
                (p) => p.id !== this.selectedPlace!.id,
              );
              this.closePlaceBox();
              this.updateMarkersAndClusters();
              if (this.viewMarkersList) this.setVisibleMarkers();
            },
          });
      },
    });
  }

  editPlace() {
    if (!this.selectedPlace) return;
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
        data: {
          place: {
            ...this.selectedPlace,
            category: this.selectedPlace.category.id,
          },
        },
      },
    );

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
              places.sort((a, b) => a.name.localeCompare(b.name));
              this.places = places;
              this.selectedPlace = { ...place };
              setTimeout(() => {
                this.updateMarkersAndClusters();
              }, 10);
              if (this.viewMarkersList) this.setVisibleMarkers();
            },
          });
      },
    });
  }

  displayGPXOnMap(gpx: string) {
    if (!this.map) return;
    if (!this.gpxLayerGroup)
      this.gpxLayerGroup = L.layerGroup().addTo(this.map);
    this.gpxLayerGroup.clearLayers();

    try {
      const gpxPolyline = gpxToPolyline(gpx);
      gpxPolyline.on("click", () => {
        this.gpxLayerGroup?.removeLayer(gpxPolyline);
      });
      this.gpxLayerGroup?.addLayer(gpxPolyline);
      this.map.fitBounds(gpxPolyline.getBounds(), { padding: [20, 20] });
    } catch {
      this.utilsService.toast("error", "Error", "Couldn't parse GPX data");
    }
  }

  getPlaceGPX() {
    if (!this.selectedPlace) return;
    this.apiService
      .getPlaceGPX(this.selectedPlace.id)
      .pipe(take(1))
      .subscribe({
        next: (p) => {
          if (!p.gpx) {
            this.utilsService.toast(
              "error",
              "Error",
              "Couldn't retrieve GPX data",
            );
            return;
          }
          this.displayGPXOnMap(p.gpx);
        },
      });
  }

  toggleSettings() {
    this.viewSettings = !this.viewSettings;
    if (!this.viewSettings || !this.settings) return;

    this.settingsForm.reset(this.settings);
    this.doNotDisplayOptions = [
      {
        label: "Categories",
        items: this.categories.map((c) => ({ label: c.name, value: c.name })),
      },
    ];
  }

  toggleFilters() {
    this.viewFilters = !this.viewFilters;
  }

  toggleMarkersList() {
    this.viewMarkersList = !this.viewMarkersList;
    this.viewMarkersListSearch = false;
    this.searchInput.setValue("");
    if (this.viewMarkersList) this.setVisibleMarkers();
  }

  toggleMarkersListSearch() {
    this.viewMarkersListSearch = !this.viewMarkersListSearch;
    if (this.viewMarkersListSearch) this.searchInput.setValue("");
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
    formdata.append("file", input.files[0]);

    this.apiService
      .settingsUserImport(formdata)
      .pipe(take(1))
      .subscribe({
        next: (places) => {
          this.places = [...this.places, ...places].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
          setTimeout(() => {
            this.updateMarkersAndClusters();
          }, 10);
          this.viewSettings = false;
        },
      });
  }

  exportData(): void {
    this.apiService
      .settingsUserExport()
      .pipe(take(1))
      .subscribe((resp: Object) => {
        const dataBlob = new Blob([JSON.stringify(resp, null, 2)], {
          type: "application/json",
        });
        const downloadURL = URL.createObjectURL(dataBlob);
        const link = document.createElement("a");
        link.href = downloadURL;
        link.download = `TRIP_backup_${new Date().toISOString().split("T")[0]}.json`;
        link.click();
        link.remove();
        URL.revokeObjectURL(downloadURL);
      });
  }

  updateSettings() {
    this.apiService
      .putSettings(this.settingsForm.value)
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
          this.toggleSettings();
        },
      });
  }

  editCategory(c: Category) {
    const modal: DynamicDialogRef = this.dialogService.open(
      CategoryCreateModalComponent,
      {
        header: "Update Category",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        data: { category: c },
        width: "40vw",
        breakpoints: {
          "960px": "70vw",
          "640px": "90vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (category: Category | null) => {
        if (!category) return;

        this.apiService
          .putCategory(c.id, category)
          .pipe(take(1))
          .subscribe({
            next: (updated) => {
              this.categories = this.categories.map((cat) =>
                cat.id === updated.id ? updated : cat,
              );

              this.activeCategories = new Set(
                this.categories.map((c) => c.name),
              );
              this.places = this.places.map((p) => {
                if (p.category.id == updated.id)
                  return { ...p, category: updated };
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
    const modal: DynamicDialogRef = this.dialogService.open(
      CategoryCreateModalComponent,
      {
        header: "Create Category",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "40vw",
        breakpoints: {
          "960px": "70vw",
          "640px": "90vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
      next: (category: Category | null) => {
        if (!category) return;

        this.apiService
          .postCategory(category)
          .pipe(take(1))
          .subscribe({
            next: (category: Category) => {
              this.categories.push(category);
              this.categories.sort((categoryA: Category, categoryB: Category) =>
                categoryA.name.localeCompare(categoryB.name),
              );
              this.activeCategories.add(category.name);
            },
          });
      },
    });
  }

  deleteCategory(c_id: number) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: "Confirm deletion",
      modal: true,
      closable: true,
      dismissableMask: true,
      breakpoints: {
        "640px": "90vw",
      },
      data: "Delete this category ?",
    });

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (bool)
          this.apiService
            .deleteCategory(c_id)
            .pipe(take(1))
            .subscribe({
              next: () => {
                this.categories = this.categories.filter((c) => c.id !== c_id);

                this.activeCategories = new Set(
                  this.categories.map((c) => c.name),
                );
              },
            });
      },
    });
  }

  gotoPlace(p: Place) {
    this.map?.flyTo([p.lat, p.lng]);
  }

  gotoTrips() {
    this.router.navigateByUrl("/trips");
  }

  logout() {
    this.authService.logout();
  }

  closePlaceBox() {
    this.selectedPlace = undefined;
  }

  toGithub() {
    this.utilsService.toGithubTRIP();
  }

  check_update() {
    this.apiService
      .checkVersion()
      .pipe(take(1))
      .subscribe({
        next: (remote_version) => {
          if (!remote_version)
            this.utilsService.toast(
              "success",
              "Latest version",
              "You're running the latest version of TRIP",
            );
          if (this.info && remote_version != this.info?.version)
            this.info.update = remote_version;
        },
      });
  }

  toggleLowNet() {
    this.apiService
      .putSettings({ mode_low_network: this.isLowNet })
      .pipe(take(1))
      .subscribe({
        next: (_) => {
          setTimeout(() => {
            this.updateMarkersAndClusters();
          }, 100);
        },
      });
  }

  toggleDarkMode() {
    this.apiService
      .putSettings({ mode_dark: this.isDarkMode })
      .pipe(take(1))
      .subscribe({
        next: (_) => {
          this.utilsService.toggleDarkMode();
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
}
