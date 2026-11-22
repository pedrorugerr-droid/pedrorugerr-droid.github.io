// Peças de tela da família Trilha, sem framework. Nenhum texto do usuário entra
// por innerHTML: tudo por textContent. Usadas pelo app do paciente e pelo
// app livre.

/** Cria um elemento. `on<evento>` vira listener; true vira atributo vazio. */
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = Boolean(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const f of filhos.flat(Infinity)) if (f != null && f !== false) el.append(f instanceof Node ? f : String(f));
  return el;
}

/** Aviso rápido no elemento #aviso. */
export function aviso(msg, ms = 3500) {
  const a = document.getElementById("aviso");
  if (!a) return;
  a.textContent = msg;
  a.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (a.hidden = true), ms);
}

/** Texto com tabelas e listas simples (exemplos do conteúdo), sem HTML cru. */
export function textoRico(texto) {
  const caixa = h("div", { class: "texto-longo" });
  for (const bloco of String(texto).split(/\n\s*\n/)) {
    const linhas = bloco.split("\n").filter((l) => l.trim());
    if (!linhas.length) continue;
    if (linhas.every((l) => l.trim().startsWith("|"))) {
      const celulas = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const corpo = linhas.filter((l) => !/^\|?\s*:?-{2,}/.test(l.trim().replace(/^\|/, "")));
      const [cab, ...resto] = corpo;
      caixa.append(
        h("table", {},
          h("thead", {}, h("tr", {}, celulas(cab).map((c) => h("th", { scope: "col" }, c)))),
          h("tbody", {}, resto.map((l) => h("tr", {}, celulas(l).map((c) => h("td", {}, c))))),
        ),
      );
    } else if (linhas.every((l) => /^\s*[-*] /.test(l))) {
      caixa.append(h("ul", {}, linhas.map((l) => h("li", {}, l.replace(/^\s*[-*] /, "").replace(/\*\*/g, "")))));
    } else {
      caixa.append(h("p", {}, linhas.join("\n").replace(/\*\*/g, "")));
    }
  }
  return caixa;
}

/** Escala de 0 a 10 que começa sem valor ("-") até ser tocada. */
export function escala({ id, rotulo, rotulo_0 = "0", rotulo_10 = "10", valores }) {
  const saida = h("output", { for: id, "aria-live": "polite" }, typeof valores[id] === "number" ? String(valores[id]) : "-");
  const r = h("input", {
    type: "range", id, min: 0, max: 10, step: 1, value: typeof valores[id] === "number" ? valores[id] : 5,
    "aria-valuetext": typeof valores[id] === "number" ? String(valores[id]) : "sem resposta",
    oninput: (e) => {
      valores[id] = Number(e.target.value);
      saida.textContent = e.target.value;
      e.target.setAttribute("aria-valuetext", e.target.value);
    },
  });
  return h("div", {},
    rotulo ? h("label", { for: id }, rotulo) : null,
    h("div", { class: "escala" }, r, saida, h("div", { class: "rotulos" }, h("span", {}, `0: ${rotulo_0}`), h("span", {}, `10: ${rotulo_10}`))),
  );
}

export function chips({ opcoes, multipla, valores, id, rotulo, semRotulo = false }) {
  const grupo = h("div", { class: "chips", role: "group", "aria-label": rotulo });
  const atual = () => valores[id];
  const botoes = opcoes.map((o) => {
    const b = h("button", { type: "button", class: "chip", "aria-pressed": "false" }, o);
    b.addEventListener("click", () => {
      if (multipla) {
        const s = new Set(atual() ?? []);
        s.has(o) ? s.delete(o) : s.add(o);
        valores[id] = [...s];
      } else valores[id] = atual() === o ? undefined : o;
      pintar();
    });
    return b;
  });
  const pintar = () => botoes.forEach((b, i) => b.setAttribute("aria-pressed", String(multipla ? (atual() ?? []).includes(opcoes[i]) : atual() === opcoes[i])));
  pintar();
  grupo.append(...botoes);
  return h("div", {}, semRotulo ? null : h("p", { class: "rotulo-campo", "aria-hidden": "true" }, rotulo), grupo);
}

/** Campo de formulário de registro (formatos de paciente/web/logica.js). */
export function campo(c, valores, hoje) {
  const id = `c-${c.id}`;
  const mudar = (e) => (valores[c.id] = c.tipo === "numero" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value);
  switch (c.tipo) {
    case "escala":
      return escala({ id: c.id, rotulo: c.rotulo, rotulo_0: "nada", rotulo_10: "o máximo", valores });
    case "lista":
      return chips({ opcoes: c.opcoes ?? [], multipla: c.multipla, valores, id: c.id, rotulo: c.rotulo });
    case "sim_nao":
      return chips({ opcoes: ["sim", "não"], multipla: false, valores, id: c.id, rotulo: c.rotulo });
    case "data":
      valores[c.id] ??= hoje;
      return h("div", {}, h("label", { for: id }, c.rotulo), h("input", { type: "date", id, value: valores[c.id], oninput: mudar }));
    case "hora":
      return h("div", {}, h("label", { for: id }, c.rotulo), h("input", { type: "time", id, value: valores[c.id] ?? "", oninput: mudar }));
    case "numero":
      return h("div", {}, h("label", { for: id }, c.rotulo), h("input", { type: "number", id, min: 0, inputmode: "numeric", value: valores[c.id] ?? "", oninput: mudar }));
    default:
      return h("div", {}, h("label", { for: id }, c.rotulo), h("textarea", { id, rows: 3, maxlength: 2000, oninput: mudar }, valores[c.id] ?? ""));
  }
}

/** Cronômetro com começar, pausar e de novo. `limpezas` recebe a função que para o relógio. */
export function cronometro(minutos, limpezas = []) {
  let resta = Math.round(minutos * 60);
  let usado = 0;
  let t = null;
  const mostrador = h("p", { class: "tempo", role: "timer", "aria-live": "off" });
  const fim = h("p", { role: "status" });
  const pintar = () => (mostrador.textContent = `${String(Math.floor(resta / 60)).padStart(2, "0")}:${String(resta % 60).padStart(2, "0")}`);
  const botao = h("button", { type: "button" }, "Começar");
  const pausar = () => { clearInterval(t); t = null; botao.textContent = "Continuar"; };
  botao.addEventListener("click", () => {
    if (t) return pausar();
    if (resta <= 0) { resta = Math.round(minutos * 60); fim.textContent = ""; }
    botao.textContent = "Pausar";
    t = setInterval(() => {
      resta--; usado++;
      pintar();
      if (resta <= 0) { pausar(); botao.textContent = "De novo"; fim.textContent = "Tempo concluído."; navigator.vibrate?.(200); }
    }, 1000);
  });
  limpezas.push(() => clearInterval(t));
  pintar();
  const el = h("div", { class: "cartao cronometro" }, h("h2", {}, `Cronômetro: ${minutos} min`), mostrador, botao, fim);
  el.segundos = () => usado;
  return el;
}
