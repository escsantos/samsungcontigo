export function semanaAtualStr() {
  const d = new Date();
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((firstThursday - target) / (7 * 24 * 3600 * 1000));
  return d.getFullYear() + "-W" + String(week).padStart(2, "0");
}

export function mesAtualStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

export function calcularSemanaISO(valor) {
  if (!valor) return null;
  const [anoStr, semanaStr] = valor.split("-W");
  const ano = parseInt(anoStr, 10);
  const semana = parseInt(semanaStr, 10);
  const jan4 = new Date(ano, 0, 4);
  const diaSemanaJan4 = jan4.getDay() || 7;
  const inicioSemana1 = new Date(jan4);
  inicioSemana1.setDate(jan4.getDate() - diaSemanaJan4 + 1);
  const de = new Date(inicioSemana1);
  de.setDate(inicioSemana1.getDate() + (semana - 1) * 7);
  de.setHours(0, 0, 0, 0);
  const ate = new Date(de);
  ate.setDate(de.getDate() + 6);
  ate.setHours(23, 59, 59, 999);
  return { de, ate };
}

export function calcularMesEscolhido(valor) {
  if (!valor) return null;
  const [ano, mes] = valor.split("-").map(Number);
  const de = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
  const ate = new Date(ano, mes, 0, 23, 59, 59, 999);
  return { de, ate };
}
