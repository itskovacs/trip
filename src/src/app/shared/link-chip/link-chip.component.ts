import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LinkDisplay, parseLinkDisplay } from '../link-display';

@Component({
  selector: 'app-link-chip',
  standalone: true,
  imports: [],
  templateUrl: './link-chip.component.html',
  styleUrls: ['./link-chip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkChipComponent {
  @Input({ required: true }) url!: string;

  get display(): LinkDisplay {
    return parseLinkDisplay(this.url);
  }
}
