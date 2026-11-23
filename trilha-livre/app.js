// Trilha Psicológica Livre: app aberto ao público, sem terapeuta, sem conta e
// sem rede. Telas e navegação. Regras em logica.js, dados em estado.js
// (armazém cifrado de comum/armazem.js), peças de tela em comum/telas.js.
// Nenhum texto do usuário entra por innerHTML: tudo por textContent.

import { backendIndexedDb, backendMemoria, backendSqlite } from "./comum/armazem.js";
import { importarPrivada } from "./comum/pacote.js";
import { aviso, campo, chips, cronometro, escala, h, textoRico } from "./comum/telas.js";
import { FORMULARIOS, formularioDaPratica, limparRegistro, medidaDaPratica } from "./paciente/web/logica.js";
import { abrirEstado } from "./estado.js";
import { cartaoInstalar } from "./instalar.js";
import { telaSugestoes } from "./sugestoes.js";
import { estadoLicenca, lerLicenca, MODELO, pode } from "./licenca.js";
import {
  AVISO_FIXO,
  AVISOS_TRIAGEM,
  BLOQUEIOS,
  CONTATOS_FIXOS,
  PLANO_SECOES,
  TRIAGEM,
  VERSAO_TERMO,
  blocosDaPratica,
  buscar,
  conteudoElegivel,
  dataLocal,
  linkWhatsApp,
  textoProgresso,
  destinoAposTriagem,
  ehExposicao,
  filtrarPorTriagem,
  objetivosDisponiveis,
  planoVazio,
  praticasDoObjetivo,
  resumoProgresso,
  triagemVencida,
} from "./logica.js";
import { POLITICA, TERMO } from "./textos.js";

let E; // estado
let C = { praticas: [], modulos: {}, fora: [], total: 0, versao_conteudo: "" };
let porId = new Map();
let cfg = null;
let licenca = null;
let limpezas = [];
let entrada = { maior: null, aceite: false };
let respostasTriagem = {};

const tela = () => document.getElementById("tela");
const nativo = () => Boolean(globalThis.Capacitor?.isNativePlatform?.());
const ir = (rota) => (location.hash === `#${rota}` ? rotear() : (location.hash = rota));
const formatarData = (d) => (d ? d.split("-").reverse().join("/") : "");

/** Práticas que a pessoa vê agora: elegíveis (D-135) e liberadas pela triagem. */
const visiveis = () => filtrarPorTriagem(C.praticas, cfg?.triagem ?? null).visiveis;
const visivel = (id) => visiveis().some((p) => p.id === id);

function contatosFixos() {
  return h("div", { class: "contatos-fixos", role: "region", "aria-label": "Contatos de emergência" },
    CONTATOS_FIXOS.map((c) => h("a", { href: `tel:${c.numero}`, class: "ligar" }, h("span", { class: "num" }, `Ligar ${c.numero}`), h("span", {}, `${c.nome}: ${c.descricao}`))));
}

function itemPratica(p, extra) {
  return h("li", {}, h("a", { href: `#pratica/${p.id}`, class: "item" },
    h("span", {}, h("span", { class: "titulo" }, p.titulo), h("span", { class: "sub" }, p.modulo_nome)),
    extra ?? null));
}

// ---------- Rotas ----------

const ROTAS = {
  entrada: telaEntrada,
  triagem: telaTriagem,
  inicio: telaInicio,
  objetivo: telaObjetivo,
  busca: telaBusca,
  praticas: telaPraticas,
  pratica: telaPratica,
  lista: telaLista,
  registros: telaRegistros,
  registro: telaRegistro,
  progresso: telaProgresso,
  ajuda: telaAjuda,
  plano: telaPlano,
  ajustes: telaAjustes,
  texto: telaTexto,
  sugestoes: () => telaSugestoes({ E, versao: `app ${VERSAO_TERMO}, conteúdo ${C.versao_conteudo}`, limpezas }),
};
/** Abrem sem entrada concluída: Ajuda agora, os textos legais e as sugestões estão sempre a um toque. */
const PUBLICAS = new Set(["entrada", "ajuda", "texto", "plano", "sugestoes"]);
const linkSugestoes = () =>
  h("div", { class: "cartao" },
    h("h2", {}, "Sugestões de melhoria"),
    h("p", {}, "Versão de teste: conte o que achou, escrevendo ou falando."),
    h("a", { href: "#sugestoes", class: "botao sec largo" }, "Dar uma sugestão"));

function etapaPendente() {
  if (!cfg?.consentimento || cfg.consentimento.versao_termo !== VERSAO_TERMO) return "entrada";
  if (!cfg.triagem) return "triagem";
  return null;
}

