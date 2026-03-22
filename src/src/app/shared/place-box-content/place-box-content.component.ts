import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal, effect, inject, SimpleChanges, OnChanges } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { Place } from '../../types/poi';
import { MenuItem } from 'primeng/api';
import { UtilsService } from '../../services/utils.service';
import { ApiService } from '../../services/api.service';
import { Observable, forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
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
export class PlaceBoxContentComponent implements OnChanges {
  @Input() selectedPlace: Place | null = null;
  @Input() showButtons: boolean = true;
  @Input() showMeta: boolean = true;
  tooltipCopied = signal(false);

  placeDetails = signal<any>(null);
  restaurantDetails = signal<any>(null);
  dishes = signal<any[]>([]);

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
  private apiService = inject(ApiService);

  constructor(private utilsService: UtilsService) {
    this.currency$ = this.utilsService.currency$;
    this.buildMenu();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedPlace'] && this.selectedPlace?.id) {
      this.placeDetails.set(null);
      this.restaurantDetails.set(null);
      this.dishes.set([]);
      this.buildMenu();

      const placeId = this.selectedPlace.id;
      this.apiService.getPlaceDetails(placeId).pipe(take(1)).subscribe({
        next: (details) => this.placeDetails.set(details),
        error: () => {},
      });
      this.apiService.getRestaurantDetails(placeId).pipe(take(1)).subscribe({
        next: (details) => this.restaurantDetails.set(details),
        error: () => {},
      });
      this.apiService.getRestaurantDishes(placeId).pipe(take(1)).subscribe({
        next: (dishes) => this.dishes.set(dishes || []),
        error: () => {},
      });
    }
  }

  getGoogleMapsQuery(place: any): string {
    const query = (place.name + ' ' + (place.place || '')).trim();
    return encodeURIComponent(query);
  }

  formatOpeningHours(hours: any): string {
    if (!hours) return '';
    if (typeof hours === 'string') return hours;
    if (Array.isArray(hours)) return hours.join(', ');
    if (typeof hours === 'object') {
      return Object.entries(hours)
        .map(([day, time]) => `${day}: ${time}`)
        .join('\n');
    }
    return String(hours);
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
