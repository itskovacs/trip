import { Component, HostListener, signal, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { Trip, TripAttachment, TripDay, TripItemImage, TripMember, TripStatus } from '../../types/trip';
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
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

/** One gallery slot while editing: an existing image (`id`) or a freshly picked one (`data`). */
interface EditImage {
  id?: number;
  data?: string;
  url: string;
}

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
    TranslocoDirective,
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
  images = signal<EditImage[]>([]);
  coverIndex = signal(0);
  trip?: Trip;
  newLinkInput = signal('');

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
    private apiService: ApiService,
    private utilsService: UtilsService,
    private translocoService: TranslocoService,
  ) {
    this.statuses = this.utilsService.statuses;

    this.itemForm = this.fb.group({
      id: -1,
      time: [
        '',
        {
          validators: [Validators.pattern(/^([01]\d|2[0-3])(:[0-5]\d)?$/)],
        },
      ],
      text: ['', Validators.required],
      comment: '',
      day_id: [null, Validators.required],
      place: null,
      status: null,
      price: null,
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
      links: [[]],
    });

    const data = this.config.data;
    if (data) {
      this.members = data.members ?? [];
      this.places = data.places ?? [];
      this.trip = data.trip ?? [];

      if (data.item) {
        this.itemForm.patchValue({
          ...data.item,
          place: data.item.place?.id ?? null,
          attachments: data.item.attachments.map((a: TripAttachment) => a.id),
          links: data.item.links ?? [],
        });

        const existing: TripItemImage[] = data.item.images ?? [];
        this.images.set(existing.map((img) => ({ id: img.id, url: img.url })));
        const coverPos = existing.findIndex((img) => img.id === data.item.image_id);
        this.coverIndex.set(coverPos >= 0 ? coverPos : 0);
      }

      if (data.selectedDayId) this.itemForm.get('day_id')?.setValue([data.selectedDayId]);
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
    if (!ret['time']) ret['time'] = null;
    if (!ret['lat']) {
      ret['lat'] = null;
      ret['lng'] = null;
    }
    ret['images'] = this.images().map((img) => (img.id != null ? { id: img.id } : { data: img.data }));
    ret['cover_index'] = this.coverIndex();
    if (ret['gpx'] == '1') delete ret['gpx'];
    if (!ret['place']) ret['place'] = null;
    if (ret['attachments']) {
      ret['attachment_ids'] = ret['attachments'];
      delete ret['attachments'];
    }
    if (!ret['links']?.length) ret['links'] = null;
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

    // Places embedded in the trip carry a '1' placeholder instead of the real GPX (payload-size
    // optimization) so the full track has to be fetched separately before it can be copied onto the item.
    if (p.gpx === '1' && !this.itemForm.get('gpx')?.value) {
      this.apiService
        .getPlaceGPX(p.id)
        .pipe(take(1))
        .subscribe({
          next: (full) => {
            if (!full.gpx || full.gpx === '1') return;
            if (this.itemForm.get('place')?.value !== pid) return;
            if (this.itemForm.get('gpx')?.value) return;
            this.itemForm.get('gpx')?.setValue(full.gpx);
            this.itemForm.get('gpx')?.markAsDirty();
          },
          error: () => {
            this.utilsService.toast(
              'error',
              this.translocoService.translate('common.status.error'),
              this.translocoService.translate('messages.could_not_retrieve_gpx'),
            );
          },
        });
    }
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

  onImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    Array.from(input.files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        this.images.update((list) => [...list, { data: url, url }]);
        this.itemForm.markAsDirty();
      };
      reader.readAsDataURL(file);
    });

    input.value = ''; // allow re-picking the same file
  }

  setCover(index: number) {
    this.coverIndex.set(index);
    this.itemForm.markAsDirty();
  }

  removeImage(index: number) {
    this.images.update((list) => list.filter((_, i) => i !== index));
    this.coverIndex.update((cover) => {
      if (index === cover) return 0;
      return index < cover ? cover - 1 : cover;
    });
    this.itemForm.markAsDirty();
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

  isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  addLink(url: string) {
    const trimmed = url.trim();
    if (!trimmed || !this.isValidUrl(trimmed)) return;
    const current: string[] = this.itemForm.get('links')?.value ?? [];
    this.itemForm.get('links')?.setValue([...current, trimmed]);
    this.itemForm.markAsDirty();
    this.newLinkInput.set('');
  }

  removeLink(index: number) {
    const current: string[] = [...(this.itemForm.get('links')?.value ?? [])];
    current.splice(index, 1);
    this.itemForm.get('links')?.setValue(current);
    this.itemForm.markAsDirty();
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