async function rotear() {
  for (const f of limpezas.splice(0)) try { f(); } catch {}
  const [rota = "", ...args] = decodeURIComponent(location.hash.slice(1)).split("/");
  const pendente = etapaPendente();
  if (!ROTAS[rota] || (pendente && rota !== pendente && !PUBLICAS.has(rota))) {
    location.replace(`#${pendente ?? "inicio"}`);
    return;
  }
  if (!pendente && rota === "entrada") return location.replace("#inicio");
  const dentro = !pendente;
  document.getElementById("barra").hidden = !dentro;
  for (const a of document.querySelectorAll(".barra a")) {
    const atual = a.dataset.rota === rota || (["pratica", "objetivo", "busca", "lista"].includes(rota) && a.dataset.rota === "praticas") || (rota === "registro" && a.dataset.rota === "registros") || (rota === "plano" && a.dataset.rota === "ajuda");
    atual ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  }
  document.getElementById("topo-acoes").replaceChildren(
    dentro
      ? h("a", { href: "#ajustes", class: "botao sec", "aria-label": "Ajustes e privacidade" }, "Ajustes")
      : h("a", { href: "#ajuda", class: "botao perigo" }, "Ajuda agora"),
  );
  const conteudo = await ROTAS[rota](...args);
  tela().replaceChildren(conteudo);
  window.scrollTo(0, 0);
  tela().focus({ preventScroll: true });
}

// ---------- Entrada: idade, aviso, termo e consentimento ----------

async function telaEntrada() {
  const r = entrada;
  const erro = h("p", { class: "erro", role: "alert" });
  const idade = (v, txt) => h("label", { class: "escolha" }, h("input", { type: "radio", name: "idade", checked: r.maior === v, onchange: () => { r.maior = v; rotear(); } }), txt);
  const menor = r.maior === false;
  return h("div", {},
    h("h1", {}, "Boas-vindas ao Trilha Psicológica Livre"),
    h("p", {}, "Práticas de terapia cognitivo-comportamental e de aceitação e compromisso, em linguagem simples, para usar por conta própria. Tudo fica só neste aparelho, cifrado. Sem conta e sem cadastro."),
    h("div", { class: "cartao caixa-ajuda", role: "note" }, h("strong", {}, "Importante. "), AVISO_FIXO),
    cartaoInstalar({ compacto: true }),
    h("fieldset", { class: "cartao" },
      h("legend", {}, "Qual a sua idade?"),
      idade(true, "Tenho 18 anos ou mais"),
      idade(false, "Tenho menos de 18 anos")),
    menor
      ? h("div", { class: "cartao alerta", role: "alert" },
          h("p", {}, h("strong", {}, "Este app é só para maiores de 18 anos.")),
          h("p", {}, "Se você está passando por um momento difícil, converse com um adulto de confiança, com a escola ou com a unidade de saúde. Para conversar agora, o CVV atende pelo 188, a qualquer hora."),
          contatosFixos())
      : null,
    r.maior === true
      ? h("div", { class: "cartao" },
          h("h2", {}, "Termo de uso e privacidade"),
          h("p", {}, "Leia antes de aceitar. Os seus dados são de saúde e ficam só no aparelho; você pode apagar tudo quando quiser."),
          h("div", { class: "fila" }, h("a", { href: "#texto/termo", class: "botao sec" }, "Termo de uso"), h("a", { href: "#texto/privacidade", class: "botao sec" }, "Política de privacidade")),
          h("label", { class: "escolha" },
            h("input", { type: "checkbox", id: "aceite", checked: r.aceite, onchange: (e) => (r.aceite = e.target.checked) }),
            "Li e aceito o termo de uso e a política de privacidade, e consinto com o tratamento dos meus dados de saúde neste aparelho."),
          erro,
          h("button", {
            type: "button", class: "largo",
            onclick: async () => {
              if (!r.aceite) return (erro.textContent = "Marque o aceite para continuar.");
              cfg = await E.registrarEntrada({ maior: true, aceite: true });
              ir("triagem");
            },
          }, "Continuar"))
      : null,
    h("p", { class: "nota" }, h("a", { href: "#sugestoes" }, "Sugestões de melhoria")),
  );
}

// ---------- Triagem ----------

async function telaTriagem() {
  const r = respostasTriagem;
  const erro = h("p", { class: "erro", role: "alert" });
  const pergunta = (q, i) => {
    const valores = { [q.id]: r[q.id] === true ? "sim" : r[q.id] === false ? "não" : undefined };
    const grupo = chips({ opcoes: ["sim", "não"], multipla: false, valores, id: q.id, rotulo: q.texto, semRotulo: true });
    grupo.addEventListener("click", () => (r[q.id] = valores[q.id] === "sim" ? true : valores[q.id] === "não" ? false : undefined));
    return h("li", { class: "pergunta" }, h("p", { id: `q-${q.id}` }, `${i + 1}. ${q.texto}`), grupo);
  };
  return h("div", {},
    h("h1", {}, "Antes de começar"),
    h("p", {}, "Nove perguntas rápidas, de sim ou não. Elas não são teste nem diagnóstico: servem para mostrar a ajuda certa e guardar as práticas que pedem acompanhamento. As respostas ficam só no aparelho."),
    cfg?.triagem ? h("p", { class: "nota" }, `Última triagem em ${formatarData(dataLocal(new Date(cfg.triagem.em)))}.`) : null,
    h("ol", { class: "lista triagem cartao" }, TRIAGEM.map(pergunta)),
    erro,
    h("button", {
      type: "button", class: "largo",
      onclick: async () => {
        const falta = TRIAGEM.findIndex((q) => typeof r[q.id] !== "boolean");
        if (falta >= 0) return (erro.textContent = `Falta responder a pergunta ${falta + 1}.`);
        const res = await E.registrarTriagem(r);
        cfg = await E.config();
        respostasTriagem = {};
        ir(destinoAposTriagem(res));
      },
    }, "Ver o resultado"),
  );
}

