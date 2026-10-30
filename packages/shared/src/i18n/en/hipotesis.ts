// Hipótesis de Patty: lo que la IA sospecha de los datos y el motor verifica, y los patrones que ya no se ven.
export const HIPOTESIS: Record<string, string> = {
  // Más → Qué patrones buscar
  '🦉 Hipótesis de Patty': '🦉 Patty’s hypotheses',
  'Una vez por semana Patty mira el resumen de todos tus datos y sospecha cosas. Solo te muestra las que los números confirman.':
    'Once a week Patty looks at a summary of all your data and comes up with suspicions. She only shows you the ones the numbers confirm.',
  'Por ejemplo: «desde que empezaste con el mate, te duele menos la cabeza».': 'For example: “since you started drinking mate, you get fewer headaches”.',
  // Tarjetas de Patrones
  '🦉 Lo sospechó Patty y los datos lo confirman': '🦉 Patty suspected it and the data confirms it',
  '🕰️ Pasaba antes: en los últimos meses ya no se ve': '🕰️ This used to happen: it hasn’t shown up in recent months',
  'desde el {fecha}': 'since {fecha}',
  'del {desde} al {hasta}': 'from {desde} to {hasta}',
  'antes {n}%': 'before {n}%',
  'después {n}%': 'after {n}%',
  '{n} de {total} días': '{n} of {total} days',
  // Explicaciones armadas por el motor
  'Desde el {fecha}, «{causa}» aparece {sentido_causa} ({antes} → {despues} de los días) y «{efecto}» pasó del {antes_efecto} al {despues_efecto} de los días. Coinciden en el tiempo: no prueba que una cosa cause la otra.':
    'Since {fecha}, “{causa}” shows up {sentido_causa} ({antes} → {despues} of days) and “{efecto}” went from {antes_efecto} to {despues_efecto} of days. They coincide in time: this doesn’t prove one causes the other.',
  'más seguido': 'more often',
  'menos seguido': 'less often',
  'Del {desde} al {hasta}:': 'From {desde} to {hasta}:',
  'Período inválido.': 'Invalid period.',
};
