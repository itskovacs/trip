import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { ProviderPlaceResult } from '../../types/provider';

@Component({
  selector: 'app-place-create-provider-modal',
  imports: [ButtonModule],
  standalone: true,
  templateUrl: './place-create-provider-modal.component.html',
  styleUrl: './place-create-provider-modal.component.scss',
})
export class PlaceCreateProviderModalComponent {
  results: ProviderPlaceResult[];

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    this.results = this.config.data;
  }

  closeDialog(data: ProviderPlaceResult) {
    this.ref.close(data);
  }
}
