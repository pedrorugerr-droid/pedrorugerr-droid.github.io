// Tela "Sugestões de melhoria": a pessoa conta o que achou, por escrito ou por
// voz, e manda pelo WhatsApp, e-mail ou outro app dela. O app não envia nada
// sozinho; o rascunho fica cifrado no aparelho até ela mandar.
//
// Voz: o reconhecimento de fala do próprio navegador (Chrome no Android,
// Safari no iPhone), quando existe. O navegador pode usar o serviço de voz do
// Google ou da Apple para transformar a fala em texto; a tela avisa. Onde não
// existe (app das lojas, alguns navegadores), a tela indica o microfone do
// teclado, que funciona em qualquer celular.

import { aviso, chips, escala, h } from "./comum/telas.js";
import { AVISO_SUGESTAO, SUGESTAO_LUGARES, SUGESTAO_MAX, SUGESTAO_TIPOS, dataLocal, limparSugestao, linkWhatsApp, resumoProgresso, textoProgresso, textoSugestao } from "./logica.js";

const Reconhecedor = () => globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null;

/** Botão de ditado que acrescenta a fala ao campo. `limpezas` recebe o que para o microfone. */
function ditado(campoTexto, aoMudar, limpezas) {
  const R = Reconhecedor();
  const dica = h("p", { class: "nota" }, "Para falar em vez de digitar, toque no microfone do teclado do celular.");
  if (!R) return dica;
  const estado = h("p", { class: "nota", role: "status", "aria-live": "polite" });
  const botao = h("button", { type: "button", class: "sec largo voz", "aria-pressed": "false" }, "🎤 Falar");
  let rec = null;
  const parar = () => {
    try { rec?.stop(); } catch {}
  };
  const desligado = () => {
    rec = null;
    botao.textContent = "🎤 Falar";
    botao.setAttribute("aria-pressed", "false");
  };
  botao.addEventListener("click", () => {
    if (rec) return parar();
    rec = new R();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    const base = campoTexto.value.trim();
    let final = "";
    rec.onresult = (e) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += (final ? " " : "") + t.trim();
        else parcial += t;
      }
      campoTexto.value = [base, final, parcial.trim()].filter(Boolean).join(" ").slice(0, SUGESTAO_MAX);
      aoMudar();
    };
    rec.onerror = (e) => {
      estado.textContent =
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "O microfone não foi liberado. Libere nas permissões do navegador ou use o microfone do teclado."
          : e.error === "no-speech" ? "Não ouvi nada. Toque em Falar e tente de novo." : "A voz não funcionou agora. Use o microfone do teclado.";
    };
    rec.onend = () => {
      desligado();
      if (!estado.textContent.startsWith("O microfone") && !estado.textContent.startsWith("Não ouvi") && !estado.textContent.startsWith("A voz")) estado.textContent = "";
    };
    estado.textContent = "Ouvindo. Fale e toque em Parar quando terminar.";
    botao.textContent = "■ Parar";
    botao.setAttribute("aria-pressed", "true");
    try { rec.start(); } catch { desligado(); estado.textContent = "A voz não funcionou agora. Use o microfone do teclado."; }
  });
  limpezas.push(parar);
  return h("div", {},
    botao,
    estado,
    h("p", { class: "nota" }, "A voz vira texto pelo serviço do próprio navegador (Google ou Apple). Se preferir, use o microfone do teclado."));
}

