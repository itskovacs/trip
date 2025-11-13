import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TextareaModule } from 'primeng/textarea';

@Component({
  selector: 'app-batch-create-modal',
  imports: [FloatLabelModule, ButtonModule, ReactiveFormsModule, TextareaModule],
  standalone: true,
  templateUrl: './batch-create-modal.component.html',
  styleUrl: './batch-create-modal.component.scss',
})
export class BatchCreateModalComponent {
  batchInput = new FormControl('');

  constructor(private ref: DynamicDialogRef) {}

  closeDialog() {
    this.ref.close(this.batchInput.value);
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length == 1) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        this.batchInput.setValue(e.target?.result as string);
      };

      reader.onerror = (e) => {
        console.error('Error reading file:', e);
      };

      reader.readAsText(file);
    }
  }
}
