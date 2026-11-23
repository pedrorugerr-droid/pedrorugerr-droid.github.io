// Regras do Trilha Psicológica Livre, sem tela e sem rede. Testadas em app/test/livre.test.js.
// Conteúdo: só data/publico.json (redação leiga para o público). Nada da ficha clínica.
//
// Decisões que valem aqui: D-129 (autoajuda, recorte menor, triagem e contatos
// de crise), D-132 (só maiores de 18), D-134 (nome) e D-135 (o que entra e o
// que fica fora; exposição com prevenção de resposta com textos obrigatórios;
// crise só com tolerância ao mal-estar e plano feito pela própria pessoa).
//
// O que vem do app do paciente (formulários de registro, medida de 0 a 10,
// datas) é reaproveitado de paciente/web/logica.js, sem cópia.

import { dataLocal, somarDias, ultimosDias, diaDaSemana } from "./paciente/web/logica.js";

export const VERSAO_TERMO = "2026-11-23-livre";
export const IDADE_MINIMA = 18;
/** Depois de quantos dias o app pede para refazer a triagem. */
export const DIAS_TRIAGEM = 30;

export const CONTATOS_FIXOS = [
  { nome: "CVV", numero: "188", descricao: "apoio emocional, 24 horas, ligação gratuita" },
  { nome: "SAMU", numero: "192", descricao: "emergência médica" },
];

export const AVISO_FIXO =
  "Este app não substitui atendimento com psicólogo ou médico e não é serviço de emergência. Ninguém acompanha o que você faz aqui. Em perigo, ligue 188 (CVV) ou 192 (SAMU).";

export const AVISO_PIORA =
  "Se uma prática deixar o mal-estar maior do que antes, pare. Não precisa insistir sozinho: procure um profissional.";

/**
 * O texto de data/publico.json foi escrito também para quem faz terapia e às
 * vezes fala em sessão ou terapeuta. Este aviso aparece em toda prática.
 */
export const AVISO_SESSAO =
  "Onde o texto fala em sessão ou terapeuta: se você faz acompanhamento, leve isso para o profissional. Se não faz, anote em Meus registros e, se a dúvida continuar, procure um psicólogo.";

/** D-135: texto obrigatório nas telas de exposição (sempre gradual, hierarquia da própria pessoa). */
export const TEXTO_EXPOSICAO = {
  gradual:
    "Sempre aos poucos. Você monta a sua própria lista de situações, da mais fácil para a mais difícil, e começa pelas mais fáceis. Não pule etapas.",
  procurar:
    "Procure acompanhamento profissional em vez de seguir sozinho se os rituais tomam mais de uma hora por dia, se você tem pensamentos intrusivos de causar dano a si ou a outras pessoas, ou se não houver melhora em algumas semanas.",
};

// ---------- O que fica fora (D-135) ----------

/** Módulos inteiros fora do app aberto, com o motivo. */
export const MODULOS_FORA = {
  CRI: "técnica de crise feita com terapeuta; no app aberto a crise é tolerância ao mal-estar e o plano de segurança da própria pessoa",
  TER: "técnica de terapeuta",
  SUB: "técnica com uso de substância",
};

/**
 * Práticas fora por id estável, com o motivo. Cada uma é anotada para o Pedro
 * (app/livre/LOJA.md, seção Conteúdo filtrado).
 */
export const IDS_FORA = {
  "rotina-alimentar-regular": "técnica sobre alimentação; a contraindicação (transtorno alimentar) pede triagem que o app não faz com segurança",
};

/** Descrição de método de autolesão: nunca aparece (D-135). */
export const RE_METODO = /cortar os pulsos|cortar-se|se cortar com|lâmina|gilete|overdose|enforc|(tomar|engolir) (todos os|muitos|vários) (remédios|comprimidos)|pular de (um prédio|uma ponte|lugar alto)|veneno de rato/i;
/** Substituição sensorial da autolesão (D-116): nunca aparece. */
export const RE_SUBSTITUICAO = /(em vez de|no lugar de) (se machucar|se cortar|se ferir|autoles)|(gelo|elástico|caneta vermelha|pimenta)[^.]{0,60}(autoles|se machucar|se cortar)|(autoles|se machucar|se cortar)[^.]{0,60}(gelo|elástico|caneta vermelha|pimenta)/i;
/** Exposição a trauma e revivência como objetivo da prática (não como cautela). */
export const RE_TRAUMA_ALVO = /(exposição|expor-se|enfrentar)[^.]{0,40}(trauma|lembrança traumática)|reviver (o trauma|a cena) de propósito|narrativa do trauma/i;
/** Meta de peso ou dieta como objetivo da prática. */
export const RE_PESO_ALVO = /(?<!(não tem|sem|nem) )meta de peso|perder (\d+ )?quilos|emagrecer|contar calorias para/i;

