import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-trip-skeleton',
  standalone: true,
  imports: [ButtonModule, SkeletonModule],
  templateUrl: './trip-skeleton.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripSkeletonComponent {
  showBackButton = input(false);
  back = output<void>();
}
