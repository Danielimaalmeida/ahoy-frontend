import type {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { API_BASE, trimBase } from '@core/api/api-base';
import { AUTH_STRATEGY } from './auth-strategy';
import { FedevAuthService } from '@company-name-fedev/auth';

/**
 * Adds the headers of the `AuthStrategy` to requests to the API, and only to those: a request to anything else, such as
 * `/config.json`, is left alone. With `NoAuthStrategy` there are none, so no request changes.
 *
 * If the strategy fails (a token it could not refresh), the request fails with that error and the client reports it as an
 * `invalid_response`: a tooling failure, not a verdict.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(FedevAuthService);
  const base = trimBase(inject(API_BASE));
  if (request.url !== base && !request.url.startsWith(`${base}/`))
    return next(request);
  const strategy = inject(AUTH_STRATEGY);
  return from(strategy.headers()).pipe(
    switchMap((headers) =>
      next(
        Object.keys(headers).length > 0
          ? request.clone({ setHeaders: headers })
          : request
      )
    ),
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authService.logout();
        location.reload();
      }
      return throwError(() => error);
    })
  );
};
