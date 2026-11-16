import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cliente, conAdmin } from './ayudas.js';
import { usarEnviador, type Correo } from '../src/lib/correo.js';

const CLIENTE = 'cliente-web.apps.googleusercontent.com';
const cuenta = (email: string, nombre: string, foto: string) => ({
  aud: CLIENTE, iss: 'https://accounts.google.com', email, email_verified: 'true', name: nombre, picture: foto, exp: String(Math.floor(Date.now() / 1000) + 600),
});

describe('entrar con Google', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
    usarEnviador(undefined);
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

  it('avisa por mail a Rodrigo cuando se registra alguien, y no cuando vuelve a entrar', async () => {
    await conAdmin();
    process.env.GOOGLE_CLIENT_ID = CLIENTE;
    const mandados: Correo[] = [];
    usarEnviador(async (c) => {
      mandados.push(c);
    });
    const info = cuenta('ana@ejemplo.com', 'Ana Pérez', 'https://lh3.googleusercontent.com/a/ana');
    const real = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) =>
      String(url).startsWith('https://oauth2.googleapis.com/tokeninfo') ? new Response(JSON.stringify(info)) : real(url, init),
    );
    expect((await new Cliente().post('/api/entrar-google', { credential: 'a.b.c' })).status).toBe(200);
    await vi.waitFor(() => expect(mandados).toHaveLength(1));
    expect(mandados[0].para).toEqual(['rbutta@gmail.com']);
    expect(mandados[0].asunto).toBe('Nuevo usuario en Patty: Ana Pérez');
    expect(mandados[0].texto).toContain('ana@ejemplo.com');
    expect(mandados[0].texto).toContain('Usuarios en total: 2');
    await new Cliente().post('/api/entrar-google', { credential: 'a.b.c' });
    await new Promise((r) => setTimeout(r, 50));
    expect(mandados).toHaveLength(1);
  });
});
