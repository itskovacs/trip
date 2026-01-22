import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TextareaModule } from 'primeng/textarea';
import { Trip } from '../../types/trip';

@Component({
  selector: 'app-trip-archive-modal',
  imports: [FloatLabelModule, TextareaModule, ButtonModule, ReactiveFormsModule],
  standalone: true,
  templateUrl: './trip-archive-modal.component.html',
  styleUrl: './trip-archive-modal.component.scss',
})
export class TripArchiveModalComponent {
  review = new FormControl('');

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    this.computeReviewPlaceholder(this.config.data);
  }

  computeReviewPlaceholder(trip: Trip) {
    if (trip.archival_review) {
      this.review.setValue(trip.archival_review);
      return;
    }
    if (!trip.days.length) return;
    let placeholder = 'General feedback:\n\n';
    trip.days.forEach((day, index) => {
      placeholder += `\nDay ${index + 1} (${day.label})\n`;
      if (!day.items.length) placeholder += '  No activities.\n';
      else day.items.forEach((item) => (placeholder += `  - ${item.time} | ${item.text}\n`));
    });
    placeholder += '\nAnything else?';
    this.review.setValue(placeholder);
  }

  closeDialog() {
    this.ref.close(this.review.value);
  }
}
