import { Component, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';
import { DatePickerModule } from 'primeng/datepicker';
import { ApiService } from '../../services/api.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-trip-create-modal',
  imports: [FloatLabelModule, InputTextModule, DatePickerModule, ButtonModule, ReactiveFormsModule, FocusTrapModule],
  standalone: true,
  templateUrl: './trip-create-modal.component.html',
  styleUrl: './trip-create-modal.component.scss',
})
export class TripCreateModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  tripForm: FormGroup;
  previous_image_id: number | null = null;
  previous_image: string | null = null;

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
    private apiService: ApiService,
  ) {
    this.tripForm = this.fb.group({
      id: -1,
      name: ['', Validators.required],
      image: '',
      currency: null,
      image_id: null,
      daterange: null,
    });

    const patchValue = this.config.data?.trip;
    if (patchValue) {
      if (!patchValue.image_id) delete patchValue['image'];
      this.tripForm.patchValue(patchValue);
    } else {
      this.apiService
        .getSettings()
        .pipe(take(1))
        .subscribe({
          next: (settings) => this.tripForm.get('currency')?.setValue(settings.currency),
        });
    }
  }

  closeDialog() {
    if (!this.tripForm.valid) return;
    let ret = this.tripForm.value;
    if (!ret['name']) return;
    if (ret['image_id']) {
      delete ret['image'];
      delete ret['image_id'];
    }
    this.ref.close(ret);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        if (this.tripForm.get('image_id')?.value) {
          this.previous_image_id = this.tripForm.get('image_id')?.value;
          this.previous_image = this.tripForm.get('image')?.value;
          this.tripForm.get('image_id')?.setValue(null);
        }

        this.tripForm.get('image')?.setValue(e.target?.result as string);
        this.tripForm.get('image')?.markAsDirty();
      };

      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.tripForm.get('image')?.setValue(null);

    if (this.previous_image && this.previous_image_id) {
      this.tripForm.get('image_id')?.setValue(this.previous_image_id);
      this.tripForm.get('image')?.setValue(this.previous_image);
    }
  }
}
