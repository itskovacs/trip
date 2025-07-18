import { Component } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { DynamicDialogRef } from "primeng/dynamicdialog";
import { FloatLabelModule } from "primeng/floatlabel";
import { TextareaModule } from "primeng/textarea";

@Component({
  selector: "app-batch-create-modal",
  imports: [FloatLabelModule, ButtonModule, ReactiveFormsModule, TextareaModule],
  standalone: true,
  templateUrl: "./batch-create-modal.component.html",
  styleUrl: "./batch-create-modal.component.scss",
})
export class BatchCreateModalComponent {
  batchInput = new FormControl("");

  constructor(private ref: DynamicDialogRef) {}

  closeDialog() {
    this.ref.close(this.batchInput.value);
  }
}
