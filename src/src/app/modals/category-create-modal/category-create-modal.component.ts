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
import { FocusTrapModule } from "primeng/focustrap";

@Component({
  selector: "app-category-create-modal",
  imports: [
    FloatLabelModule,
    InputTextModule,
    ButtonModule,
    ReactiveFormsModule,
    FocusTrapModule,
  ],
  standalone: true,
  templateUrl: "./category-create-modal.component.html",
  styleUrl: "./category-create-modal.component.scss",
})
export class CategoryCreateModalComponent {
  categoryForm: FormGroup;
  previous_image: string | null = null;
  updatedImage = false;

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.categoryForm = this.fb.group({
      id: -1,
      name: ["", Validators.required],
      image: null,
    });

    if (this.config.data) {
      let patchValue = this.config.data.category;
      this.categoryForm.patchValue(patchValue);
    }
  }

  closeDialog() {
    // Normalize data for API POST
    let ret = this.categoryForm.value;
    if (!ret["name"]) return;
    if (!this.updatedImage) delete ret["image"];
    this.ref.close(ret);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        this.categoryForm.get("image")?.setValue(e.target?.result as string);
        this.categoryForm.get("image")?.markAsDirty();
        this.updatedImage = true;
      };

      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.categoryForm.get("image")?.setValue(null);
  }
}
