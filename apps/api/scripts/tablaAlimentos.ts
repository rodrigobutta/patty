// Arma la foto chica de la tabla de ingredientes (src/componentes/datos/ingredientes.json) a partir de las descargas de USDA
// FoodData Central (dominio público, CC0): Foundation Foods y SR Legacy, en CSV. No hace falta clave ni se usa la API: en
// funcionamiento, Patty solo lee la foto que queda en el repo.
//
//   curl -O https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
//   curl -O https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-04-24.zip
//   unzip cada uno en su carpeta, y después:
//   pnpm --filter api exec tsx scripts/tablaAlimentos.ts <carpeta sr legacy> <carpeta foundation>
//
// Se queda con lo que se come como ingrediente (sin marcas, sin comida para bebés, sin platos de cadenas, sin las decenas de
// cortes iguales) y con los nutrientes de componentes/lista.ts, por 100 g. Los nombres en castellano salen de
// src/componentes/datos/nombres.json (a mano): sin eso, una búsqueda en castellano no encontraría nada sin la IA.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [sr, foundation] = process.argv.slice(2);
if (!sr || !foundation) throw new Error('Uso: tablaAlimentos.ts <carpeta sr legacy> <carpeta foundation>');
const SALIDA = new URL('../src/componentes/datos/ingredientes.json', import.meta.url);
const NOMBRES = new URL('../src/componentes/datos/nombres.json', import.meta.url);

/** Lee un CSV con comillas, sin armar todo en memoria más de lo necesario. */
function* csv(ruta: string): Generator<string[]> {
  const t = readFileSync(ruta, 'utf8');
  let campo = '';
  let fila: string[] = [];
  let enComillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (enComillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === ',') {
      fila.push(campo);
      campo = '';
    } else if (ch === '\n') {
      fila.push(campo);
      yield fila;
      fila = [];
      campo = '';
    } else if (ch !== '\r') campo += ch;
  }
  if (campo || fila.length) {
    fila.push(campo);
    yield fila;
  }
}

function tabla(ruta: string): Array<Record<string, string>> {
  const it = csv(ruta);
  const cab = it.next().value as string[];
  const r: Array<Record<string, string>> = [];
  for (const f of it) r.push(Object.fromEntries(cab.map((c, i) => [c, f[i] ?? ''])));
  return r;
}

/** Los nutrientes que se usan, por id de FoodData Central. */
const NUTRIENTES: Record<string, string> = {
  '1003': 'proteina',
  '1004': 'grasa',
  '1005': 'carbos',
  '1008': 'calorias',
  '2047': 'calorias2',
  '2048': 'calorias3',
  '1018': 'alcohol',
  '1057': 'cafeina',
  '1063': 'azucar2',
  '2000': 'azucar',
  '1079': 'fibra',
  '1093': 'sodio',
  '1258': 'saturada',
};

/** Rubros que no sirven como ingrediente. */
const RUBROS_AFUERA = new Set(['Baby Foods', 'American Indian/Alaska Native Foods', 'Restaurant Foods', 'Fast Foods', 'Meals, Entrees, and Side Dishes']);
/** Marcas y repeticiones: decenas de cortes iguales, productos de una marca. */
const AFUERA = [
  /\b[A-Z][A-Z'’&.]{2,}\b/, // marcas en mayúsculas (KRAFT, McDONALD'S…)
  /\b(Pillsbury|Kraft|Kellogg|Nabisco|Campbell|Quaker|General Mills|Malt-O-Meal|Oscar Mayer|Hormel|Keebler|Pepperidge|Betty Crocker|Mission Foods|Martha White|Heinz|Hershey|Mars|Nestle|Tyson|Lean Pockets|Hot Pockets|Sara Lee|Archway|Sunshine|Interstate|Wonder|Stouffer|Luncheon|George Weston|Ralston)\b/i,
  /separable lean only/i,
  /trimmed to 1\/8|imported|retail cuts, |New Zealand|Australian|Canadian|Alaska Native|Mexican style|Puerto Rican/i,
  /\b(choice|select|low sodium|reduced sodium|no salt added|dehydrated|condensed)\b/i,
  /^(Veal|Game|Soup, .*(canned|prepared with)|Candies, |Turkey, (young|fryer|back|light or dark|retail)|Chicken, (broilers or fryers, (back|neck|rotisserie|dark meat|light meat|giblets)|capons|cornish|stewing|roasting)|Pork, (cured|fresh, (composite|variety|loin, (blade|center|sirloin|top)|shoulder, (arm|blade)))|Lamb, (composite|domestic, (foreshank|shoulder, (arm|blade)))|Beef, (chuck|round, (back|bottom|eye|full|tip|top)|rib, (eye|large|shortribs|small|whole)|short loin|loin, (tenderloin|top sirloin|bottom)|flank, steak, separable)|Fish, (.*(moist heat|dry heat), .*with|.*(smoked|pickled|dried|salted)))/i,
  /\b(Formulated|formula|infant|school lunch|USDA Commodity|military|emergency|ration|Nutritional supplement|Protein supplement|Abalone|bear|beaver|bison|caribou|elk|moose|muskrat|opossum|raccoon|squab|walrus|whale|seal|armadillo|game meat)\b/i,
];

interface Crudo {
  id: number;
  en: string;
  rubro: string;
  n: Map<string, number>;
  orden: number;
}

