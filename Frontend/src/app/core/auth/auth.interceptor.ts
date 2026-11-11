import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AppConfig } from '../config/app-config';
import { ToastService } from '../toast/toast.service';
import { AuthService } from './auth.service';

const withToken = (request: HttpRequest<unknown>, token: string | null) =>
  token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

/** Ajoute le token aux appels vers la Gateway (jamais vers Keycloak) et traite 401, 403 et 503. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(AppConfig);
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!request.url.startsWith(config.apiUrl)) {
    return next(request);
  }

  const sessionExpired = () => {
    auth.logout();
    void router.navigate(['/session-expired']);
  };

  return next(withToken(request, auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }
      if (error.status === 401) {
        // Une seule tentative de renouvellement, puis « Session expirée ».
        return auth.refresh().pipe(
          catchError(() => {
            sessionExpired();
            return throwError(() => error);
          }),
          switchMap((token) =>
            next(withToken(request, token)).pipe(
              catchError((retryError: unknown) => {
                if (retryError instanceof HttpErrorResponse && retryError.status === 401) {
                  sessionExpired();
                }
                return throwError(() => retryError);
              }),
            ),
          ),
        );
      }
      if (error.status === 403) {
        void router.navigate(['/forbidden']);
      } else if (error.status === 503) {
        toast.error('Service momentanément indisponible');
      }
      return throwError(() => error);
    }),
  );
};
