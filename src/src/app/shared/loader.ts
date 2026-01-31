import { Component, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message()) {
      <div
        class="z-[9000] flex items-center justify-center min-h-screen p-4 absolute inset-0 bg-white/30 dark:bg-primary-950/80 backdrop-blur-xl">
        <div
          class="flex flex-col items-center gap-8 px-12 py-10
                bg-white/80 dark:bg-primary-950/80 rounded-3xl
                 shadow-2xl shadow-black/5 dark:shadow-black/20
                 border border-primary-100/50 dark:border-primary-800/50
                 max-w-md w-full">
          <div class="relative w-24 h-24">
            <svg
              class="absolute inset-0 w-24 h-24 animate-spin-slow text-primary-500/30 dark:text-primary-400/20"
              viewBox="0 0 100 100"
              fill="none">
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                stroke-width="3"
                stroke-dasharray="70 200"
                stroke-linecap="round" />
            </svg>

            <svg
              class="absolute inset-0 w-24 h-24 animate-spin text-primary-600 dark:text-primary-500"
              viewBox="0 0 100 100"
              fill="none">
              <circle
                cx="50"
                cy="50"
                r="35"
                stroke="currentColor"
                stroke-width="4"
                stroke-dasharray="30 180"
                stroke-linecap="round" />
            </svg>

            <div class="absolute inset-0 flex items-center justify-center">
              <span class="size-4 bg-primary-600 dark:bg-primary-500 rounded-full"></span>
            </div>
          </div>

          <div class="text-center space-y-3 w-full">
            <h3 class="text-xl font-bold text-primary-900 dark:text-white tracking-tight">
              {{ message() }}
            </h3>
            <p class="text-sm text-primary-600 dark:text-primary-400 font-medium leading-relaxed max-w-xs mx-auto">
              This may take a moment. Please wait.
            </p>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      @keyframes spin-slow {
        to {
          transform: rotate(360deg);
        }
      }

      .animate-spin-slow {
        animation: spin-slow 3s linear infinite;
      }
    `,
  ],
})
export class LoaderComponent {
  message = input<string>();
}
