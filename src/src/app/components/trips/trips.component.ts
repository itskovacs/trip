import { Component, OnInit } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { ButtonModule } from "primeng/button";
import { SkeletonModule } from "primeng/skeleton";
import { TripBase } from "../../types/trip";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { TripCreateModalComponent } from "../../modals/trip-create-modal/trip-create-modal.component";
import { Router } from "@angular/router";
import { take } from "rxjs";

@Component({
  selector: "app-trips",
  standalone: true,
  imports: [SkeletonModule, ButtonModule],
  templateUrl: "./trips.component.html",
  styleUrls: ["./trips.component.scss"],
})
export class TripsComponent implements OnInit {
  trips: TripBase[] = [];

  constructor(
    private apiService: ApiService,
    private dialogService: DialogService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.apiService
      .getTrips()
      .pipe(take(1))
      .subscribe({
        next: (trips) => {
          this.trips = trips;
          this.sortTrips();
        },
      });
  }

  gotoMap() {
    this.router.navigateByUrl("/");
  }

  viewTrip(id: number) {
    this.router.navigateByUrl(`/trips/${id}`);
  }

  addTrip() {
    const modal: DynamicDialogRef = this.dialogService.open(
      TripCreateModalComponent,
      {
        header: "Create Trip",
        modal: true,
        appendTo: "body",
        closable: true,
        dismissableMask: true,
        width: "50vw",
        breakpoints: {
          "960px": "80vw",
        },
      },
    );

    modal.onClose.pipe(take(1)).subscribe({
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

  sortTrips() {
    this.trips = this.trips.sort((a, b) => {
      if (!!a.archived !== !!b.archived) {
        return Number(!!a.archived) - Number(!!b.archived);
      }

      return a.name.localeCompare(b.name);
    });
  }
}
