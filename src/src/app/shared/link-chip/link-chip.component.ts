import { ChangeDetectionStrategy, Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { DialogService } from 'primeng/dynamicdialog';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { take } from 'rxjs';
import { groupLinksByDomain, LinkGroup } from '../link-display';
import { LinkEditModalComponent, LinkEditModalResult } from '../../modals/link-edit-modal/link-edit-modal.component';

@Component({
  selector: 'app-link-chip',
  standalone: true,
  imports: [ButtonModule, TooltipModule, TranslocoDirective],
  templateUrl: './link-chip.component.html',
  styleUrls: ['./link-chip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkChipComponent {
  @Input({ required: true }) links!: string[];
  @Input() editable = false;
  @Output() linksChange = new EventEmitter<string[]>();

  private dialogService = inject(DialogService);
  private translocoService = inject(TranslocoService);

  get groups(): LinkGroup[] {
    return groupLinksByDomain(this.links);
  }

  editLink(index: number) {
    const modal = this.dialogService.open(LinkEditModalComponent, {
      header: this.translocoService.translate('entities.link.edit'),
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: { url: this.links[index] },
    })!;

    modal.onClose.pipe(take(1)).subscribe((result: LinkEditModalResult | undefined) => {
      if (!result) return;
      if (result.deleted) {
        this.linksChange.emit(this.links.filter((_, i) => i !== index));
      } else if (result.url) {
        this.linksChange.emit(this.links.map((l, i) => (i === index ? result.url! : l)));
      }
    });
  }
}
