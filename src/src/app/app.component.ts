import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { LoaderComponent } from './shared/loader';
import { UtilsService } from './services/utils.service';
import { SupportTripComponent } from './shared/support-trip';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastModule, LoaderComponent, SupportTripComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private utilsService = inject(UtilsService);
  loadingMessage = this.utilsService.loadingMessage;

  constructor() {
    this.utilsService.initDarkMode();
  }
}
