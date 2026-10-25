import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cliente, conAdmin } from './ayudas.js';

const CLIENTE = 'cliente-web.apps.googleusercontent.com';
const cuenta = (email: string, nombre: string, foto: string) => ({
  aud: CLIENTE, iss: 'https://accounts.google.com', email, email_verified: 'true', name: nombre, picture: foto, exp: String(Math.floor(Date.now() / 1000) + 600),
});

describe('entrar con Google', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
  });

  it('crea la cuenta la primera vez (con foto y apodo), y al volver actualiza la foto', async () => {
    await conAdmin();
    process.env.GOOGLE_CLIENT_ID = CLIENTE;
    let info = cuenta('rodrigo@ejemplo.com', 'Rodrigo Butta', 'https://lh3.googleusercontent.com/a/uno');
    const real = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) =>
      String(url).startsWith('https://oauth2.googleapis.com/tokeninfo') ? new Response(JSON.stringify(info)) : real(url, init),
    );
    const rodrigo = new Cliente();
    const r = await rodrigo.post('/api/entrar-google', { credential: 'a.b.c' });
    expect(r.status).toBe(200);
    const s = (await rodrigo.get('/api/sesion')).body;
    expect(s.usuario).toMatchObject({ nombre: 'Rodrigo Butta', rol: 'editor', foto: 'https://lh3.googleusercontent.com/a/uno', apodo: 'Rodri', apodo_elegido: null });

    // Elige su apodo
    await rodrigo.put('/api/usuarios/yo/preferencias', { apodo: 'Rodo' });
    expect((await rodrigo.get('/api/sesion')).body.usuario.apodo).toBe('Rodo');

    // Vuelve a entrar con otra foto
    info = cuenta('rodrigo@ejemplo.com', 'Rodrigo Butta', 'https://lh3.googleusercontent.com/a/dos');
    const otra = new Cliente();
    await otra.post('/api/entrar-google', { credential: 'a.b.c' });
    expect((await otra.get('/api/sesion')).body.usuario).toMatchObject({ foto: 'https://lh3.googleusercontent.com/a/dos', apodo: 'Rodo' });
  });
});
