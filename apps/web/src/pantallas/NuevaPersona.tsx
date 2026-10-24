import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';

/** Crear a la persona de la que se anota el día (la primera vez, uno mismo). */
export function NuevaPersona({ primera = false, alTerminar }: { primera?: boolean; alTerminar?: () => void }) {
  const { recargar, elegirPersona, usuario } = useEstado();
  const [error, setError] = useState('');
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const datos = Object.fromEntries(new FormData(e.currentTarget).entries());
      const p = await api<{ id: number }>('POST', '/api/personas', { ...datos, nacimiento: datos.nacimiento || null });
      await recargar();
      elegirPersona(p.id);
      alTerminar?.();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className={primera ? 'entrar' : 'tarjeta'} onSubmit={enviar}>
      {primera ? <><h1 className="marca grande">Patty</h1><p className="suave">¿De quién vas a anotar el día?</p></> : <h3>Nueva persona</h3>}
      <div className={primera ? 'tarjeta' : ''}>
        <label>Nombre<input name="nombre" required defaultValue={primera ? usuario?.nombre : ''} /></label>
        <label>Fecha de nacimiento (opcional)<input name="nacimiento" type="date" /></label>
        <label>Zona horaria<input name="zona_horaria" defaultValue={zona} /></label>
        <button className="btn primario ancho">Listo</button>
        {error ? <p className="neg">{error}</p> : null}
      </div>
    </form>
  );
}
