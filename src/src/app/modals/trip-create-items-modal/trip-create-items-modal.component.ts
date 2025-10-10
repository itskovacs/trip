import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TextareaModule } from 'primeng/textarea';
import { TripDay, TripItem } from '../../types/trip';
import { SelectModule } from 'primeng/select';

@Component({
  selector: 'app-trip-create-items-modal',
  imports: [FloatLabelModule, ButtonModule, SelectModule, ReactiveFormsModule, TextareaModule],
  standalone: true,
  templateUrl: './trip-create-items-modal.component.html',
  styleUrl: './trip-create-items-modal.component.scss',
})
export class TripCreateItemsModalComponent {
  itemBatchForm: FormGroup;
  pholder = 'eg.\n14h Just an item example\n15:10 Another format for an item\n16h30 Another item here';
  days: TripDay[] = [];

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.itemBatchForm = this.fb.group({
      batch: ['', Validators.required],
      day_id: [null, Validators.required],
    });

    if (this.config.data) {
      this.days = this.config.data.days;
    }
  }

  closeDialog() {
    const ret = this.itemBatchForm.value;
    const day_id = ret.day_id;
    const lines: string[] = ret.batch.trim().split('\n');
    const tripItems: Partial<TripItem>[] = [];

    lines.forEach((l) => {
      const match = l.match(/^(\d{1,2})(?:h|:)?(\d{0,2})?\s+(.+)$/);
      if (match) {
        const [_, hoursStr, minutesStr = '', text] = match;
        const hours = hoursStr.padStart(2, '0');
        const minutes = minutesStr.padStart(2, '0') || '00';
        const time = `${hours}:${minutes}`;
        tripItems.push({ time: time, text: text, day_id: day_id });
      }
    });

    this.ref.close(tripItems);
  }
}
