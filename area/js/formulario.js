// Monta o formulário a partir do conteúdo guardado no banco (tabela instrumentos).
// Conteúdo: { apresentacao, secoes: [ { parte, titulo, instrucao, campos: [ { k, rotulo, tipo, opcoes } ] } ] }
// Tipos: textolongo, texto, numero, selecao e escala (opções para tocar; escala fica em linha).
(function () {
  'use strict';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function todosCampos(conteudo) {
    const l = [];
    (conteudo.secoes || []).forEach((s) => (s.campos || []).forEach((c) => l.push(c)));
    return l;
  }
  const preenchido = (v) => v !== null && v !== undefined && String(v).trim() !== '';

  // Campos com "opcional: true" (ex.: reflexões livres) não contam no progresso nem no aviso de "sem resposta".
  function progresso(conteudo, respostas) {
    const campos = todosCampos(conteudo).filter((c) => !c.opcional);
    if (!campos.length) return 0;
    const n = campos.filter((c) => preenchido((respostas || {})[c.k])).length;
    return Math.round((n / campos.length) * 100);
  }
  function faltando(conteudo, respostas) {
    return todosCampos(conteudo).filter((c) => !c.opcional && !preenchido((respostas || {})[c.k]));
  }

  function htmlCampo(c, valor, somenteLeitura) {
    const id = 'f_' + c.k;
    const dis = somenteLeitura ? ' disabled' : '';
    const v = valor == null ? '' : String(valor);
    if (c.tipo === 'selecao' || c.tipo === 'escala') {
      const ops = (c.opcoes || []).map(([val, txt]) => `
        <label><input type="radio" name="${esc(id)}" value="${esc(val)}"${String(val) === v ? ' checked' : ''}${dis}><span>${esc(txt)}</span></label>`).join('');
      return `<fieldset class="campo" style="border:0;padding:0;margin:18px 0"><legend class="rotulo">${esc(c.rotulo)}</legend>
        <div class="opcoes${c.tipo === 'escala' ? ' horizontal' : ''}">${ops}</div></fieldset>`;
    }
    let ctl;
    if (c.tipo === 'textolongo') ctl = `<textarea id="${esc(id)}" data-k="${esc(c.k)}" rows="3"${dis}>${esc(v)}</textarea>`;
    else if (c.tipo === 'numero') ctl = `<input id="${esc(id)}" data-k="${esc(c.k)}" type="text" inputmode="decimal" value="${esc(v)}"${dis}>`;
    else ctl = `<input id="${esc(id)}" data-k="${esc(c.k)}" type="text" value="${esc(v)}"${dis}>`;
    return `<div class="campo"><label class="rotulo" for="${esc(id)}">${esc(c.rotulo)}</label>${ctl}</div>`;
  }

  // Desenha uma seção dentro de "caixa". aoMudar(k, valor) é chamado a cada alteração.
  function desenharSecao(caixa, secao, respostas, opcoes) {
    const o = opcoes || {};
    caixa.innerHTML = `
      ${secao.parte ? `<div class="parte">${esc(secao.parte)}</div>` : ''}
      <h2>${esc(secao.titulo || '')}</h2>
      ${secao.instrucao ? `<p class="suave">${esc(secao.instrucao)}</p>` : ''}
      ${(secao.campos || []).map((c) => htmlCampo(c, (respostas || {})[c.k], o.somenteLeitura)).join('')}`;
    caixa.oninput = null; caixa.onchange = null;
    if (o.somenteLeitura) return;
    caixa.querySelectorAll('textarea').forEach(autoAltura);
    caixa.oninput = (ev) => {
      const el = ev.target;
      if (el.matches('textarea')) autoAltura(el);
      if (el.dataset && el.dataset.k && o.aoMudar) o.aoMudar(el.dataset.k, el.value);
    };
    caixa.onchange = (ev) => {
      const el = ev.target;
      if (el.type === 'radio' && el.checked && o.aoMudar) o.aoMudar(el.name.slice(2), el.value);
    };
  }
  function autoAltura(t) {
    t.style.height = 'auto';
    t.style.height = Math.min(Math.max(t.scrollHeight + 2, 96), 480) + 'px';
  }

  // Texto da resposta para leitura (opções viram o rótulo).
  function textoResposta(c, v) {
    if (!preenchido(v)) return '';
    if (c.opcoes) {
      const o = c.opcoes.find(([val]) => String(val) === String(v));
      if (o) return o[1];
    }
    return String(v);
  }

  // Lista de perguntas e respostas (Área do profissional). "anterior" destaca o que mudou.
  function htmlLeitura(conteudo, respostas, anterior) {
    return (conteudo.secoes || []).map((s) => `
      <h3>${esc([s.parte, s.titulo].filter(Boolean).join(': '))}</h3>
      ${(s.campos || []).map((c) => {
        const atual = textoResposta(c, (respostas || {})[c.k]);
        const antes = anterior ? textoResposta(c, anterior[c.k]) : null;
        const mudou = anterior && antes !== atual;
        return `<div class="qa${mudou ? ' mudou' : ''}"><div class="p">${esc(c.rotulo)}</div>
          <div class="r${atual ? '' : ' vazio'}">${atual ? esc(atual) : 'sem resposta'}</div>
          ${mudou ? `<div class="antes">Antes: ${antes ? esc(antes) : 'sem resposta'}</div>` : ''}</div>`;
      }).join('')}`).join('');
  }

  window.Formulario = { todosCampos, progresso, faltando, desenharSecao, htmlLeitura, textoResposta, preenchido };
})();