// ---------- Início: busca por problema ou objetivo ----------

function caixaBusca(valor = "") {
  const campoBusca = h("input", { type: "search", id: "busca", value: valor, placeholder: "Ex.: não consigo dormir", autocomplete: "off", enterkeyhint: "search" });
  const ir_ = (e) => { e.preventDefault(); const t = campoBusca.value.trim(); if (t) ir(`busca/${encodeURIComponent(t)}`); };
  return h("form", { class: "busca", role: "search", onsubmit: ir_ },
    h("label", { for: "busca" }, "O que está difícil, ou o que você quer melhorar?"),
    h("div", { class: "fila" }, campoBusca, h("button", { type: "submit" }, "Buscar")));
}

function avisosDaTriagem() {
  const t = cfg.triagem;
  const itens = t.avisos.filter((k) => AVISOS_TRIAGEM[k]);
  if (!itens.length) return null;
  return h("details", { class: "cartao" }, h("summary", {}, "O que a triagem mudou"), h("ul", {}, itens.map((k) => h("li", {}, AVISOS_TRIAGEM[k]))));
}

async function telaInicio() {
  const lista = visiveis();
  const feitas = await E.feitas();
  const res = resumoProgresso(feitas);
  const ultimas = [...new Set(feitas.slice(-20).reverse().map((f) => f.id_estavel))].filter(visivel).slice(0, 3);
  return h("div", {},
    h("h1", {}, "Por onde começar"),
    triagemVencida(cfg.triagem) ? h("div", { class: "cartao destaque" }, h("p", {}, "Faz um tempo desde a última triagem. Responder de novo leva um minuto."), h("a", { href: "#triagem", class: "botao sec" }, "Refazer a triagem")) : null,
    caixaBusca(),
    h("h2", {}, "Escolha um objetivo"),
    h("div", { class: "objetivos" }, objetivosDisponiveis(lista, C.modulos).map((o) => h("a", { href: `#objetivo/${o.id}`, class: "chip objetivo" }, o.rotulo))),
    ultimas.length ? h("section", {}, h("h2", {}, "Para voltar"), h("ul", { class: "lista" }, ultimas.map((id) => itemPratica(porId.get(id))))) : null,
    h("div", { class: "cartao" },
      h("p", {}, res.naSemana ? `Você fez ${res.naSemana} prática${res.naSemana > 1 ? "s" : ""} nos últimos sete dias.` : "Nenhuma prática nos últimos sete dias. Uma curta já conta."),
      h("div", { class: "fila" }, h("a", { href: "#plano", class: "botao sec" }, planoVazio(await E.plano()) ? "Montar meu plano de segurança" : "Meu plano de segurança"))),
    avisosDaTriagem(),
    linkSugestoes(),
    cartaoInstalar(),
    h("p", { class: "nota" }, AVISO_FIXO),
  );
}

async function telaObjetivo(id) {
  const lista = praticasDoObjetivo(visiveis(), C.modulos, id);
  const o = objetivosDisponiveis(visiveis(), C.modulos).find((x) => x.id === id);
  if (!o) return h("div", {}, h("h1", {}, "Objetivo"), h("p", {}, "Nada aqui por enquanto."), h("a", { href: "#inicio", class: "botao" }, "Voltar"));
  const modulos = [...new Set(lista.map((p) => p.modulo))].filter((m) => o.modulos.includes(m));
  return h("div", {},
    h("h1", {}, o.rotulo),
    modulos.map((m) => h("p", { class: "secundario" }, h("strong", {}, `${C.modulos[m]?.nome}: `), C.modulos[m]?.descricao)),
    h("ul", { class: "lista" }, lista.map((p) => itemPratica(p))),
    o.id === "medo" && cfg.triagem.bloqueios.includes("exposicao") ? h("p", { class: "cartao caixa-ajuda" }, BLOQUEIOS.exposicao.motivo) : null,
  );
}

async function telaBusca(consulta = "") {
  const achadas = buscar(visiveis(), C.modulos, consulta);
  return h("div", {},
    h("h1", {}, "Buscar"),
    caixaBusca(consulta),
    h("p", { role: "status" }, achadas.length ? `${achadas.length} prática${achadas.length > 1 ? "s" : ""} para "${consulta}".` : `Nada encontrado para "${consulta}". Tente outras palavras ou escolha um objetivo no início.`),
    h("ul", { class: "lista" }, achadas.slice(0, 30).map((p) => itemPratica(p))),
  );
}

