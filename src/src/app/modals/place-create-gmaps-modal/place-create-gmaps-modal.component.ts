import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { GooglePlaceResult } from '../../types/poi';

@Component({
  selector: 'app-place-create-gmaps-modal',
  imports: [ButtonModule],
  standalone: true,
  templateUrl: './place-create-gmaps-modal.component.html',
  styleUrl: './place-create-gmaps-modal.component.scss',
})
export class PlaceCreateGmapsModalComponent {
  results: GooglePlaceResult[];

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    this.results = this.config.data;
  }

  closeDialog(data: GooglePlaceResult) {
    this.ref.close(data);
  }
}
