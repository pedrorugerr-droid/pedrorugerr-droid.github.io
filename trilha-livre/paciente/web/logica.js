// Regras do app do paciente, sem tela e sem rede. Testadas em app/test.
// Conteúdo: só data/paciente.json (redação leiga). A ficha clínica nunca chega aqui.

export const VERSAO_TERMO = "2026-11-22";

/** Contatos de crise que funcionam mesmo sem o conteúdo carregado. */
export const CONTATOS_FIXOS = [
  { nome: "CVV", numero: "188", descricao: "apoio emocional, 24 horas, ligação gratuita" },
  { nome: "SAMU", numero: "192", descricao: "emergência médica" },
];

export const AVISO_EMERGENCIA =
  "Este app não substitui o atendimento e não é serviço de emergência. O seu terapeuta não vê nada do que você faz aqui em tempo real: ele só vê o que você escolher enviar. Em perigo, ligue 188 (CVV) ou 192 (SAMU).";

export const AVISO_PIORA =
  "Se uma prática deixar o mal-estar maior do que antes, pare e leve isso para a sessão. Não precisa insistir sozinho.";

/** Módulos que nunca entram como prática solta: só pelo plano de segurança. */
export const SO_PELO_PLANO = new Set(["CRI"]);

export const HUMOR = [
  { valor: 1, rotulo: "Muito mal" },
  { valor: 2, rotulo: "Mal" },
  { valor: 3, rotulo: "Mais ou menos" },
  { valor: 4, rotulo: "Bem" },
  { valor: 5, rotulo: "Muito bem" },
];

export const EMOCOES = [
  "alegria", "tristeza", "raiva", "medo", "ansiedade", "vergonha", "culpa", "nojo", "alívio", "cansaço", "confusão",
];

// ---------- Datas ----------