// ---------- Lista de técnicas por módulo ----------

async function telaPraticas() {
  const lista = visiveis();
  const { guardadas } = filtrarPorTriagem(C.praticas, cfg.triagem);
  const porModulo = new Map();
  for (const p of lista) (porModulo.get(p.modulo) ?? porModulo.set(p.modulo, []).get(p.modulo)).push(p);
  return h("div", {},
    h("h1", {}, "Práticas"),
    caixaBusca(),
    h("p", { class: "secundario" }, `${lista.length} práticas, por tema.`),
    [...porModulo].map(([m, ps]) =>
      h("details", { class: "cartao modulo" },
        h("summary", {}, `${C.modulos[m]?.nome ?? m} (${ps.length})`),
        h("p", { class: "secundario" }, C.modulos[m]?.descricao ?? ""),
        h("ul", { class: "lista" }, ps.map((p) => itemPratica(p))))),
    guardadas.length
      ? h("p", { class: "nota" }, `${guardadas.length} prática${guardadas.length > 1 ? "s estão guardadas" : " está guardada"} pelas respostas da triagem. Se a sua situação mudou, refaça a triagem em Ajustes.`)
      : null,
  );
}

// ---------- Prática guiada ----------

function bloco(b) {
  switch (b.tipo) {
    case "contatos":
      return h("section", { class: "cartao alerta" }, h("h2", {}, "Em perigo, ligue agora"), contatosFixos());
    case "exposicao":
      return h("section", { class: "cartao caixa-ajuda exposicao" },
        h("p", {}, h("strong", {}, "Como fazer. "), b.gradual),
        h("p", {}, h("strong", {}, "Quando procurar um profissional. "), b.procurar));
    case "cuidado":
      return h("section", { class: "cartao caixa-ajuda" },
        h("h2", {}, "Antes de começar, confira"),
        h("p", {}, h("strong", {}, "Quando não fazer sozinho. "), b.quando_nao_usar),
        b.cautela ? h("p", {}, h("strong", {}, "Cuidado. "), b.cautela) : null,
        h("p", {}, b.piora));
    case "procurar":
      return b.texto ? h("details", { class: "cartao" }, h("summary", {}, "Quando procurar ajuda"), h("p", {}, b.texto)) : null;
    case "sessao":
      return h("p", { class: "nota" }, b.texto);
    default:
      return null;
  }
}

function passoAPasso(passos) {
  let i = 0;
  const atual = h("p", { class: "passo-atual", "aria-live": "polite" });
  const conta = h("p", { class: "nota" });
  const ant = h("button", { type: "button", class: "sec" }, "Anterior");
  const prox = h("button", { type: "button" }, "Próximo");
  const pintar = () => {
    atual.textContent = passos[i];
    conta.textContent = `Passo ${i + 1} de ${passos.length}`;
    ant.disabled = i === 0;
    prox.disabled = i === passos.length - 1;
  };
  ant.addEventListener("click", () => { i = Math.max(0, i - 1); pintar(); });
  prox.addEventListener("click", () => { i = Math.min(passos.length - 1, i + 1); pintar(); });
  pintar();
  return h("section", { class: "cartao guiado" },
    h("h2", {}, "Passo a passo"), conta, atual, h("div", { class: "fila" }, ant, prox),
    h("details", {}, h("summary", {}, "Ver todos os passos"), h("ol", { class: "passos" }, passos.map((s) => h("li", {}, s)))));
}

