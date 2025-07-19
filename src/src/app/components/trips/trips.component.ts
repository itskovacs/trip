import { Component } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { ButtonModule } from "primeng/button";
import { SkeletonModule } from "primeng/skeleton";
import { TripBase } from "../../types/trip";
import { Category } from "../../types/poi";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { TripCreateModalComponent } from "../../modals/trip-create-modal/trip-create-modal.component";
import { Router } from "@angular/router";

@Component({
  selector: "app-trips",
  standalone: true,
  imports: [SkeletonModule, ButtonModule],
  templateUrl: "./trips.component.html",
  styleUrls: ["./trips.component.scss"],
})
export class TripsComponent {
  categories: Category[] = [];
  map: any;
  mapSettings: L.LatLng | undefined;
  markerClusterGroup: any;

  trips: TripBase[] = [];

  constructor(
    private apiService: ApiService,
    private dialogService: DialogService,
    private router: Router,
  ) {
    this.apiService.getTrips().subscribe({
      next: (trips) => {
        this.trips = trips;
        this.sortTrips();
      },
    });
  }

  viewTrip(id: number) {
    this.router.navigateByUrl(`/trips/${id}`);
  }

  sortTrips() {
    this.trips = this.trips.sort((a, b) => {
      if (!!a.archived !== !!b.archived) {
        return Number(!!a.archived) - Number(!!b.archived);
      }

      return a.name.localeCompare(b.name);
    });
  }

  gotoMap() {
    this.router.navigateByUrl("/");
  }

  addTrip() {
    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateModalComponent,
      {
        header: "Create Place",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "30vw",
        breakpoints: {
          "640px": "90vw",
        },
      },
    );

    modal.onClose.subscribe({
      next: (trip: TripBase | null) => {
        if (!trip) return;

        this.apiService.postTrip(trip).subscribe({
          next: (trip: TripBase) => {
            this.trips.push(trip);
            this.sortTrips();
          },
        });
      },
    });
  }
}
