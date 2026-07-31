import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { groupLinksByDomain, LinkGroup } from '../link-display';

@Component({
  selector: 'app-link-chip',
  standalone: true,
  imports: [],
  templateUrl: './link-chip.component.html',
  styleUrls: ['./link-chip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkChipComponent {
  @Input({ required: true }) links!: string[];

  get groups(): LinkGroup[] {
    return groupLinksByDomain(this.links);
  }
}
