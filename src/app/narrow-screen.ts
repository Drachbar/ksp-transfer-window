import { DestroyRef, inject, InjectionToken, signal, type Signal } from '@angular/core';

/** True on screens too narrow for a form and its results side by side. */
export const NARROW_SCREEN = new InjectionToken<Signal<boolean>>('NARROW_SCREEN', {
  providedIn: 'root',
  factory: () => {
    if (typeof matchMedia !== 'function') return signal(false);
    const query = matchMedia('(max-width: 959px)');
    const narrow = signal(query.matches);
    const update = () => narrow.set(query.matches);
    query.addEventListener?.('change', update);
    inject(DestroyRef).onDestroy(() => query.removeEventListener?.('change', update));
    return narrow.asReadonly();
  },
});
