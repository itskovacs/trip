import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TripBase, TripInvitation, TripDay, TripBaseWithDates } from '../../types/trip';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TripCreateModalComponent } from '../../modals/trip-create-modal/trip-create-modal.component';
import { Router } from '@angular/router';
import { forkJoin, take } from 'rxjs';
import { DatePipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { daterangeToTripDays } from '../../shared/utils';

@Component({
  selector: 'app-trips',
  standalone: true,
  imports: [SkeletonModule, ButtonModule, DialogModule, DatePipe],
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.scss'],
})
export class TripsComponent implements OnInit {
  trips: TripBase[] = [];
  hasPendingInvitations = false;
  invitations: TripInvitation[] = [];
  invitationsDialogVisible = false;

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
    this.apiService
      .getHasTripsInvitations()
      .pipe(take(1))
      .subscribe({
        next: (bool) => (this.hasPendingInvitations = bool),
      });
  }

  gotoMap() {
    this.router.navigateByUrl('/');
  }

  viewTrip(id: number) {
    this.router.navigateByUrl(`/trips/${id}`);
  }

  addTrip() {
    const modal: DynamicDialogRef = this.dialogService.open(TripCreateModalComponent, {
      header: 'Create Trip',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '40vw',
      breakpoints: {
        '960px': '80vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((trip: TripBaseWithDates | null) => {
      if (!trip) return;

      this.apiService.postTrip(trip).subscribe({
        next: (new_trip: TripBase) => {
          let dayCount = 0;

          if (trip.daterange && trip.daterange.length === 2) {
            const obs$ = daterangeToTripDays(trip.daterange).map((td) =>
              this.apiService.postTripDay({ id: -1, label: td.label!, dt: td.dt, items: [] }, new_trip.id),
            );
            dayCount = obs$.length;
            forkJoin(obs$).pipe(take(1)).subscribe();
          }

          this.trips.push({ ...new_trip, days: dayCount });
          this.sortTrips();
        },
      });
    });
  }

  sortTrips() {
    this.trips = this.trips.sort((a, b) => {
      if (!!a.archived !== !!b.archived) {
        return Number(!!a.archived) - Number(!!b.archived);
      }

      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  toggleInvitations() {
    if (!this.invitations.length)
      this.apiService
        .getTripsInvitations()
        .pipe(take(1))
        .subscribe({
          next: (items) => {
            this.invitations = [...items];
          },
        });
    this.invitationsDialogVisible = true;
  }

  removeInvitationAndHide(trip_id: number) {
    this.invitations = this.invitations.filter((inv) => inv.id != trip_id);
    this.hasPendingInvitations = !!this.invitations.length;
    this.invitationsDialogVisible = false;
  }

  acceptInvitation(trip_id: number) {
    this.apiService
      .acceptTripMemberInvite(trip_id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          const index = this.invitations.findIndex((inv) => inv.id == trip_id);
          if (index > -1) {
            this.trips = [...this.trips, this.invitations[index]];
            this.sortTrips();
          }
          this.removeInvitationAndHide(trip_id);
        },
      });
  }

  declineInvitation(trip_id: number) {
    this.apiService
      .declineTripMemberInvite(trip_id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.removeInvitationAndHide(trip_id);
        },
      });
  }
}
