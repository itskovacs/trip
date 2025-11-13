import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { ApiService } from '../../services/api.service';
import { SkeletonModule } from 'primeng/skeleton';
import { UtilsService } from '../../services/utils.service';
import { TooltipModule } from 'primeng/tooltip';
import { Category, Place } from '../../types/poi';
import { PlaceCreateModalComponent } from '../place-create-modal/place-create-modal.component';
import { take } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-multi-places-create-modal',
  imports: [
    FloatLabelModule,
    InputTextModule,
    CommonModule,
    ButtonModule,
    ReactiveFormsModule,
    SkeletonModule,
    TooltipModule,
  ],
  standalone: true,
  templateUrl: './multi-places-create-modal.component.html',
  styleUrl: './multi-places-create-modal.component.scss',
})
export class MultiPlacesCreateModalComponent {
  places: Place[] = [];
  categories: Category[] = [];

  constructor(
    private apiService: ApiService,
    private ref: DynamicDialogRef,
    private dialogService: DialogService,
    private config: DynamicDialogConfig,
    private utilsService: UtilsService,
  ) {
    this.apiService
      .getCategories()
      .pipe(take(1))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.places = this.config.data?.places.map((p: Place, i: number) => {
            p.id = i;
            if (!p.category) return p;

            const category_id = this.categoryNameToCategoryID(p.category as unknown as string);
            return { ...p, category_id };
          });
        },
      });
  }

  categoryIDToCategory(id: number): Category {
    return this.categories.find((c) => c.id == id)!;
  }

  categoryNameToCategoryID(category: string): number | undefined {
    return this.categories.find((c) => c.name == category)?.id;
  }

  editPlace(pEdit: Place) {
    const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Edit Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      width: '55vw',
      breakpoints: {
        '1920px': '70vw',
        '1260px': '90vw',
      },
      data: {
        place: { ...pEdit, category: pEdit.category_id },
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (p: Place | null) => {
        if (!p) return;
        const index = this.places.findIndex((place) => place.id == p.id);
        if (index > -1) this.places.splice(index, 1, p);
      },
    });
  }

  isPlaceValid(p: Place) {
    return (
      p !== null &&
      typeof p === 'object' &&
      typeof p.category_id === 'number' &&
      typeof p.place === 'string' &&
      typeof p.name === 'string' &&
      typeof p.lat === 'number' &&
      typeof p.lng === 'number'
    );
  }

  closeDialog() {
    this.ref.close(null);
  }

  confirmDialog() {
    if (this.places.some((p) => !this.isPlaceValid(p))) {
      this.utilsService.toast('warn', 'Incomplete place(s)', 'You have incomplete place(s)');
      return;
    }
    this.ref.close(this.places);
  }
}
