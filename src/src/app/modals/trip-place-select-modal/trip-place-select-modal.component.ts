import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { ProviderBoundaries, Place } from '../../types/poi';
import { ApiService } from '../../services/api.service';
import { SkeletonModule } from 'primeng/skeleton';
import { UtilsService } from '../../services/utils.service';
import { take } from 'rxjs';
import { isPointInBounds } from '../../shared/map';
import { TooltipModule } from 'primeng/tooltip';
import { TabsModule } from 'primeng/tabs';

@Component({
  selector: 'app-trip-place-select-modal',
  imports: [
    FloatLabelModule,
    InputTextModule,
    ButtonModule,
    ReactiveFormsModule,
    SkeletonModule,
    TooltipModule,
    TabsModule,
  ],
  standalone: true,
  templateUrl: './trip-place-select-modal.component.html',
  styleUrl: './trip-place-select-modal.component.scss',
})
export class TripPlaceSelectModalComponent {
  searchInput = new FormControl('');
  googleGeocodeInput = new FormControl('');
  boundariesFiltering?: ProviderBoundaries;

  selectedPlaces: Place[] = [];
  showSelectedPlaces: boolean = false;
  selectedPlacesID: number[] = [];

  places: Place[] = [];
  displayedPlaces: Place[] = [];
  usedPlacesID: Set<number>;

  constructor(
    private apiService: ApiService,
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
    private utilsService: UtilsService,
  ) {
    this.apiService.getPlaces().subscribe({
      next: (places) => {
        this.places = places.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        this.displayedPlaces = places;
      },
    });

    const places: Place[] | undefined = this.config.data?.places;
    this.usedPlacesID = this.config.data?.usedPlaces;
    if (places) {
      this.selectedPlaces = [...places];
      this.selectedPlacesID = places.map((p) => p.id);
    }

    this.searchInput.valueChanges.subscribe({
      next: () => this.filterPlaces(),
    });
  }

  togglePlace(p: Place) {
    if (this.selectedPlacesID.includes(p.id)) {
      if (this.usedPlacesID.has(p.id)) {
        this.utilsService.toast(
          'error',
          'Place in use',
          'Place is currently used in your plans, remove it before unselecting it',
          4000,
        );
        return;
      }
      this.selectedPlacesID.splice(this.selectedPlacesID.indexOf(p.id), 1);
      this.selectedPlaces.splice(
        this.selectedPlaces.findIndex((place) => place.id === p.id),
        1,
      );
      return;
    }

    this.selectedPlacesID.push(p.id);
    this.selectedPlaces.push(p);
    this.selectedPlaces.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  filterPlaces() {
    const searchInputValue = (this.searchInput.value || '').toLowerCase();
    this.displayedPlaces = this.places.filter((place) => {
      if (this.boundariesFiltering) {
        if (!isPointInBounds(place.lat, place.lng, this.boundariesFiltering)) return false;
      }

      if (!searchInputValue) return true;
      return (
        place.name.toLowerCase().includes(searchInputValue) ||
        place.description?.toLowerCase().includes(searchInputValue)
      );
    });
  }

  resetGeocodeFilters() {
    this.boundariesFiltering = undefined;
    this.googleGeocodeInput.enable();
    this.googleGeocodeInput.setValue('');
    this.filterPlaces();
  }

  closeDialog() {
    this.ref.close(this.selectedPlaces);
  }

  selectAll() {
    const toAdd = this.displayedPlaces.filter((p) => !this.selectedPlacesID.includes(p.id));
    this.selectedPlacesID.push(...toAdd.map((p) => p.id));
    this.selectedPlaces.push(...toAdd);
    this.selectedPlaces.sort((a, b) => a.name.localeCompare(b.name));
  }

  deselectAll() {
    const hasUsedPlace = this.selectedPlaces.some((p) => this.usedPlacesID.has(p.id));
    if (hasUsedPlace) {
      this.utilsService.toast(
        'error',
        'Place in use',
        'One or more selected places are currently used in your plans, remove them from your plans before unselecting all places',
        4000,
      );
      return;
    }
    this.selectedPlaces = [];
    this.selectedPlacesID = [];
  }

  geocodeFilter() {
    const value = this.googleGeocodeInput.value;
    if (!value) return;

    this.apiService
      .completionGeocodeBoundaries(value)
      .pipe(take(1))
      .subscribe({
        next: (boundaries) => {
          this.boundariesFiltering = boundaries;
          this.googleGeocodeInput.disable();
          this.filterPlaces();
        },
      });
  }
}
