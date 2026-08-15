import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { FocusTrapModule } from 'primeng/focustrap';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-trip-create-checklist-modal',
  imports: [
    FloatLabelModule,
    InputTextModule,
    DatePickerModule,
    ButtonModule,
    ReactiveFormsModule,
    FocusTrapModule,
    TranslocoDirective,
  ],
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
      notify_dt: null,
    });

    const patchValue = this.config.data?.packing;
    if (patchValue) {
      this.checklistForm.patchValue({
        ...patchValue,
        // notify_dt is stored as naive UTC (no offset); appending 'Z' tells
        // Date to parse it as UTC instead of assuming local time.
        notify_dt: patchValue.notify_dt ? new Date(patchValue.notify_dt + 'Z') : null,
      });
    }
  }

  closeDialog() {
    if (!this.checklistForm.valid) return;

    let ret = this.checklistForm.value;
    if (ret['notify_dt']) ret['notify_dt'] = this.formatUtcDateTime(ret['notify_dt']);
    this.ref.close(ret);
  }

  private formatUtcDateTime(date: Date) {
    return date.toISOString().slice(0, 19);
  }
}
