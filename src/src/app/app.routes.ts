import { Routes } from '@angular/router';

import { AuthComponent } from './components/auth/auth.component';

import { DashboardComponent } from './components/dashboard/dashboard.component';
import { AuthGuard } from './services/auth.guard';
import { TripComponent } from './components/trip/trip.component';
import { TripsComponent } from './components/trips/trips.component';
import { SharedTripComponent } from './components/shared-trip/shared-trip.component';

export const routes: Routes = [
  {
    path: 'auth',
    pathMatch: 'full',
    component: AuthComponent,
    title: 'TravelThing - Authentication',
  },

  {
    path: 's',
    children: [
      {
        path: 't/:token',
        component: SharedTripComponent,
        title: 'TravelThing - Shared Trip',
      },

      { path: '**', redirectTo: '/home', pathMatch: 'full' },
    ],
  },

  {
    path: '',
    canActivate: [AuthGuard],
    children: [
      {
        path: 'home',
        component: DashboardComponent,
        title: 'TravelThing - Map',
      },
      {
        path: 'trips',
        children: [
          {
            path: '',
            component: TripsComponent,
            title: 'TravelThing - Trips',
          },
          {
            path: ':id',
            component: TripComponent,
            title: 'TravelThing - Trip',
          },
        ],
      },

      { path: '**', redirectTo: '/home', pathMatch: 'full' },
    ],
  },

  { path: '**', redirectTo: '/', pathMatch: 'full' },
];
