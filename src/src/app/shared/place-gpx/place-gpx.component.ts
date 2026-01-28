import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Place } from '../../types/poi';

@Component({
  selector: 'app-place-gpx',
  standalone: true,
  imports: [ButtonModule],
  templateUrl: './place-gpx.component.html',
  styleUrls: ['./place-gpx.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceGPXComponent {
  @Input() selectedPlace: Place | null = null;
  @Output() closeEmitter = new EventEmitter<void>();
  @Output() removeEmitter = new EventEmitter<void>();
  @Output() downloadEmitter = new EventEmitter<void>();

  constructor() {}

  close() {
    this.closeEmitter.emit();
  }

  removeTrace() {
    this.removeEmitter.emit();
  }

  downloadTrace() {
    this.downloadEmitter.emit();
  }
}
