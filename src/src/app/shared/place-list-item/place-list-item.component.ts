import { ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Place } from '../../types/poi';
import { ButtonModule } from 'primeng/button';
import { ApiService } from '../../services/api.service';
import { map } from 'rxjs';

@Component({
  selector: 'app-place-list-item',
  standalone: true,
  imports: [ButtonModule],
  templateUrl: './place-list-item.component.html',
  styleUrls: ['./place-list-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceListItemComponent {
  private apiService = inject(ApiService);
  showDogTag = toSignal(this.apiService.settings$.pipe(map((s) => s?.show_dog_tag !== false)), { initialValue: true });
  @Input() place: Place | null = null;
  @Input() editable: boolean = true;
  @Input() showMeta: boolean = false;
  @Input() grayscale: boolean = false;

  @Output() clickEmitter = new EventEmitter<void>();
  @Output() editEmitter = new EventEmitter<void>();
  @Output() mouseEnterEmitter = new EventEmitter<void>();
  @Output() mouseLeaveEmitter = new EventEmitter<void>();

  onPlaceClick() {
    this.clickEmitter.emit();
  }

  onPlaceEditClick() {
    this.editEmitter.emit();
  }

  onMouseEnter() {
    this.mouseEnterEmitter.emit();
  }

  onMouseLeave() {
    this.mouseLeaveEmitter.emit();
  }
}
