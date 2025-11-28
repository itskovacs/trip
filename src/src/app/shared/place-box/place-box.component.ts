import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { Place } from '../../types/poi';
import { MenuItem } from 'primeng/api';
import { UtilsService } from '../../services/utils.service';
import { Observable } from 'rxjs';
import { AsyncPipe } from '@angular/common';
import { LinkifyPipe } from '../linkify.pipe';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-place-box',
  standalone: true,
  imports: [ButtonModule, MenuModule, AsyncPipe, LinkifyPipe, TooltipModule],
  templateUrl: './place-box.component.html',
  styleUrls: ['./place-box.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceBoxComponent implements OnInit {
  @Input() selectedPlace: Place | undefined = undefined;

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
  }

  ngOnInit() {
    const items = [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        iconClass: 'text-blue-500!',
        command: () => this.editPlace(),
      },
      {
        label: 'Favorite',
        icon: 'pi pi-heart',
        iconClass: 'text-rose-500!',
        command: () => this.favoritePlace(),
      },
      {
        label: 'Mark',
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
        iconClass: 'text-gray-500!',
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
