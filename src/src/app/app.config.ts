import { ApplicationConfig, provideZoneChangeDetection, isDevMode, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { providePrimeNG } from 'primeng/config';
import { TripThemePreset } from '../mytheme';
import { MessageService } from 'primeng/api';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Interceptor } from './services/interceptor.service';
import { DialogService } from 'primeng/dynamicdialog';
import { provideServiceWorker } from '@angular/service-worker';
import { TranslocoHttpLoader } from './transloco-loader';
import { getBrowserLang, provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideTranslocoPersistTranslations } from '@jsverse/transloco-persist-translations';
import { lastValueFrom } from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([Interceptor])),
    providePrimeNG({
      translation: {
        firstDayOfWeek: 1,
      },
      theme: {
        preset: TripThemePreset,
        options: { darkModeSelector: '.dark' },
      },
    }),
    MessageService,
    DialogService,
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideTransloco({
      config: {
        availableLangs: ['en', 'fr', 'nl', 'pt-BR'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideTranslocoPersistTranslations({
      loader: TranslocoHttpLoader,
      storage: { useValue: localStorage },
    }),
    provideAppInitializer(() => {
      const translocoService = inject(TranslocoService);
      const availableLangs = translocoService.getAvailableLangs() as string[];

      const fullLang = navigator.language.toLowerCase();
      const baseLang = getBrowserLang() ?? translocoService.getDefaultLang();

      const lang =
        availableLangs.find((l) => l.toLowerCase() === fullLang) ??
        availableLangs.find((l) => l.toLowerCase() === baseLang) ??
        translocoService.getDefaultLang();

      translocoService.setActiveLang(lang);
      return lastValueFrom(translocoService.load(lang));
    }),
  ],
};
