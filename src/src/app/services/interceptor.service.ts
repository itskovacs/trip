import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
} from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, Observable, switchMap, take, throwError } from "rxjs";
import { AuthService } from "./auth.service";
import { UtilsService } from "./utils.service";

const ERROR_CONFIG: Record<number, { title: string; detail: string }> = {
  400: {
    title: "Bad Request",
    detail: "Unknown error, check console for details",
  },
  403: { title: "Forbidden", detail: "You are not allowed to do this" },
  409: { title: "Conflict", detail: "Conflict on resource" },
  413: { title: "Request Entity Too Large", detail: "The resource is too big" },
  422: {
    title: "Unprocessable Entity",
    detail: "The resource you sent was unprocessable",
  },
  502: {
    title: "Bad Gateway",
    detail: "Check your connectivity and ensure the server is up",
  },
  503: { title: "Service Unavailable", detail: "Resource not available" },
};

export const Interceptor = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const utilsService = inject(UtilsService);

  function showAndThrowError(title: string, details: string) {
    utilsService.toast("error", title, details);
    return throwError(() => details);
  }

  if (!req.headers.has("enctype") && !req.headers.has("Content-Type")) {
    req = req.clone({
      setHeaders: {
        "Content-Type": "application/json",
        "Accept-Language": "en-US;q=0.9,en-US,en;q=0.8",
      },
    });
  }

  if (
    authService.accessToken &&
    !authService.isTokenExpired(authService.accessToken)
  ) {
    if (req.url.startsWith(authService.apiBaseUrl)) {
      req = req.clone({
        setHeaders: { Authorization: `Bearer ${authService.accessToken}` },
      });
    }
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const errDetails = ERROR_CONFIG[err.status];
      if (errDetails) {
        console.error(err);
        return showAndThrowError(
          errDetails.title,
          `${err.error?.detail || err.message || errDetails.detail}`,
        );
      }

      if (err.status == 401 && authService.accessToken) {
        //  Handle 401 on Refresh (RT expired)
        if (req.url.endsWith("/refresh")) {
          authService.logout("Your session has expired", true);
          return throwError(() => "Your session has expired");
        }

        // Unauthenticated, AT exists but is expired (authServices.accessToken truethy), we refresh it
        return authService.refreshAccessToken().pipe(
          take(1),
          switchMap((tokens) => {
            const refreshedReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${tokens.access_token}`,
              },
            });
            return next(refreshedReq);
          }),
        );
      } else if (err.status == 401 && !req.url.endsWith("/refresh")) {
        //  If any API route 401 -> redirect to login. We skip /refresh/ to prevent toast on login errors.
        authService.logout(
          `${err.error?.detail || err.message || "You must be authenticated"}`,
          true,
        );
      }

      console.error(err);
      return showAndThrowError(
        "Request Error",
        `${err.error?.detail || err.message || "Unknown error, check console for details"}`,
      );
    }),
  );
};
