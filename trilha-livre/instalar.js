// "Instalar no meu celular": o app aberto no navegador vira ícone na tela
// inicial e passa a abrir sem internet (PWA). No Android (Chrome, Edge,
// Samsung Internet) usa o pedido de instalação do próprio navegador; no
// iPhone e no iPad, que não têm esse pedido, mostra o caminho pelo Safari.
// Dentro do app das lojas (Capacitor) ou já instalado, não aparece.

import { h } from "../../comum/telas.js";

let pedido = null;
let instalado = false;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pedido = e;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    instalado = true;
    pedido = null;
    avisar();
  });
}

/** Em que situação o aparelho está: "nativo", "instalado", "pedido", "ios" ou "outro". */
export function situacaoInstalacao({ nav = globalThis.navigator, mm = globalThis.matchMedia, cap = globalThis.Capacitor } = {}) {
  if (cap?.isNativePlatform?.()) return "nativo";
  if (instalado || nav?.standalone === true || mm?.("(display-mode: standalone)")?.matches) return "instalado";
  if (pedido) return "pedido";
  const ua = nav?.userAgent ?? "";
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1)) return "ios";
  return "outro";
}

/** Cartão com o botão ou o passo a passo. Devolve null quando não há o que instalar. */
export function cartaoInstalar({ compacto = false } = {}) {
  const caixa = h("div", { class: "cartao instalar" });
  const pintar = () => {
    const s = situacaoInstalacao();
    if (!caixa.isConnected && caixa.childNodes.length) {
      ouvintes.delete(pintar);
      return;
    }
    caixa.replaceChildren();
    caixa.hidden = s === "nativo";
    if (s === "nativo") return;
    caixa.append(h("h2", {}, "Instalar no meu celular"));
    if (s === "instalado") {
      caixa.append(h("p", {}, "O app já está instalado neste aparelho. Abra pelo ícone Trilha Livre na tela inicial."));
      return;
    }
    if (!compacto) caixa.append(h("p", {}, "Fica um ícone na tela inicial, o app abre como os outros e funciona sem internet. Os seus dados continuam só neste aparelho."));
    if (s === "pedido") {
      caixa.append(h("button", {
        type: "button", class: "largo",
        onclick: async () => {
          const p = pedido;
          if (!p) return;
          pedido = null;
          await p.prompt();
          const { outcome } = await p.userChoice;
          if (outcome === "accepted") instalado = true;
          pintar();
        },
      }, "Instalar no meu celular"));
    } else if (s === "ios") {
      caixa.append(h("ol", {},
        h("li", {}, "Abra este endereço no Safari."),
        h("li", {}, "Toque em Compartilhar (o quadrado com a seta para cima)."),
        h("li", {}, "Escolha Adicionar à Tela de Início e toque em Adicionar.")));
    } else {
      caixa.append(h("ol", {},
        h("li", {}, "No Android, abra este endereço no Chrome."),
        h("li", {}, "Toque no menu (os três pontos, no alto à direita)."),
        h("li", {}, "Escolha Instalar app ou Adicionar à tela inicial.")));
    }
  };
  ouvintes.add(pintar);
  pintar();
  return caixa;
}
