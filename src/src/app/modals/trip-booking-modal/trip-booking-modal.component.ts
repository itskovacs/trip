import { ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { FileSizePipe } from '../../shared/pipes/filesize.pipe';
import { bookingTypeClass, bookingTypeIcon, saveBlobAs } from '../../shared/utils';
import { BookingType, Trip, TripAttachment, TripBooking, TripDay } from '../../types/trip';

@Component({
  selector: 'app-trip-booking-modal',
  imports: [
    ButtonModule,
    FileSizePipe,
    FloatLabelModule,
    InputTextModule,
    MultiSelectModule,
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
    if (!this.isEditing()) return;
    event.preventDefault();
    this.save();
  }

  bookingForm: FormGroup;
  bookingTypes: { label: string; value: BookingType }[];
  days: TripDay[] = [];
  trip?: Trip;

  // Whether this modal was opened against an already-existing booking (view/edit) vs a brand-new one (create-only).
  isExisting = signal(false);
  // Whether the edit form (vs the read-only summary) is currently shown.
  isEditing = signal(true);

  bookingTypeIcon = bookingTypeIcon;
  bookingTypeClass = bookingTypeClass;

  originalBooking?: TripBooking;

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
    private translocoService: TranslocoService,
    private apiService: ApiService,
  ) {
    this.bookingTypes = (['flight', 'car', 'hotel', 'activity', 'train', 'boat', 'generic'] as BookingType[]).map(
      (value) => ({
        value,
        label: this.translocoService.translate(`bookings.types.${value}`),
      }),
    );

    this.bookingForm = this.fb.group({
      type: ['generic', Validators.required],
      label: ['', Validators.required],
      reference: [null],
      notes: [null],
      day_id: [[]],
      attachment_ids: [[]],
    });

    this.days = this.config.data?.days ?? [];
    this.trip = this.config.data?.trip;
    const booking: TripBooking | undefined = this.config.data?.booking;

    this.bookingForm.get('day_id')?.setValidators(Validators.required);
    this.bookingForm.get('day_id')?.updateValueAndValidity();

    if (booking) {
      this.originalBooking = booking;
      this.isExisting.set(true);
      this.isEditing.set(false);
      this.bookingForm.patchValue({
        type: booking.type,
        label: booking.label,
        reference: booking.reference,
        notes: booking.notes,
        day_id: booking.day_id,
        attachment_ids: booking.attachments?.map((a) => a.id) ?? [],
      });
    } else {
      const dayId = this.config.data?.day?.id;
      if (dayId) this.bookingForm.get('day_id')?.setValue([dayId]);
    }
  }

  startEditing() {
    this.isEditing.set(true);
  }

  cancelEditing() {
    if (!this.originalBooking) return;
    this.bookingForm.patchValue({
      type: this.originalBooking.type,
      label: this.originalBooking.label,
      reference: this.originalBooking.reference,
      notes: this.originalBooking.notes,
      day_id: this.originalBooking.day_id,
      attachment_ids: this.originalBooking.attachments?.map((a) => a.id) ?? [],
    });
    this.bookingForm.markAsPristine();
    this.isEditing.set(false);
  }

  onFileUploadInputChange(event: Event) {
    if (!this.trip) return;
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const formdata = new FormData();
    formdata.append('file', input.files[0]);

    this.apiService
      .postTripAttachment(this.trip.id, formdata)
      .pipe(take(1))
      .subscribe({
        next: (attachment) => {
          this.trip!.attachments = [...(this.trip!.attachments ?? []), attachment];
          this.bookingForm
            .get('attachment_ids')
            ?.setValue([...(this.bookingForm.get('attachment_ids')?.value ?? []), attachment.id]);
        },
      });
  }

  downloadAttachment(attachment: TripAttachment) {
    if (!this.trip) return;
    this.apiService
      .downloadTripAttachment(this.trip.id, attachment.id)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          const blob = new Blob([data], { type: 'application/pdf' });
          saveBlobAs(blob, attachment.filename);
        },
      });
  }

  save() {
    if (!this.bookingForm.valid) return;
    const { day_id, ...booking } = this.bookingForm.value;
    if (this.isExisting()) {
      this.ref.close({ action: 'save', booking: { ...booking, day_id } });
    } else {
      this.ref.close({ action: 'save', booking, dayIds: day_id as number[] });
    }
  }

  delete() {
    this.ref.close({ action: 'delete' });
  }

  cancel() {
    this.ref.close(null);
  }
}
