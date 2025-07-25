import { Routes } from "@angular/router";

import { AuthComponent } from "./components/auth/auth.component";

import { DashboardComponent } from "./components/dashboard/dashboard.component";
import { AuthGuard } from "./services/auth.guard";
import { TripComponent } from "./components/trip/trip.component";
import { TripsComponent } from "./components/trips/trips.component";

export const routes: Routes = [
  {
    path: "auth",
    pathMatch: "full",
    component: AuthComponent,
    title: "TRIP - Authentication",
  },

  {
    path: "",
    canActivate: [AuthGuard],
    children: [
      {
        path: "home",
        component: DashboardComponent,
        title: "TRIP - Map",
      },
      {
        path: "trips",
        children: [
          {
            path: "",
            component: TripsComponent,
            title: "TRIP - Trips",
          },
          {
            path: ":id",
            component: TripComponent,
            title: "TRIP - Trip",
          },
        ],
      },

      { path: "**", redirectTo: "/home", pathMatch: "full" },
    ],
  },

  { path: "**", redirectTo: "/", pathMatch: "full" },
];