const textoDe = (p) => [p.titulo, p.para_que_serve, ...(p.passos ?? []), p.cautela, JSON.stringify(p.materiais ?? {})].join("\n");
const textoDoAlvo = (p) => [p.titulo, p.para_que_serve, ...(p.passos ?? [])].join("\n");

/** Motivo para a prática ficar fora do app aberto, ou null. */
export function motivoFora(p) {
  if (MODULOS_FORA[p.modulo]) return MODULOS_FORA[p.modulo];
  if (IDS_FORA[p.id]) return IDS_FORA[p.id];
  const t = textoDe(p);
  if (RE_METODO.test(t)) return "texto com descrição de método de autolesão";
  if (RE_SUBSTITUICAO.test(t)) return "substituição sensorial da autolesão";
  const alvo = textoDoAlvo(p);
  if (RE_TRAUMA_ALVO.test(alvo)) return "exposição a trauma ou revivência";
  if (RE_PESO_ALVO.test(alvo)) return "meta de peso ou dieta";
  return null;
}

/** Separa o que entra no app aberto do que fica fora, com a contagem. */
export function conteudoElegivel(publico) {
  const praticas = [];
  const fora = [];
  for (const p of publico.praticas ?? []) {
    const m = motivoFora(p);
    if (m) fora.push({ id: p.id, codigo: p.codigo, titulo: p.titulo, motivo: m });
    else praticas.push(p);
  }
  const modulos = Object.fromEntries(Object.entries(publico.modulos ?? {}).filter(([k]) => !MODULOS_FORA[k] && praticas.some((p) => p.modulo === k)));
  return { praticas, fora, modulos, total: (publico.praticas ?? []).length };
}

// ---------- Triagem própria (sem instrumento licenciado) ----------

/**
 * Perguntas de sim ou não, escritas para o app. Não são escala validada nem
 * diagnóstico: servem para mostrar a ajuda certa e esconder o que pede
 * acompanhamento. `risco` leva direto à Ajuda agora.
 */
export const TRIAGEM = [
  { id: "perigo_agora", texto: "Neste momento, você está em perigo ou pensa em tirar a própria vida?", risco: true, urgente: true },
  { id: "pensou_morrer", texto: "Nas últimas duas semanas, você pensou em se machucar ou que seria melhor não estar vivo?", risco: true },
  { id: "rituais", texto: "Você passa mais de uma hora por dia com rituais, como lavar, conferir ou repetir, ou com pensamentos que não saem da cabeça?", bloqueia: ["exposicao"] },
  { id: "intrusivos_dano", texto: "Você tem pensamentos que assustam, de causar mal a si ou a outra pessoa, e que vêm sem querer?", bloqueia: ["exposicao"] },
  { id: "trauma", texto: "Lembranças de algo muito ruim voltam como se estivesse acontecendo de novo, ou você se sente fora do corpo com frequência?", bloqueia: ["exposicao", "trauma"] },
  { id: "saude", texto: "Você tem problema de coração, pressão alta ou baixa, desmaios, asma, epilepsia, ou está grávida?", bloqueia: ["saude"] },
  { id: "alimentacao", texto: "Você vomita ou usa remédio para compensar o que comeu, fica muito tempo sem comer de propósito, ou tem medo intenso de engordar?", bloqueia: ["alimentacao"] },
  { id: "substancia", texto: "Bebida, drogas ou apostas têm trazido problemas para você?", aviso: "substancia" },
  { id: "esgotamento", texto: "Você está tão esgotado que não dá conta do básico do dia, como comer, dormir e se cuidar?", aviso: "esgotamento" },
];

