import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';

@Component({
  selector: 'app-trip-invite-member-modal',
  imports: [FloatLabelModule, InputTextModule, ButtonModule, ReactiveFormsModule, FocusTrapModule],
  standalone: true,
  templateUrl: './trip-invite-member-modal.component.html',
  styleUrl: './trip-invite-member-modal.component.scss',
})
export class TripInviteMemberModalComponent {
  memberForm = new FormControl('');
  constructor(private ref: DynamicDialogRef) {}

  closeDialog() {
    if (!this.memberForm.value) return;

    this.ref.close(this.memberForm.value);
  }
}
