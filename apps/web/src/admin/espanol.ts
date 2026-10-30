// La administración es solo en castellano: esto tiene que importarse antes que lib/idioma.
try {
  localStorage.setItem('idioma', 'es');
} catch {
  /* sin almacenamiento: queda el idioma del navegador */
}
