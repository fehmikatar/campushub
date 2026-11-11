import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './shared/toast/toast-host';

@Component({
  imports: [RouterOutlet, ToastHost],
  selector: 'app-root',
  template: `<router-outlet /><app-toast-host />`,
})
export class App {}
