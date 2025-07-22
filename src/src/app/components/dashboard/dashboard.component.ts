import { AfterViewInit, Component } from "@angular/core";
import { combineLatest, debounceTime, tap } from "rxjs";
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
export class DashboardComponent implements AfterViewInit {
  searchInput = new FormControl("");
  info: Info | undefined;
  isLowNet: boolean = false;

  viewSettings = false;
  viewFilters = false;
  viewMarkersList = false;
  viewMarkersListSearch = false;
  settingsForm: FormGroup;
  hoveredElements: HTMLElement[] = [];

  map: any;
  mapDisplayedTrace: L.Polyline[] = [];
  settings: Settings | undefined;
  currencySigns: { c: string; s: string }[] = [];
  doNotDisplayOptions: SelectItemGroup[] = [];
  markerClusterGroup: L.MarkerClusterGroup | undefined;

  places: Place[] = [];
  visiblePlaces: Place[] = [];
  selectedPlace: Place | undefined;
  categories: Category[] = [];

  filter_display_visited: boolean = false;
  filter_display_favorite_only: boolean = false;
  filter_dog_only: boolean = false;
  activeCategories: Set<string> = new Set();

  constructor(
    private apiService: ApiService,
    private utilsService: UtilsService,
    private dialogService: DialogService,
    private router: Router,
    private fb: FormBuilder,
  ) {
    this.currencySigns = this.utilsService.currencySigns();
    this.isLowNet = this.utilsService.isLowNet;

    this.settingsForm = this.fb.group({
      mapLat: [
        "",
        {
          validators: [
            Validators.required,
            Validators.pattern("-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)"),
          ],
        },
      ],
      mapLng: [
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
    });

    this.apiService.getInfo().subscribe({
      next: (info) => (this.info = info),
    });

    this.searchInput.valueChanges.pipe(debounceTime(200)).subscribe({
      next: () => this.setVisibleMarkers(),
    });
  }

  closePlaceBox() {
    this.selectedPlace = undefined;
  }

  toGithub() {
    this.utilsService.toGithubTRIP();
  }

  check_update() {
    this.apiService.checkVersion().subscribe({
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

  ngAfterViewInit(): void {
    this.initMap();
    combineLatest({
      categories: this.apiService.getCategories(),
      places: this.apiService.getPlaces(),
      settings: this.apiService.getSettings(),
    })
      .pipe(
        tap(({ categories, places, settings }) => {
          this.categories = categories;
          this.activeCategories = new Set(categories.map((c) => c.name));

          this.settings = settings;
          this.map.setView(L.latLng(settings.mapLat, +settings.mapLng));
          this.resetFilters();

          this.map.on("moveend zoomend", () => {
            this.setVisibleMarkers();
          });

          this.markerClusterGroup = createClusterGroup().addTo(this.map);
          this.places.push(...places);
          this.updateMarkersAndClusters(); //Not optimized as I could do it on the forEach, but it allows me to modify only one function instead of multiple places
        }),
      )
      .subscribe();
  }

  initMap(): void {
    let contentMenuItems = [
      {
        text: "Add Point of Interest",
        icon: "add-location.png",
        callback: (e: any) => {
          this.addPlaceModal(e);
        },
      },
    ];
    this.map = createMap(contentMenuItems);
  }

  setVisibleMarkers() {
    const bounds = this.map.getBounds();
    this.visiblePlaces = this.filteredPlaces
      .filter((p) => bounds.contains([p.lat, p.lng]))
      .filter((p) => {
        const v = this.searchInput.value;
        if (v)
          return (
            p.name.toLowerCase().includes(v) ||
            p.description?.toLowerCase().includes(v)
          );
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
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

  toggleLowNet() {
    this.utilsService.toggleLowNet();
    setTimeout(() => {
      this.updateMarkersAndClusters();
    }, 200);
  }

  get filteredPlaces(): Place[] {
    return this.places.filter((p) => {
      if (!this.filter_display_visited && p.visited) return false;
      if (this.filter_display_favorite_only && !p.favorite) return false;
      if (this.filter_dog_only && !p.allowdog) return false;
      if (!this.activeCategories.has(p.category.name)) return false;
      return true;
    });
  }

  updateMarkersAndClusters(): void {
    this.markerClusterGroup?.clearLayers();

    this.filteredPlaces.forEach((place) => {
      const marker = this.placeToMarker(place);
      this.markerClusterGroup?.addLayer(marker);
    });
  }

  placeToMarker(place: Place): L.Marker {
    let marker = placeToMarker(place, this.isLowNet);
    marker
      .on("click", (e) => {
        this.selectedPlace = place;

        let toView = { ...e.latlng };
        if ("ontouchstart" in window) toView.lat = toView.lat - 0.0175;

        marker.closeTooltip();
        this.map.setView(toView);
      })
      .on("contextmenu", () => {
        this.map.contextmenu.hide();
      });
    return marker;
  }

  addPlaceModal(e?: any): void {
    let opts = {};
    if (e) opts = { data: { place: e.latlng } };

    const modal: DynamicDialogRef = this.dialogService.open(
      PlaceCreateModalComponent,
      {
        header: "Create Place",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "40vw",
        breakpoints: {
          "960px": "60vw",
          "640px": "90vw",
        },
        ...opts,
      },
    );

    modal.onClose.subscribe({
      next: (place: Place | null) => {
        if (!place) return;

        this.apiService.postPlace(place).subscribe({
          next: (place: Place) => {
            this.places.push(place);
            this.places.sort((a, b) => a.name.localeCompare(b.name));
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
        width: "40vw",
        breakpoints: {
          "960px": "60vw",
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (places: string | null) => {
        if (!places) return;

        let parsedPlaces = [];
        try {
          parsedPlaces = JSON.parse(places);
          if (!Array.isArray(parsedPlaces)) return;
        } catch (err) {
          this.utilsService.toast("error", "Error", "Content looks invalid");
          return;
        }

        this.apiService.postPlaces(parsedPlaces).subscribe((places) => {
          places.forEach((p) => this.places.push(p));
          this.places.sort((a, b) => a.name.localeCompare(b.name));
          setTimeout(() => {
            this.updateMarkersAndClusters();
          }, 10);
        });
      },
    });
  }

  gotoPlace(p: Place) {
    this.map.flyTo([p.lat, p.lng]);
  }

  gotoTrips() {
    this.router.navigateByUrl("/trips");
  }

  resetHoverPlace() {
    this.hoveredElements.forEach((elem) => elem.classList.remove("listHover"));
    this.hoveredElements = [];
  }

  hoverPlace(p: Place) {
    let marker: L.Marker | undefined;
    this.markerClusterGroup?.eachLayer((layer: any) => {
      if (layer.getLatLng && layer.getLatLng().equals([p.lat, p.lng])) {
        marker = layer;
      }
    });

    if (!marker) return;
    let markerElement = marker.getElement() as HTMLElement; // search for Marker. If 'null', is inside Cluster

    if (markerElement) {
      // marker, not clustered
      markerElement.classList.add("listHover");
      this.hoveredElements.push(markerElement);
    } else {
      // marker , clustered
      const parentCluster = (this.markerClusterGroup as any).getVisibleParent(
        marker,
      );
      if (parentCluster) {
        const clusterEl = parentCluster.getElement();
        if (clusterEl) {
          clusterEl.classList.add("listHover");
          this.hoveredElements.push(clusterEl);
        }
      }
    }
  }

  favoritePlace() {
    if (!this.selectedPlace) return;

    let favoriteBool = !this.selectedPlace.favorite;
    this.apiService
      .putPlace(this.selectedPlace.id, { favorite: favoriteBool })
      .subscribe({
        next: () => {
          this.selectedPlace!.favorite = favoriteBool;
          this.updateMarkersAndClusters();
        },
      });
  }

  visitPlace() {
    if (!this.selectedPlace) return;

    let visitedBool = !this.selectedPlace.visited;
    this.apiService
      .putPlace(this.selectedPlace.id, { visited: visitedBool })
      .subscribe({
        next: () => {
          this.selectedPlace!.visited = visitedBool;
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
        if (bool)
          this.apiService.deletePlace(this.selectedPlace!.id).subscribe({
            next: () => {
              let index = this.places.findIndex(
                (p) => p.id == this.selectedPlace!.id,
              );
              if (index > -1) this.places.splice(index, 1);
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
        width: "40vw",
        data: {
          place: {
            ...this.selectedPlace,
            category: this.selectedPlace.category.id,
          },
        },
        breakpoints: {
          "960px": "60vw",
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (place: Place | null) => {
        if (!place) return;

        this.apiService.putPlace(place.id, place).subscribe({
          next: (place: Place) => {
            let index = this.places.findIndex((p) => p.id == place.id);
            if (index > -1) this.places.splice(index, 1, place);
            this.places.sort((a, b) => a.name.localeCompare(b.name));
            this.selectedPlace = place;
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
    try {
      // HINT: For now, delete traces everytime we display a GPX
      // TODO: Handle multiple polygons and handle Click events
      this.mapDisplayedTrace.forEach((p) => this.map.removeLayer(p));
      this.mapDisplayedTrace = [];

      const gpxPolyline = gpxToPolyline(gpx).addTo(this.map);
      gpxPolyline.on("click", () => {
        this.map.removeLayer(gpxPolyline);
      });

      this.mapDisplayedTrace.push(gpxPolyline);
    } catch {
      this.utilsService.toast("error", "Error", "Couldn't parse GPX data");
      return;
    }
  }

  getPlaceGPX() {
    if (!this.selectedPlace) return;
    this.apiService.getPlaceGPX(this.selectedPlace.id).subscribe({
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
    if (this.viewSettings && this.settings) {
      this.settingsForm.reset();
      this.settingsForm.patchValue(this.settings);
      this.doNotDisplayOptions = [
        {
          label: "Categories",
          items: this.categories.map((c) => ({ label: c.name, value: c.name })),
        },
      ];
    }
  }

  toggleFilters() {
    this.viewFilters = !this.viewFilters;
  }

  toggleMarkersList() {
    this.viewMarkersList = !this.viewMarkersList;
    if (this.viewMarkersList) this.setVisibleMarkers();
  }

  toggleMarkersListSearch() {
    this.searchInput.setValue("");
    this.viewMarkersListSearch = !this.viewMarkersListSearch;
  }

  setMapCenterToCurrent() {
    let latlng: L.LatLng = this.map.getCenter();
    this.settingsForm.patchValue({ mapLat: latlng.lat, mapLng: latlng.lng });
    this.settingsForm.markAsDirty();
  }

  importData(e: any): void {
    const formdata = new FormData();
    if (e.target.files[0]) {
      formdata.append("file", e.target.files[0]);

      this.apiService.settingsUserImport(formdata).subscribe({
        next: (places) => {
          places.forEach((p) => this.places.push(p));
          this.places.sort((a, b) => a.name.localeCompare(b.name));
          setTimeout(() => {
            this.updateMarkersAndClusters();
          }, 10);
          this.viewSettings = false;
        },
      });
    }
  }

  exportData(): void {
    this.apiService.settingsUserExport().subscribe((resp: Object) => {
      let _datablob = new Blob([JSON.stringify(resp, null, 2)], {
        type: "text/json",
      });
      var downloadURL = URL.createObjectURL(_datablob);
      var link = document.createElement("a");
      link.href = downloadURL;
      link.download =
        "TRIP_backup_" + new Date().toISOString().split("T")[0] + ".json";
      link.click();
      link.remove();
    });
  }

  updateSettings() {
    this.apiService.putSettings(this.settingsForm.value).subscribe({
      next: (settings) => {
        this.settings = settings;
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
        width: "20vw",
        breakpoints: {
          "960px": "60vw",
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (category: Category | null) => {
        if (!category) return;

        this.apiService.putCategory(c.id, category).subscribe({
          next: (category) => {
            const index = this.categories.findIndex(
              (categ) => categ.id == c.id,
            );
            if (index > -1) {
              this.categories.splice(index, 1, category);
              this.activeCategories = new Set(
                this.categories.map((c) => c.name),
              );
              this.places = this.places.map((p) => {
                if (p.category.id == category.id) return { ...p, category };
                return p;
              });
              setTimeout(() => {
                this.updateMarkersAndClusters();
              }, 100);
            }
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
        width: "20vw",
        breakpoints: {
          "960px": "60vw",
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (category: Category | null) => {
        if (!category) return;

        this.apiService.postCategory(category).subscribe({
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

    modal.onClose.subscribe({
      next: (bool) => {
        if (bool)
          this.apiService.deleteCategory(c_id).subscribe({
            next: () => {
              const index = this.categories.findIndex(
                (categ) => categ.id == c_id,
              );
              if (index > -1) {
                this.categories.splice(index, 1);
                this.activeCategories = new Set(
                  this.categories.map((c) => c.name),
                );
              }
            },
          });
      },
    });
  }
}
