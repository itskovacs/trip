import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { Place } from '../../types/poi';
import { PlaceBoxContentComponent } from '../place-box-content/place-box-content.component';

@Component({
  selector: 'app-place-box',
  standalone: true,
  imports: [PlaceBoxContentComponent],
  templateUrl: './place-box.component.html',
  styleUrls: ['./place-box.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceBoxComponent {
  @Input() selectedPlace: Place | null = null;

  @Output() editEmitter = new EventEmitter<void>();
  @Output() deleteEmitter = new EventEmitter<void>();
  @Output() visitEmitter = new EventEmitter<void>();
  @Output() favoriteEmitter = new EventEmitter<void>();
  @Output() gpxEmitter = new EventEmitter<void>();
  @Output() closeEmitter = new EventEmitter<void>();
  @Output() openNavigationEmitter = new EventEmitter<void>();
  @Output() flyToEmitter = new EventEmitter<void>();

  visitPlace() {
    this.visitEmitter.emit();
  }

  favoritePlace() {
    this.favoriteEmitter.emit();
  }

  editPlace() {
    this.editEmitter.emit();
  }

  displayGPX() {
    this.gpxEmitter.emit();
  }

  deletePlace() {
    this.deleteEmitter.emit();
  }

  openNavigationToPlace() {
    this.openNavigationEmitter.emit();
  }

  flyToPlace() {
    this.flyToEmitter.emit();
  }

  close() {
    this.closeEmitter.emit();
  }
}
