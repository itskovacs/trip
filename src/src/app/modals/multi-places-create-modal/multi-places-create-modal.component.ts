import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { ApiService } from '../../services/api.service';
import { UtilsService } from '../../services/utils.service';
import { Category, Place } from '../../types/poi';
import { PlaceCreateModalComponent } from '../place-create-modal/place-create-modal.component';
import { map, take } from 'rxjs';
import { DialogModule } from 'primeng/dialog';
import { TripBase } from '../../types/trip';
import { toSignal } from '@angular/core/rxjs-interop';
import { PopoverModule } from 'primeng/popover';
import { YesNoModalComponent } from '../yes-no-modal/yes-no-modal.component';

@Component({
  selector: 'app-multi-places-create-modal',
  imports: [ButtonModule, DialogModule, PopoverModule],
  standalone: true,
  templateUrl: './multi-places-create-modal.component.html',
  styleUrl: './multi-places-create-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiPlacesCreateModalComponent {
  apiService = inject(ApiService);
  ref = inject(DynamicDialogRef);
  dialogService = inject(DialogService);
  config = inject(DynamicDialogConfig);
  utilsService = inject(UtilsService);

  categories = toSignal(this.apiService.getCategories(), { initialValue: [] as Category[] });
  places = signal<Place[]>([]);
  isTripsDialogVisible = signal(false);
  trips = signal<TripBase[]>([]);
  linkToTripId = signal<number | null>(null);

  categoryById = computed(() => new Map(this.categories().map((c: Category) => [c.id, c])));
  categoryIdByName = computed(() => new Map(this.categories().map((c: Category) => [c.name, c.id])));
  validPlaces = computed(() => this.places().filter((p) => this.isPlaceValid(p)).length);
  hasInvalidPlace = computed(() => this.places().some((p) => !this.isPlaceValid(p)));
  duplicatePlaceNames = computed(() => {
    const places = this.places();
    const seen = new Map<string, Place[]>();

    places.forEach((p) => {
      const key = `${p.name?.trim().toLowerCase() || ''}_${p.lat?.toFixed(6) || ''}_${p.lng?.toFixed(6) || ''}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(p);
    });
    const duplicateNames: string[] = [];
    seen.forEach((group) => {
      if (group.length > 1 && group[0].name) duplicateNames.push(group[0].name);
    });
    return duplicateNames;
  });

  hasDuplicates = computed(() => this.duplicatePlaceNames().length > 0);

  constructor() {
    if (!this.config.data?.places) {
      this.ref.close(null);
      return;
    }

    effect(() => {
      const categories = this.categories();
      if (!categories.length || this.places().length) return;

      const parsedPlaces = this.config.data.places.map((p: Place, i: number) => {
        const category_id = this.categoryIdByName().get(p.category as unknown as string);
        return { ...p, id: i, category_id };
      });

      this.sortAndSetPlaces(parsedPlaces);
    });
  }

  sortAndSetPlaces(places: Place[]) {
    const sorted = [...places].sort((a, b) => {
      const nameA = a.name?.toLowerCase() || '';
      const nameB = b.name?.toLowerCase() || '';
      return nameA.localeCompare(nameB);
    });
    this.places.set(sorted);
  }

  categoryIDToCategory(id: number) {
    return this.categoryById().get(id);
  }

  editPlace(pEdit: Place) {
    const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Edit Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '55vw',
      breakpoints: {
        '1920px': '70vw',
        '1260px': '90vw',
      },
      data: { place: { ...pEdit, category: pEdit.category_id } },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (p: Place | null) => {
        if (!p) return;
        const updated = this.places().map((place) => (place.id === p.id ? p : place));
        this.sortAndSetPlaces(updated);
      },
    });
  }

  deletePlace(p: Place) {
    this.places.update((places) => places.filter((place) => place.id !== p.id));
  }

  isPlaceValid(p: Place) {
    return !!(p?.category_id && p.place && p.name && typeof p.lat === 'number' && typeof p.lng === 'number');
  }

  openTripsModal() {
    this.isTripsDialogVisible.set(true);
    if (this.trips().length) return;
    this.apiService
      .getTrips()
      .pipe(
        map((trips) => trips.filter((t) => !t.archived)),
        take(1),
      )
      .subscribe((trips) => this.trips.set(trips));
  }

  cancelLinkToTrip() {
    this.linkToTripId.set(null);
  }

  linkToTrip(trip: TripBase) {
    this.linkToTripId.set(trip.id);
    this.isTripsDialogVisible.set(false);
  }

  closeDialog() {
    if (this.hasInvalidPlace()) {
      this.utilsService.toast(
        'warn',
        'Incomplete place(s)',
        'You have incomplete place(s). Look for the red text with asterisk (*) to spot incomplete places.',
      );
      return;
    }

    const tripId = this.linkToTripId();
    if (!tripId) {
      this.ref.close({ places: this.places(), trip: null });
      return;
    }

    this.apiService
      .getTrip(tripId)
      .pipe(take(1))
      .subscribe((trip) => this.ref.close({ places: this.places(), trip }));
  }

  bulkApplyCategory(category: string): void {
    const confirmModal = this.dialogService.open(YesNoModalComponent, {
      header: 'Possible duplicate',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: `Apply ${category} to places with none?`,
    })!;

    confirmModal.onClose.pipe(take(1)).subscribe({
      next: (confirmed: boolean) => {
        if (!confirmed) return;
        const categoryId = this.categoryIdByName().get(category);
        const updated = this.places().map((p) => (this.isPlaceValid(p) ? p : { ...p, category_id: categoryId }));
        this.sortAndSetPlaces(updated);
      },
    });
  }

  removeDuplicates() {
    const seen = new Map<string, Place>();
    const unique: Place[] = [];

    this.places().forEach((p) => {
      const key = `${p.name?.trim().toLowerCase() || ''}_${p.lat?.toFixed(6) || ''}_${p.lng?.toFixed(6) || ''}`;
      if (!seen.has(key)) {
        seen.set(key, p);
        unique.push(p);
      }
    });

    this.sortAndSetPlaces(unique);
  }
}
