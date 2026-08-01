import { Component, HostListener, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { take } from 'rxjs';
import { isValidUrl } from '../../shared/link-display';
import { YesNoModalComponent } from '../yes-no-modal/yes-no-modal.component';

export interface LinkEditModalResult {
  url?: string;
  deleted?: boolean;
}

@Component({
  selector: 'app-link-edit-modal',
  imports: [FloatLabelModule, InputTextModule, ButtonModule, ReactiveFormsModule, FocusTrapModule, TranslocoDirective],
  standalone: true,
  templateUrl: './link-edit-modal.component.html',
  styleUrl: './link-edit-modal.component.scss',
})
export class LinkEditModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  linkForm: FormGroup;
  private dialogService = inject(DialogService);
  private translocoService = inject(TranslocoService);

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
    private fb: FormBuilder,
  ) {
    this.linkForm = this.fb.group({
      url: [this.config.data?.url ?? ''],
    });
  }

  isValidUrl(url: string): boolean {
    return isValidUrl(url);
  }

  closeDialog() {
    const url: string = (this.linkForm.value.url ?? '').trim();
    if (!url || !this.isValidUrl(url)) return;
    this.ref.close({ url } as LinkEditModalResult);
  }

  deleteLink() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: this.translocoService.translate('entities.link.delete'),
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: this.translocoService.translate('entities.link.delete_desc'),
    })!;

    modal.onClose.pipe(take(1)).subscribe((confirmed: boolean) => {
      if (confirmed) this.ref.close({ deleted: true } as LinkEditModalResult);
    });
  }
}
