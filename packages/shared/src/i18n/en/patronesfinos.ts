// Patrones más finos: umbrales ("a partir de 3 cafés"), lo que protege, efectos a los dos o tres días, y la sección de
// Más donde se prenden y apagan.
export const PATRONES_FINOS: Record<string, string> = {
  // Cuándo llega el efecto
  'a los dos días': 'two days later',
  'a los tres días': 'three days later',
  // Tarjetas de Patrones
  'menos {efecto}': 'less {efecto}',
  '{n}% menos seguido': '{n}% less often',
  '🛡️ Parece que te protege': '🛡️ Seems to protect you',
  // Texto del motor (sin IA)
  'Los días con «{causa}», {cuando} hubo «{efecto}» solo el {con} de las veces ({soporte} de {dias}); el resto de los días, el {sin}. Parece que te protege.':
    'On days with “{causa}”, {cuando} there was “{efecto}” only {con} of the time ({soporte} of {dias}); on other days, {sin}. It seems to protect you.',
  'Ajustes de patrones inválidos.': 'Invalid pattern settings.',
  // Más → Qué patrones buscar
  'Qué patrones buscar': 'Which patterns to look for',
  'Umbrales, lo que te protege, efectos a los días': 'Thresholds, what protects you, delayed effects',
  'Patty siempre busca qué cosas van seguidas de otras. Acá elegís si además busca estos patrones más finos. Se aplican en la próxima búsqueda.':
    'Patty always looks for things that tend to follow others. Here you choose whether it also looks for these finer patterns. They apply from the next search.',
  '📏 Desde qué cantidad': '📏 From what amount',
  'Buscar a partir de cuánto empieza a pasar algo, no solo si pasó.': 'Look for the amount at which something starts to happen, not just whether it happened.',
  'Por ejemplo: «a partir de 3 cafés, esa noche dormís peor».': 'For example: “from 3 coffees on, you sleep worse that night”.',
  '🛡️ Lo que te protege': '🛡️ What protects you',
  'Buscar lo que hace que un dolor o una molestia aparezca menos.': 'Look for what makes a pain or discomfort show up less.',
  'Por ejemplo: «los días que caminás, al día siguiente te duele menos la cabeza».': 'For example: “on days you walk, you get fewer headaches the next day”.',
  '⏳ Efectos a los dos o tres días': '⏳ Effects two or three days later',
  'Buscar lo que se nota recién a los dos o tres días, además del mismo día y el siguiente.':
    'Look for what only shows up two or three days later, besides the same day and the next.',
  'Por ejemplo: «si comés tomate, a los dos días te duele la cabeza».': 'For example: “if you eat tomato, two days later you get a headache”.',
};
