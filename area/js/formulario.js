// Monta o formulário a partir do conteúdo guardado no banco (tabela instrumentos).
// Conteúdo: { apresentacao, disparos, secoes: [ { parte, titulo, instrucao, condicao, campos: [ { k, rotulo, tipo, opcoes, grupo, condicao } ] } ] }
// Tipos: textolongo, texto, numero, selecao e escala (opções para tocar; escala fica em linha),
// multipla (marque todos que se aplicam; a resposta é uma lista com os valores marcados) e aviso (texto, sem resposta).
// "condicao" (seção ou campo) mostra a parte só quando as respostas pedem; "disparos" traz as regras por rede
// usadas em {"disparo": "R4"}. Campos ocultos não contam como "sem resposta" e o que já foi escrito neles é mantido.
(function () {
  'use strict';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function todosCampos(conteudo) {
    const l = [];
    (conteudo.secoes || []).forEach((s) => (s.campos || []).forEach((c) => l.push(c)));
    return l;
  }
  const preenchido = (v) => v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== '');
  const numero = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; };

  // Regra de disparo por rede: portão 2 ou 3; portão 1 com piora; ou três portões em 1.
  // NDV: dois ou mais "sim" na triagem da infância, ou uma resposta de "sempre foi assim".
  function disparou(rede, r, conteudo) {
    const d = ((conteudo && conteudo.disparos) || {})[rede];
    if (!d) return false;
    if (d.ndv || d.traco) {
      const sims = (d.ndv || []).filter((k) => r[k] === 'sim').length;
      return sims >= 2 || (d.traco || []).some(([k, v]) => r[k] === v);
    }
    const vals = (d.portoes || []).map((k) => numero(r[k])).filter((v) => v !== null);
    const uns = vals.filter((v) => v === 1).length;
    return vals.some((v) => v >= 2) || (uns >= 1 && r[d.mudanca] === 'piorou') || uns >= 3;
  }
  function condicaoOk(cond, respostas, conteudo) {
    if (!cond) return true;
    const r = respostas || {};
    if (cond.qualquer) return cond.qualquer.some((c) => condicaoOk(c, r, conteudo));
    if (cond.todas) return cond.todas.every((c) => condicaoOk(c, r, conteudo));
    if (cond.disparo) return disparou(cond.disparo, r, conteudo);
    const v = r[cond.campo];
    if (!preenchido(v)) return false;
    const lista = (Array.isArray(v) ? v : [v]).map(String);
    const alvo = (cond.valores || []).map(String);
    if (cond.op === 'in') return lista.some((x) => alvo.includes(x));
    if (cond.op === 'not_in') return lista.some((x) => !alvo.includes(x));
    if (cond.op === 'gte') { const a = numero(v), b = numero(cond.valor); return a !== null && b !== null && a >= b; }
    return true;
  }
  const secaoVisivel = (s, r, conteudo) => condicaoOk(s.condicao, r, conteudo);
  // Campos que valem agora (seção e campo visíveis; avisos não têm resposta).
  function camposVisiveis(conteudo, respostas) {
    const l = [];
    (conteudo.secoes || []).forEach((s) => {
      if (!secaoVisivel(s, respostas, conteudo)) return;
      (s.campos || []).forEach((c) => { if (c.tipo !== 'aviso' && condicaoOk(c.condicao, respostas, conteudo)) l.push(c); });
    });
    return l;
  }

  // Campos com "opcional: true" (ex.: reflexões livres) não contam no progresso nem no aviso de "sem resposta".
  function progresso(conteudo, respostas) {
    const campos = camposVisiveis(conteudo, respostas).filter((c) => !c.opcional);
    if (!campos.length) return 0;
    const n = campos.filter((c) => preenchido((respostas || {})[c.k])).length;
    return Math.round((n / campos.length) * 100);
  }
  function faltando(conteudo, respostas) {
    return camposVisiveis(conteudo, respostas).filter((c) => !c.opcional && !preenchido((respostas || {})[c.k]));
  }

  function htmlCampo(c, valor, somenteLeitura) {
    const id = 'f_' + c.k;
    const dis = somenteLeitura ? ' disabled' : '';
    const v = valor == null ? '' : String(valor);
    if (c.tipo === 'aviso') return `<div class="msg aviso" style="margin:18px 0">${esc(c.rotulo)}</div>`;
    if (c.tipo === 'multipla') {
      const marcados = Array.isArray(valor) ? valor.map(String) : [];
      const ops = (c.opcoes || []).map(([val, txt]) => `
        <label><input type="checkbox" name="${esc(id)}" value="${esc(val)}"${marcados.includes(String(val)) ? ' checked' : ''}${dis}><span>${esc(txt)}</span></label>`).join('');
      return `<fieldset class="campo" style="border:0;padding:0;margin:18px 0"><legend class="rotulo">${esc(c.rotulo)}</legend>
        <p class="suave" style="margin:0 0 6px">Marque todas as opções que se aplicam.</p><div class="opcoes">${ops}</div></fieldset>`;
    }
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
  // opcoes.conteudo (o questionário inteiro) é necessário quando há condições.
  function desenharSecao(caixa, secao, respostas, opcoes) {
    const o = opcoes || {};
    const r = respostas || {};
    let grupo = null;
    const campos = (secao.campos || []).map((c) => {
      let cab = '';
      if (c.grupo && c.grupo !== grupo) cab = `<p class="rotulo" style="margin:26px 0 0;font-weight:600">${esc(c.grupo)}</p>`;
      grupo = c.grupo || null;
      const html = cab + htmlCampo(c, r[c.k], o.somenteLeitura);
      return c.condicao ? `<div data-cond="${esc(c.k)}"${condicaoOk(c.condicao, r, o.conteudo) ? '' : ' hidden'}>${html}</div>` : html;
    }).join('');
    caixa.innerHTML = `
      ${secao.parte ? `<div class="parte">${esc(secao.parte)}</div>` : ''}
      <h2>${esc(secao.titulo || '')}</h2>
      ${secao.condicao ? '<div class="msg ok">Uma nova parte foi aberta com base nas suas respostas.</div>' : ''}
      ${secao.instrucao ? `<p class="suave">${esc(secao.instrucao)}</p>` : ''}
      ${campos}`;
    caixa.oninput = null; caixa.onchange = null;
    if (o.somenteLeitura) return;
    caixa.querySelectorAll('textarea').forEach(autoAltura);
    const condicionais = (secao.campos || []).filter((c) => c.condicao);
    const atualizar = (k, v) => {
      r[k] = v;
      if (o.aoMudar) o.aoMudar(k, v);
      condicionais.forEach((c) => {
        const el = caixa.querySelector(`[data-cond="${CSS.escape(c.k)}"]`);
        if (el) el.hidden = !condicaoOk(c.condicao, r, o.conteudo);
      });
    };
    caixa.oninput = (ev) => {
      const el = ev.target;
      if (el.matches('textarea')) autoAltura(el);
      if (el.dataset && el.dataset.k) atualizar(el.dataset.k, el.value);
    };
    caixa.onchange = (ev) => {
      const el = ev.target;
      if (el.type === 'radio' && el.checked) atualizar(el.name.slice(2), el.value);
      if (el.type === 'checkbox') {
        const marcados = [...caixa.querySelectorAll('input[type="checkbox"]')].filter((x) => x.name === el.name && x.checked).map((x) => x.value);
        atualizar(el.name.slice(2), marcados.length ? marcados : null);
      }
    };
  }
  function autoAltura(t) {
    t.style.height = 'auto';
    t.style.height = Math.min(Math.max(t.scrollHeight + 2, 96), 480) + 'px';
  }

  // Texto da resposta para leitura (opções viram o rótulo).
  function textoResposta(c, v) {
    if (!preenchido(v)) return '';
    if (Array.isArray(v)) {
      return v.map((x) => { const o = (c.opcoes || []).find(([val]) => String(val) === String(x)); return o ? o[1] : String(x); }).join('; ');
    }
    if (c.opcoes) {
      const o = c.opcoes.find(([val]) => String(val) === String(v));
      if (o) return o[1];
    }
    return String(v);
  }

  // Lista de perguntas e respostas (Área do profissional). "anterior" destaca o que mudou.
  // Partes e perguntas que não se aplicaram (condição falsa) só aparecem se tiverem resposta guardada.
  function htmlLeitura(conteudo, respostas, anterior) {
    const r = respostas || {};
    const tem = (c) => preenchido(r[c.k]) || (anterior && preenchido(anterior[c.k]));
    return (conteudo.secoes || []).map((s) => {
      const sv = secaoVisivel(s, r, conteudo);
      const campos = (s.campos || []).filter((c) => c.tipo !== 'aviso' && ((sv && condicaoOk(c.condicao, r, conteudo)) || tem(c)));
      if (!campos.length) return '';
      return `
      <h3>${esc([s.parte, s.titulo].filter(Boolean).join(': '))}</h3>
      ${campos.map((c) => {
        const atual = textoResposta(c, r[c.k]);
        const antes = anterior ? textoResposta(c, anterior[c.k]) : null;
        const mudou = anterior && antes !== atual;
        const rot = c.grupo ? c.grupo + (/[?:]$/.test(c.grupo) ? ' ' : ': ') + c.rotulo : c.rotulo;
        return `<div class="qa${mudou ? ' mudou' : ''}"><div class="p">${esc(rot)}</div>
          <div class="r${atual ? '' : ' vazio'}">${atual ? esc(atual) : 'sem resposta'}</div>
          ${mudou ? `<div class="antes">Antes: ${antes ? esc(antes) : 'sem resposta'}</div>` : ''}</div>`;
      }).join('')}`;
    }).join('');
  }

  window.Formulario = { todosCampos, camposVisiveis, secaoVisivel, condicaoOk, disparou, progresso, faltando, desenharSecao, htmlLeitura, textoResposta, preenchido };
})();
