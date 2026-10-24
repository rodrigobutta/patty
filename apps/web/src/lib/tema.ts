// Tema: auto (sigue al sistema), claro u oscuro. Se recuerda en este dispositivo.
export type Tema = 'auto' | 'claro' | 'oscuro';
export const temaActual = (): Tema => (document.documentElement.dataset.tema as Tema) || 'auto';
export const temaOscuro = (): boolean => temaActual() === 'oscuro' || (temaActual() === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
export function ponerTema(t: Tema): void {
  if (t === 'auto') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t;
  try {
    if (t === 'auto') localStorage.removeItem('tema');
    else localStorage.setItem('tema', t);
  } catch {
    /* sin almacenamiento */
  }
}
