import { Component } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { DynamicDialogConfig, DynamicDialogRef } from "primeng/dynamicdialog";
import { FloatLabelModule } from "primeng/floatlabel";
import { InputTextModule } from "primeng/inputtext";
import { Place } from "../../types/poi";
import { ApiService } from "../../services/api.service";
import { SkeletonModule } from "primeng/skeleton";

@Component({
  selector: "app-trip-place-select-modal",
  imports: [
    FloatLabelModule,
    InputTextModule,
    ButtonModule,
    ReactiveFormsModule,
    SkeletonModule,
  ],
  standalone: true,
  templateUrl: "./trip-place-select-modal.component.html",
  styleUrl: "./trip-place-select-modal.component.scss",
})
export class TripPlaceSelectModalComponent {
  searchInput = new FormControl("");

  selectedPlaces: Place[] = [];
  showSelectedPlaces: boolean = false;
  selectedPlacesID: number[] = [];

  places: Place[] = [];
  displayedPlaces: Place[] = [];

  constructor(
    private apiService: ApiService,
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    this.apiService.getPlaces().subscribe({
      next: (places) => {
        this.places = places.sort((a, b) =>
          a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
        );
        this.displayedPlaces = places;
      },
    });

    const places: Place[] | undefined = this.config.data?.places;
    if (places) {
      this.selectedPlaces = [...places];
      this.selectedPlacesID = places.map((p) => p.id);
    }

    this.searchInput.valueChanges.subscribe({
      next: (value) => {
        if (!value) {
          this.displayedPlaces = this.places;
          return;
        }

        const v = value.toLowerCase();
        this.displayedPlaces = this.places.filter(
          (p) =>
            p.name.toLowerCase().includes(v) ||
            p.description?.toLowerCase().includes(v),
        );
      },
    });
  }

  togglePlace(p: Place) {
    if (this.selectedPlacesID.includes(p.id)) {
      this.selectedPlacesID.splice(this.selectedPlacesID.indexOf(p.id), 1);
      this.selectedPlaces.splice(
        this.selectedPlaces.findIndex((place) => place.id === p.id),
        1,
      );
      return;
    }

    this.selectedPlacesID.push(p.id);
    this.selectedPlaces.push(p);
    this.selectedPlaces.sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }

  closeDialog() {
    this.ref.close(this.selectedPlaces);
  }
}
