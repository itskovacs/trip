import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { TripDay } from '../../types/trip';
import { UtilsService } from '../../services/utils.service';

@Component({
  selector: 'app-trip-create-day-modal',
  imports: [FloatLabelModule, InputTextModule, DatePickerModule, ButtonModule, ReactiveFormsModule],
  standalone: true,
  templateUrl: './trip-create-day-modal.component.html',
  styleUrl: './trip-create-day-modal.component.scss',
})
export class TripCreateDayModalComponent {
  dayForm: FormGroup;
  dayNames: string[] = [];

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
    private utilsService: UtilsService,
  ) {
    this.dayForm = this.fb.group({
      id: -1,
      dt: null,
      label: ['', Validators.required],
    });

    if (this.config.data) {
      if (this.config.data.day) {
        this.dayForm.patchValue({
          ...this.config.data.day,
          dt: this.config.data.day.dt ? new Date(this.config.data.day.dt) : null,
        });
      }
      this.dayNames = (this.config.data.days || []).map((d: TripDay) => d.label);
    }
  }

  formatDateWithoutTimezone(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  closeDialog() {
    // Normalize data for API POST
    let ret = this.dayForm.value;
    if (this.dayNames.includes(ret['label'])) {
      this.utilsService.toast('error', 'Error', 'Day label is already in use');
      return;
    }

    if (!ret['label']) return;
    if (ret['dt']) ret['dt'] = this.formatDateWithoutTimezone(ret['dt']);
    this.ref.close(ret);
  }
}
