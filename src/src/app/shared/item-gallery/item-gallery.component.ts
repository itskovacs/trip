import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { TranslocoPipe } from '@jsverse/transloco';
import { TripItemImage } from '../../types/trip';

@Component({
  selector: 'app-item-gallery',
  standalone: true,
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cover(); as coverImg) {
      <div class="mt-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs font-semibold uppercase tracking-wide text-primary-500 dark:text-primary-400">
            {{ 'common.fields.image' | transloco }}
          </span>
          <span class="text-xs text-black/40 dark:text-white/40">{{ images().length }}</span>
        </div>

        <div class="flex gap-2 items-start">
          <button
            type="button"
            (click)="open(0)"
            class="group relative size-40 shrink-0 overflow-hidden rounded-2xl
               ring-1 ring-black/5 dark:ring-white/10 shadow-sm cursor-zoom-in
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            <img
              [src]="coverImg.url"
              loading="lazy"
              class="size-full object-cover transition duration-500 ease-out
                 group-hover:scale-105 group-hover:brightness-105" />
          </button>

          @if (rest().length) {
            <div class="grid grid-cols-2 sm:grid-cols-4 grid-rows-4 sm:grid-rows-2 gap-2 h-40 flex-1 min-w-0">
              @for (img of visibleRest(); track img.id; let i = $index) {
                <button
                  type="button"
                  (click)="open(i + 1)"
                  class="group relative overflow-hidden rounded-lg
                     ring-1 ring-black/5 dark:ring-white/10 cursor-zoom-in
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                  <img
                    [src]="img.url"
                    loading="lazy"
                    class="size-full object-cover transition duration-500 ease-out
                       group-hover:scale-105 group-hover:brightness-105" />
                  @if (i === visibleRest().length - 1 && overflowCount() > 0) {
                    <div
                      class="absolute inset-0 flex items-center justify-center bg-black/55
                            text-white text-xs font-semibold backdrop-blur-[2px]">
                      +{{ overflowCount() }}
                    </div>
                  }
                </button>
              }
            </div>
          }
        </div>
      </div>
    }

    <ng-template #lightbox>
      <div
        animate.enter="fade-scale"
        animate.leave="a-fade-scale"
        role="dialog"
        [attr.aria-label]="'common.fields.image' | transloco"
        (click)="close()"
        class="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md">
        <img
          [src]="activeImage().url"
          (click)="$event.stopPropagation()"
          class="max-h-[88vh] max-w-[92vw] object-contain rounded-xl shadow-2xl ring-1 ring-white/10" />

        @if (ordered().length > 1) {
          <div
            (click)="$event.stopPropagation()"
            class="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10
                   px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {{ index() + 1 }} / {{ ordered().length }}
          </div>

          <button
            type="button"
            (click)="prev(); $event.stopPropagation()"
            [attr.aria-label]="'common.actions.previous' | transloco"
            class="cursor-pointer absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 size-10 sm:size-12
                   flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition">
            <i class="pi pi-chevron-left"></i>
          </button>
          <button
            type="button"
            (click)="next(); $event.stopPropagation()"
            [attr.aria-label]="'common.actions.next' | transloco"
            class="cursor-pointer absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 size-10 sm:size-12
                   flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition">
            <i class="pi pi-chevron-right"></i>
          </button>
        }

        <button
          type="button"
          (click)="close(); $event.stopPropagation()"
          [attr.aria-label]="'common.actions.close' | transloco"
          class="cursor-pointer absolute top-4 right-4 size-10 flex items-center justify-center
                 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
          <i class="pi pi-times"></i>
        </button>
      </div>
    </ng-template>
  `,
  host: {
    '(document:keydown.escape)': 'close()',
    '(document:keydown.arrowleft)': 'onArrowLeft()',
    '(document:keydown.arrowright)': 'onArrowRight()',
  },
})
export class ItemGalleryComponent {
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private overlayRef?: OverlayRef;

  private readonly lightboxTpl = viewChild.required<TemplateRef<unknown>>('lightbox');

  images = input.required<TripItemImage[]>();
  coverId = input<number | undefined>(undefined);
  maxThumbnails = input(8);

  readonly cover = computed<TripItemImage | undefined>(() => {
    const imgs = this.images();
    return imgs.find((i) => i.id === this.coverId()) ?? imgs[0];
  });

  readonly ordered = computed(() => {
    const coverImg = this.cover();
    const others = this.images().filter((i) => i.id !== coverImg?.id);
    return coverImg ? [coverImg, ...others] : others;
  });

  readonly rest = computed(() => this.ordered().slice(1));
  readonly visibleRest = computed(() => this.rest().slice(0, this.maxThumbnails()));
  readonly overflowCount = computed(() => Math.max(0, this.rest().length - this.maxThumbnails()));

  readonly index = signal(0);
  readonly activeImage = computed(() => this.ordered()[this.index()]);

  open(startIndex: number) {
    this.index.set(startIndex);

    this.overlayRef = this.overlay.create({
      hasBackdrop: false,
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
      scrollStrategy: this.overlay.scrollStrategies.block(),
    });

    this.overlayRef.attach(new TemplatePortal(this.lightboxTpl(), this.vcr));
  }

  close() {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  next() {
    this.index.set((this.index() + 1) % this.ordered().length);
  }

  prev() {
    this.index.set((this.index() - 1 + this.ordered().length) % this.ordered().length);
  }

  onArrowLeft() {
    if (this.overlayRef) this.prev();
  }

  onArrowRight() {
    if (this.overlayRef) this.next();
  }
}
