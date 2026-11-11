import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AppConfig } from './core/config/app-config';
import { routes } from './app.routes';
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(() => inject(AppConfig).load()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
  ],
};
