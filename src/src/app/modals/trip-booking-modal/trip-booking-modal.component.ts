import { ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { BookingType, TripBooking } from '../../types/trip';

@Component({
  selector: 'app-trip-booking-modal',
  imports: [
    ButtonModule,
    FloatLabelModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    ReactiveFormsModule,
    TextareaModule,
    TranslocoDirective,
  ],
  standalone: true,
  templateUrl: './trip-booking-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripBookingModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.save();
  }

  bookingForm: FormGroup;
  isEdit = signal(false);
  bookingTypes: { label: string; value: BookingType }[];

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
    private translocoService: TranslocoService,
  ) {
    this.bookingTypes = (['flight', 'car', 'hotel', 'activity', 'generic'] as BookingType[]).map((value) => ({
      value,
      label: this.translocoService.translate(`bookings.types.${value}`),
    }));

    this.bookingForm = this.fb.group({
      type: ['generic', Validators.required],
      label: ['', Validators.required],
      reference: [null],
      notes: [null],
    });

    const booking: TripBooking | undefined = this.config.data?.booking;
    if (booking) {
      this.isEdit.set(true);
      this.bookingForm.patchValue(booking);
    }
  }

  save() {
    if (!this.bookingForm.valid) return;
    this.ref.close({ action: 'save', booking: this.bookingForm.value });
  }

  delete() {
    this.ref.close({ action: 'delete' });
  }

  cancel() {
    this.ref.close(null);
  }
}
