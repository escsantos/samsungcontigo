/**
 * A data de "hoje" no fuso de Brasília (America/Sao_Paulo), no formato
 * YYYY-MM-DD — nunca usar `new Date().toISOString()` para isso, porque
 * toISOString() sempre converte para UTC e o dia vira 3h mais cedo
 * (às 21h de Brasília já seria "amanhã" em UTC).
 */
export function hojeBrasil() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const obj = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

/** Início da semana (domingo) que contém a data informada (ou hoje), no fuso de Brasília. */
export function inicioDaSemanaBrasil(dataBase = hojeBrasil()) {
  const d = new Date(dataBase + "T12:00:00"); // meio-dia evita problemas de DST/virada
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

/** Fim da semana (sábado) que contém a data informada (ou hoje). */
export function fimDaSemanaBrasil(dataBase = hojeBrasil()) {
  const d = new Date(dataBase + "T12:00:00");
  d.setDate(d.getDate() - d.getDay() + 6);
  return d.toISOString().slice(0, 10);
}

/** Primeiro dia do mês (YYYY-MM-01) de uma referência "YYYY-MM" (ou do mês atual, em Brasília). */
export function inicioDoMesBrasil(mesReferencia) {
  const [ano, mes] = (mesReferencia || hojeBrasil().slice(0, 7)).split("-");
  return `${ano}-${mes}-01`;
}

/** Primeiro dia do mês seguinte — útil como limite superior exclusivo em consultas. */
export function inicioDoProximoMes(mesReferencia) {
  const [ano, mes] = (mesReferencia || hojeBrasil().slice(0, 7)).split("-").map(Number);
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  return `${proximoAno}-${String(proximoMes).padStart(2, "0")}-01`;
}

/**
 * Lista os últimos `qtd` meses, do mais recente pro mais antigo, cada um
 * com { valor: "YYYY-MM", rotulo: "MM/YYYY", inicio, fimExclusivo }.
 */
export function listaMesesRecentes(qtd = 12) {
  const hoje = hojeBrasil();
  const [anoAtual, mesAtual] = hoje.split("-").map(Number);
  const meses = [];
  for (let i = 0; i < qtd; i++) {
    let mes = mesAtual - i;
    let ano = anoAtual;
    while (mes <= 0) {
      mes += 12;
      ano -= 1;
    }
    const mesFmt = String(mes).padStart(2, "0");
    const valor = `${ano}-${mesFmt}`;
    meses.push({
      valor,
      rotulo: `${mesFmt}/${ano}`,
      inicio: `${valor}-01`,
      fimExclusivo: inicioDoProximoMes(valor),
    });
  }
  return meses;
}
export function numeroDaSemana(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  const inicioAno = new Date(d.getFullYear(), 0, 1);
  const dias = Math.floor((d - inicioAno) / 86400000);
  return Math.ceil((dias + inicioAno.getDay() + 1) / 7);
}

function formatarCurta(dataIso) {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}

/**
 * Lista as últimas `qtd` semanas (domingo→sábado), da mais recente pra
 * mais antiga, cada uma com { inicio, fim, numero, rotulo, valor }.
 * `valor` serve de identificador único pro <select> (a própria data de início).
 */
export function listaSemanasRecentes(qtd = 12) {
  const hoje = hojeBrasil();
  const domingoAtual = inicioDaSemanaBrasil(hoje);
  const semanas = [];
  for (let i = 0; i < qtd; i++) {
    const d = new Date(domingoAtual + "T12:00:00");
    d.setDate(d.getDate() - i * 7);
    const inicio = d.toISOString().slice(0, 10);
    const fimData = new Date(inicio + "T12:00:00");
    fimData.setDate(fimData.getDate() + 6);
    const fim = fimData.toISOString().slice(0, 10);
    semanas.push({
      inicio,
      fim,
      numero: numeroDaSemana(inicio),
      valor: inicio,
      rotulo: `W${numeroDaSemana(inicio)} — ${formatarCurta(inicio)} a ${formatarCurta(fim)}`,
    });
  }
  return semanas;
}
