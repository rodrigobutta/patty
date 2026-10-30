// El armazón del backoffice: menú a la izquierda, barra de arriba (buscador de personas y usuarios, tema, cuenta) y la
// pantalla elegida, que queda en la dirección (#/persona/5/2026-10-30) para poder recargar y compartir el link.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useEstado } from '../estado';
import { t } from '../lib/idioma';
import { DetalleUsuario, VistaActividad, VistaAvisos, VistaResumen, VistaUso, VistaUsuarios } from '../pantallas/Admin';
import { AdminBeta } from '../pantallas/AdminBeta';
import { VistaTablas, type PedidoTabla, type PersonaAdmin } from '../pantallas/AdminDatos';
import { AdminDatosCalidad } from '../pantallas/AdminDatosCalidad';
import { AdminDatosAuditoria, AdminDatosHallazgos, AdminDatosIa } from '../pantallas/AdminDatosIa';
import { AdminDatosPersona } from '../pantallas/AdminDatosPersona';
import { AdminSalud } from '../pantallas/AdminSalud';
import { AdminUsoIa } from '../pantallas/AdminUsoIa';
import { Avatar } from '../ui/Avatar';

/** Los íconos del menú (trazos simples, del color del texto). */
const TRAZOS: Record<string, string> = {
  resumen: 'M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z',
  uso: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  actividad: 'M3 12h4l3-8 4 16 3-8h4',
  usuarios: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  persona: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  tablas: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
  calidad: 'M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  ia: 'M12 3v3M12 18v3M3 12h3M18 12h3M7 7h10v10H7zM10 10h4v4h-4z',
  patrones: 'M5 6a2 2 0 1 0 0-.01M19 6a2 2 0 1 0 0-.01M12 18a2 2 0 1 0 0-.01M6.5 7.5 11 16.5M17.5 7.5 13 16.5',
  auditoria: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h8',
  salud: 'M3 12h4l2-5 4 10 2-5h6',
  planes: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  avisos: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.3 20a2 2 0 0 0 3.4 0',
  beta: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
};
const Icono = ({ de }: { de: string }) => (
  <svg className="icono-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={TRAZOS[de]} />
  </svg>
);

const MENU: Array<{ grupo: string; items: Array<[string, string]> }> = [
  { grupo: 'General', items: [['resumen', 'Resumen'], ['uso', 'Uso'], ['actividad', 'Actividad'], ['usuarios', 'Usuarios']] },
  { grupo: 'Datos', items: [['persona', 'Persona 360'], ['tablas', 'Tablas'], ['calidad', 'Calidad'], ['ia', 'Lo que hizo la IA'], ['patrones', 'Patrones'], ['auditoria', 'Auditoría']] },
  { grupo: 'Operación', items: [['salud', 'Salud'], ['planes', 'IA y planes'], ['avisos', 'Avisos'], ['beta', 'Beta']] },
];
const TITULOS = Object.fromEntries(MENU.flatMap((g) => g.items));

const leerRuta = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
export const ir = (...partes: Array<string | number>) => {
  location.hash = `/${partes.join('/')}`;
};

function useRuta(): string[] {
  const [ruta, setRuta] = useState(leerRuta);
  useEffect(() => {
    const cambio = () => setRuta(leerRuta());
    addEventListener('hashchange', cambio);
    return () => removeEventListener('hashchange', cambio);
  }, []);
  return ruta;
}

/** Busca personas y usuarios por nombre o mail y lleva a su pantalla. */
function Buscador() {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<{ personas: PersonaAdmin[]; usuarios: Array<{ id: number; nombre: string; usuario: string; email: string | null }> } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const traer = () => {
    setAbierto(true);
    if (datos) return;
    void Promise.all([api<PersonaAdmin[]>('GET', '/api/admin/datos/personas'), api<Array<{ id: number; nombre: string; usuario: string; email: string | null }>>('GET', '/api/admin/usuarios')])
      .then(([personas, usuarios]) => setDatos({ personas, usuarios }))
      .catch(() => {});
  };
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const busca = norm(q.trim());
  const coincide = (...v: Array<string | null | undefined>) => !busca || v.some((x) => x && norm(x).includes(busca));
  const personas = (datos?.personas ?? []).filter((p) => coincide(p.nombre, p.duenos)).slice(0, 6);
  const usuarios = (datos?.usuarios ?? []).filter((u) => coincide(u.nombre, u.usuario, u.email)).slice(0, 6);
  const elegir = (...r: Array<string | number>) => {
    ir(...r);
    setAbierto(false);
    setQ('');
  };
  return (
    <div className="buscador" ref={caja}>
      <input type="search" placeholder={t('Buscar persona o usuario…')} value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); }} onFocus={traer} onKeyDown={(e) => e.key === 'Escape' && setAbierto(false)} aria-label={t('Buscar')} />
      {abierto && (personas.length || usuarios.length) ? (
        <div className="buscador-lista">
          {personas.length ? <p className="grupo-tablas">{t('Personas')}</p> : null}
          {personas.map((p) => <button key={`p${p.id}`} onClick={() => elegir('persona', p.id)}>{p.nombre}<span className="suave chico">{p.duenos ?? ''}</span></button>)}
          {usuarios.length ? <p className="grupo-tablas">{t('Usuarios')}</p> : null}
          {usuarios.map((u) => <button key={`u${u.id}`} onClick={() => elegir('usuarios', u.id)}>{u.nombre}<span className="suave chico">{u.email ?? u.usuario}</span></button>)}
        </div>
      ) : null}
    </div>
  );
}

