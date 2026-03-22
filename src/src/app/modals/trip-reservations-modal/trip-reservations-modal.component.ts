import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ApiService } from '../../services/api.service';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-trip-reservations-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trip-reservations-modal.component.html',
})
export class TripReservationsModalComponent implements OnInit {
  private config = inject(DynamicDialogConfig);
  private apiService = inject(ApiService);

  flights = signal<any[]>([]);
  accommodation = signal<any[]>([]);
  rentalCars = signal<any[]>([]);

  ngOnInit() {
    const tripId = this.config.data.tripId;
    forkJoin({
      flights: this.apiService.getFlights(tripId),
      accommodation: this.apiService.getAccommodation(tripId),
      rentalCars: this.apiService.getRentalCars(tripId),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ flights, accommodation, rentalCars }) => {
          this.flights.set(flights || []);
          this.accommodation.set(accommodation || []);
          this.rentalCars.set(rentalCars || []);
        },
        error: () => {},
      });
  }
}