async function telaPratica(id) {
  const p = porId.get(id);
  if (!p || !visivel(id)) {
    return h("div", {}, h("h1", {}, "Prática"),
      h("p", {}, p ? "Esta prática está guardada pelas respostas da triagem: ela pede acompanhamento de um profissional." : "Esta prática não está no app."),
      h("a", { href: "#praticas", class: "botao" }, "Ver as práticas"));
  }
  if (!pode("praticas", licenca)) return h("div", {}, h("h1", {}, p.titulo), h("p", {}, "A assinatura venceu. A Ajuda agora, o plano de segurança e os seus registros continuam abertos."));
  const m = p.materiais ?? {};
  const med = medidaDaPratica(p);
  const valores = {};
  const crono = cronometro(typeof p.duracao_min === "number" && p.duracao_min > 0 ? p.duracao_min : 5, limpezas);
  const form = formularioDaPratica(p);
  const det = (rot, ...filhos) => h("details", {}, h("summary", {}, rot), ...filhos);
  const blocos = blocosDaPratica(p).map(bloco);
  return h("article", {},
    h("p", { class: "nota" }, p.modulo_nome),
    h("h1", {}, p.titulo),
    textoRico(p.para_que_serve),
    p.frequencia ? h("p", { class: "secundario" }, h("strong", {}, "Quanto fazer: "), p.frequencia) : null,
    blocos,
    ehExposicao(p) ? h("a", { href: `#lista/${id}`, class: "botao sec largo" }, "Minha lista de passos, do mais fácil ao mais difícil") : null,
    h("section", { class: "cartao" }, h("h2", {}, "Antes"), escala({ id: "antes", rotulo: med.pergunta, rotulo_0: med.rotulo_0, rotulo_10: med.rotulo_10, valores })),
    passoAPasso(p.passos ?? []),
    crono,
    h("div", { class: "cartao" },
      m.cartao ? det(`Cartão: ${m.cartao.titulo}`, h("p", {}, m.cartao.texto)) : null,
      m.psicoeducacao ? det(`Para entender: ${m.psicoeducacao.titulo}`, textoRico(m.psicoeducacao.texto)) : null,
      m.audio ? det(`Roteiro para ler devagar: ${m.audio.titulo}`, h("p", { class: "nota" }, "Leia com calma, ou peça para alguém ler para você."), textoRico(m.audio.texto)) : null,
      m.exemplo ? det(`Exemplo: ${m.exemplo.titulo}`, textoRico(m.exemplo.texto)) : null,
    ),
    h("section", { class: "cartao" },
      h("h2", {}, "Depois"),
      escala({ id: "depois", rotulo: med.pergunta, rotulo_0: med.rotulo_0, rotulo_10: med.rotulo_10, valores }),
      h("p", {}),
      h("button", {
        type: "button", class: "largo",
        onclick: async () => {
          const f = await E.marcarFeita({ id_estavel: id, antes: valores.antes, depois: valores.depois, segundos: crono.segundos() });
          aviso("Prática guardada no aparelho.");
          if (typeof f.antes === "number" && typeof f.depois === "number" && f.depois > f.antes) aviso("O mal-estar subiu. Se continuar assim, pare esta prática e procure um profissional.", 6000);
          ir(form ? `registro/${id}` : "progresso");
        },
      }, "Concluir"),
    ),
  );
}

// ---------- Lista de passos da exposição (hierarquia da própria pessoa) ----------

async function telaLista(id) {
  const p = porId.get(id);
  if (!p || !ehExposicao(p) || !visivel(id)) return h("p", {}, "Lista indisponível.");
  let { itens, proximo } = await E.hierarquia(id);
  const texto = h("input", { type: "text", id: "novo-passo", maxlength: 200, placeholder: "Ex.: tocar na maçaneta sem lavar a mão" });
  const valores = {};
  const erro = h("p", { class: "erro", role: "alert" });
  const salvar = async (novos) => { ({ itens, proximo } = await E.salvarHierarquia(id, novos)); rotear(); };
  return h("div", {},
    h("h1", {}, "Minha lista de passos"),
    h("p", { class: "secundario" }, p.titulo),
    bloco(blocosDaPratica(p).find((b) => b.tipo === "exposicao")),
    proximo ? h("div", { class: "cartao destaque" }, h("strong", {}, "Próximo passo: "), proximo.texto, ` (${proximo.nota} de 10)`) : null,
    itens.length
      ? h("ol", { class: "lista hierarquia" }, itens.map((i) => h("li", { class: "item" },
          h("span", {}, h("span", { class: "titulo" }, i.texto), h("span", { class: "sub" }, `Aflição esperada: ${i.nota} de 10${i.feito ? ". Feito." : ""}`)),
          h("span", { class: "fila" },
            h("button", { type: "button", class: "sec", onclick: () => salvar(itens.map((x) => (x.id === i.id ? { ...x, feito: !x.feito } : x))) }, i.feito ? "Desfazer" : "Feito"),
            h("button", { type: "button", class: "link", "aria-label": `Tirar ${i.texto}`, onclick: () => salvar(itens.filter((x) => x.id !== i.id)) }, "Tirar")))))
      : h("p", {}, "A lista está vazia. Escreva situações que dão medo, da mais fácil à mais difícil, e dê uma nota de quanto cada uma assusta."),
    h("section", { class: "cartao" },
      h("h2", {}, "Acrescentar um passo"),
      h("label", { for: "novo-passo" }, "Situação"), texto,
      escala({ id: "nota", rotulo: "Quanta aflição você espera sentir", rotulo_0: "nenhuma", rotulo_10: "a maior possível", valores }),
      erro,
      h("button", {
        type: "button", class: "largo",
        onclick: () => {
          if (!texto.value.trim()) return (erro.textContent = "Escreva a situação.");
          if (typeof valores.nota !== "number") return (erro.textContent = "Dê uma nota de 0 a 10.");
          salvar([...itens, { id: `${Date.now().toString(36)}${itens.length}`, texto: texto.value, nota: valores.nota }]);
        },
      }, "Acrescentar")),
    h("a", { href: `#pratica/${id}`, class: "botao sec largo" }, "Voltar para a prática"),
  );
}

// ---------- Meus registros ----------

