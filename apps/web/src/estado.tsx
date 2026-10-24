// Estado general: sesión, personas, categorías y la persona que se está anotando.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Categoria, Persona, Sesion, Usuario } from 'shared';
import { api, cuandoSePierdaLaSesion, guardarToken } from './api';

export type Fase = 'arrancando' | 'entrar' | 'configurar' | 'listo' | 'error';

interface Estado {
  fase: Fase;
  error: string;
  sesion: Sesion | null;
  usuario: Usuario | null;
  personas: Persona[];
  persona: Persona | null;
  categorias: Categoria[];
  elegirPersona(id: number): void;
  recargar(): Promise<void>;
  entro(token?: string): Promise<void>;
  salir(): Promise<void>;
  aviso: string;
  avisar(t: string): void;
}

const Ctx = createContext<Estado | null>(null);
export const useEstado = (): Estado => {
  const e = useContext(Ctx);
  if (!e) throw new Error('useEstado fuera de EstadoProvider');
  return e;
};

const recordada = () => {
  try {
    return Number(localStorage.getItem('persona')) || null;
  } catch {
    return null;
  }
};

export function EstadoProvider({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Fase>('arrancando');
  const [error, setError] = useState('');
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaId, setPersonaId] = useState<number | null>(recordada);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [aviso, setAviso] = useState('');

  const avisar = useCallback((t: string) => {
    setAviso(t);
    setTimeout(() => setAviso((a) => (a === t ? '' : a)), 2500);
  }, []);

  const recargar = useCallback(async () => {
    const [ps, cs] = await Promise.all([api<Persona[]>('GET', '/api/personas'), api<Categoria[]>('GET', '/api/conceptos/categorias')]);
    setPersonas(ps);
    setCategorias(cs);
  }, []);

  const arrancar = useCallback(async () => {
    try {
      const s = await api<Sesion>('GET', '/api/sesion');
      setSesion(s);
      if (s.configurar) return setFase('configurar');
      if (!s.usuario) return setFase('entrar');
      await recargar();
      setFase('listo');
    } catch (e) {
      setError((e as Error).message);
      setFase('error');
    }
  }, [recargar]);

  useEffect(() => {
    cuandoSePierdaLaSesion(() => setFase((f) => (f === 'listo' ? 'entrar' : f)));
    void arrancar();
  }, [arrancar]);

  const entro = useCallback(
    async (token?: string) => {
      if (token) guardarToken(token);
      await arrancar();
    },
    [arrancar],
  );

  const salir = useCallback(async () => {
    await api('POST', '/api/salir').catch(() => {});
    guardarToken(null);
    setFase('entrar');
  }, []);

  const elegirPersona = useCallback((id: number) => {
    setPersonaId(id);
    try {
      localStorage.setItem('persona', String(id));
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  const persona = personas.find((p) => p.id === personaId) ?? personas[0] ?? null;
  const valor: Estado = {
    fase, error, sesion, usuario: sesion?.usuario ?? null, personas, persona, categorias, elegirPersona, recargar, entro, salir, aviso, avisar,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
