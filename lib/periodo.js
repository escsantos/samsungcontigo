export const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mês" },
  { id: "tudo", label: "Tudo" },
  { id: "personalizado", label: "Personalizado" }
];

export function inicioHoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export function inicioSemana() {
  const d = new Date();
  const dia = d.getDay();
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1);
  const s = new Date(d);
  s.setDate(diff);
  s.setHours(0, 0, 0, 0);
  return s;
}
export function inicioMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
export function fimHoje() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function calcularIntervalo(periodo, dataDe, dataAte) {
  if (periodo === "hoje") return { de: inicioHoje(), ate: fimHoje() };
  if (periodo === "semana") return { de: inicioSemana(), ate: fimHoje() };
  if (periodo === "mes") return { de: inicioMes(), ate: fimHoje() };
  if (periodo === "personalizado" && dataDe && dataAte) {
    return { de: new Date(dataDe + "T00:00:00"), ate: new Date(dataAte + "T23:59:59") };
  }
  return null; // "tudo" -> sem filtro
}