async function telaRegistros() {
  const regs = (await E.registros()).reverse();
  const tipos = ["pensamentos", "emocoes", "atividades", "sono", "livre"].concat(visiveis().some(ehExposicao) ? ["exposicao"] : []);
  return h("div", {},
    h("h1", {}, "Meus registros"),
    h("section", { class: "cartao" }, h("h2", {}, "Novo registro"),
      h("div", { class: "chips" }, tipos.map((t) => h("a", { href: `#registro/tipo:${t}`, class: "chip" }, FORMULARIOS[t].titulo)))),
    regs.length
      ? h("ul", { class: "lista" }, regs.map((r) => {
          const f = FORMULARIOS[r.tipo] ?? { titulo: "Registro", campos: [] };
          const rot = new Map((f.campos ?? []).map((c) => [c.id, c.rotulo]));
          return h("li", {}, h("details", { class: "item registro" },
            h("summary", {}, `${formatarData(r.data)}: ${r.id_estavel && porId.get(r.id_estavel) ? porId.get(r.id_estavel).titulo : f.titulo}`),
            h("dl", {}, Object.entries(r.campos).map(([k, v]) => [h("dt", {}, rot.get(k) ?? k), h("dd", {}, Array.isArray(v) ? v.join(", ") : String(v))])),
            h("button", { type: "button", class: "perigo sec", onclick: async () => { await E.removerRegistro(r.id); aviso("Registro apagado."); rotear(); } }, "Apagar este registro")));
        }))
      : h("p", { class: "secundario" }, "Nenhum registro ainda. Eles ficam só neste aparelho."),
  );
}

async function telaRegistro(arg = "") {
  let form, idEstavel = null, tipo;
  if (arg.startsWith("tipo:")) {
    tipo = arg.slice(5);
    if (!FORMULARIOS[tipo]) return h("p", {}, "Registro desconhecido.");
    form = FORMULARIOS[tipo];
  } else {
    const p = porId.get(arg);
    form = p && visivel(arg) && formularioDaPratica(p);
    if (!form) return h("p", {}, "Esta prática não tem registro.");
    idEstavel = arg;
    tipo = form.tipo;
  }
  const valores = {};
  const erro = h("p", { class: "erro", role: "alert" });
  return h("div", {},
    h("h1", {}, form.titulo),
    idEstavel ? h("p", { class: "secundario" }, porId.get(idEstavel).titulo) : null,
    form.instrucao ? h("p", { class: "nota" }, form.instrucao) : null,
    h("div", { class: "cartao" }, form.campos.map((c) => campo(c, valores, dataLocal()))),
    erro,
    h("div", { class: "fila" },
      h("button", {
        type: "button",
        onclick: async () => {
          const campos = limparRegistro(form.campos, valores);
          if (!campos) return (erro.textContent = "Preencha pelo menos um campo.");
          await E.salvarRegistro({ tipo, id_estavel: idEstavel, campos });
          aviso("Registro guardado no aparelho.");
          ir("registros");
        },
      }, "Guardar"),
      h("a", { href: "#registros", class: "botao sec" }, "Agora não")),
  );
}

// ---------- Progresso ----------

async function telaProgresso() {
  const feitas = await E.feitas();
  const r = resumoProgresso(feitas);
  const max = Math.max(1, ...r.porDia.map((d) => d.n));
  const recentes = feitas.slice(-10).reverse();
  return h("div", {},
    h("h1", {}, "Progresso"),
    h("section", { class: "cartao" },
      h("h2", {}, "Últimos sete dias"),
      h("div", { class: "barras", role: "img", "aria-label": r.porDia.map((d) => `${d.dia}: ${d.n}`).join(", ") },
        r.porDia.map((d) => {
          // Altura pelo CSSOM: atributo style é barrado pela CSP (style-src 'self').
          const b = h("div", { class: "b" });
          b.style.height = `${Math.round((d.n / max) * 100)}%`;
          return h("div", { class: "col" }, h("span", { class: "v" }, String(d.n)), b, h("span", {}, d.dia));
        })),
      h("p", {}, `${r.naSemana} na semana, ${r.total} no total.${r.diasSeguidos > 1 ? ` ${r.diasSeguidos} dias seguidos.` : ""}`)),
    h("section", { class: "cartao" },
      h("h2", {}, "Antes e depois"),
      r.pares
        ? h("p", {}, `${r.pares === 1 ? "Na prática" : `Nas ${r.pares} práticas`} com as duas notas, o mal-estar médio foi de ${r.mediaAntes} antes para ${r.mediaDepois} depois.`)
        : h("p", { class: "secundario" }, "Dê a nota de 0 a 10 antes e depois de uma prática para ver a diferença aqui."),
      r.pares && r.mediaDepois > r.mediaAntes ? h("p", { class: "caixa-ajuda cartao" }, "Na média, o mal-estar subiu depois das práticas. Vale procurar um profissional para escolher outro caminho.") : null),
    r.total ? cartaoEnviarProgresso(r) : null,
    recentes.length
      ? h("section", { class: "cartao" }, h("h2", {}, "Últimas práticas"),
          h("ul", {}, recentes.map((f) => h("li", {}, `${formatarData(f.data)}: ${porId.get(f.id_estavel)?.titulo ?? "prática"}${typeof f.antes === "number" ? `, ${f.antes}` : ""}${typeof f.depois === "number" ? ` para ${f.depois}` : ""}`))))
      : null,
  );
}

