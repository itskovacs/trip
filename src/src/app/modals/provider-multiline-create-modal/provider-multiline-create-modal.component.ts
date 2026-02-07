import { Component, HostListener } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TextareaModule } from 'primeng/textarea';

@Component({
  selector: 'app-provider-multiline-create-modal',
  imports: [FloatLabelModule, ButtonModule, ReactiveFormsModule, TextareaModule],
  standalone: true,
  templateUrl: './provider-multiline-create-modal.component.html',
  styleUrl: './provider-multiline-create-modal.component.scss',
})
export class ProviderMultilineCreateModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  batchInput = new FormControl('');
  constructor(private ref: DynamicDialogRef) {}

  closeDialog() {
    if (!this.batchInput.value) return;
    this.ref.close(this.batchInput.value?.split('\n'));
  }
}