/** O que cada bloqueio esconde, com o texto que a pessoa lê. */
export const BLOQUEIOS = {
  exposicao: {
    motivo: "As práticas de enfrentar o medo ficam guardadas: pelas suas respostas, elas pedem acompanhamento de um profissional.",
    esconde: (p) => p.modulo === "EXP",
  },
  trauma: {
    motivo: "Algumas práticas que mexem com lembranças e com o corpo ficam guardadas: com lembranças que voltam, faça com um profissional.",
    esconde: (p) => /trauma|reviv|fora de si|fora do corpo|longe do próprio corpo/i.test(p.quando_nao_usar ?? ""),
  },
  saude: {
    motivo: "Algumas práticas com frio, esforço físico ou respiração forte ficam guardadas até você conversar com o seu médico.",
    esconde: (p) => /coração|cardía|pressão (alta|baixa)|grávid|gestant|desmai|asma|epileps|convuls/i.test(p.quando_nao_usar ?? ""),
  },
  alimentacao: {
    motivo: "Práticas que tocam em comida e corpo ficam guardadas: o que você contou pede um profissional com experiência em alimentação.",
    esconde: (p) => /vomit|laxante|engordar|transtorno alimentar|comida, peso/i.test(p.quando_nao_usar ?? ""),
  },
};

export const AVISOS_TRIAGEM = {
  risco: "Você contou que pensou em se machucar ou em não estar vivo. Fale com alguém agora: o CVV atende pelo 188, a qualquer hora, e o SAMU pelo 192 em emergência. Procure também um psicólogo, a unidade de saúde (UBS) ou o CAPS da sua cidade.",
  substancia: "Para bebida, drogas ou apostas, procure a unidade de saúde (UBS), o CAPS AD da sua cidade ou um profissional. O app não tem práticas sobre uso de substância.",
  esgotamento: "Com esse cansaço, comece pelas práticas curtas de acalmar o corpo e procure um profissional. Deixe as práticas que pedem esforço para depois.",
  exposicao: BLOQUEIOS.exposicao.motivo,
  trauma: BLOQUEIOS.trauma.motivo,
  saude: BLOQUEIOS.saude.motivo,
  alimentacao: BLOQUEIOS.alimentacao.motivo,
};

/**
 * Avalia as respostas ({ id: true | false }). Pergunta sem resposta conta como
 * não respondida e impede concluir, menos as de risco, que sempre precisam de resposta.
 */
export function avaliarTriagem(respostas, agora = new Date()) {
  const faltam = TRIAGEM.filter((q) => typeof respostas[q.id] !== "boolean").map((q) => q.id);
  const sim = TRIAGEM.filter((q) => respostas[q.id] === true);
  const risco = sim.some((q) => q.risco);
  const urgente = sim.some((q) => q.urgente);
  const bloqueios = new Set(sim.flatMap((q) => q.bloqueia ?? []));
  // Com risco, exposição também fica guardada.
  if (risco) bloqueios.add("exposicao");
  const avisos = [...new Set([...(risco ? ["risco"] : []), ...sim.map((q) => q.aviso).filter(Boolean), ...bloqueios])];
  return {
    completa: faltam.length === 0,
    faltam,
    risco,
    urgente,
    bloqueios: [...bloqueios].sort(),
    avisos,
    respostas: Object.fromEntries(TRIAGEM.map((q) => [q.id, respostas[q.id] === true])),
    em: agora.toISOString(),
  };
}

/** Para onde a pessoa vai depois da triagem: risco leva direto à Ajuda agora. */
export function destinoAposTriagem(resultado) {
  if (resultado.risco) return resultado.urgente ? "ajuda/urgente" : "ajuda/risco";
  return "inicio";
}

export function triagemVencida(triagem, agora = new Date()) {
  if (!triagem?.em) return true;
  return agora.getTime() - new Date(triagem.em).getTime() > DIAS_TRIAGEM * 86400000;
}

/** Aplica os bloqueios da triagem. Sem triagem, tudo o que pede triagem fica guardado. */
export function filtrarPorTriagem(praticas, triagem) {
  const bloqueios = triagem ? triagem.bloqueios : Object.keys(BLOQUEIOS);
  const visiveis = [];
  const guardadas = [];
  for (const p of praticas) {
    const b = bloqueios.find((k) => BLOQUEIOS[k]?.esconde(p));
    if (b) guardadas.push({ id: p.id, bloqueio: b });
    else visiveis.push(p);
  }
  return { visiveis, guardadas };
}

// ---------- Famílias com regra própria ----------

/** Técnica de crise (D-135): tolerância ao mal-estar ou prática para o pico. Contatos fixos na tela. */
export const ehCrise = (p) => p.modulo === "TOL" || /crise|pico/i.test(p.titulo ?? "");
/** Exposição: textos obrigatórios e lista da própria pessoa. */
export const ehExposicao = (p) => p.modulo === "EXP";

