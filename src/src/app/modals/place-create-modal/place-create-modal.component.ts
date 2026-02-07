import { Component, HostListener } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { Observable, take } from 'rxjs';
import { AsyncPipe, CommonModule } from '@angular/common';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { ApiService } from '../../services/api.service';
import { UtilsService } from '../../services/utils.service';
import { FocusTrapModule } from 'primeng/focustrap';
import { Category, Place } from '../../types/poi';
import { ProviderPlaceResult } from '../../types/provider';
import { CheckboxModule } from 'primeng/checkbox';
import { TooltipModule } from 'primeng/tooltip';
import { checkAndParseLatLng, formatLatLng } from '../../shared/latlng-parser';
import { InputNumberModule } from 'primeng/inputnumber';
import { PlaceCreateProviderModalComponent } from '../place-create-provider-modal/place-create-provider-modal.component';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-place-create-modal',
  imports: [
    FloatLabelModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    SelectModule,
    ReactiveFormsModule,
    TextareaModule,
    InputGroupModule,
    InputGroupAddonModule,
    TooltipModule,
    CheckboxModule,
    AsyncPipe,
    FocusTrapModule,
    DialogModule,
    CommonModule,
    FormsModule,
  ],
  standalone: true,
  templateUrl: './place-create-modal.component.html',
  styleUrl: './place-create-modal.component.scss',
})
export class PlaceCreateModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  placeForm: FormGroup;
  categories$?: Observable<Category[]>;
  previous_image_id: number | null = null;
  previous_image: string | null = null;
  showImageUrlDialog = false;
  imageUrl = '';

  constructor(
    private ref: DynamicDialogRef,
    private apiService: ApiService,
    private utilsService: UtilsService,
    private dialogService: DialogService,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.categories$ = this.apiService.getCategories();

    this.placeForm = this.fb.group({
      id: -1,
      name: ['', Validators.required],
      place: ['', { validators: Validators.required, updateOn: 'blur' }],
      lat: [
        '',
        {
          validators: [Validators.required, Validators.pattern('-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)')],
          updateOn: 'blur',
        },
      ],
      lng: [
        '',
        {
          validators: [
            Validators.required,
            Validators.pattern('-?(180(\\.0+)?|1[0-7]\\d(\\.\\d+)?|[1-9]?\\d(\\.\\d+)?)'),
          ],
        },
      ],
      category: [null, Validators.required],
      description: null,
      duration: [null, Validators.pattern('\\d+')],
      price: null,
      allowdog: false,
      restroom: false,
      visited: false,
      image: null,
      image_id: null,
      gpx: null,
    });

    const patchValue = this.config.data?.place as Place | undefined;
    if (patchValue) this.placeForm.patchValue(patchValue);
    this.placeForm
      .get('place')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value: string) => {
          const isGoogleMapsURL = /^(https?:\/\/)?(www\.)?google\.[a-z.]+\/maps/.test(value);
          if (isGoogleMapsURL) this._parseGoogleMapsPlaceUrl(value);

          const shortLinkMatch = /^https:\/\/maps.app.goo.gl\/([^\/]+)/.test(value);
          if (shortLinkMatch) this._parseGoogleMapsShortUrl(value);
        },
      });
    this.placeForm
      .get('lat')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value: string) => {
          const result = checkAndParseLatLng(value);
          if (!result) return;
          const [lat, lng] = result;

          const latControl = this.placeForm.get('lat');
          const lngControl = this.placeForm.get('lng');

          latControl?.setValue(formatLatLng(lat).trim(), { emitEvent: false });
          lngControl?.setValue(formatLatLng(lng).trim(), { emitEvent: false });

          lngControl?.markAsDirty();
          lngControl?.updateValueAndValidity();
        },
      });
  }

  closeDialog() {
    if (!this.placeForm.valid) return;
    let ret = this.placeForm.value;
    ret['category_id'] = ret['category'];
    delete ret['category'];
    if (ret['image_id']) {
      delete ret['image'];
      delete ret['image_id'];
    } else {
      delete ret['image_id'];
    }
    if (ret['gpx'] == '1') delete ret['gpx'];
    ret['lat'] = +ret['lat'];
    ret['lng'] = +ret['lng'];
    this.ref.close(ret);
  }

  _parseGoogleMapsPlaceUrl(url: string): void {
    const [place, latlng] = this.utilsService.parseGoogleMapsPlaceUrl(url);
    if (!place || !latlng) return;
    const [lat, lng] = latlng.split(',');
    this.placeForm.get('place')?.setValue(place);
    this.placeForm.get('lat')?.setValue(lat);
    this.placeForm.get('lng')?.setValue(lng);
    if (!this.placeForm.get('name')?.value) this.placeForm.get('name')?.setValue(place);
  }

  _parseGoogleMapsShortUrl(url: string) {
    const id = this.utilsService.parseGoogleMapsShortUrl(url);
    if (!id) return;
    this.utilsService.setLoading('Querying Google Maps API...');
    this.apiService
      .completionGoogleShortlink(id)
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          this.utilsService.setLoading('');
          this.providerToForm(result);
        },
        error: () => {
          this.utilsService.setLoading('');
          this.utilsService.toast('error', 'Error', 'Could not parse maps.app.goo.gl identifier');
        },
      });
  }

  storePreviousImageAndClear() {
    if (!this.placeForm.get('image_id')?.value) return;
    this.previous_image_id = this.placeForm.get('image_id')?.value;
    this.previous_image = this.placeForm.get('image')?.value;
    this.placeForm.get('image_id')?.setValue(null);
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        this.storePreviousImageAndClear();
        this.placeForm.get('image')?.setValue(e.target?.result as string);
        this.placeForm.get('image')?.markAsDirty();
      };

      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.placeForm.get('image')?.setValue(null);
    this.placeForm.get('image_id')?.setValue(null);

    if (this.previous_image && this.previous_image_id) {
      this.placeForm.get('image_id')?.setValue(this.previous_image_id);
      this.placeForm.get('image')?.setValue(this.previous_image);
    }
  }

  onGPXSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        this.placeForm.get('gpx')?.setValue(e.target?.result as string);
        this.placeForm.get('gpx')?.markAsDirty();
      };

      reader.readAsText(file);
    }
  }

  clearGPX() {
    this.placeForm.get('gpx')?.setValue(null);
    this.placeForm.get('gpx')?.markAsDirty();
  }

  providerToForm(r: ProviderPlaceResult) {
    this.placeForm.patchValue({ ...r, lat: formatLatLng(r.lat), lng: formatLatLng(r.lng), place: r.name || '' });
    this.placeForm.get('category')?.markAsDirty();
    this.utilsService.setLoading('');
    if (r.category) {
      this.categories$?.pipe(take(1)).subscribe({
        next: (categories) => {
          const category: Category | undefined = categories.find((c) => c.name == r.category);
          if (!category) return;
          this.placeForm.get('category')?.setValue(category.id);
        },
      });
    }
  }

  completionSearchText() {
    this.utilsService.setLoading('Querying Provider API...');
    const query = this.placeForm.get('name')?.value;
    if (!query) return;
    this.apiService.completionSearchText(query).subscribe({
      next: (results) => {
        this.utilsService.setLoading('');
        if (!results.length) {
          this.utilsService.toast('warn', 'No result', 'No result available for this autocompletion');
          return;
        }

        if (results.length == 1) {
          this.providerToForm(results[0]);
          return;
        }

        const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateProviderModalComponent, {
          header: 'Select Provider Place',
          modal: true,
          appendTo: 'body',
          closable: true,
          dismissableMask: true,
          draggable: false,
          resizable: false,
          data: results,
          width: '40vw',
          breakpoints: {
            '960px': '70vw',
            '640px': '90vw',
          },
        })!;

        modal.onClose.pipe(take(1)).subscribe({
          next: (result: ProviderPlaceResult | null) => {
            if (!result) return;
            this.providerToForm(result);
          },
        });
      },
      error: () => this.utilsService.setLoading(''),
    });
  }

  toggleCheckbox(k: string) {
    this.placeForm.get(k)?.setValue(!this.placeForm.get(k)?.value);
    this.placeForm.markAsDirty();
  }

  setImageFromUrl() {
    if (!this.imageUrl) return;
    this.storePreviousImageAndClear();
    this.placeForm.get('image')?.setValue(this.imageUrl);
    this.placeForm.get('image')?.markAsDirty();
    this.showImageUrlDialog = false;
    this.imageUrl = '';
  }
}
