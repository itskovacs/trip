import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-trip-create-day-modal',
  imports: [FloatLabelModule, InputTextModule, DatePickerModule, ButtonModule, ReactiveFormsModule],
  standalone: true,
  templateUrl: './trip-create-day-modal.component.html',
  styleUrl: './trip-create-day-modal.component.scss',
})
export class TripCreateDayModalComponent {
  dayForm: FormGroup;

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.dayForm = this.fb.group({
      id: -1,
      dt: null,
      label: ['', Validators.required],
    });

    if (this.config.data) {
      this.dayForm.patchValue({
        ...this.config.data,
        dt: this.config.data.dt ? new Date(this.config.data.dt) : null,
      });
    }
  }

  closeDialog() {
    // Normalize data for API POST
    let ret = this.dayForm.value;
    if (!ret['label']) return;
    if (ret['dt']) ret['dt'] = ret['dt'].toISOString().split('T')[0];
    this.ref.close(ret);
  }
}