const TEMAS = ['auto', 'claro', 'oscuro'] as const;
function useTema() {
  const [tema, setTema] = useState<(typeof TEMAS)[number]>(() => {
    try {
      const v = localStorage.getItem('tema');
      return v === 'claro' || v === 'oscuro' ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    if (tema === 'auto') delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = tema;
    try {
      if (tema === 'auto') localStorage.removeItem('tema');
      else localStorage.setItem('tema', tema);
    } catch {
      /* sin almacenamiento */
    }
  }, [tema]);
  return { tema, siguiente: () => setTema(TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length]) };
}

export function Shell() {
  const { usuario, salir, aviso } = useEstado();
  const ruta = useRuta();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [pedidoTabla, setPedidoTabla] = useState<PedidoTabla | null>(null);
  const { tema, siguiente } = useTema();
  const pantalla = ruta[0] && TITULOS[ruta[0]] ? ruta[0] : 'resumen';

  useEffect(() => setMenuAbierto(false), [pantalla]);
  useEffect(() => {
    document.title = `${t(TITULOS[pantalla])} · Patty Admin`;
    window.scrollTo({ top: 0 });
  }, [pantalla]);

  const abrirTabla = useCallback((p: PedidoTabla) => {
    setPedidoTabla(p);
    ir('tablas', p.tabla);
  }, []);
  const verUsuario = useCallback((id: number) => ir('usuarios', id), []);

  const contenido = useMemo((): ReactNode => {
    switch (pantalla) {
      case 'uso': return <VistaUso alElegir={verUsuario} />;
      case 'actividad': return <VistaActividad />;
      case 'usuarios': {
        const id = Number(ruta[1]);
        return id ? <DetalleUsuario key={id} id={id} alVolver={() => ir('usuarios')} /> : <VistaUsuarios alElegir={verUsuario} />;
      }
      case 'persona':
        return (
          <AdminDatosPersona
            persona={Number(ruta[1]) || null}
            fecha={ruta[2] ?? null}
            alCambiar={(p, f) => (f ? ir('persona', p, f) : ir('persona', p))}
            abrirTabla={abrirTabla}
          />
        );
      case 'tablas': {
        const pedido = pedidoTabla && pedidoTabla.tabla === ruta[1] ? pedidoTabla : ruta[1] ? { tabla: ruta[1] } : null;
        return <VistaTablas key={JSON.stringify(pedido)} pedido={pedido} />;
      }
      case 'calidad': return <AdminDatosCalidad abrirTabla={abrirTabla} />;
      case 'ia': return <AdminDatosIa />;
      case 'patrones': return <AdminDatosHallazgos />;
      case 'auditoria': return <AdminDatosAuditoria />;
      case 'salud': return <AdminSalud />;
      case 'planes': return <AdminUsoIa />;
      case 'avisos': return <VistaAvisos />;
      case 'beta': return <AdminBeta />;
      default: return <VistaResumen />;
    }
  }, [pantalla, ruta, pedidoTabla, abrirTabla, verUsuario]);

  const urlApp = location.hostname.startsWith('admin.') ? 'https://app.patty.today/' : '/app/';
  return (
    <div className={`shell ${menuAbierto ? 'menu-abierto' : ''}`}>
      <aside className="lateral">
        <a className="marca" href="#/resumen">Patty <span>Admin</span></a>
        <nav>
          {MENU.map((g) => (
            <div key={g.grupo}>
              <p className="grupo-menu">{t(g.grupo)}</p>
              {g.items.map(([k, nombre]) => (
                <a key={k} href={`#/${k}`} className={pantalla === k ? 'activa' : ''} aria-current={pantalla === k ? 'page' : undefined}>
                  <Icono de={k} /> {t(nombre)}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {menuAbierto ? <div className="velo" onClick={() => setMenuAbierto(false)} /> : null}
      <div className="cuerpo">
        <header className="superior">
          <button className="btn-menu" onClick={() => setMenuAbierto(!menuAbierto)} aria-label={t('Menú')}>☰</button>
          <h1>{t(TITULOS[pantalla])}</h1>
          <Buscador />
          <span className="espacio" />
          <button className="btn chico-btn" onClick={siguiente} title={t('Tema')}>{tema === 'auto' ? t('Tema: auto') : tema === 'claro' ? t('Tema: claro') : t('Tema: oscuro')}</button>
          <a className="btn chico-btn" href={urlApp}>{t('Ir a la app')}</a>
          <span className="cuenta">
            <Avatar foto={usuario?.foto} nombre={usuario?.nombre ?? '?'} tamano={28} />
            <span className="cuenta-nombre">{usuario?.nombre}</span>
            <button className="btn chico-btn" onClick={() => void salir()}>{t('Salir')}</button>
          </span>
        </header>
        <main className="contenido">{contenido}</main>
      </div>
      {aviso ? <div className="aviso" role="status">{aviso}</div> : null}
    </div>
  );
}
