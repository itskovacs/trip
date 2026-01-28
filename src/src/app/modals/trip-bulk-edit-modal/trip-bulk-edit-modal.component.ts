import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputMaskModule } from 'primeng/inputmask';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Trip, TripMember, TripStatus } from '../../types/trip';
import { MultiSelectModule } from 'primeng/multiselect';

@Component({
  selector: 'app-trip-bulk-edit-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    SelectModule,
    MultiSelectModule,
    InputTextModule,
    InputNumberModule,
    FloatLabelModule,
    CheckboxModule,
    InputGroupModule,
    InputGroupAddonModule,
    TextareaModule,
    InputMaskModule,
  ],
  templateUrl: './trip-bulk-edit-modal.component.html',
  styleUrl: './trip-bulk-edit-modal.component.scss',
})
export class TripBulkEditModalComponent {
  editForm: FormGroup;
  trip?: Trip;
  members: TripMember[] = [];
  statuses: TripStatus[] = [];

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
    private fb: FormBuilder,
  ) {
    const data = this.config.data;
    this.members = data.members ?? [];
    this.trip = data.trip ?? [];
    this.statuses = data.statuses;

    this.editForm = this.fb.group({
      day_id: [{ value: null, disabled: true }],
      time: [{ value: '', disabled: true }, [Validators.pattern(/^([01]\d|2[0-3])(:[0-5]\d)?$/)]],
      text: [{ value: '', disabled: true }],
      place: [{ value: null, disabled: true }],
      status: [{ value: null, disabled: true }],
      lat: [{ value: '', disabled: true }, [Validators.pattern('-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)')]],
      lng: [
        { value: '', disabled: true },
        [Validators.pattern('-?(180(\\.0+)?|1[0-7]\\d(\\.\\d+)?|[1-9]?\\d(\\.\\d+)?)')],
      ],
      price: [{ value: null, disabled: true }],
      comment: [{ value: '', disabled: true }],
      attachment_ids: [{ value: [], disabled: true }],
      enable_day_id: [false],
      enable_time: [false],
      enable_text: [false],
      enable_place: [false],
      enable_status: [false],
      enable_lat: [false],
      enable_lng: [false],
      enable_price: [false],
      enable_comment: [false],
      enable_attachment_ids: [false],
    });
    this.setupToggles();
  }

  setupToggles() {
    //todo: group lat and lng into one same checkbox logic
    const keys = ['day_id', 'time', 'text', 'place', 'status', 'lat', 'lng', 'price', 'comment', 'attachment_ids'];
    keys.forEach((key) => {
      this.editForm
        .get(`enable_${key}`)
        ?.valueChanges.pipe(takeUntilDestroyed())
        .subscribe((enabled) => {
          const control = this.editForm.get(key);
          if (enabled) {
            control?.enable();
          } else {
            control?.disable();
            control?.reset();
          }
        });
    });

    // Synchronize lat/lng enable states
    this.editForm
      .get('enable_lat')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe((enabled) => {
        const enableLngControl = this.editForm.get('enable_lng');
        if (enabled !== enableLngControl?.value) enableLngControl?.setValue(enabled);
      });

    this.editForm
      .get('enable_lng')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe((enabled) => {
        const enableLatControl = this.editForm.get('enable_lat');
        if (enabled !== enableLatControl?.value) enableLatControl?.setValue(enabled);
      });

    this.editForm
      .get('lat')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe((value) => {
        const lngControl = this.editForm.get('lng');
        if (value) {
          lngControl?.addValidators(Validators.required);
          lngControl?.markAsDirty();
        } else lngControl?.removeValidators(Validators.required);
        lngControl?.updateValueAndValidity({ emitEvent: false });
      });

    this.editForm
      .get('lng')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe((value) => {
        const latControl = this.editForm.get('lat');
        if (value) {
          latControl?.addValidators(Validators.required);
          latControl?.markAsDirty();
        } else latControl?.removeValidators(Validators.required);
        latControl?.updateValueAndValidity({ emitEvent: false });
      });
  }

  closeDialog() {
    if (!this.editForm.valid) return;
    const formValue = this.editForm.value;
    const data: any = {};
    const keys = ['day_id', 'time', 'text', 'place', 'status', 'lat', 'lng', 'price', 'comment', 'attachment_ids'];

    let hasChanges = false;
    keys.forEach((key) => {
      if (formValue[`enable_${key}`] === true) {
        hasChanges = true;
        const val = formValue[key];
        data[key] = val === '' || val === null || val === undefined ? null : val;
      }
    });

    if (!hasChanges) {
      this.ref.close(null);
      return;
    }

    this.ref.close(data);
  }
}
