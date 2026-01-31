import { Component, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';
import { ColorPickerModule } from 'primeng/colorpicker';
import { Category } from '../../types/poi';

@Component({
  selector: 'app-category-create-modal',
  imports: [
    FloatLabelModule,
    InputTextModule,
    FormsModule,
    ButtonModule,
    ColorPickerModule,
    ReactiveFormsModule,
    FocusTrapModule,
  ],
  standalone: true,
  templateUrl: './category-create-modal.component.html',
  styleUrl: './category-create-modal.component.scss',
})
export class CategoryCreateModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  categoryForm: FormGroup;
  updatedImage = false;

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.categoryForm = this.fb.group({
      id: -1,
      name: ['', Validators.required],
      color: [
        '#000000',
        {
          validators: [Validators.required, Validators.pattern('\#[abcdefABCDEF0-9]{6}')],
        },
      ],
      image: null,
    });

    const patchValue = this.config.data?.category as Category | undefined;
    if (patchValue) this.categoryForm.patchValue(patchValue);
  }

  closeDialog() {
    if (!this.categoryForm.valid) return;
    let ret = this.categoryForm.value;
    if (!this.updatedImage) delete ret['image'];
    this.ref.close(ret);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        this.categoryForm.get('image')?.setValue(e.target?.result as string);
        this.categoryForm.get('image')?.markAsDirty();
        this.updatedImage = true;
      };

      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.categoryForm.get('image')?.setValue(null);
    this.updatedImage = false;
  }

  updateColorFromPicker(value: string) {
    this.categoryForm.get('color')?.setValue(value.toUpperCase());
    this.categoryForm.get('color')?.markAsDirty();
  }
}
