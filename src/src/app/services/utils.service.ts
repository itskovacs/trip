import { inject, Injectable } from "@angular/core";
import { MessageService } from "primeng/api";
import { TripStatus } from "../types/trip";
import { ApiService } from "./api.service";
import { map } from "rxjs";

type ToastSeverity = "info" | "warn" | "error" | "success";

@Injectable({
  providedIn: "root",
})
export class UtilsService {
  private apiService = inject(ApiService);
  currency$ = this.apiService.settings$.pipe(map((s) => s?.currency ?? "€"));

  readonly statuses: TripStatus[] = [
    { label: "pending", color: "#3258A8" },
    { label: "booked", color: "#00A341" },
    { label: "constraint", color: "#FFB900" },
    { label: "optional", color: "#625A84" },
  ];

  constructor(private ngMessageService: MessageService) {}

  toGithubTRIP() {
    window.open("https://github.com/itskovacs/trip", "_blank");
  }

  toggleDarkMode() {
    const element = document.querySelector("html");
    element?.classList.toggle("dark");
  }

  toast(
    severity: ToastSeverity = "info",
    summary = "Info",
    detail = "",
    life = 3000,
  ): void {
    this.ngMessageService.add({
      severity,
      summary,
      detail,
      life,
    });
  }

  parseGoogleMapsUrl(url: string): [place: string, latlng: string] {
    // Look /place/<place>/ and !3d<lat> and !4d<lng>
    const placeMatch = url.match(/\/place\/([^\/]+)/);
    const latMatch = url.match(/!3d([\d\-.]+)/);
    const lngMatch = url.match(/!4d([\d\-.]+)/);

    if (!placeMatch || !latMatch || !lngMatch) {
      this.toast("error", "Error", "Unrecognized Google Maps URL format");
      console.error("Unrecognized Google Maps URL format");
      return ["", ""];
    }

    const place = decodeURIComponent(placeMatch[1].replace(/\+/g, " ").trim());
    const latlng = `${latMatch[1]},${lngMatch[1]}`;
    return [place, latlng];
  }

  static currencySigns(): { c: string; s: string }[] {
    return [
      { c: "EUR", s: "€" },
      { c: "GBP", s: "£" },
      { c: "JPY", s: "¥" },
      { c: "USD", s: "$" },
      { c: "CHF", s: "CHF" },
    ];
  }
}
