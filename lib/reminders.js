// Recordatorios de listas: group.remindAt = marca de tiempo (ms). Se sincroniza con el resto de datos.

/** Calcula el momento de un ajuste rápido ('1h' | 'eve' | 'tom' | 'mon') a partir de `from`. */
export function presetTime(preset, from = new Date()) {
  const d = new Date(from);
  if (preset === '1h') return d.getTime() + 3600e3;
  if (preset === 'eve') { d.setHours(18, 0, 0, 0); if (d <= from) d.setDate(d.getDate() + 1); return d.getTime(); }
  if (preset === 'tom') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); }
  if (preset === 'mon') { d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); d.setHours(9, 0, 0, 0); return d.getTime(); }
  return NaN;
}

export const dueGroups = (data, at = Date.now()) =>
  Object.values(data.groups).filter(g => !g.trashedAt && g.remindAt && g.remindAt <= at);

export function remindLabel(ts) {
  return new Date(ts).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Momento del próximo recordatorio pendiente (o null si no hay ninguno). */
export function nextReminder(data) {
  let next = null;
  for (const g of Object.values(data.groups)) {
    if (!g.trashedAt && g.remindAt && (next === null || g.remindAt < next)) next = g.remindAt;
  }
  return next;
}
