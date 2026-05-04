import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';

@Component({
  selector: 'app-yes-no-modal',
  imports: [ButtonModule, TranslocoDirective],
  standalone: true,
  templateUrl: './yes-no-modal.component.html',
  styleUrl: './yes-no-modal.component.scss',
})
export class YesNoModalComponent {
  msg = '';

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    this.msg = this.config.data;
  }

  confirm(confirm = false) {
    this.ref.close(confirm);
  }
}
