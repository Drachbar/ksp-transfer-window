import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./planner/planner/planner').then((m) => m.Planner), title: 'KSP Transfer Window' },
  { path: '**', redirectTo: '' },
];
