import { Component, HostListener } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputOtpModule } from 'primeng/inputotp';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-update-password-modal',
  imports: [ButtonModule, InputTextModule, InputOtpModule, FormsModule, ReactiveFormsModule, FloatLabelModule],
  standalone: true,
  templateUrl: './update-password-modal.component.html',
  styleUrl: './update-password-modal.component.scss',
})
export class UpdatePasswordModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  otpEnabled: boolean = false;
  otp: string = '';
  current = new FormControl('');
  updated = new FormControl('');

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    this.otpEnabled = this.config.data;
  }

  closeDialog() {
    if (!this.current.value || !this.updated.value) return;
    if (this.otpEnabled && !this.otp) return;

    this.ref.close({
      code: this.otp,
      current: this.current.value,
      updated: this.updated.value,
    });
  }
}
