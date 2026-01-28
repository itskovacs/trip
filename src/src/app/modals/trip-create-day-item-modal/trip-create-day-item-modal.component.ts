import { Component, HostListener, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { Trip, TripAttachment, TripDay, TripMember, TripStatus } from '../../types/trip';
import { Place } from '../../types/poi';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { InputMaskModule } from 'primeng/inputmask';
import { UtilsService } from '../../services/utils.service';
import { checkAndParseLatLng, formatLatLng } from '../../shared/latlng-parser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { Popover, PopoverModule } from 'primeng/popover';
import { ApiService } from '../../services/api.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-trip-create-day-item-modal',
  imports: [
    FloatLabelModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    SelectModule,
    ReactiveFormsModule,
    TextareaModule,
    FloatLabelModule,
    InputTextModule,
    ButtonModule,
    ReactiveFormsModule,
    InputMaskModule,
    MultiSelectModule,
    InputGroupModule,
    InputGroupAddonModule,
    PopoverModule,
  ],
  standalone: true,
  templateUrl: './trip-create-day-item-modal.component.html',
  styleUrl: './trip-create-day-item-modal.component.scss',
})
export class TripCreateDayItemModalComponent {
  @ViewChild('op') op!: Popover;
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  members: TripMember[] = [];
  itemForm: FormGroup;
  places: Place[] = [];
  statuses: TripStatus[] = [];
  previous_image_id: number | null = null;
  previous_image: string | null = null;
  trip?: Trip;

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
    private apiService: ApiService,
    private utilsService: UtilsService,
  ) {
    this.statuses = this.utilsService.statuses;

    this.itemForm = this.fb.group({
      id: -1,
      time: [
        '',
        {
          validators: [Validators.required, Validators.pattern(/^([01]\d|2[0-3])(:[0-5]\d)?$/)],
        },
      ],
      text: ['', Validators.required],
      comment: '',
      day_id: [null, Validators.required],
      place: null,
      status: null,
      price: null,
      image: null,
      image_id: null,
      gpx: null,
      lat: [
        '',
        {
          validators: Validators.pattern('-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)'),
          updateOn: 'blur',
        },
      ],
      lng: [
        '',
        {
          validators: Validators.pattern('-?(180(\\.0+)?|1[0-7]\\d(\\.\\d+)?|[1-9]?\\d(\\.\\d+)?)'),
        },
      ],
      paid_by: null,
      attachments: [],
    });

    const data = this.config.data;
    if (data) {
      this.members = data.members ?? [];
      this.places = data.places ?? [];
      this.trip = data.trip ?? [];

      if (data.item)
        this.itemForm.patchValue({
          ...data.item,
          place: data.item.place?.id ?? null,
          attachments: data.item.attachments.map((a: TripAttachment) => a.id),
        });

      if (data.selectedDay) this.itemForm.get('day_id')?.setValue([data.selectedDay]);
      if (data.selectedPlaceId) {
        this.itemForm.get('place')?.setValue(data.selectedPlaceId);
        this.placeUpdatedTrigger(data.selectedPlaceId);
      }
    }

    this.itemForm
      .get('place')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (newPlace?: number) => {
          if (!newPlace) {
            this.itemForm.get('lat')?.setValue('');
            this.itemForm.get('lng')?.setValue('');
            return;
          }
          this.placeUpdatedTrigger(newPlace);
        },
      });

    this.itemForm
      .get('lat')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value: string) => {
          const result = checkAndParseLatLng(value);
          if (!result) return;

          const [lat, lng] = result;
          const latControl = this.itemForm.get('lat');
          const lngControl = this.itemForm.get('lng');

          latControl?.setValue(formatLatLng(lat).trim(), { emitEvent: false });
          lngControl?.setValue(formatLatLng(lng).trim(), { emitEvent: false });

          lngControl?.markAsDirty();
          lngControl?.updateValueAndValidity();
        },
      });
  }

  closeDialog() {
    if (!this.itemForm.valid) return;
    let ret = this.itemForm.value;
    if (!ret['lat']) {
      ret['lat'] = null;
      ret['lng'] = null;
    }
    if (ret['image_id']) {
      delete ret['image'];
      delete ret['image_id'];
    }
    if (ret['gpx'] == '1') delete ret['gpx'];
    if (!ret['place']) delete ret['place'];
    if (ret['attachments']) {
      ret['attachment_ids'] = ret['attachments'];
      delete ret['attachments'];
    }
    this.ref.close(ret);
  }

  placeUpdatedTrigger(pid: number) {
    const p: Place = this.places.find((p) => p.id === pid) as Place;
    if (!p) return;
    this.itemForm.get('lat')?.setValue(p.lat);
    this.itemForm.get('lng')?.setValue(p.lng);
    this.itemForm.get('price')?.setValue(p.price || 0);
    if (!this.itemForm.get('text')?.value) this.itemForm.get('text')?.setValue(p.name);
    if (p.description && !this.itemForm.get('comment')?.value) this.itemForm.get('comment')?.setValue(p.description);
  }

  togglePriceMembersPopover(e: any) {
    this.op.toggle(e);
  }

  get paidByControl(): any {
    return this.itemForm.get('paid_by');
  }

  selectPriceMember(member: any) {
    this.itemForm.markAsDirty();
    if (this.paidByControl.value == member) {
      this.paidByControl.setValue(null);
      this.op.hide();
      return;
    }
    this.paidByControl.setValue(member);
    this.op.hide();
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        if (this.itemForm.get('image_id')?.value) {
          this.previous_image_id = this.itemForm.get('image_id')?.value;
          this.previous_image = this.itemForm.get('image')?.value;
          this.itemForm.get('image_id')?.setValue(null);
        }

        this.itemForm.get('image')?.setValue(e.target?.result as string);
        this.itemForm.get('image')?.markAsDirty();
      };

      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.itemForm.get('image')?.setValue(null);
    this.itemForm.get('image_id')?.setValue(null);
    this.itemForm.markAsDirty();

    if (this.previous_image && this.previous_image_id) {
      this.itemForm.get('image_id')?.setValue(this.previous_image_id);
      this.itemForm.get('image')?.setValue(this.previous_image);
    }
  }

  onGPXSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        this.itemForm.get('gpx')?.setValue(e.target?.result as string);
        this.itemForm.get('gpx')?.markAsDirty();
      };

      reader.readAsText(file);
    }
  }

  clearGPX() {
    this.itemForm.get('gpx')?.setValue(null);
    this.itemForm.get('gpx')?.markAsDirty();
  }

  onFileUploadInputChange(event: Event) {
    if (!this.trip) return;
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const formdata = new FormData();
    formdata.append('file', input.files[0]);

    this.apiService
      .postTripAttachment(this.trip?.id, formdata)
      .pipe(take(1))
      .subscribe({
        next: (attachment) => (this.trip!.attachments = [...this.trip!.attachments!, attachment]),
      });
  }
}
