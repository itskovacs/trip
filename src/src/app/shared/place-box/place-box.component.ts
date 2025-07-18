import { Component, EventEmitter, Input, Output } from "@angular/core";
import { ButtonModule } from "primeng/button";
import { MenuModule } from "primeng/menu";
import { Place } from "../../types/poi";
import { MenuItem } from "primeng/api";
import { UtilsService } from "../../services/utils.service";
import { Observable } from "rxjs";
import { AsyncPipe } from "@angular/common";

@Component({
  selector: "app-place-box",
  standalone: true,
  imports: [ButtonModule, MenuModule, AsyncPipe],
  templateUrl: "./place-box.component.html",
  styleUrls: ["./place-box.component.scss"],
})
export class PlaceBoxComponent {
  @Input() selectedPlace: Place | undefined = undefined;

  @Output() editEmitter = new EventEmitter<any>();
  @Output() deleteEmitter = new EventEmitter<any>();
  @Output() visitEmitter = new EventEmitter<any>();
  @Output() favoriteEmitter = new EventEmitter<any>();
  @Output() gpxEmitter = new EventEmitter<any>();
  @Output() closeEmitter = new EventEmitter<any>();

  menuItems: MenuItem[] = [];
  currency$: Observable<string>;

  constructor(private utilsService: UtilsService) {
    this.currency$ = this.utilsService.currency$;

    let items = [
      {
        label: "Edit",
        icon: "pi pi-pencil",
        iconClass: "text-blue-500!",
        command: () => {
          this.editPlace();
        },
      },
      {
        label: "Favorite",
        icon: "pi pi-star",
        iconClass: "text-yellow-500!",
        command: () => {
          this.favoritePlace();
        },
      },
      {
        label: "Mark",
        icon: "pi pi-check",
        iconClass: "text-green-500!",
        command: () => {
          this.visitPlace();
        },
      },
      {
        label: "Delete",
        icon: "pi pi-trash",
        iconClass: "text-red-500!",
        command: () => {
          this.deletePlace();
        },
      },
    ];

    if (this.selectedPlace?.gpx) {
      items.push({
        label: "Display GPX",
        icon: "pi pi-compass",
        iconClass: "text-gray-500!",
        command: () => {
          this.displayGPX();
        },
      });
    }

    this.menuItems = [
      {
        label: "Place",
        items: items,
      },
    ];
  }

  visitPlace() {
    this.visitEmitter.emit();
  }

  favoritePlace() {
    this.favoriteEmitter.emit();
  }

  editPlace() {
    this.editEmitter.emit();
  }

  displayGPX() {
    this.gpxEmitter.emit();
  }

  deletePlace() {
    this.deleteEmitter.emit();
  }

  close() {
    this.closeEmitter.emit();
  }
}
