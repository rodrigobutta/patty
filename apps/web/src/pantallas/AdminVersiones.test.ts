import { describe, expect, it } from 'vitest';
import { estadoDe } from './AdminVersiones';

const ultimas = { web: '1.61.9', app: '1.61.4' };

describe('estado de una versión', () => {
  it('Android: tienen que estar al día la web y la app', () => {
    expect(estadoDe({ plataforma: 'android', web: '1.61.9', app: '1.61.4' }, ultimas).alDia).toBe(true);
    expect(estadoDe({ plataforma: 'android', web: '1.61.10', app: '1.61.5' }, ultimas).alDia).toBe(true);
    expect(estadoDe({ plataforma: 'android', web: '1.61.9', app: '1.60.0' }, ultimas)).toMatchObject({ web: true, app: false, alDia: false });
    expect(estadoDe({ plataforma: 'android', web: '1.61.8', app: '1.61.4' }, ultimas)).toMatchObject({ web: false, app: true, alDia: false });
    // Tan vieja que no cuenta su versión.
    expect(estadoDe({ plataforma: 'android', web: '1.61.9', app: null }, ultimas).alDia).toBe(false);
  });
  it('en el navegador y en iPhone solo cuenta la web', () => {
    expect(estadoDe({ plataforma: 'web', web: '1.61.9', app: null }, ultimas)).toMatchObject({ app: null, alDia: true });
    expect(estadoDe({ plataforma: 'ios', web: '1.61.9', app: '1.0.0' }, ultimas)).toMatchObject({ app: null, alDia: true });
    expect(estadoDe({ plataforma: 'web', web: null, app: null }, ultimas).alDia).toBe(false);
  });
  it('sin APK publicado no se compara la app', () => {
    expect(estadoDe({ plataforma: 'android', web: '1.61.9', app: '1.0.0' }, { web: '1.61.9', app: null }).alDia).toBe(true);
  });
});
