import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';
import { ToastHost } from './shared/toast/toast-host';

@Component({
  imports: [RouterOutlet, ToastHost],
  selector: 'app-root',
  template: `<router-outlet /><app-toast-host />`,
})
export class App {
  /** Instancié dès le démarrage pour appliquer le thème mémorisé, y compris sur la page de connexion. */
  protected readonly theme = inject(ThemeService);
}