function cargar(carpeta: string, soloFoundation: boolean, orden: number): Map<number, Crudo> {
  const rubros = new Map(tabla(join(carpeta, 'food_category.csv')).map((x) => [x.id, x.description]));
  const validos = soloFoundation ? new Set(tabla(join(carpeta, 'foundation_food.csv')).map((x) => x.fdc_id)) : null;
  const r = new Map<number, Crudo>();
  for (const f of tabla(join(carpeta, 'food.csv'))) {
    if (validos && !validos.has(f.fdc_id)) continue;
    r.set(Number(f.fdc_id), { id: Number(f.fdc_id), en: f.description, rubro: rubros.get(f.food_category_id) ?? '', n: new Map(), orden });
  }
  const it = csv(join(carpeta, 'food_nutrient.csv'));
  const cab = it.next().value as string[];
  const [cId, cNut, cVal] = ['fdc_id', 'nutrient_id', 'amount'].map((c) => cab.indexOf(c));
  for (const f of it) {
    const k = NUTRIENTES[f[cNut]];
    if (!k) continue;
    const x = r.get(Number(f[cId]));
    if (x) x.n.set(k, Number(f[cVal]));
  }
  return r;
}

const num = (x: number) => Math.round(x * 10) / 10;

/** Harinas refinadas: los hidratos que no son azúcar ni fibra, en lo que viene de grano sin integral ni salvado. */
const REFINADO = /\b(flour|bread|rolls?|buns?|bagels?|croissants?|biscuits?|crackers?|cookies?|cakes?|pies?|pastry|pastries|muffins?|waffles?|pancakes?|doughnuts?|tortillas?|pizza|pasta|spaghetti|macaroni|noodles?|couscous|semolina|rice, white|rice noodles|cornstarch|corn flour|cornmeal, degermed|breadcrumbs?|bread crumbs|cereals? ready-to-eat|pretzels?|polenta|gnocchi)\b/i;
const NO_REFINADO = /whole[- ]?(wheat|grain)|wholemeal|\bbran\b|\boat|\bbarley\b|brown rice|rice, brown|rye|buckwheat|quinoa|amaranth|\bnuts?\b|peanut|almond|soy flour|chickpea|chick-pea|lupin|fish|meat|pork|beef|chicken|shellfish|crab|potato|apples?,|fruit,|pumpkin|tart/i;
const harinas = (en: string, rubro: string, carbos: number, azucar: number, fibra: number) => {
  const deGrano = /Baked Products|Cereal Grains and Pasta|Breakfast Cereals|Snacks|Sweets/.test(rubro);
  if (!deGrano || !REFINADO.test(en) || NO_REFINADO.test(en)) return 0;
  return Math.max(0, carbos - azucar - fibra);
};

const nombres = JSON.parse(readFileSync(NOMBRES, 'utf8')) as Record<string, string[]>;
const porId = new Map<number, string[]>(Object.entries(nombres).map(([k, v]) => [Number(k), v]));

const todos = [...cargar(foundation, true, 0).values(), ...cargar(sr, false, 1).values()];
const filas: Array<Array<number | string>> = [];
let afuera = 0;
const vistos = new Set<string>();
for (const x of todos.sort((a, b) => a.orden - b.orden || a.en.localeCompare(b.en))) {
  const pedido = porId.has(x.id);
  if (!pedido && (RUBROS_AFUERA.has(x.rubro) || AFUERA.some((re) => re.test(x.en)))) {
    afuera++;
    continue;
  }
  const clave = x.en.toLowerCase();
  if (vistos.has(clave) && !pedido) continue;
  vistos.add(clave);
  const v = (k: string) => x.n.get(k);
  // Foundation a veces trae las calorías con otro id, y a veces falta algo: si no se conoce lo principal, no sirve.
  const prot = v('proteina');
  const grasa = v('grasa');
  const carbos = v('carbos') ?? 0;
  const cal = v('calorias') ?? v('calorias3') ?? v('calorias2') ?? (prot !== undefined && grasa !== undefined ? 4 * prot + 9 * grasa + 4 * carbos : undefined);
  if (prot === undefined || grasa === undefined || cal === undefined) continue;
  const azucar = v('azucar') ?? v('azucar2') ?? 0;
  const fibra = v('fibra') ?? 0;
  filas.push([
    x.id,
    x.en,
    (porId.get(x.id) ?? []).join('|'),
    Math.round(cal),
    num(grasa),
    num(v('saturada') ?? 0),
    num(azucar),
    num(harinas(x.en, x.rubro, carbos, azucar, fibra)),
    num(fibra),
    num(prot),
    Math.round(v('sodio') ?? 0),
    num(v('alcohol') ?? 0),
    Math.round(v('cafeina') ?? 0),
  ]);
}
const faltan = [...porId.keys()].filter((id) => !filas.some((f) => f[0] === id));
if (faltan.length) throw new Error(`nombres.json pide ingredientes que no están: ${faltan.join(', ')}`);

const texto = `{"fuente":"USDA FoodData Central (Foundation Foods 2025-04, SR Legacy 2018-04), dominio público CC0","columnas":["id","en","es","calorias","grasa","grasa_saturada","azucar","harinas","fibra","proteina","sal","alcohol","cafeina"],"filas":[\n${filas.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
writeFileSync(SALIDA, texto);
console.log(`${filas.length} ingredientes, ${afuera} descartados, ${Math.round(texto.length / 1024)} KB`);
