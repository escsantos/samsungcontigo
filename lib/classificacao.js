const REGRAS = [
  ["\\bPCB\\s*MAIN\\b|\\bPBA\\s*MAIN\\b|MAIN\\s*BOARD", "Placa Principal"],
  ["\\bPCB\\s*INVERTER\\b|\\bINVERTER\\s*PCB\\b", "Placa Inversora"],
  ["\\bPCB\\s*POWER\\b|\\bPOWER\\s*BOARD\\b|\\bSMPS\\b", "Placa de Fonte (Power)"],
  ["\\bVSS[- ]?PD\\s*BOARD\\b|\\bPD\\s*BOARD\\b", "Placa VSS/PD (Fonte)"],
  ["\\bOPEN\\s*CELL\\b", "Painel de Tela (Open Cell)"],
  ["\\bLED\\s*BAR\\b", "Barra de LED"],
  ["\\bT-?CON\\b|\\bTCON\\b", "Placa T-Con"],
  ["\\bPCB\\b|\\bPBA\\b", "Placa Eletrônica"],
  ["\\bBATT(ERY)?\\b", "Bateria"],
  ["\\bTAPE\\b", "Fita Adesiva"],
  ["\\bDAMPER\\b", "Amortecedor"],
  ["\\bMOTOR\\b", "Motor"],
  ["\\bCOMP(RESSOR)?\\b", "Compressor"],
  ["\\bPUMP\\b", "Bomba"],
  ["\\bVALVE\\b", "Válvula"],
  ["\\bSENSOR\\b", "Sensor"],
  ["\\bHINGE\\b", "Dobradiça"],
  ["\\bDOOR\\b", "Porta"],
  ["\\bCOVER\\b", "Tampa"],
  ["\\bBRACKET\\b", "Suporte"],
  ["\\bHOSE\\b", "Mangueira"],
  ["\\bDUCT\\b", "Duto"],
  ["\\bFILTER\\b", "Filtro"],
  ["\\bSWITCH\\b", "Interruptor/Chave"],
  ["\\bHARNESS\\b", "Chicote Elétrico"],
  ["\\bCABLE\\b", "Cabo"],
  ["\\bWIRE\\b", "Fio/Cabo"],
  ["\\bSPEAKER\\b", "Alto-falante"],
  ["\\bREMOCON\\b|\\bREMOTE\\b", "Controle Remoto"],
  ["\\bANTENNA\\b", "Antena"],
  ["\\bDISPLAY\\b|\\bLCD\\b|\\bOLED\\b|\\bSCREEN\\b", "Tela/Display"],
  ["\\bCHASSIS\\b", "Chassi"],
  ["\\bSPRING\\b", "Mola"],
  ["\\bGASKET\\b|\\bEPDM\\b", "Vedação/Borracha"],
  ["\\bDIAPHRAGM\\b", "Diafragma"],
  ["\\bEVAP(ORATOR)?\\b", "Evaporador"],
  ["\\bCONDENSER\\b", "Condensador"],
  ["\\bFAN\\b", "Ventilador"],
  ["\\bDRUM\\b", "Tambor"],
  ["\\bICE\\s*MAKER\\b|\\bICEMAKER\\b", "Fabricador de Gelo"],
  ["\\bKNOB\\b", "Botão/Manípulo"],
  ["\\bHANDLE\\b", "Puxador"],
  ["\\bPANEL\\b", "Painel"],
  ["\\bSCREW\\b", "Parafuso"],
  ["\\bGLASS\\b", "Vidro"],
  ["\\bLABEL\\b|\\bSTICKER\\b", "Etiqueta/Adesivo"],
  ["\\bTRANSFORMER\\b", "Transformador"],
  ["\\bCAPACITOR\\b", "Capacitor"],
  ["\\bEEPROM\\b", "Memória EEPROM"],
  ["\\bWLAN\\b|\\bNETWORK\\b|\\bWI-?FI\\b", "Módulo Wi-Fi/Rede"],
  ["\\bTUB\\b", "Tanque/Cesto"],
  ["\\bBASKET\\b", "Cesto"],
  ["\\bSHELF\\b", "Prateleira"],
  ["\\bDRAWER\\b", "Gaveta"],
  ["\\bTRAY\\b", "Bandeja"],
  ["\\bNOZZLE\\b", "Bico/Nozzle"],
  ["\\bTUBE\\b|\\bPIPE\\b", "Tubo"],
  ["\\bHEATER\\b", "Resistência/Aquecedor"],
  ["\\bTHERMOSTAT\\b", "Termostato"],
  ["\\bRELAY\\b", "Relé"],
  ["\\bBUZZER\\b", "Buzzer"],
  ["\\bCAMERA\\b", "Câmera"],
  ["\\bMICROPHONE\\b|\\bMIC\\b", "Microfone"],
  ["\\bBOLT\\b|\\bNUT\\b|\\bWASHER\\b", "Parafuso/Porca/Arruela"],
  ["\\bFOOT\\b|\\bLEG\\b", "Pé/Base"],
  ["\\bWHEEL\\b|\\bCASTER\\b|\\bROLLER\\b", "Roda/Rolete"],
  ["\\bBELT\\b", "Correia"],
  ["\\bFILTER\\s*HOUSING\\b", "Carcaça de Filtro"],
  ["\\bHOUSING\\b", "Carcaça"],
  ["\\bFRAME\\b", "Estrutura/Moldura"],
  ["\\bSTAND\\b", "Base/Suporte de Mesa"],
  ["\\bREMOTE\\s*CONTROLLER\\b", "Controle Remoto"],
  ["\\bADAPTOR\\b|\\bADAPTER\\b", "Adaptador"],
  ["\\bCHARGER\\b", "Carregador"],
  ["\\bKIT\\b", "Kit de Peças"],
  ["\\bMODULE\\b", "Módulo"],
  ["\\bBOARD\\b", "Placa"],
  ["\\bLGP\\b", "Guia de Luz (LGP)"],
  ["\\bBEARING\\b", "Rolamento"],
  ["\\bSEAL\\s*OIL\\b|\\bOIL\\s*SEAL\\b", "Retentor de Óleo"],
  ["\\bTHERMISTOR\\b", "Termistor"],
  ["\\bPOWER\\s*CORD\\b", "Cabo de Força"],
  ["\\bSTATOR\\b", "Estator"],
  ["\\bROTOR\\b", "Rotor"],
  ["\\bFLANGE\\b|\\bSHAFT\\b", "Eixo/Flange"],
  ["\\bA/S-?DRYER\\b|\\bDRYER\\b", "Componente de Secadora"],
  ["\\bEBL\\)?\\s*(BOE|SDC|SDP|HKC|AUO|CSOT|LGD|CHOT|INX|NVT)\\b|\\b(BOE|SDC|SDP|HKC|AUO|CSOT|LGD|CHOT|INX)\\b.*\\b(BASIC|SEDA|LCM|LCDLCM)\\b", "Painel de Tela (provável)"],
  ["^\\d{2,3}[A-Z]{1,3}\\d{3,4}", "Painel de Tela / Modelo (provável)"],
  ["^Y\\d{2}\\b.*\\b(SDC|SDP|HKC|AUO|CSOT|LGD|CHOT|INX|BOE|CEC)\\b", "Painel de Tela (provável)"],
  ["\\b(SDC|SDP|HKC|AUO|CSOT|LGD|CHOT|INX|BOE|CEC)\\b\\s*\\d{2}[A-Z]{1,3}\\d{3,4}", "Painel de Tela (provável)"],
  ["\\bVSS\\b", "Placa VSS (Fonte)"],
  ["\\bIC[- ]", "Circuito Integrado (CI)"],
  ["\\bPROTECTOR\\s*FILM\\b", "Película Protetora"],
  ["\\bCLIP\\b", "Clipe/Grampo"],
  ["\\bSMT\\s*OCTA\\b|\\bOCTA\\s*ASSY\\b", "Módulo de Tela (Celular)"],
  ["\\bSTYLUS\\s*PEN\\b", "Caneta S Pen"],
  ["\\bFFC\\b", "Cabo Flex (FFC)"],
  ["\\bTHERMO\\s*FUSE\\b", "Fusível Térmico"],
  ["\\bFUSE\\b", "Fusível"],
  ["\\bLEAD\\s*CONNECTOR\\b", "Cabo Condutor"],
  ["\\bCONNECTOR\\b", "Conector"],
  ["\\bWEIGHT\\s*BALANCER\\b", "Contrapeso"],
  ["\\bK\\s*D\\s*IR\\b|\\bIR\\s*FUNCTION\\b", "Sensor Infravermelho (IR)"],
  ["\\bFPCB\\b", "Placa Flexível (FPCB)"]
].map(([padrao, categoria]) => [new RegExp(padrao), categoria]);

