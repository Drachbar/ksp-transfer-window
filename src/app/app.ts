import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, type IsActiveMatchOptions } from '@angular/router';
import { Theme } from './theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly theme = inject(Theme);

  /** A page is current whatever its query parameters (they hold the search). */
  protected readonly page: IsActiveMatchOptions = { paths: 'subset', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' };
  /** The start page "/" is a prefix of every path, so it must match exactly. */
  protected readonly startPage: IsActiveMatchOptions = { ...this.page, paths: 'exact' };
}
