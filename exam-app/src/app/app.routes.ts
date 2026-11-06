import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Qüestionari de coneixements — Agents Rurals',
    loadComponent: () =>
      import('./components/exam-runner/exam-runner').then((module) => module.ExamRunner),
  },
  { path: '**', redirectTo: '' },
];
