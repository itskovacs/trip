import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { UtilsService } from "./utils.service";
import { AuthService } from "./auth.service";
import { of, switchMap, take } from "rxjs";

export const AuthGuard: CanActivateFn = (_, state) => {
  const router: Router = inject(Router);
  const utilsService = inject(UtilsService);

  return inject(AuthService)
    .isLoggedIn()
    .pipe(
      take(1),
      switchMap((authenticated) => {
        if (!authenticated) {
          const redirectURL =
            state.url === "/auth" ? "" : `redirectURL=${state.url}`;
          const urlTree = router.parseUrl(`auth?${redirectURL}`);
          utilsService.toast(
            "warn",
            "Authentication required",
            "You must be authenticated",
          );
          return of(urlTree);
        }

        return of(true);
      }),
    );
};
