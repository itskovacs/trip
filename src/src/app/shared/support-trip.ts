import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TranslocoDirective } from '@jsverse/transloco';

const TRIP_COUNTER = 'TRIP_SUPPORT_COUNTER';
const TRIP_SUPPORTED = 'TRIP_SUPPORT_DONE';

@Component({
  selector: 'app-support-trip',
  standalone: true,
  imports: [CommonModule, ButtonModule, TranslocoDirective],
  template: `
    @if (showSupport()) {
      <ng-container *transloco="let t; prefix: 'support'">
        <div
          animate.enter="slide-from-y"
          animate.leave="a-slide-from-y"
          class="w-full fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-4 sm:translate-x-0 z-50 animate-fade-in-up pointer-events-none">
          <div
            class="pointer-events-auto w-[90vw] sm:w-md flex flex-col gap-3 p-4 ring-1 ring-black/5 dark:ring-white/10 bg-white/70 dark:bg-primary-900/70
          backdrop-blur-xl rounded-lg shadow-2xl mx-auto sm:ml-0">
            <div class="flex items-center gap-3">
              <div
                class="flex items-center justify-center size-10 rounded-full bg-pink-100 dark:bg-pink-900/30 shrink-0">
                <i class="pi pi-heart-fill text-pink-500 animate-pulse"></i>
              </div>
              <div>
                <h3 class="text-sm font-bold text-primary-900 dark:text-white leading-tight">{{ t('support') }}</h3>
                <p class="text-xs font-medium text-primary-600 dark:text-primary-400 mt-1 leading-relaxed">
                  {{ t('support_desc') }}<b>{{ t('support_desc_coffee') }}</b
                  >. {{ t('support_desc_thankyou') }}
                </p>
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 mt-1">
              <p-button [label]="t('not_now')" size="small" text severity="secondary" (click)="dismiss()" />
              <a href="https://ko-fi.com/itskovacs" target="_blank" rel="noopener noreferrer">
                <p-button
                  [label]="t('support_btn')"
                  size="small"
                  icon="pi pi-heart-fill"
                  iconPos="right"
                  (click)="dismiss(true)" />
              </a>
            </div>
          </div>
        </div>
      </ng-container>
    }
  `,
})
export class SupportTripComponent implements OnInit {
  showSupport = signal(false);

  ngOnInit() {
    const didSupport = localStorage.getItem(TRIP_SUPPORTED);
    if (didSupport) return;

    const openCount = parseInt(localStorage.getItem(TRIP_COUNTER) || '0', 10) + 1;
    localStorage.setItem(TRIP_COUNTER, openCount.toString());
    if (openCount > 9) setTimeout(() => this.showSupport.set(true), 2500);
  }

  dismiss(support: boolean = false) {
    this.showSupport.set(false);
    localStorage.setItem(TRIP_COUNTER, '0');
    if (support) localStorage.setItem(TRIP_SUPPORTED, '1');
  }
}
