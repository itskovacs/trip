import { Component, OnInit } from "@angular/core";
import { ApiService } from "../../services/api.service";
import { ButtonModule } from "primeng/button";
import { SkeletonModule } from "primeng/skeleton";
import { TripBase } from "../../types/trip";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { TripCreateModalComponent } from "../../modals/trip-create-modal/trip-create-modal.component";
import { Router } from "@angular/router";
import { forkJoin, take } from "rxjs";

interface TripBaseWithDates extends TripBase {
  from?: Date;
  to?: Date;
}

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
      next: (trip: TripBaseWithDates | null) => {
        if (!trip) return;

        this.apiService.postTrip(trip).subscribe({
          next: (new_trip: TripBase) => {
            let dayCount = 0;

            if (trip.from && trip.to) {
              const obs$ = this.generateDaysLabel(trip.from!, trip.to!).map(
                (label) =>
                  this.apiService.postTripDay(
                    { id: -1, label: label, items: [] },
                    new_trip.id,
                  ),
              );
              dayCount = obs$.length;
              forkJoin(obs$).pipe(take(1)).subscribe();
            }

            this.trips.push({ ...new_trip, days: dayCount });
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

  generateDaysLabel(from: Date, to: Date): string[] {
    const labels: string[] = [];
    const sameMonth =
      from.getFullYear() === to.getFullYear() &&
      from.getMonth() === to.getMonth();

    const months = [
      "Jan.",
      "Feb.",
      "Mar.",
      "Apr.",
      "May.",
      "Jun.",
      "Jul.",
      "Aug.",
      "Sep.",
      "Oct.",
      "Nov.",
      "Dec.",
    ];

    const current = new Date(from);
    while (current <= to) {
      let label = "";
      if (sameMonth) {
        label = `${current.getDate().toString().padStart(2, "0")} ${months[current.getMonth()]}`;
      } else {
        label = `${(current.getMonth() + 1).toString().padStart(2, "0")}/${current.getDate().toString().padStart(2, "0")}`;
      }
      labels.push(label);
      current.setDate(current.getDate() + 1);
    }
    return labels;
  }
}
