import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';

@Component({
  selector: 'app-trip-create-checklist-modal',
  imports: [FloatLabelModule, InputTextModule, ButtonModule, ReactiveFormsModule, FocusTrapModule],
  standalone: true,
  templateUrl: './trip-create-checklist-modal.component.html',
  styleUrl: './trip-create-checklist-modal.component.scss',
})
export class TripCreateChecklistModalComponent {
  checklistForm: FormGroup;
  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.checklistForm = this.fb.group({
      id: -1,
      text: ['', { validators: Validators.required }],
    });

    const patchValue = this.config.data?.packing;
    if (patchValue) {
      this.checklistForm.patchValue(patchValue);
    }
  }

  closeDialog() {
    if (!this.checklistForm.valid) return;

    let ret = this.checklistForm.value;
    this.ref.close(ret);
  }
}
