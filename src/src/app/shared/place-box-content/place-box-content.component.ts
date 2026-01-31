import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { Place } from '../../types/poi';
import { MenuItem } from 'primeng/api';
import { UtilsService } from '../../services/utils.service';
import { Observable } from 'rxjs';
import { AsyncPipe } from '@angular/common';
import { LinkifyPipe } from '../pipes/linkify.pipe';
import { TooltipModule } from 'primeng/tooltip';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { NaturalDurationPipe } from '../pipes/naturalduration.pipe';

@Component({
  selector: 'app-place-box-content',
  standalone: true,
  imports: [ButtonModule, MenuModule, AsyncPipe, LinkifyPipe, ClipboardModule, TooltipModule, NaturalDurationPipe],
  templateUrl: './place-box-content.component.html',
  styleUrls: ['./place-box-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceBoxContentComponent {
  @Input() selectedPlace: Place | null = null;
  @Input() showButtons: boolean = true;
  @Input() showMeta: boolean = true;
  tooltipCopied = signal(false);

  @Output() editEmitter = new EventEmitter<void>();
  @Output() deleteEmitter = new EventEmitter<void>();
  @Output() visitEmitter = new EventEmitter<void>();
  @Output() favoriteEmitter = new EventEmitter<void>();
  @Output() gpxEmitter = new EventEmitter<void>();
  @Output() closeEmitter = new EventEmitter<void>();
  @Output() openNavigationEmitter = new EventEmitter<void>();
  @Output() flyToEmitter = new EventEmitter<void>();

  menuItems: MenuItem[] = [];
  readonly currency$: Observable<string>;

  constructor(private utilsService: UtilsService) {
    this.currency$ = this.utilsService.currency$;
    this.buildMenu();
  }

  buildMenu() {
    const items = [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        iconClass: 'text-blue-500!',
        command: () => this.editPlace(),
      },
      {
        label: this.selectedPlace?.favorite ? 'Unfavorite' : 'Favorite',
        icon: this.selectedPlace?.favorite ? 'pi pi-heart-fill' : 'pi pi-heart',
        iconClass: 'text-rose-500!',
        command: () => this.favoritePlace(),
      },
      {
        label: this.selectedPlace?.visited ? 'Mark not visited' : 'Mark visited',
        icon: 'pi pi-check',
        iconClass: 'text-green-500!',
        command: () => this.visitPlace(),
      },
      {
        label: 'Fly To',
        icon: 'pi pi-expand',
        command: () => this.flyToPlace(),
      },
      {
        label: 'Navigation',
        icon: 'pi pi-car',
        command: () => this.openNavigationToPlace(),
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        iconClass: 'text-red-500!',
        command: () => this.deletePlace(),
      },
    ];

    if (this.selectedPlace?.gpx) {
      items.unshift({
        label: 'Display GPX',
        icon: 'pi pi-compass',
        iconClass: 'text-primary-500!',
        command: () => {
          this.displayGPX();
        },
      });
    }

    this.menuItems = [
      {
        label: 'Place',
        items: items,
      },
    ];
  }

  visitPlace() {
    this.visitEmitter.emit();
    this.selectedPlace!.visited = !this.selectedPlace?.visited;
    this.buildMenu();
  }

  favoritePlace() {
    this.favoriteEmitter.emit();
    this.selectedPlace!.favorite = !this.selectedPlace?.favorite;
    this.buildMenu();
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

  onCoordsCopied() {
    this.tooltipCopied.set(true);
    setTimeout(() => this.tooltipCopied.set(false), 1200);
  }
}
