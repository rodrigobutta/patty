// La música de fondo del video, generada con ElevenLabs Music (instrumental, sin voces): public/voz/musica.mp3. Va
// bajita debajo del relato (ver Historia.tsx). Uso: node musica.mjs [segundos]
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const clave = readFileSync(path.join(homedir(), 'patty-release/elevenlabs.key'), 'utf8').trim();
const segundos = Number(process.argv[2] ?? 40);
const r = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
  method: 'POST',
  headers: { 'xi-api-key': clave, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Light, warm and playful instrumental background music for a friendly wellness app ad. Ukulele, soft claps, glockenspiel, gentle upbeat tempo around 110 bpm, optimistic and cozy. No vocals.',
    music_length_ms: segundos * 1000,
    force_instrumental: true,
  }),
});
if (!r.ok) {
  console.error(`Música: ${r.status} ${await r.text()}`);
  process.exit(1);
}
writeFileSync(path.join(aqui, 'public/voz/musica.mp3'), Buffer.from(await r.arrayBuffer()));
console.log('✓ musica.mp3');