/** Enviar o resumo (só números) a quem desenvolve o app, pela mão da própria pessoa. */
function cartaoEnviarProgresso(r) {
  const texto = textoProgresso(r, { versao: `app ${VERSAO_TERMO}, conteúdo ${C.versao_conteudo}`, data: dataLocal() });
  const whatsapp = h("a", { class: "botao largo", target: "_blank", rel: "noopener noreferrer", href: linkWhatsApp(texto) }, "Enviar pelo WhatsApp");
  const outro = navigator.share
    ? h("button", { type: "button", class: "sec largo", onclick: async () => { try { await navigator.share({ title: "Meu progresso no Trilha Psicológica Livre", text: texto }); } catch {} } }, "Enviar por outro app")
    : null;
  return h("section", { class: "cartao" },
    h("h2", {}, "Enviar meu progresso"),
    h("p", {}, "Se quiser, mande este resumo para o Pedro Rüger, psicólogo que desenvolve o app. Ajuda a saber se as práticas estão servindo. Vão só os números abaixo; nenhum registro, plano ou resposta sua."),
    h("pre", { class: "resumo-envio" }, texto),
    h("div", { class: "pilha" }, whatsapp, outro),
    h("p", { class: "nota" }, "Não é um canal de atendimento. Em perigo, ligue 188 (CVV) ou 192 (SAMU)."));
}

// ---------- Ajuda agora ----------

async function telaAjuda(motivo) {
  const plano = E ? await E.plano() : null;
  const MOTIVOS = {
    urgente: "Você contou que está em perigo agora. Ligue já para o SAMU (192) ou vá ao pronto-socorro mais próximo. Se puder, peça para alguém ficar com você.",
    risco: AVISOS_TRIAGEM.risco,
  };
  return h("div", {},
    h("h1", {}, "Ajuda agora"),
    MOTIVOS[motivo] ? h("div", { class: "cartao alerta", role: "alert" }, h("strong", {}, MOTIVOS[motivo])) : null,
    contatosFixos(),
    h("p", {}, "Em perigo imediato, vá ao pronto-socorro mais próximo."),
    h("section", { class: "cartao" },
      h("h2", {}, "Procure um profissional"),
      h("p", {}, "Este app não substitui atendimento. Você pode procurar um psicólogo ou um psiquiatra, a unidade básica de saúde (UBS) do seu bairro ou o CAPS da sua cidade, que atendem pelo SUS."),
      h("p", { class: "nota" }, "O CVV também atende por chat em cvv.org.br.")),
    h("section", { class: "cartao" },
      h("h2", {}, "Meu plano de segurança"),
      plano && !planoVazio(plano)
        ? PLANO_SECOES.filter((s) => plano[s.id]?.length).map((s) => h("div", {}, h("h3", {}, s.titulo), h("ul", {}, plano[s.id].map((i) => h("li", {}, i)))))
        : h("p", { class: "secundario" }, "Você ainda não montou o seu plano. Ele é feito por você, com calma, para usar num momento difícil."),
      E && cfg?.consentimento ? h("a", { href: "#plano", class: "botao sec largo" }, plano && !planoVazio(plano) ? "Editar o plano" : "Montar o plano") : null),
    motivo && cfg?.triagem ? h("a", { href: "#inicio", class: "botao sec largo" }, "Continuar no app") : null,
    h("div", { class: "cartao caixa-ajuda" }, AVISO_FIXO),
  );
}

// ---------- Plano de segurança feito pela própria pessoa ----------

async function telaPlano() {
  if (!cfg?.consentimento) return telaAjuda();
  const atual = (await E.plano()) ?? {};
  const campos = PLANO_SECOES.map((s) => ({ s, area: h("textarea", { id: `plano-${s.id}`, rows: 3, maxlength: 3000 }, (atual[s.id] ?? []).join("\n")) }));
  return h("div", {},
    h("h1", {}, "Meu plano de segurança"),
    h("p", {}, "Preencha com calma, num momento tranquilo, para usar quando a crise chegar. Um item por linha. Fica só neste aparelho."),
    contatosFixos(),
    h("div", { class: "cartao" }, campos.map(({ s, area }) => h("div", {}, h("label", { for: area.id }, s.titulo), h("p", { class: "nota" }, s.ajuda), area))),
    h("button", {
      type: "button", class: "largo",
      onclick: async () => {
        await E.salvarPlano(Object.fromEntries(campos.map(({ s, area }) => [s.id, area.value])));
        aviso("Plano guardado no aparelho.");
        ir("ajuda");
      },
    }, "Guardar o plano"),
  );
}

// ---------- Ajustes ----------

