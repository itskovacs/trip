import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ApiService } from '../../services/api.service';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-trip-travel-info-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trip-travel-info-modal.component.html',
})
export class TripTravelInfoModalComponent implements OnInit {
  private config = inject(DynamicDialogConfig);
  private apiService = inject(ApiService);

  travelInfo = signal<any>(null);

  ngOnInit() {
    const tripId = this.config.data.tripId;
    this.apiService
      .getTravelInfo(tripId)
      .pipe(take(1))
      .subscribe({
        next: (info) => this.travelInfo.set(info),
        error: () => {},
      });
  }

  getVisaStatusColor(status: string): string {
    if (!status) return 'bg-primary-100 dark:bg-primary-800 text-primary-700 dark:text-primary-300';
    const s = status.toLowerCase();
    if (s.includes('free') || s.includes('not required') || s.includes('none'))
      return 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300';
    if (s.includes('required') || s.includes('mandatory'))
      return 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300';
    return 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300';
  }
}
