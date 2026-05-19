import { Component, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TranslocoDirective } from '@jsverse/transloco';
import { PackingItem } from '../../types/trip';

@Component({
  selector: 'app-trip-create-packing-modal',
  imports: [
    FloatLabelModule,
    InputTextModule,
    ButtonModule,
    ReactiveFormsModule,
    FocusTrapModule,
    SelectModule,
    InputNumberModule,
    TranslocoDirective,
  ],
  standalone: true,
  templateUrl: './trip-create-packing-modal.component.html',
  styleUrl: './trip-create-packing-modal.component.scss',
})
export class TripCreatePackingModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  packingForm: FormGroup;
  isEditMode = false;
  readonly packingCategories = [
    { value: 'clothes', dispValue: 'modals.packing.categories.clothes' },
    { value: 'toiletries', dispValue: 'modals.packing.categories.toiletries' },
    { value: 'tech', dispValue: 'modals.packing.categories.tech' },
    { value: 'documents', dispValue: 'modals.packing.categories.documents' },
    { value: 'other', dispValue: 'modals.packing.categories.other' },
  ];

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
    private fb: FormBuilder,
  ) {
    const existing: PackingItem | undefined = this.config.data;
    this.isEditMode = !!existing;
    this.packingForm = this.fb.group({
      qt: [existing?.qt ?? null],
      text: [existing?.text ?? '', { validators: Validators.required }],
      category: [existing?.category ?? '', { validators: Validators.required }],
    });
  }

  closeDialog() {
    if (!this.packingForm.valid) return;
    this.ref.close(this.packingForm.value);
  }
}
