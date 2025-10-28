import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { InputOtpModule } from 'primeng/inputotp';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-totp-verify-modal',
  imports: [ButtonModule, ClipboardModule, InputOtpModule, FormsModule],
  standalone: true,
  templateUrl: './totp-verify-modal.component.html',
  styleUrl: './totp-verify-modal.component.scss',
})
export class TotpVerifyModalComponent {
  token: string = '';
  message: string = '';
  otp: string = '';

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    if (this.config.data) {
      this.token = this.config.data.token;
      this.message = this.config.data.message;
    }
  }

  close() {
    this.ref.close(this.otp);
  }
}
