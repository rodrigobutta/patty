// Genera la voz de cada escena con ElevenLabs: public/voz/<clave>.mp3 y public/voz/duraciones.json (los segundos de
// cada una, para que el video dure lo que dura la voz). La clave se lee de ~/patty-release/elevenlabs.key (fuera del
// repo). Hay una historia por voz: la de Sofía (src/guion.ts, voz femenina, en public/voz) y la de Martín
// (src/guion-martin.ts, voz masculina, en public/voz/martin). La voz elegida queda en voz.json y se reusa; para otra:
// ELEVEN_VOZ=<id>. Si no hay, la primera voz argentina de la biblioteca de ElevenLabs.
// Uso: npm run voz [-- martin] [clave …] (sin claves, todas).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const argumentos = process.argv.slice(2);
const martin = argumentos[0] === 'martin';
const HISTORIA = martin
  ? { guion: 'src/guion-martin.ts', salida: 'public/voz/martin', genero: 'male' }
  : { guion: 'src/guion.ts', salida: 'public/voz', genero: 'female' };
const SALIDA = path.join(aqui, HISTORIA.salida);
const API = 'https://api.elevenlabs.io/v1';
const MODELO = process.env.ELEVEN_MODELO ?? 'eleven_multilingual_v2';

const archivoClave = path.join(homedir(), 'patty-release/elevenlabs.key');
if (!existsSync(archivoClave)) {
  console.error(`Falta la clave de ElevenLabs en ${archivoClave}`);
  process.exit(1);
}
const clave = readFileSync(archivoClave, 'utf8').trim();
const h = { 'xi-api-key': clave };

// El guion sale del mismo archivo que usa el video (se lee el texto, sin compilar TypeScript).
const guion = readFileSync(path.join(aqui, HISTORIA.guion), 'utf8');
const escenas = [...guion.matchAll(/clave: '([^']+)',\s*\n\s*texto: '([^']+)'/g)].map((m) => ({ clave: m[1], texto: m[2] }));
const pedidas = martin ? argumentos.slice(1) : argumentos;

async function elegirVoz() {
  if (process.env.ELEVEN_VOZ) return { voice_id: process.env.ELEVEN_VOZ, name: process.env.ELEVEN_VOZ };
  // La que ya se usó para esta historia (así todas las escenas tienen la misma voz).
  const guardada = path.join(SALIDA, 'voz.json');
  if (existsSync(guardada)) {
    const g = JSON.parse(readFileSync(guardada, 'utf8'));
    if (g.voice_id) return { voice_id: g.voice_id, name: g.voz };
  }
  const r = await fetch(`${API}/shared-voices?page_size=30&language=es&accent=argentine&gender=${HISTORIA.genero}&sort=usage_character_count_1y`, { headers: h });
  if (!r.ok) throw new Error(`Buscar voces: ${r.status} ${await r.text()}`);
  const { voices } = await r.json();
  const v = voices?.[0];
  if (!v) throw new Error('No encontré voces argentinas: pasá una con ELEVEN_VOZ=<id>.');
  // Las de la biblioteca se suman a "Mis voces" para poder usarlas.
  const sumar = await fetch(`${API}/voices/add/${v.public_owner_id}/${v.voice_id}`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: `Patty – ${v.name}` }),
  });
  const sumada = sumar.ok ? await sumar.json() : null;
  console.log(`Voz: ${v.name} (${v.accent ?? ''}, ${v.description ?? ''})`);
  return { voice_id: sumada?.voice_id ?? v.voice_id, name: v.name };
}

/** Los segundos de un mp3: con afinfo (Mac); si no está, por el tamaño (se pide a 128 kbps fijos). */
function segundos(archivo) {
  try {
    const m = /estimated duration: ([\d.]+)/.exec(execFileSync('afinfo', [archivo], { encoding: 'utf8' }));
    if (m) return Number(m[1]);
  } catch {
    /* sin afinfo */
  }
  return (statSync(archivo).size * 8) / 128000;
}

mkdirSync(SALIDA, { recursive: true });
const voz = await elegirVoz();
const durPath = path.join(SALIDA, 'duraciones.json');
const duraciones = existsSync(durPath) ? JSON.parse(readFileSync(durPath, 'utf8')) : {};
for (const e of escenas) {
  if (pedidas.length && !pedidas.includes(e.clave)) continue;
  const r = await fetch(`${API}/text-to-speech/${voz.voice_id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: e.texto,
      model_id: MODELO,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error(`Voz de "${e.clave}": ${r.status} ${await r.text()}`);
  const archivo = path.join(SALIDA, `${e.clave}.mp3`);
  writeFileSync(archivo, Buffer.from(await r.arrayBuffer()));
  duraciones[e.clave] = Math.round(segundos(archivo) * 100) / 100;
  console.log(`✓ ${e.clave}: ${duraciones[e.clave]} s`);
}
writeFileSync(durPath, JSON.stringify(duraciones, null, 2) + '\n');
writeFileSync(path.join(SALIDA, 'voz.json'), JSON.stringify({ voz: voz.name, voice_id: voz.voice_id, modelo: MODELO }, null, 2) + '\n');
