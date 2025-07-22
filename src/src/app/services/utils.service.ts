import { inject, Injectable } from "@angular/core";
import { MessageService } from "primeng/api";
import { TripStatus } from "../types/trip";
import { ApiService } from "./api.service";
import { map } from "rxjs";

const DISABLE_LOWNET = "TRIP_DISABLE_LOWNET";

@Injectable({
  providedIn: "root",
})
export class UtilsService {
  private apiService = inject(ApiService);
  currency$ = this.apiService.settings$.pipe(map((s) => s?.currency ?? "€"));
  public isLowNet: boolean = true;

  constructor(private ngMessageService: MessageService) {
    this.isLowNet = !localStorage.getItem(DISABLE_LOWNET);
  }

  toGithubTRIP() {
    window.open("https://github.com/itskovacs/trip", "_blank");
  }

  toggleLowNet() {
    if (this.isLowNet) {
      localStorage.setItem(DISABLE_LOWNET, "1");
    } else {
      localStorage.removeItem(DISABLE_LOWNET);
    }
    this.isLowNet = !this.isLowNet;
  }

  get statuses(): TripStatus[] {
    return [
      { label: "pending", color: "#3258A8" },
      { label: "booked", color: "#007A30" },
      { label: "constraint", color: "#FFB900" },
      { label: "optional", color: "#625A84" },
    ];
  }

  toast(severity = "info", summary = "Info", detail = "", life = 3000): void {
    this.ngMessageService.add({
      severity,
      summary,
      detail,
      life,
    });
  }

  parseGoogleMapsUrl(url: string): [string, string] {
    const match = url.match(/place\/(.*)\/@([\d\-.]+,[\d\-.]+)/);

    if (!match?.length || match?.length < 3) {
      console.error("Incorrect Google Maps URL format");
      return ["", ""];
    }

    let place = decodeURIComponent(match[1].trim().replace(/\+/g, " "));
    let latlng = match[2].trim();

    return [place, latlng];
  }

  currencySigns(): { c: string; s: string }[] {
    return [
      { c: "EUR", s: "€" },
      { c: "GBP", s: "£" },
      { c: "JPY", s: "¥" },
      { c: "USD", s: "$" },
    ];
  }
}
