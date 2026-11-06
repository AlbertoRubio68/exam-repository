import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Componente raíz: solo aloja el `router-outlet` de la aplicación.
 *
 * La pantalla del examen se carga de forma perezosa desde `app.routes.ts`.
 */
@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
