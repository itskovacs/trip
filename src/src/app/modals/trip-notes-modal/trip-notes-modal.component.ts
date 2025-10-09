import { Component } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
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
  isEditing: boolean = false;

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    if (this.config.data) {
      this.notes.setValue(this.config.data);
    }
  }

  cancelEditing() {
    this.notes.setValue(this.config.data);
    this.notes.markAsPristine();
    this.toggleEditing();
  }

  toggleEditing() {
    this.isEditing = !this.isEditing;
  }

  closeDialog() {
    // Normalize data for API POST
    this.ref.close(this.notes.value);
  }
}