/** Blocos fixos que a tela da prática mostra, na ordem. */
export function blocosDaPratica(p) {
  const b = [];
  if (ehCrise(p)) b.push({ tipo: "contatos", contatos: CONTATOS_FIXOS });
  if (ehExposicao(p)) b.push({ tipo: "exposicao", ...TEXTO_EXPOSICAO });
  b.push({ tipo: "cuidado", quando_nao_usar: p.quando_nao_usar, cautela: p.cautela, piora: AVISO_PIORA });
  b.push({ tipo: "procurar", texto: p.quando_procurar_ajuda });
  if (/terapeuta|sessão/i.test(textoDe(p))) b.push({ tipo: "sessao", texto: AVISO_SESSAO });
  return b;
}

// ---------- Hierarquia de exposição (montada pela própria pessoa) ----------

/** Ordena da mais fácil para a mais difícil e marca o próximo passo (o mais fácil ainda não feito). */
export function ordenarHierarquia(itens) {
  const lista = [...(itens ?? [])]
    .filter((i) => i && String(i.texto ?? "").trim())
    .map((i) => ({ id: String(i.id), texto: String(i.texto).trim().slice(0, 200), nota: Math.max(0, Math.min(10, Math.round(Number(i.nota) || 0))), feito: Boolean(i.feito) }))
    .sort((a, b) => a.nota - b.nota || a.id.localeCompare(b.id));
  const proximo = lista.find((i) => !i.feito) ?? null;
  return { itens: lista, proximo };
}

// ---------- Busca por problema ou objetivo ----------

/**
 * Portas de entrada em linguagem leiga. Cada uma junta módulos e palavras.
 * Módulo que não estiver no conteúdo elegível simplesmente não aparece.
 */
export const OBJETIVOS = [
  { id: "ansiedade", rotulo: "Ansiedade e nervosismo", modulos: ["FIS", "MET", "ACE"], palavras: ["ansiedade", "preocupação", "nervoso", "aflição"] },
  { id: "crise", rotulo: "Um momento muito difícil agora", modulos: ["TOL"], palavras: ["crise", "pico", "acalmar"] },
  { id: "tristeza", rotulo: "Tristeza e falta de ânimo", modulos: ["ATV", "VAL"], palavras: ["ânimo", "tristeza", "vontade", "prazer"] },
  { id: "pensamentos", rotulo: "Pensamentos que não saem da cabeça", modulos: ["COG", "MET", "ACE"], palavras: ["pensamento", "preocupação", "ruminação"] },
  { id: "sentir", rotulo: "Entender o que eu sinto", modulos: ["EMO"], palavras: ["emoção", "sentir", "corpo"] },
  { id: "medo", rotulo: "Medo e coisas que eu evito", modulos: ["EXP"], palavras: ["medo", "evitar", "enfrentar"] },
  { id: "raiva", rotulo: "Raiva e impulsos", modulos: ["TOL", "EMO"], palavras: ["raiva", "impulso", "explodir"] },
  { id: "sono", rotulo: "Dormir melhor", modulos: [], palavras: ["sono", "dormir", "cama", "insônia"] },
  { id: "organizar", rotulo: "Organizar tarefas e rotina", modulos: ["EXE", "CTX", "MOT"], palavras: ["tarefa", "rotina", "adiar", "organizar"] },
  { id: "foco", rotulo: "Atenção e memória", modulos: ["ATE"], palavras: ["atenção", "foco", "esquecer", "memória"] },
  { id: "relacoes", rotulo: "Relações e conversas difíceis", modulos: ["INT", "REC"], palavras: ["conversa", "pedir", "dizer não", "briga"] },
  { id: "familia", rotulo: "Família, filhos e casal", modulos: ["FAM", "CAS"], palavras: ["família", "filho", "casal"] },
  { id: "valores", rotulo: "Saber o que importa para mim", modulos: ["VAL"], palavras: ["valores", "importa", "sentido"] },
];

export const normalizar = (s) =>
  String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const PARADAS = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "um", "uma", "para", "com", "que", "eu", "me", "meu", "minha", "se", "por", "mais", "muito", "quero", "estou", "tenho", "nao", "sem", "ser", "ter"]);
const raiz = (w) => (w.length > 5 ? w.slice(0, w.length - 2) : w);

