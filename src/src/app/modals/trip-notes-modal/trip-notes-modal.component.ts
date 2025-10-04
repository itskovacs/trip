import { Component } from "@angular/core";
import { FormBuilder, FormControl, ReactiveFormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { DynamicDialogConfig, DynamicDialogRef } from "primeng/dynamicdialog";
import { FloatLabelModule } from "primeng/floatlabel";
import { TextareaModule } from "primeng/textarea";

@Component({
  selector: "app-trip-notes-modal",
  imports: [
    FloatLabelModule,
    TextareaModule,
    ButtonModule,
    ReactiveFormsModule,
  ],
  standalone: true,
  templateUrl: "./trip-notes-modal.component.html",
  styleUrl: "./trip-notes-modal.component.scss",
})
export class TripNotesModalComponent {
  notes = new FormControl("");

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    if (this.config.data) {
      this.notes.setValue(this.config.data);
    }
  }

  closeDialog() {
    // Normalize data for API POST
    this.ref.close(this.notes.value);
  }
}
