import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-settings-view-token',
  imports: [ButtonModule, ClipboardModule, TranslocoDirective],
  standalone: true,
  templateUrl: './settings-view-token.component.html',
  styleUrl: './settings-view-token.component.scss',
})
export class SettingsViewTokenComponent {
  token: string = '';
  msg: string = '';

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
    private translocoService: TranslocoService,
  ) {
    this.msg = this.translocoService.translate('modals.totp.msg');
    if (this.config.data) {
      this.token = this.config.data.token;
      if (this.config.data.msg) this.msg = this.config.data.msg;
    }
  }

  close() {
    this.ref.close();
  }
}
