// Área do paciente: login, termo, lista do que foi liberado, preenchimento com salvamento e envio.
(function () {
  'use strict';
  const { esc, $, dataHora, traduzErro } = window.Area;
  const F = window.Formulario;
  const tela = () => $('tela');
  let area = null;
  let usuarioAtual = undefined;
  let cadastro = null;
  let guardarAgora = null; // salva o questionário aberto (ao esconder a página)

  function erroGeral(texto) {
    tela().innerHTML = `<div class="cartao"><div class="msg erro">${esc(texto)}</div></div>`;
  }

  async function rotear() {
    let s = null;
    try { s = await area.sessao(); } catch (e) { erroGeral(traduzErro(e)); return; }
    const uid = s && s.user ? s.user.id : null;
    if (uid === usuarioAtual) return;
    usuarioAtual = uid;
    $('btnSair').classList.toggle('oculto', !uid);
    if (!uid) {
      window.Area.montarLogin(tela(), area, {
        titulo: 'Entrar',
        texto: 'Use o e-mail que você informou ao profissional. Você vai receber um e-mail com o acesso, sem senha.',
      });
      return;
    }
    await entrar();
  }

  async function entrar() {
    tela().innerHTML = '<div class="cartao"><p class="suave">Carregando...</p></div>';
    try {
      cadastro = await area.meuCadastro();
      if (!cadastro) {
        tela().innerHTML = `<div class="cartao"><h2>Acesso não liberado</h2>
          <p>Este e-mail ainda não tem questionários liberados. Fale com o profissional responsável.</p></div>`;
        return;
      }
      const cons = await area.meusConsentimentos();
      if (!cons.some((c) => c.versao_termo === window.TERMO.versao)) { telaTermo(); return; }
      await telaLista();
    } catch (e) { erroGeral(traduzErro(e)); }
  }

  function telaTermo() {
    tela().innerHTML = `<div class="cartao">
      <h2>Antes de começar</h2>
      <p>Leia com atenção. Para usar a Área do paciente é preciso concordar.</p>
      <div class="termo">${window.TERMO.html}</div>
      <label style="display:flex;gap:10px;align-items:flex-start;margin-top:14px">
        <input type="checkbox" id="tmLi" style="width:22px;height:22px;flex:none"> <span>Li o termo e concordo com o uso dos meus dados como descrito acima.</span>
      </label>
      <div class="botoes"><button id="tmOk" disabled>Concordo e quero continuar</button><button class="sec" id="tmNao">Não concordo</button></div>
      <div id="tmMsg"></div></div>`;
    $('tmLi').addEventListener('change', () => { $('tmOk').disabled = !$('tmLi').checked; });
    $('tmOk').addEventListener('click', async () => {
      $('tmOk').disabled = true;
      try { await area.consentir(cadastro.id, window.TERMO.versao); await telaLista(); } catch (e) { $('tmMsg').innerHTML = `<div class="msg erro">${esc(traduzErro(e))}</div>`; $('tmOk').disabled = false; }
    });
    $('tmNao').addEventListener('click', () => {
      tela().innerHTML = `<div class="cartao"><h2>Tudo bem</h2><p>Sem o seu consentimento as respostas não são guardadas. Se mudar de ideia, é só entrar de novo. Você também pode responder pessoalmente na consulta.</p></div>`;
    });
  }

  async function telaLista() {
    tela().innerHTML = '<div class="cartao"><p class="suave">Carregando...</p></div>';
    const [libs, insts, resps] = await Promise.all([area.liberacoes(), area.instrumentosResumo(), area.respostasResumo()]);
    const nomeInst = Object.fromEntries(insts.map((i) => [i.id, i.nome]));
    const porLib = Object.fromEntries(resps.map((r) => [r.liberacao_id, r]));
    const ativas = libs.filter((l) => !l.revogada && nomeInst[l.instrumento_id]);
    const saud = cadastro.nome ? `Olá, ${esc(cadastro.nome)}.` : 'Olá.';
    if (!ativas.length) {
      tela().innerHTML = `<div class="cartao"><h2>${saud}</h2><p>No momento não há questionários liberados para você.</p></div>`;
      return;
    }
    tela().innerHTML = `<div class="cartao"><h2>${saud}</h2><p class="suave">Estes são os questionários liberados para você. Você pode parar a qualquer momento e continuar depois.</p></div>
      ${ativas.map((l) => {
        const r = porLib[l.id];
        const s = window.Area.situacao(l, r);
        const rot = s.cod === 'nova' ? 'Começar' : s.cod === 'andamento' ? 'Continuar' : 'Ver';
        return `<div class="cartao item-lista"><div><b>${esc(nomeInst[l.instrumento_id])}</b><br>
          <span class="etiqueta ${s.classe}">${esc(s.texto)}</span></div>
          <button data-lib="${esc(l.id)}">${rot}</button></div>`;
      }).join('')}`;
    tela().querySelectorAll('button[data-lib]').forEach((b) => b.addEventListener('click', () => {
      const l = ativas.find((x) => x.id === b.dataset.lib);
      abrir(l, nomeInst[l.instrumento_id]).catch((e) => erroGeral(traduzErro(e)));
    }));
  }

  // ---------- preenchimento ----------
  const chaveLocal = (libId) => 'area_rascunho_' + libId;
  function lerLocal(libId) { try { return JSON.parse(localStorage.getItem(chaveLocal(libId)) || 'null'); } catch (e) { return null; } }
  function gravarLocal(libId, d) { try { localStorage.setItem(chaveLocal(libId), JSON.stringify(d)); } catch (e) { /* sem armazenamento */ } }
  function apagarLocal(libId) { try { localStorage.removeItem(chaveLocal(libId)); } catch (e) { /* ignore */ } }

  async function abrir(lib, nome) {
    tela().innerHTML = '<div class="cartao"><p class="suave">Abrindo...</p></div>';
    const [inst, resp] = await Promise.all([area.conteudo(lib.instrumento_id), area.resposta(lib.id)]);
    if (!inst) { erroGeral('Este questionário não está mais disponível.'); return; }
    if (resp && resp.enviado_em) { apagarLocal(lib.id); telaEnviado(inst, resp); return; }
    const conteudo = inst.conteudo;
    const local = lerLocal(lib.id);
    let respostas = Object.assign({}, (resp && resp.respostas) || {});
    let pendente = false;
    // A cópia do aparelho só vale quando tem alterações que o servidor ainda não recebeu.
    if (local && local.respostas && local.pendente) { Object.assign(respostas, local.respostas); pendente = true; }
    const secoes = conteudo.secoes || [];
    let idx = local && Number.isInteger(local.secao) ? Math.min(local.secao, secoes.length) : -1; // -1 = apresentação, secoes.length = revisão
    let timer = null, salvando = false;

    const status = (t) => { const el = $('pcStatus'); if (el) el.textContent = t; };
    const prog = () => F.progresso(conteudo, respostas);

    async function salvarServidor() {
      clearTimeout(timer); timer = null;
      if (!pendente || salvando) return;
      salvando = true; pendente = false;
      status('Salvando...');
      try {
        const r = await area.salvar(lib.id, respostas, prog());
        if (!pendente) gravarLocal(lib.id, { respostas, secao: idx, pendente: false });
        status('Salvo às ' + dataHora(r && r.atualizado_em).slice(-5));
      } catch (e) {
        pendente = true;
        status(traduzErro(e));
      } finally { salvando = false; }
      if (pendente && !timer) timer = setTimeout(salvarServidor, 15000);
    }
    function mudou(k, v) {
      respostas[k] = v;
      pendente = true;
      gravarLocal(lib.id, { respostas, secao: idx, pendente: true });
      const b = $('pcBarra'); if (b) b.style.width = prog() + '%';
      status('Alterações ainda não salvas');
      clearTimeout(timer); timer = setTimeout(salvarServidor, 1500);
    }
    function ir(n) {
      salvarServidor();
      idx = n;
      const l = lerLocal(lib.id);
      gravarLocal(lib.id, { respostas, secao: idx, pendente: !!(pendente || (l && l.pendente)) });
      desenhar();
      window.scrollTo(0, 0);
    }

    function cabecalho() {
      const passo = idx < 0 ? 'Apresentação' : idx >= secoes.length ? 'Revisão e envio' : `Tela ${idx + 1} de ${secoes.length}`;
      return `<div class="cartao"><b>${esc(nome || inst.nome)}</b>
        <div class="barra"><div id="pcBarra" style="width:${prog()}%"></div></div>
        <div class="suave">${esc(passo)} · ${prog()}% respondido</div></div>`;
    }
    function desenhar() {
      if (idx < 0) {
        tela().innerHTML = `${cabecalho()}<div class="cartao"><h2>Como responder</h2><p>${esc(conteudo.apresentacao || '')}</p>
          <div class="botoes fim"><button class="sec" id="pcLista">Voltar à lista</button><button id="pcProx">Começar</button></div></div>`;
        $('pcLista').onclick = () => { salvarServidor(); guardarAgora = null; telaLista().catch((e) => erroGeral(traduzErro(e))); };
        $('pcProx').onclick = () => ir(0);
        return;
      }
      if (idx >= secoes.length) { desenharRevisao(); return; }
      tela().innerHTML = `${cabecalho()}<div class="cartao" id="pcSecao"></div>
        <div class="rodape-form"><div class="salvamento" id="pcStatus">${pendente ? 'Alterações ainda não salvas' : ''}</div>
        <div class="botoes fim"><button class="sec" id="pcAnt">Voltar</button><button id="pcProx">${idx === secoes.length - 1 ? 'Revisar e enviar' : 'Próxima'}</button></div></div>`;
      F.desenharSecao($('pcSecao'), secoes[idx], respostas, { aoMudar: mudou });
      $('pcAnt').onclick = () => ir(idx - 1);
      $('pcProx').onclick = () => ir(idx + 1);
    }
    function desenharRevisao() {
      const falta = F.faltando(conteudo, respostas);
      const porSecao = secoes.map((s, i) => ({ i, s, n: s.campos.filter((c) => falta.includes(c)).length })).filter((x) => x.n);
      tela().innerHTML = `${cabecalho()}<div class="cartao"><h2>Revisão</h2>
        ${falta.length ? `<p>Ficaram <b>${falta.length}</b> perguntas sem resposta. Você pode enviar assim mesmo ou voltar para completar.</p>
          <ul>${porSecao.map((x) => `<li><a href="#" data-ir="${x.i}">Tela ${x.i + 1}</a>: ${esc(x.s.parte ? x.s.parte + ', ' : '')}${esc(x.s.titulo)} (${x.n} sem resposta)</li>`).join('')}</ul>`
          : '<p>Todas as perguntas foram respondidas.</p>'}
        <p>Depois de enviar, você não poderá mais alterar as respostas. Se precisar corrigir algo, fale com o profissional.</p>
        <div class="salvamento" id="pcStatus"></div>
        <div class="botoes fim"><button class="sec" id="pcAnt">Voltar</button><button id="pcEnviar">Enviar respostas</button></div></div>`;
      tela().querySelectorAll('a[data-ir]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); ir(Number(a.dataset.ir)); }));
      $('pcAnt').onclick = () => ir(secoes.length - 1);
      $('pcEnviar').onclick = async () => {
        if (!confirm('Enviar as respostas agora? Depois do envio não é possível alterar.')) return;
        $('pcEnviar').disabled = true; status('Enviando...');
        try {
          clearTimeout(timer); guardarAgora = null;
          await area.enviar(lib.id, respostas, prog());
          apagarLocal(lib.id);
          tela().innerHTML = `<div class="cartao"><h2>Respostas enviadas</h2><p>Obrigado! O profissional já pode ver as suas respostas.</p>
            <div class="botoes"><button id="pcLista">Voltar à lista</button></div></div>`;
          $('pcLista').onclick = () => telaLista().catch((e) => erroGeral(traduzErro(e)));
        } catch (e) { status(traduzErro(e)); $('pcEnviar').disabled = false; }
      };
    }
    guardarAgora = salvarServidor;
    desenhar();
    if (pendente) timer = setTimeout(salvarServidor, 500); // manda ao servidor o que ficou só no aparelho
  }

  function telaEnviado(inst, resp) {
    tela().innerHTML = `<div class="cartao"><b>${esc(inst.nome)}</b><p class="etiqueta ok">Enviado em ${esc(dataHora(resp.enviado_em))}</p>
      <p>Obrigado! As suas respostas já estão com o profissional.</p>
      <div class="botoes"><button class="sec" id="pcLista">Voltar à lista</button><button class="sec" id="pcVer">Ver minhas respostas</button></div></div>
      <div class="cartao oculto" id="pcLeitura"></div>`;
    $('pcLista').onclick = () => telaLista().catch((e) => erroGeral(traduzErro(e)));
    $('pcVer').onclick = () => { const c = $('pcLeitura'); c.innerHTML = F.htmlLeitura(inst.conteudo, resp.respostas); c.classList.remove('oculto'); $('pcVer').remove(); };
  }

  function iniciar() {
    try { area = window.Area.api(window.Area.criarCliente()); } catch (e) { erroGeral(e.message); return; }
    $('btnSair').addEventListener('click', async () => { await area.sair(); usuarioAtual = undefined; rotear(); });
    area.aoMudarSessao(() => { setTimeout(rotear, 0); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && guardarAgora) guardarAgora(); });
    rotear();
  }
  iniciar();
})();
