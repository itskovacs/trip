import { Component, HostListener } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TextareaModule } from 'primeng/textarea';

@Component({
  selector: 'app-trip-notes-modal',
  imports: [FloatLabelModule, TextareaModule, ButtonModule, ReactiveFormsModule],
  standalone: true,
  templateUrl: './trip-notes-modal.component.html',
  styleUrl: './trip-notes-modal.component.scss',
})
export class TripNotesModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  notes = new FormControl('');
  isArchived = false;
  isEditing: boolean = false;

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    if (this.config.data) {
      if (this.config.data.notes) this.notes.setValue(this.config.data.notes);
      this.isArchived = this.config.data.archived;
    }
  }

  cancelEditing() {
    this.notes.setValue(this.config.data.notes);
    this.notes.markAsPristine();
    this.toggleEditing();
  }

  toggleEditing() {
    this.isEditing = !this.isEditing;
  }

  closeDialog() {
    this.ref.close(this.notes.value);
  }
}
