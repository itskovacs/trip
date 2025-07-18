import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, Observable, switchMap, throwError } from "rxjs";
import { AuthService } from "./auth.service";
import { UtilsService } from "./utils.service";

export const Interceptor = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const utilsService = inject(UtilsService);

  if (!req.headers.has("enctype") && !req.headers.has("Content-Type")) {
    req = req.clone({
      setHeaders: {
        "Content-Type": "application/json",
        "Accept-Language": "en-US;q=0.9,en-US,en;q=0.8",
      },
    });
  }

  if (authService.accessToken && !authService.isTokenExpired(authService.accessToken)) {
    if (req.url.startsWith(authService.apiBaseUrl)) {
      req = req.clone({
        setHeaders: { Authorization: `Bearer ${authService.accessToken}` },
      });
    }
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status == 400) {
        console.error(err);
        utilsService.toast(
          "error",
          "Bad Request",
          `${err.error?.detail || err.error || "Unknown error, check console for details"}`
        );
        return throwError(
          () => `Bad Request: ${err.error?.detail || err.error || "Unknown error, check console for details"}`
        );
      }

      if (err.status == 403) {
        console.error(err);
        utilsService.toast("error", "Error", `${err.error?.detail || err.error || "You are not allowed to do this"}`);
        return throwError(() => `Bad Request: ${err.error?.detail || err.error || "You are not allowed to do this"}`);
      }

      if (err.status == 409) {
        console.error(err);
        utilsService.toast("error", "Error", `${err.error?.detail || err.error || "Conflict on resource"}`);
        return throwError(() => `Bad Request: ${err.error?.detail || err.error || "Conflict on resource"}`);
      }

      if (err.status == 413) {
        console.error(err);
        utilsService.toast(
          "error",
          "Request entity too large",
          "The resource you are trying to upload or create is too big"
        );
        return throwError(() => "Request entity too large, the resource you are trying to upload or create is too big");
      }

      if (err.status == 422) {
        console.error(err);
        utilsService.toast("error", "Unprocessable Entity ", "The resource you sent was unprocessable");
        return throwError(() => "Resource sent was unprocessable");
      }

      if (err.status == 502) {
        console.error(err);
        utilsService.toast("error", "Bad Gateway", "Check your connectivity and ensure the server is up and running");
        return throwError(() => "Bad Request: Check your connectivity and ensure the server is up and running");
      }

      if (err.status == 503) {
        console.error(err);
        utilsService.toast(
          "error",
          "Service Unavailable",
          `${err.error?.detail || err.statusText || "Resource not available"}`
        );
        return throwError(() => "Service Unavailable: Resource not available");
      }

      if (err.status == 401 && authService.accessToken) {
        //  Handle 401 on Refresh (RT expired)
        if (req.url.endsWith("/refresh")) {
          authService.logout("Your session has expired", true);
          return throwError(() => "Your session has expired");
        }

        // Unauthenticated, AT exists but is expired (authServices.accessToken truethy), we refresh it
        return authService.refreshAccessToken().pipe(
          switchMap((tokens) => {
            req = req.clone({
              setHeaders: {
                Authorization: `Bearer ${tokens.access_token}`,
              },
            });
            return next(req);
          })
        );
      } else {
        //  If any API route 401 -> redirect to login. We skip /refresh/ to prevent toast on login errors.
        if (!req.url.endsWith("/refresh")) {
          if (err instanceof HttpErrorResponse && err.status === 401) {
            authService.logout(`${err.error?.detail || err.error || "You must be authenticated"}`, true);
          }
        }
      }

      return throwError(() => err);
    })
  );
};
