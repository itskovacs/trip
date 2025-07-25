import { Component } from "@angular/core";
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
import { TripDay, TripStatus } from "../../types/trip";
import { Place } from "../../types/poi";
import { SelectModule } from "primeng/select";
import { TextareaModule } from "primeng/textarea";
import { InputMaskModule } from "primeng/inputmask";
import { UtilsService } from "../../services/utils.service";
import { checkAndParseLatLng, formatLatLng } from "../../shared/latlng-parser";

@Component({
  selector: "app-trip-create-day-item-modal",
  imports: [
    FloatLabelModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
    ReactiveFormsModule,
    TextareaModule,
    FloatLabelModule,
    InputTextModule,
    ButtonModule,
    ReactiveFormsModule,
    InputMaskModule,
  ],
  standalone: true,
  templateUrl: "./trip-create-day-item-modal.component.html",
  styleUrl: "./trip-create-day-item-modal.component.scss",
})
export class TripCreateDayItemModalComponent {
  itemForm: FormGroup;
  days: TripDay[] = [];
  places: Place[] = [];
  statuses: TripStatus[] = [];

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
    private utilsService: UtilsService,
  ) {
    this.statuses = this.utilsService.statuses;

    this.itemForm = this.fb.group({
      id: -1,
      time: [
        "",
        {
          validators: [
            Validators.required,
            Validators.pattern(/^([01]\d|2[0-3])(:[0-5]\d)?$/),
          ],
        },
      ],
      text: ["", Validators.required],
      comment: "",
      day_id: [null, Validators.required],
      place: null,
      status: null,
      price: 0,
      lat: [
        "",
        {
          validators: Validators.pattern("-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)"),
          updateOn: "blur",
        },
      ],
      lng: [
        "",
        {
          validators: Validators.pattern(
            "-?(180(\\.0+)?|1[0-7]\\d(\\.\\d+)?|[1-9]?\\d(\\.\\d+)?)",
          ),
        },
      ],
    });

    if (this.config.data) {
      const item = this.config.data.item;
      if (item)
        this.itemForm.patchValue({ ...item, place: item.place?.id || null });

      this.places = this.config.data.places;
      this.days = this.config.data.days;
      if (this.config.data.selectedDay)
        this.itemForm.get("day_id")?.setValue(this.config.data.selectedDay);
    }

    this.itemForm.get("place")?.valueChanges.subscribe({
      next: (value?: number) => {
        if (!value) {
          this.itemForm.get("lat")?.setValue("");
          this.itemForm.get("lng")?.setValue("");
        }
        if (value) {
          const p: Place = this.places.find((p) => p.id === value) as Place;
          this.itemForm.get("lat")?.setValue(p.lat);
          this.itemForm.get("lng")?.setValue(p.lng);
          this.itemForm.get("price")?.setValue(p.price || 0);
          if (!this.itemForm.get("text")?.value)
            this.itemForm.get("text")?.setValue(p.name);
        }
      },
    });

    this.itemForm.get("lat")?.valueChanges.subscribe({
      next: (value: string) => {
        const result = checkAndParseLatLng(value);
        if (!result) return;

        const [lat, lng] = result;
        const latControl = this.itemForm.get("lat");
        const lngControl = this.itemForm.get("lng");

        latControl?.setValue(formatLatLng(lat), { emitEvent: false });
        lngControl?.setValue(formatLatLng(lng), { emitEvent: false });

        lngControl?.markAsDirty();
        lngControl?.updateValueAndValidity();
      },
    });
  }

  closeDialog() {
    // Normalize data for API POST
    let ret = this.itemForm.value;
    if (!ret["lat"]) {
      ret["lat"] = null;
      ret["lng"] = null;
    }
    if (!ret["place"]) delete ret["place"];
    this.ref.close(ret);
  }
}
