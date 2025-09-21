import { Component } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { DynamicDialogConfig, DynamicDialogRef } from "primeng/dynamicdialog";
import { FloatLabelModule } from "primeng/floatlabel";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { TextareaModule } from "primeng/textarea";
import { Observable } from "rxjs";
import { AsyncPipe } from "@angular/common";
import { InputGroupModule } from "primeng/inputgroup";
import { InputGroupAddonModule } from "primeng/inputgroupaddon";
import { ApiService } from "../../services/api.service";
import { UtilsService } from "../../services/utils.service";
import { FocusTrapModule } from "primeng/focustrap";
import { Category, Place } from "../../types/poi";
import { CheckboxModule } from "primeng/checkbox";
import { TooltipModule } from "primeng/tooltip";
import { checkAndParseLatLng, formatLatLng } from "../../shared/latlng-parser";
import { InputNumberModule } from "primeng/inputnumber";

@Component({
  selector: "app-place-create-modal",
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
  ],
  standalone: true,
  templateUrl: "./place-create-modal.component.html",
  styleUrl: "./place-create-modal.component.scss",
})
export class PlaceCreateModalComponent {
  placeForm: FormGroup;
  categories$?: Observable<Category[]>;
  previous_image_id: number | null = null;
  previous_image: string | null = null;

  placeInputTooltip: string =
    "<div class='text-center'>You can paste a Google Maps Place link to fill <i>Name</i>, <i>Place</i>, <i>Lat</i>, <i>Lng</i>.</div>\n<div class='text-sm text-center'>https://google.com/maps/place/XXX</div>\n<div class='text-xs text-center'>Either « click » on a point of interest or « search » for it (eg: British Museum) and copy the URL</div>";

  constructor(
    private ref: DynamicDialogRef,
    private apiService: ApiService,
    private utilsService: UtilsService,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.categories$ = this.apiService.getCategories();

    this.placeForm = this.fb.group({
      id: -1,
      name: ["", Validators.required],
      place: ["", { validators: Validators.required, updateOn: "blur" }],
      lat: [
        "",
        {
          validators: [
            Validators.required,
            Validators.pattern("-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)"),
          ],
          updateOn: "blur",
        },
      ],
      lng: [
        "",
        {
          validators: [
            Validators.required,
            Validators.pattern(
              "-?(180(\\.0+)?|1[0-7]\\d(\\.\\d+)?|[1-9]?\\d(\\.\\d+)?)",
            ),
          ],
        },
      ],
      category: [null, Validators.required],
      description: null,
      duration: [null, Validators.pattern("\\d+")],
      price: null,
      allowdog: false,
      visited: false,
      image: null,
      image_id: null,
      gpx: null,
    });

    const patchValue = this.config.data?.place as Place | undefined;
    if (patchValue) this.placeForm.patchValue(patchValue);

    this.placeForm
      .get("place")
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value: string) => {
          const isGoogleMapsURL =
            /^(https?:\/\/)?(www\.)?google\.[a-z.]+\/maps/.test(value);
          if (isGoogleMapsURL) {
            this.parseGoogleMapsUrl(value);
          }
        },
      });

    this.placeForm
      .get("lat")
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value: string) => {
          const result = checkAndParseLatLng(value);
          if (!result) return;
          const [lat, lng] = result;

          const latControl = this.placeForm.get("lat");
          const lngControl = this.placeForm.get("lng");

          latControl?.setValue(formatLatLng(lat).trim(), { emitEvent: false });
          lngControl?.setValue(formatLatLng(lng).trim(), { emitEvent: false });

          lngControl?.markAsDirty();
          lngControl?.updateValueAndValidity();
        },
      });
  }

  closeDialog() {
    // Normalize data for API POST
    let ret = this.placeForm.value;
    ret["category_id"] = ret["category"];
    delete ret["category"];
    if (ret["image_id"]) {
      delete ret["image"];
      delete ret["image_id"];
    }
    if (ret["gpx"] == "1") delete ret["gpx"];
    ret["lat"] = +ret["lat"];
    ret["lng"] = +ret["lng"];
    this.ref.close(ret);
  }

  parseGoogleMapsUrl(url: string): void {
    const [place, latlng] = this.utilsService.parseGoogleMapsUrl(url);
    if (!place || !latlng) return;

    const [lat, lng] = latlng.split(",");
    this.placeForm.get("place")?.setValue(place);
    this.placeForm.get("lat")?.setValue(lat);
    this.placeForm.get("lng")?.setValue(lng);

    if (!this.placeForm.get("name")?.value)
      this.placeForm.get("name")?.setValue(place);
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        if (this.placeForm.get("image_id")?.value) {
          this.previous_image_id = this.placeForm.get("image_id")?.value;
          this.previous_image = this.placeForm.get("image")?.value;
          this.placeForm.get("image_id")?.setValue(null);
        }

        this.placeForm.get("image")?.setValue(e.target?.result as string);
        this.placeForm.get("image")?.markAsDirty();
      };

      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.placeForm.get("image")?.setValue(null);
    this.placeForm.get("image_id")?.setValue(null);

    if (this.previous_image && this.previous_image_id) {
      this.placeForm.get("image_id")?.setValue(this.previous_image_id);
      this.placeForm.get("image")?.setValue(this.previous_image);
    }
  }

  onGPXSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        this.placeForm.get("gpx")?.setValue(e.target?.result as string);
        this.placeForm.get("gpx")?.markAsDirty();
      };

      reader.readAsText(file);
    }
  }

  clearGPX() {
    this.placeForm.get("gpx")?.setValue(null);
    this.placeForm.get("gpx")?.markAsDirty();
  }
}
