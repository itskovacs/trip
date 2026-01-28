import { Component, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';

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
  readonly packingCategories = [
    { value: 'clothes', dispValue: 'Clothes' },
    { value: 'toiletries', dispValue: 'Toiletries' },
    { value: 'tech', dispValue: 'Tech' },
    { value: 'documents', dispValue: 'Documents' },
    { value: 'other', dispValue: 'Other' },
  ];

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
  ) {
    this.packingForm = this.fb.group({
      qt: null,
      text: ['', { validators: Validators.required }],
      category: ['', { validators: Validators.required }],
    });
  }

  closeDialog() {
    if (!this.packingForm.valid) return;

    let ret = this.packingForm.value;
    this.ref.close(ret);
  }
}
