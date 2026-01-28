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
    title: 'TRIP - Authentication',
  },

  {
    path: 's',
    children: [
      {
        path: 't/:token',
        component: SharedTripComponent,
        title: 'TRIP - Shared Trip',
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
        title: 'TRIP - Map',
      },
      {
        path: 'trips',
        children: [
          {
            path: '',
            component: TripsComponent,
            title: 'TRIP - Trips',
          },
          {
            path: ':id',
            component: TripComponent,
            title: 'TRIP - Trip',
          },
        ],
      },

      { path: '**', redirectTo: '/home', pathMatch: 'full' },
    ],
  },

  { path: '**', redirectTo: '/', pathMatch: 'full' },
];