async function telaAjustes() {
  const confirmar = h("div", { class: "oculto cartao alerta" },
    h("p", {}, h("strong", {}, "Isto apaga deste aparelho a triagem, as práticas feitas, os registros, as listas, o plano de segurança e o aceite do termo. Não dá para desfazer.")),
    h("button", {
      type: "button", class: "perigo largo",
      onclick: async () => {
        await E.apagarTudo();
        entrada = { maior: null, aceite: false };
        location.replace("#entrada");
        location.reload();
      },
    }, "Sim, apagar tudo"));
  const est = estadoLicenca(licenca);
  return h("div", {},
    h("h1", {}, "Ajustes"),
    h("div", { class: "cartao" },
      h("h2", {}, "Triagem"),
      h("p", {}, `Feita em ${formatarData(dataLocal(new Date(cfg.triagem.em)))}. Refaça quando a sua situação mudar.`),
      h("a", { href: "#triagem", class: "botao sec largo" }, "Refazer a triagem")),
    h("div", { class: "cartao" },
      h("h2", {}, "Privacidade"),
      h("p", {}, "Tudo fica só neste aparelho, cifrado. O app não usa internet para os seus dados."),
      h("div", { class: "fila" },
        h("a", { href: "#texto/privacidade", class: "botao sec" }, "Política de privacidade"),
        h("a", { href: "#texto/termo", class: "botao sec" }, "Termo de uso")),
      h("p", { class: "nota" }, `Conteúdo ${C.versao_conteudo}, ${C.praticas.length} práticas. Termo aceito em ${formatarData(dataLocal(new Date(cfg.consentimento.em)))}.`)),
    linkSugestoes(),
    cartaoInstalar(),
    h("div", { class: "cartao" },
      h("h2", {}, "Assinatura"),
      h("p", { class: "nota" }, MODELO === "a_definir" ? "Versão de avaliação: tudo liberado." : `Situação: ${est}.`)),
    h("div", { class: "cartao" },
      h("h2", {}, "Apagar meus dados"),
      h("p", {}, "Os seus dados só existem neste aparelho. Apagar aqui apaga de verdade."),
      h("button", { type: "button", class: "perigo sec largo", onclick: () => confirmar.classList.remove("oculto") }, "Apagar tudo deste aparelho"),
      confirmar),
  );
}

async function telaTexto(qual) {
  const t = qual === "termo" ? TERMO : POLITICA;
  return h("article", {},
    h("h1", {}, t.titulo),
    h("p", { class: "nota" }, `Versão ${t.versao}`),
    t.secoes.map((s) => h("section", {}, h("h2", {}, s.titulo), s.paragrafos.map((p) => h("p", {}, p)))),
    h("button", { type: "button", class: "sec", onclick: () => history.back() }, "Voltar"),
  );
}

// ---------- Início ----------

async function escolherBackend() {
  if (nativo() && !globalThis.TRILHA_SQLITE) {
    try {
      const { abrirConexao } = await import("./nativo.js");
      globalThis.TRILHA_SQLITE = await abrirConexao();
    } catch (e) {
      console.error(e);
    }
  }
  if (nativo() && globalThis.TRILHA_SQLITE) return backendSqlite(globalThis.TRILHA_SQLITE, { importarPrivada });
  return backendIndexedDb({ nome: "trilha-livre" });
}

/**
 * App instalado: quando sai versão nova no site, o service worker baixa em
 * segundo plano e avisa aqui. A pessoa toca em Atualizar (ou abre de novo) e
 * passa à versão nova; os dados no aparelho continuam.
 */
function vigiarAtualizacao() {
  const sw = navigator.serviceWorker;
  const tinha = Boolean(sw.controller);
  sw.addEventListener("controllerchange", () => {
    if (!tinha || document.querySelector(".atualizacao")) return;
    document.body.append(
      h("div", { class: "atualizacao", role: "status" },
        h("span", {}, "Versão nova do app pronta."),
        h("button", { type: "button", onclick: () => location.reload() }, "Atualizar agora")));
  });
  sw.register("sw.js")
    .then((r) => document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && r.update().catch(() => {})))
    .catch(() => {});
}

async function iniciar() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) vigiarAtualizacao();
  try {
    const publico = await (await fetch("dados/publico.json")).json();
    C = { ...conteudoElegivel(publico), versao_conteudo: publico.versao_conteudo };
  } catch {
    aviso("Não foi possível abrir o conteúdo. A Ajuda agora continua funcionando.", 6000);
  }
  porId = new Map(C.praticas.map((p) => [p.id, p]));
  try {
    E = await abrirEstado(await escolherBackend());
  } catch {
    E = await abrirEstado(backendMemoria());
    aviso("Este navegador não deixa guardar dados. Nada ficará salvo ao fechar.", 6000);
  }
  cfg = await E.config();
  // Pede ao navegador para não apagar os dados sozinho quando faltar espaço
  // (no app instalado o Chrome concede sem perguntar).
  navigator.storage?.persist?.().catch(() => {});
  licenca = await lerLicenca(E.armazem);
  window.addEventListener("hashchange", rotear);
  rotear();
}

iniciar();
