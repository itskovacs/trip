import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { TripDay } from '../../types/trip';

@Component({
  selector: 'app-trip-create-day-modal',
  imports: [FloatLabelModule, InputTextModule, ButtonModule, ReactiveFormsModule],
  standalone: true,
  templateUrl: './trip-create-day-modal.component.html',
  styleUrl: './trip-create-day-modal.component.scss',
})
export class TripCreateDayModalComponent {
  dayForm: FormGroup;
  days: TripDay[] = [];

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.dayForm = this.fb.group({
      id: -1,
      label: ['', Validators.required],
    });

    if (this.config.data) {
      if (this.config.data.day) this.dayForm.patchValue(this.config.data.day);
      this.days.push(...this.config.data.days);
    }
  }

  closeDialog() {
    // Normalize data for API POST
    let ret = this.dayForm.value;
    if (!ret['label']) return;
    this.ref.close(ret);
  }
}