/** AAAA-MM-DD no fuso do aparelho. */
export function dataLocal(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const dia = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${dia}`;
}

export function somarDias(data, n) {
  const [a, m, d] = data.split("-").map(Number);
  return dataLocal(new Date(a, m - 1, d + n));
}

export function ultimosDias(hoje, n = 7) {
  return Array.from({ length: n }, (_, i) => somarDias(hoje, i - n + 1));
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function diaDaSemana(data) {
  const [a, m, d] = data.split("-").map(Number);
  return DIAS_SEMANA[new Date(a, m - 1, d).getDay()];
}

// ---------- Prescrição ----------

/** Confere a forma da prescrição (contrato em docs/ARQUITETURA_apps.md). Devolve a lista de problemas. */
export function conferirPrescricao(p) {
  const erros = [];
  if (!p || typeof p !== "object") return ["prescrição vazia"];
  if (typeof p.versao_conteudo !== "string") erros.push("falta versao_conteudo");
  if (!p.terapeuta || typeof p.terapeuta.publica !== "string") erros.push("falta a chave pública do terapeuta");
  if (!Array.isArray(p.praticas)) erros.push("falta a lista de práticas");
  else for (const x of p.praticas) if (!x || typeof x.id_estavel !== "string") erros.push("prática sem id_estavel");
  if (p.questionarios != null && !Array.isArray(p.questionarios)) erros.push("questionários em formato errado");
  if (p.plano_seguranca != null && typeof p.plano_seguranca !== "object") erros.push("plano de segurança em formato errado");
  return erros;
}

const listaDeTexto = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : v ? [String(v).trim()].filter(Boolean) : []);

/**
 * Resolve a prescrição no conteúdo leigo. Prática que não existe na versão do
 * paciente, ou de módulo que só entra pelo plano de segurança, fica de fora com
 * o motivo. O paciente nunca recebe a ficha clínica: só o que está em paciente.json.
 */
export function resolverPrescricao(prescricao, conteudo) {
  const erros = conferirPrescricao(prescricao);
  if (erros.length) throw new Error(`prescrição inválida: ${erros.join("; ")}`);
  const porId = new Map(conteudo.praticas.map((p) => [p.id, p]));
  const praticas = [];
  const fora = [];
  const vistos = new Set();
  for (const item of prescricao.praticas) {
    if (vistos.has(item.id_estavel)) continue;
    vistos.add(item.id_estavel);
    const p = porId.get(item.id_estavel);
    if (!p) {
      fora.push({ id_estavel: item.id_estavel, motivo: "esta prática não está nesta versão do app; peça na sessão" });
      continue;
    }
    if (SO_PELO_PLANO.has(p.modulo)) {
      fora.push({ id_estavel: item.id_estavel, motivo: "esta prática só entra pelo plano de segurança feito na sessão" });
      continue;
    }
    praticas.push({
      id: p.id,
      frequencia: item.frequencia ? String(item.frequencia) : p.frequencia,
      observacao: item.observacao ? String(item.observacao) : "",
    });
  }
  const ps = prescricao.plano_seguranca;
  const plano = ps
    ? {
        sinais: listaDeTexto(ps.sinais),
        sozinho: listaDeTexto(ps.sozinho),
        pessoas: listaDeTexto(ps.pessoas),
        servicos: listaDeTexto(ps.servicos),
      }
    : null;
  const t = prescricao.terapeuta;
  const versaoApp = String(conteudo.versao_conteudo ?? "");
  const versaoPresc = String(prescricao.versao_conteudo);
  return {
    terapeuta: {
      nome_exibicao: String(t.nome_exibicao ?? "Seu terapeuta"),
      contato: String(t.contato ?? ""),
      horarios: String(t.horarios ?? ""),
      publica: t.publica,
    },
    praticas,
    fora,
    plano,
    questionarios: (prescricao.questionarios ?? []).map((q) => ({ id: String(q.id), nome: String(q.nome ?? q.id) })),
    emitida_em: String(prescricao.emitida_em ?? ""),
    versao_conteudo: versaoPresc,
    aviso_versao: versaoPresc.split(".")[0] !== versaoApp.split(".")[0] ? "A prescrição foi feita para outra versão do conteúdo. Atualize o app ou confira na sessão." : null,
  };
}

// ---------- Segurança clínica ----------

/** Check-in 1 em dois dias seguidos, sendo o mais recente um deles. */
export function alertaHumor(checkins) {
  const porDia = new Map();
  for (const c of checkins) porDia.set(c.data, c.humor);
  const dias = [...porDia.keys()].sort();
  const ultimo = dias.at(-1);
  if (!ultimo || porDia.get(ultimo) !== 1) return false;
  return porDia.get(somarDias(ultimo, -1)) === 1;
}

// ---------- Questionários (só próprios ou de uso livre; D-100) ----------

const OPCOES_SEMANA = [
  { valor: 0, rotulo: "Nenhum dia" },
  { valor: 1, rotulo: "Alguns dias" },
  { valor: 2, rotulo: "Mais da metade dos dias" },
  { valor: 3, rotulo: "Quase todos os dias" },
];

/**
 * Questionários que o app sabe aplicar. O clínico prescreve pelo id.
 * "trilha-semana" é próprio do app, sem validação psicométrica: serve para
 * acompanhar a semana, não para diagnóstico. PHQ-9 e GAD-7 são de uso livre,
 * mas só entram com o texto da tradução oficial em português, a conferir pelo
 * Pedro; até lá ficam como "a responder na sessão".
 */
export const QUESTIONARIOS = {
  "trilha-semana": {
    nome: "Como foi a sua semana",
    nota: "Questionário do próprio app, para acompanhar a semana. Não é diagnóstico.",
    pergunta: "Nos últimos sete dias, em quantos dias você...",
    opcoes: OPCOES_SEMANA,
    itens: [
      { id: "animo", texto: "teve pouco ânimo ou pouca vontade de fazer as coisas?" },
      { id: "baixo", texto: "se sentiu para baixo ou sem esperança?" },
      { id: "tenso", texto: "se sentiu nervoso, tenso ou preocupado demais?" },
      { id: "sono", texto: "teve dificuldade para dormir ou para descansar?" },
      { id: "dia", texto: "teve dificuldade para fazer o que era importante no dia?" },
      { id: "risco", texto: "pensou que seria melhor não estar vivo, ou em se machucar?", risco: true },
    ],
  },
};

/** Escore (soma) e se algum item de risco foi positivo. */
export function pontuarQuestionario(id, respostas) {
  const q = QUESTIONARIOS[id];
  if (!q) throw new Error(`questionário desconhecido: ${id}`);
  let escore = 0;
  let risco = false;
  let respondidos = 0;
  for (const item of q.itens) {
    const v = respostas[item.id];
    if (typeof v !== "number") continue;
    respondidos++;
    escore += v;
    if (item.risco && v > 0) risco = true;
  }
  return { escore, risco, completo: respondidos === q.itens.length, maximo: q.itens.length * 3 };
}

// ---------- Registros ----------

/** Formulários próprios do app para os tipos de registro de paciente.json. */
export const FORMULARIOS = {
  pensamentos: {
    titulo: "Registro de pensamentos",
    campos: [
      { id: "situacao", rotulo: "Situação: onde você estava e o que aconteceu", tipo: "texto" },
      { id: "pensamento", rotulo: "O que passou pela sua cabeça", tipo: "texto" },
      { id: "emocoes", rotulo: "O que você sentiu", tipo: "lista", opcoes: EMOCOES, multipla: true },
      { id: "intensidade", rotulo: "Com que força, de 0 a 10", tipo: "escala" },
      { id: "outro_jeito", rotulo: "Outro jeito de ver (opcional)", tipo: "texto" },
    ],
  },
  emocoes: {
    titulo: "Registro de emoções",
    campos: [
      { id: "situacao", rotulo: "O que aconteceu", tipo: "texto" },
      { id: "emocoes", rotulo: "O que você sentiu", tipo: "lista", opcoes: EMOCOES, multipla: true },
      { id: "corpo", rotulo: "Onde sentiu no corpo", tipo: "texto" },
      { id: "intensidade", rotulo: "Com que força, de 0 a 10", tipo: "escala" },
    ],
  },
  atividades: {
    titulo: "Diário de atividades",
    campos: [
      { id: "hora", rotulo: "Hora", tipo: "hora" },
      { id: "atividade", rotulo: "O que você fez", tipo: "texto" },
      { id: "prazer", rotulo: "Quanto gostou, de 0 a 10", tipo: "escala" },
      { id: "conseguiu", rotulo: "Quanto conseguiu fazer, de 0 a 10", tipo: "escala" },
    ],
  },
  exposicao: {
    titulo: "Registro de exposição",
    campos: [
      { id: "passo", rotulo: "Qual foi o passo combinado", tipo: "texto" },
      { id: "antes", rotulo: "Mal-estar antes, de 0 a 10", tipo: "escala" },
      { id: "pico", rotulo: "Mal-estar no pior momento, de 0 a 10", tipo: "escala" },
      { id: "depois", rotulo: "Mal-estar no fim, de 0 a 10", tipo: "escala" },
      { id: "ficou", rotulo: "Ficou até o mal-estar baixar", tipo: "sim_nao" },
      { id: "notas", rotulo: "O que aprendeu (opcional)", tipo: "texto" },
    ],
  },
  sono: {
    titulo: "Diário de sono",
    campos: [
      { id: "deitou", rotulo: "Hora em que deitou", tipo: "hora" },
      { id: "levantou", rotulo: "Hora em que levantou", tipo: "hora" },
      { id: "demorou", rotulo: "Minutos até pegar no sono", tipo: "numero" },
      { id: "acordou", rotulo: "Quantas vezes acordou", tipo: "numero" },
      { id: "qualidade", rotulo: "Como foi o sono, de 0 a 10", tipo: "escala" },
    ],
  },
  livre: {
    titulo: "Registro",
    campos: [
      { id: "o_que", rotulo: "O que você fez ou notou", tipo: "texto" },
      { id: "como", rotulo: "Como foi, de 0 a 10 (opcional)", tipo: "escala" },
    ],
  },
};

const slug = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "campo";

/**
 * Formulário de registro de uma prática. Usa o formulário próprio quando o tipo
 * é conhecido; senão a folha da prática (campos de paciente.json); senão o livre.
 * Devolve null quando a prática não pede registro além da medida 0 a 10.
 */
export function formularioDaPratica(p) {
  const r = p.registro ?? { tipo: "nenhum" };
  if (r.tipo === "nenhum" || r.tipo === "escala") return null;
  if (r.tipo === "formulario" && FORMULARIOS[r.formulario]) return { tipo: r.formulario, ...FORMULARIOS[r.formulario] };
  const folha = p.materiais?.folha;
  if (folha?.campos?.length) {
    const usados = new Set();
    const campos = folha.campos.map((c) => {
      let id = slug(c.rotulo);
      while (usados.has(id)) id += "_";
      usados.add(id);
      return { id, rotulo: c.rotulo, tipo: c.tipo, ...(c.opcoes ? { opcoes: c.opcoes, multipla: true } : {}) };
    });
    return { tipo: "folha", titulo: folha.titulo, instrucao: folha.texto ?? "", campos };
  }
  const titulo = r.tipo === "diario" && r.diario ? `Diário: ${r.diario}` : FORMULARIOS.livre.titulo;
  return { tipo: "livre", titulo, campos: FORMULARIOS.livre.campos };
}

/** Pergunta da medida rápida de 0 a 10 depois da prática. */
export function medidaDaPratica(p) {
  const r = p.registro ?? {};
  if (r.tipo === "escala" && r.pergunta) return { pergunta: r.pergunta, rotulo_0: r.rotulo_0 ?? "nada", rotulo_10: r.rotulo_10 ?? "o máximo" };
  return { pergunta: "Quanto mal-estar você sente agora?", rotulo_0: "nenhum", rotulo_10: "o maior possível" };
}

/** Tira campos vazios. Devolve null se nada foi preenchido. */
export function limparRegistro(campos, valores) {
  const out = {};
  for (const c of campos) {
    const v = valores[c.id];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    out[c.id] = v;
  }
  return Object.keys(out).length ? out : null;
}

// ---------- Contagens ----------

export function feitasNaSemana(feitas, id, hoje) {
  const dias = new Set(ultimosDias(hoje, 7));
  return feitas.filter((f) => f.id_estavel === id && dias.has(f.data)).length;
}

export function feitasPorDia(feitas, hoje) {
  return ultimosDias(hoje, 7).map((data) => ({ data, dia: diaDaSemana(data), n: feitas.filter((f) => f.data === data).length }));
}

export function feitaHoje(feitas, id, hoje) {
  return feitas.some((f) => f.id_estavel === id && f.data === hoje);
}

// ---------- Resumo para a sessão ----------

/**
 * Monta o resumo (contrato em docs/ARQUITETURA_apps.md) só com o que o paciente
 * marcou. `marcas` = { praticas, checkins, registros: true | string[] (ids), questionarios }.
 * O que não foi marcado sai como lista vazia.
 */
export function montarResumo({ apelido, publica, periodo, praticas, feitas, checkins, registros, respostas, marcas, recado, agora = new Date() }) {
  const dentro = (d) => d >= periodo.de && d <= periodo.ate;
  const out = {
    apelido: String(apelido ?? ""),
    periodo: { de: periodo.de, ate: periodo.ate },
    praticas: [],
    checkins: [],
    registros: [],
    questionarios: [],
    recado: String(recado ?? "").trim().slice(0, 2000),
    publica,
    emitido_em: agora.toISOString(),
  };
  if (marcas.praticas) {
    out.praticas = praticas.map((p) => {
      const minhas = feitas.filter((f) => f.id_estavel === p.id && dentro(f.data));
      return {
        id_estavel: p.id,
        feitas: minhas.length,
        medidas: minhas.filter((f) => typeof f.medida === "number").map((f) => ({ data: f.data, valor: f.medida })),
      };
    });
  }
  if (marcas.checkins) out.checkins = checkins.filter((c) => dentro(c.data)).map((c) => ({ data: c.data, humor: c.humor }));
  if (marcas.registros) {
    const escolhidos = Array.isArray(marcas.registros) ? new Set(marcas.registros) : null;
    out.registros = registros
      .filter((r) => dentro(r.data) && (!escolhidos || escolhidos.has(r.id)))
      .map((r) => ({ tipo: r.tipo, id_estavel: r.id_estavel ?? null, data: r.data, campos: r.campos }));
  }
  if (marcas.questionarios) {
    out.questionarios = respostas
      .filter((q) => dentro(q.data))
      .map((q) => ({ id: q.questionario ?? q.id, data: q.data, respostas: q.respostas, escore: q.escore, risco: q.risco }));
  }
  return out;
}
