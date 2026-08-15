import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-trip-list-name-modal',
  imports: [FloatLabelModule, InputTextModule, ButtonModule, ReactiveFormsModule, FocusTrapModule, TranslocoDirective],
  standalone: true,
  templateUrl: './trip-list-name-modal.component.html',
})
export class TripListNameModalComponent {
  listForm: FormGroup;
  isEditMode = false;

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.listForm = this.fb.group({
      name: ['', { validators: Validators.required }],
    });

    const name = this.config.data?.name;
    if (name) {
      this.isEditMode = true;
      this.listForm.patchValue({ name });
    }
  }

  closeDialog() {
    if (!this.listForm.valid) return;
    this.ref.close(this.listForm.value.name);
  }
}
