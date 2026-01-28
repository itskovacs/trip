import { Component, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { TripDay } from '../../types/trip';
import { UtilsService } from '../../services/utils.service';
import { TextareaModule } from 'primeng/textarea';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TabsModule } from 'primeng/tabs';

@Component({
  selector: 'app-trip-create-day-modal',
  imports: [
    FloatLabelModule,
    InputTextModule,
    DatePickerModule,
    ButtonModule,
    ReactiveFormsModule,
    TextareaModule,
    TabsModule,
  ],
  standalone: true,
  templateUrl: './trip-create-day-modal.component.html',
  styleUrl: './trip-create-day-modal.component.scss',
})
export class TripCreateDayModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  dayForm: FormGroup;
  daysForm: FormGroup;
  dayNames: string[] = [];
  months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  tabValue: number = 0;

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
      notes: null,
    });

    this.daysForm = this.fb.group({
      daterange: [[], Validators.required],
      notes: null,
    });

    if (this.config.data) {
      if (this.config.data.day) {
        this.dayForm.patchValue({
          ...this.config.data.day,
          dt: this.config.data.day.dt ? new Date(this.config.data.day.dt) : null,
        });
      }

      this.dayNames = (this.config.data.days || [])
        .filter((d: TripDay) => d.id !== this.config.data.day?.id)
        .map((d: TripDay) => d.label);
    }

    this.dayForm
      .get('dt')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value: Date) => {
          if (!value) return;
          if (this.dayForm.get('label')?.value) return;
          const day = String(value.getDate()).padStart(2, '0');
          const label = `${day} ${this.months[value.getMonth()]}`;
          this.dayForm.get('label')?.setValue(label);
        },
      });
  }

  formatDateWithoutTimezone(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  closeDialog() {
    let ret;
    if (this.tabValue === 0) {
      if (!this.dayForm.valid) return;
      ret = this.dayForm.value;
      if (this.dayNames.includes(ret['label'])) {
        this.utilsService.toast('error', 'Error', 'Day label is already in use');
        return;
      }
      if (ret['dt']) ret['dt'] = this.formatDateWithoutTimezone(ret['dt']);
    } else if (this.tabValue === 1) {
      if (!this.daysForm.valid) return;
      ret = this.daysForm.value;
    }

    this.ref.close(ret);
  }
}
