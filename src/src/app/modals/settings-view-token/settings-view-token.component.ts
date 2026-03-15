import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { ClipboardModule } from '@angular/cdk/clipboard';

@Component({
  selector: 'app-settings-view-token',
  imports: [ButtonModule, ClipboardModule],
  standalone: true,
  templateUrl: './settings-view-token.component.html',
  styleUrl: './settings-view-token.component.scss',
})
export class SettingsViewTokenComponent {
  token: string = '';
  msg: string = "This is your TRIP API Key, save it now as you won't be able to see it again";

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    if (this.config.data) {
      this.token = this.config.data.token;
      if (this.config.data.msg) this.msg = this.config.data.msg;
    }
  }

  close() {
    this.ref.close();
  }
}
