import { Routes } from '@angular/router';
import { Planner } from './planner/planner/planner';

// The start page is part of the main bundle so it shows up without an extra round trip.
// Add further pages as lazy routes (loadComponent) so they only load when visited.
export const routes: Routes = [
  { path: '', component: Planner, title: 'KSP Transfer Window' },
  { path: '**', redirectTo: '' },
];