export function classifyDesc(texto) {
  if (texto === null || texto === undefined || texto === "") return "Outros / Não Classificado";
  let t = String(texto).toUpperCase().replace(/[_\-/;,]/g, " ");
  for (const [regex, categoria] of REGRAS) {
    if (regex.test(t)) return categoria;
  }
  return "Outros / Não Classificado";
}

export function categoria(bh) {
  if (!bh) return "Outros";
  const d = String(bh).toUpperCase();
  if (d.includes("TV") || d.includes("DISPLAY") || d.includes("LFD") || d.includes("MONITOR") || d.includes("MICROLED") || d.includes("PROJECTOR")) return "DTV";
  if (d.startsWith("HHP")) return "Celulares";
  if (d.includes("WASHING") || d.includes("LAVADORA") || d.includes("LAVA E SECA")) return "WSM";
  if (d.includes("REFRIGERATOR") || d.includes("WINE CELLAR")) return "REF";
  if (d.includes("AIR CONDITIONER") || d.startsWith("SAC") || d.startsWith("RAM")) return "ACN";
  if (d.includes("COOKTOP") || d.includes("COIFA")) return "CKT";
  return "Outros";
}

export function normKey(s) {
  return String(s === undefined || s === null ? "" : s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim().toLowerCase();
}

export function parseBRDate(s) {
  if (!s) return null;
  const partes = String(s).trim().split("/");
  if (partes.length !== 3) return null;
  const [d, m, y] = partes.map((p) => parseInt(p, 10));
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d).getTime();
}

// Aceita valores em qualquer formato comum de planilha (americano 99,999.99,
// brasileiro 99.999,99, número puro, com símbolo de moeda etc.) e devolve
// sempre um número JS correto, sem depender do formato de exibição da célula.
export function parseValorFlexivel(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return valor;
  let s = String(valor).trim();
  s = s.replace(/[^\d.,-]/g, "");
  if (s === "") return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    const posVirgula = s.lastIndexOf(",");
    const posPonto = s.lastIndexOf(".");
    if (posVirgula > posPonto) {
      // formato brasileiro: 1.234,56 -> remove separador de milhar, vírgula vira ponto decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // formato americano: 1,234.56 -> remove separador de milhar
      s = s.replace(/,/g, "");
    }
  } else if (temVirgula && !temPonto) {
    const partes = s.split(",");
    if (partes[partes.length - 1].length <= 2) {
      // vírgula decimal: 1234,56
      s = s.replace(",", ".");
    } else {
      // vírgula como separador de milhar solto: 1,234
      s = s.replace(/,/g, "");
    }
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function findExact(headers, alvo) {
  return headers.indexOf(alvo);
}
