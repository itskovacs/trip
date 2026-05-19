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
        availableLangs: ['en', 'fr', 'pt-BR'],
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
      // Browser frn we set to fr, else defaults to english
      const translocoService = inject(TranslocoService);
      const availableLangs = translocoService.getAvailableLangs() as string[];

      // navigator.language gives the full tag e.g. 'pt-BR', 'pt-PT', 'fr-FR'
      const fullLang = navigator.language;
      const exactMatch = availableLangs.find((lang) => lang.toLowerCase() === fullLang.toLowerCase());

      if (exactMatch) {
        translocoService.setActiveLang(exactMatch);
        return;
      }

      // Strips the region, giving just 'pt', 'fr' etc.
      const baseLang = fullLang.split('-')[0];
      const baseMatch = availableLangs.find((lang) => lang.toLowerCase().startsWith(baseLang.toLowerCase()));

      if (baseMatch) translocoService.setActiveLang(baseMatch);
    }),
  ],
};