/**
 * Busca livre: pontua título (peso 5), nome e descrição do módulo (3), para que
 * serve (2) e passos (1). Palavras pela raiz, sem acento. Devolve as práticas
 * com nota maior que zero, da maior para a menor.
 */
export function buscar(praticas, modulos, consulta) {
  const termos = normalizar(consulta).split(" ").filter((w) => w.length > 2 && !PARADAS.has(w)).map(raiz);
  if (!termos.length) return [];
  const conta = (texto, t) => (normalizar(texto).match(new RegExp(`\\b${t}`, "g")) ?? []).length;
  const notas = praticas.map((p) => {
    const m = modulos[p.modulo] ?? {};
    let n = 0;
    for (const t of termos) {
      n += 5 * conta(p.titulo, t) + 3 * conta(`${m.nome ?? ""} ${m.descricao ?? ""}`, t) + 2 * conta(p.para_que_serve, t) + conta((p.passos ?? []).join(" "), t);
    }
    return { p, n };
  });
  return notas.filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.p.codigo.localeCompare(b.p.codigo)).map((x) => x.p);
}

/** Práticas de um objetivo: as dos módulos dele, mais as que a busca pelas palavras achar. */
export function praticasDoObjetivo(praticas, modulos, idObjetivo) {
  const o = OBJETIVOS.find((x) => x.id === idObjetivo);
  if (!o) return [];
  const doModulo = praticas.filter((p) => o.modulos.includes(p.modulo));
  const vistos = new Set(doModulo.map((p) => p.id));
  const extra = idObjetivo === "sono" ? praticas.filter((p) => p.registro?.formulario === "sono") : [];
  for (const w of o.palavras) for (const p of buscar(praticas, modulos, w).slice(0, 6)) if (!vistos.has(p.id)) extra.push(p);
  const out = [...doModulo];
  for (const p of extra) if (!vistos.has(p.id)) { vistos.add(p.id); out.push(p); }
  return out;
}

export const objetivosDisponiveis = (praticas, modulos) => OBJETIVOS.filter((o) => praticasDoObjetivo(praticas, modulos, o.id).length > 0);

// ---------- Plano de segurança (preenchido pela própria pessoa) ----------

/** Seções do plano. Nenhuma pede nem descreve método (D-135). */
export const PLANO_SECOES = [
  { id: "sinais", titulo: "Meus sinais de alerta", ajuda: "Pensamentos, sensações ou situações que mostram que a crise está chegando." },
  { id: "sozinho", titulo: "O que eu posso fazer sozinho para atravessar", ajuda: "Coisas que acalmam ou distraem, como as práticas de tolerância ao mal-estar deste app." },
  { id: "lugares", titulo: "Pessoas e lugares que me ajudam a mudar o foco", ajuda: "Onde ir ou com quem ficar para não passar o momento sozinho." },
  { id: "pessoas", titulo: "Pessoas a quem posso pedir ajuda", ajuda: "Nome e telefone de quem você confia." },
  { id: "profissionais", titulo: "Profissionais e serviços", ajuda: "Psicólogo, médico, UBS, CAPS. O CVV (188) e o SAMU (192) já estão fixos aqui." },
  { id: "ambiente", titulo: "Como deixar o meu ambiente mais seguro", ajuda: "Por exemplo: pedir a alguém de confiança que guarde por um tempo o que pode ser perigoso nos momentos difíceis." },
  { id: "razoes", titulo: "O que me faz seguir em frente", ajuda: "Pessoas, planos e coisas que importam para você." },
];

/** Limpa o plano: só as seções conhecidas, listas de texto curtas, sem vazios. */
export function limparPlano(entrada) {
  const out = {};
  for (const s of PLANO_SECOES) {
    const v = entrada?.[s.id];
    const lista = (Array.isArray(v) ? v : String(v ?? "").split("\n")).map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 20);
    out[s.id] = lista;
  }
  return out;
}

export const planoVazio = (plano) => !plano || PLANO_SECOES.every((s) => !(plano[s.id] ?? []).length);

// ---------- Progresso ----------

