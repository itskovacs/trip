import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { UtilsService } from './utils.service';
import { AuthService } from './auth.service';
import { of, switchMap } from 'rxjs';

export const AuthGuard: CanActivateFn | CanActivateChildFn = (_, state) => {
  const router: Router = inject(Router);
  const utilsService = inject(UtilsService);

  return inject(AuthService)
    .isLoggedIn()
    .pipe(
      switchMap((authenticated) => {
        if (!authenticated) {
          const redirectURL =
            state.url === '/auth' ? '' : `redirectURL=${state.url}`;
          const urlTree = router.parseUrl(`auth?${redirectURL}`);
          utilsService.toast('error', 'Error', 'You must be authenticated');
          return of(urlTree);
        }

        return of(true);
      }),
    );
};