export async function telaSugestoes({ E, versao, limpezas }) {
  const s = await E.rascunhoSugestao();
  const valores = { tipo: s.tipo ?? undefined, onde: s.onde ?? [], nota: s.nota ?? undefined };
  const enviadas = (await E.sugestoes()).length;
  let t = null;
  const atual = () => limparSugestao({ ...valores, texto: area.value });
  const salvar = () => {
    clearTimeout(t);
    t = setTimeout(() => E.salvarRascunhoSugestao(atual()).catch(() => {}), 400);
  };
  limpezas.push(() => { clearTimeout(t); E.salvarRascunhoSugestao(atual()).catch(() => {}); });

  const area = h("textarea", { id: "sug-texto", rows: 6, maxlength: SUGESTAO_MAX, oninput: salvar, placeholder: "O que poderia ser melhor? O que atrapalhou? O que você gostou?" }, s.texto ?? "");
  const erro = h("p", { class: "erro", role: "alert" });
  const resumo = resumoProgresso(await E.feitas());
  const comProgresso = h("input", { type: "checkbox", id: "sug-progresso" });
  const mensagem = () =>
    textoSugestao(atual(), { versao, data: dataLocal() }) +
    (comProgresso.checked && resumo.total ? `\n\n${textoProgresso(resumo, { titulo: false })}` : "");
  const pronto = () => {
    const l = atual();
    if (!l.texto && !l.tipo && l.nota == null) {
      erro.textContent = "Escreva ou fale alguma coisa antes de enviar.";
      return false;
    }
    erro.textContent = "";
    return true;
  };
  const depois = async () => {
    clearTimeout(t);
    await E.guardarSugestao(atual());
    // Formulário limpo para a próxima; a saída da tela grava o rascunho vazio.
    area.value = "";
    valores.tipo = undefined;
    valores.onde = [];
    valores.nota = undefined;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    aviso("Obrigado! A sua sugestão ajuda a melhorar o app.");
  };

  const whatsapp = h("a", { class: "botao largo", target: "_blank", rel: "noopener noreferrer", href: "#sugestoes" }, "Enviar pelo WhatsApp");
  whatsapp.addEventListener("click", (e) => {
    if (!pronto()) return e.preventDefault();
    whatsapp.href = linkWhatsApp(mensagem());
    setTimeout(depois, 300);
  });
  const compartilhar = navigator.share
    ? h("button", {
        type: "button", class: "sec largo",
        onclick: async () => {
          if (!pronto()) return;
          try {
            await navigator.share({ title: "Sugestão para o Trilha Psicológica Livre", text: mensagem() });
            await depois();
          } catch {}
        },
      }, "Enviar por outro app (e-mail, mensagem)")
    : null;
  const copiar = h("button", {
    type: "button", class: "sec largo",
    onclick: async () => {
      if (!pronto()) return;
      try {
        await navigator.clipboard.writeText(mensagem());
        aviso("Texto copiado. Cole na conversa com o Pedro.");
      } catch {
        aviso("Não deu para copiar. Use Enviar pelo WhatsApp.");
      }
    },
  }, "Copiar o texto");

  const onde = chips({ opcoes: SUGESTAO_LUGARES, multipla: true, valores, id: "onde", rotulo: "Onde no app? (pode marcar mais de um)" });
  const tipo = chips({ opcoes: SUGESTAO_TIPOS, multipla: false, valores, id: "tipo", rotulo: "Que tipo de sugestão?" });
  const nota = escala({ id: "nota", rotulo: "De 0 a 10, quanto você indicaria o app para alguém?", rotulo_0: "nada", rotulo_10: "com certeza", valores });
  for (const el of [onde, tipo, nota]) {
    el.addEventListener("click", salvar);
    el.addEventListener("input", salvar);
  }

  return h("div", {},
    h("h1", {}, "Sugestões de melhoria"),
    h("p", {}, "Esta é uma versão de teste. Conte o que achou: o que ajudou, o que atrapalhou, o que faltou. Pode escrever ou falar."),
    h("div", { class: "cartao caixa-ajuda", role: "note" }, AVISO_SUGESTAO),
    h("div", { class: "cartao" }, tipo, onde),
    h("div", { class: "cartao" },
      h("label", { for: "sug-texto" }, "Sua sugestão"),
      area,
      ditado(area, salvar, limpezas)),
    h("div", { class: "cartao" }, nota),
    erro,
    h("div", { class: "cartao" },
      resumo.total
        ? h("label", { class: "marcar", for: "sug-progresso" }, comProgresso, " Incluir o resumo do meu progresso (só números: quantas práticas e a média das notas)")
        : null,
      h("p", {}, "Quando terminar, toque em enviar: a mensagem abre na conversa com o Pedro Rüger, psicólogo que desenvolve o app. Nada sai do aparelho sem você enviar."),
      h("div", { class: "pilha" }, whatsapp, compartilhar, copiar)),
    enviadas ? h("p", { class: "nota" }, `Você já mandou ${enviadas === 1 ? "1 sugestão" : `${enviadas} sugestões`} daqui. Obrigado!`) : null,
  );
}