/** Resumo do progresso: feitas nos últimos 7 dias e a média de antes e depois quando há as duas medidas. */
export function resumoProgresso(feitas, hoje = dataLocal()) {
  const dias = ultimosDias(hoje, 7);
  const semana = feitas.filter((f) => dias.includes(f.data));
  const pares = feitas.filter((f) => typeof f.antes === "number" && typeof f.depois === "number");
  const media = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return {
    porDia: dias.map((data) => ({ data, dia: diaDaSemana(data), n: feitas.filter((f) => f.data === data).length })),
    naSemana: semana.length,
    total: feitas.length,
    pares: pares.length,
    mediaAntes: media(pares.map((f) => f.antes)),
    mediaDepois: media(pares.map((f) => f.depois)),
    diasSeguidos: (() => {
      const comFeita = new Set(feitas.map((f) => f.data));
      let n = 0;
      for (let d = hoje; comFeita.has(d); d = somarDias(d, -1)) n++;
      return n;
    })(),
  };
}

export { dataLocal };

// ---------- Enviar o progresso a quem desenvolve o app ----------
// Só números (quantas práticas, médias das notas). Nenhum texto de registro,
// plano de segurança ou resposta da triagem entra na mensagem.

/** Contato de quem desenvolve o app (o mesmo que aparece no site). */
export const CONTATO_WHATSAPP = "5531999846282";

/** Endereço do WhatsApp com a mensagem pronta para o desenvolvedor. */
export const linkWhatsApp = (texto) => `https://wa.me/${CONTATO_WHATSAPP}?text=${encodeURIComponent(texto)}`;

/** Mensagem com o resumo do progresso, sem nenhum texto escrito pela pessoa. */
export function textoProgresso(r, { versao = "", data = "", titulo = true } = {}) {
  return [
    titulo ? "Meu progresso no Trilha Psicológica Livre" : "Resumo do meu progresso:",
    `Práticas nos últimos sete dias: ${r.naSemana}`,
    `Práticas no total: ${r.total}`,
    r.diasSeguidos > 1 ? `Dias seguidos: ${r.diasSeguidos}` : null,
    r.pares ? `Mal-estar médio (0 a 10) em ${r.pares} ${r.pares === 1 ? "prática" : "práticas"} com as duas notas: ${r.mediaAntes} antes, ${r.mediaDepois} depois` : null,
    titulo ? `\n(versão ${versao || "?"}${data ? `, ${data}` : ""})` : null,
  ].filter((x) => x != null).join("\n");
}

// ---------- Sugestões de melhoria ----------
// Ficam no aparelho até a própria pessoa enviar pelo WhatsApp, e-mail ou outro
// app dela (compartilhar). O app não envia nada sozinho.

export const SUGESTAO_TIPOS = ["Ideia de melhoria", "Algo não funcionou", "Texto difícil de entender", "Gostei disto", "Outro"];
export const SUGESTAO_LUGARES = ["Entrada e triagem", "Início e busca", "Prática guiada", "Registros", "Progresso", "Ajuda agora e plano", "Instalar no celular", "O app todo"];
export const SUGESTAO_MAX = 3000;
export const AVISO_SUGESTAO = "Escreva sobre o app, não sobre a sua saúde: o que você mandar vai para quem desenvolve o app, não para um profissional. Não coloque nome, telefone ou detalhes pessoais.";

/** Sugestão limpa: só os campos conhecidos, texto cortado no limite. */
export function limparSugestao(s = {}) {
  const tipo = SUGESTAO_TIPOS.includes(s.tipo) ? s.tipo : null;
  const onde = Array.isArray(s.onde) ? s.onde.filter((x) => SUGESTAO_LUGARES.includes(x)) : [];
  const nota = typeof s.nota === "number" && s.nota >= 0 && s.nota <= 10 ? Math.round(s.nota) : null;
  const texto = String(s.texto ?? "").replace(/\r\n?/g, "\n").trim().slice(0, SUGESTAO_MAX);
  return { tipo, onde, nota, texto };
}

export const sugestaoVazia = (s) => {
  const l = limparSugestao(s);
  return !l.texto && !l.tipo && !l.onde.length && l.nota == null;
};

/** Mensagem pronta para a pessoa mandar. Sem dado do aparelho além da versão do app. */
export function textoSugestao(s, { versao = "", data = "" } = {}) {
  const l = limparSugestao(s);
  return [
    "Sugestão para o Trilha Psicológica Livre",
    l.tipo ? `Tipo: ${l.tipo}` : null,
    l.onde.length ? `Onde: ${l.onde.join(", ")}` : null,
    l.nota != null ? `Nota para o app (0 a 10): ${l.nota}` : null,
    l.texto ? `\n${l.texto}` : null,
    `\n(versão ${versao || "?"}${data ? `, ${data}` : ""})`,
  ].filter((x) => x != null).join("\n");
}
