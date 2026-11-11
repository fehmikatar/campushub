import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';
import { Role } from './role';

/** Connecté (renouvelle le token si besoin) ; sinon connexion ou « Session expirée » ; sans rôle CampusHub : 403. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const checkRole = () =>
    auth.user()?.role ? true : router.createUrlTree(['/forbidden']);

  if (auth.isAuthenticated() && !auth.isAccessTokenExpired()) {
    return checkRole();
  }
  if (auth.hasSession()) {
    return auth.refresh().pipe(
      map(() => checkRole()),
      catchError(() => {
        auth.logout();
        return of(router.createUrlTree(['/session-expired']));
      }),
    );
  }
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Réserve une route à certains rôles (à placer après authGuard). */
export const roleGuard =
  (...roles: Role[]): CanActivateFn =>
  () => {
    const role = inject(AuthService).user()?.role;
    return role && roles.includes(role) ? true : inject(Router).createUrlTree(['/forbidden']);
  };

/** Page de connexion : inutile si la session est déjà valide. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() && !auth.isAccessTokenExpired()
    ? inject(Router).createUrlTree(['/'])
    : true;
};
