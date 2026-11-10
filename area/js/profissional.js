// Área do profissional: pacientes liberados, liberações, respostas, evolução e exportação para a Central.
(function () {
  'use strict';
  const { esc, $, data, dataHora, traduzErro } = window.Area;
  const F = window.Formulario;
  const tela = () => $('tela');
  let area = null;
  let usuarioAtual = undefined;
  const est = { pacientes: [], instrumentos: [], conteudos: {}, sel: null, filtro: '', libs: [], resps: [], cons: [] };
  // O paciente vê o título neutro; aqui o código do instrumento vai junto (ex.: etdah_pais), se o nome não o trouxer.
  const nomeProf = (i) => (i.nome.toLowerCase().includes(i.id.toLowerCase()) ? i.nome : `${i.nome} [${i.id}]`);
  // Na lista de liberação: uso livre ou protegido, e "a conferir" (marcações da tabela instrumentos; não mudam o acesso).
  const nomeLista = (i) => nomeProf(i) + (i.uso_livre === undefined ? '' : i.uso_livre ? ' · livre' : ' · protegido') + (i.a_conferir ? ' · A CONFERIR' : '');
  let relogio = null;

  function erroGeral(t) { tela().innerHTML = `<div class="cartao"><div class="msg erro">${esc(t)}</div></div>`; }
  function aviso(t, tipo) {
    const el = $('pfMsg'); if (!el) return;
    el.innerHTML = t ? `<div class="msg ${tipo || 'erro'}">${esc(t)}</div>` : '';
    if (t && tipo === 'ok') setTimeout(() => { if (el.textContent.includes(t)) el.innerHTML = ''; }, 4000);
  }

  async function rotear() {
    let s = null;
    try { s = await area.sessao(); } catch (e) { erroGeral(traduzErro(e)); return; }
    const uid = s && s.user ? s.user.id : null;
    if (uid === usuarioAtual) return;
    usuarioAtual = uid;
    $('btnSair').classList.toggle('oculto', !uid);
    $('btnSenha').classList.add('oculto'); fecharSenha();
    clearInterval(relogio);
    if (!uid) {
      window.Area.montarLogin(tela(), area, { titulo: 'Entrar', texto: 'Acesso restrito ao profissional responsável.', senha: true });
      return;
    }
    try {
      if (!(await area.souProfissional())) { erroGeral('Acesso restrito ao profissional responsável.'); return; }
      $('btnSenha').classList.remove('oculto');
      montarBase();
      await recarregar();
      relogio = setInterval(() => { if (document.visibilityState === 'visible') recarregar(true).catch(() => {}); }, 60000);
    } catch (e) { erroGeral(traduzErro(e)); }
  }

  function montarBase() {
    tela().innerHTML = `
      <div id="pfMsg"></div>
      <div class="grade">
        <div class="cartao">
          <h2>Pacientes</h2>
          <input type="search" id="pfBusca" placeholder="Buscar por nome ou e-mail">
          <ul class="lista-pac" id="pfLista"></ul>
          <h3>Liberar novo e-mail</h3>
          <form id="pfNovo">
            <label class="rotulo" for="pfEmail">E-mail do paciente</label>
            <input id="pfEmail" type="email" required>
            <label class="rotulo" for="pfNome" style="margin-top:8px">Nome ou código</label>
            <input id="pfNome" type="text" placeholder="Pode ser só as iniciais">
            <div class="botoes"><button type="submit">Liberar e-mail</button></div>
          </form>
          <p class="suave" style="margin-top:10px">Atualiza sozinho a cada minuto. <a href="#" id="pfAtualizar">Atualizar agora</a></p>
        </div>
        <div id="pfDetalhe"><div class="cartao"><p class="suave">Escolha um paciente.</p></div></div>
      </div>`;
    $('pfBusca').addEventListener('input', () => { est.filtro = $('pfBusca').value.toLowerCase(); desenharLista(); });
    $('pfAtualizar').addEventListener('click', (ev) => { ev.preventDefault(); recarregar().catch((e) => aviso(traduzErro(e))); });
    $('pfNovo').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const b = $('pfNovo').querySelector('button'); b.disabled = true;
      try {
        const p = await area.novoPaciente($('pfEmail').value, $('pfNome').value);
        $('pfEmail').value = ''; $('pfNome').value = '';
        est.sel = p.id;
        await recarregar();
        aviso('E-mail liberado. Agora libere um instrumento para este paciente.', 'ok');
      } catch (e) {
        aviso(/duplicate|unique/i.test(e.message || '') ? 'Este e-mail já está cadastrado.' : traduzErro(e));
      } finally { b.disabled = false; }
    });
  }

  async function recarregar(silencioso) {
    const [pacs, insts, libs, resps] = await Promise.all([area.pacientes(), area.instrumentosResumo(), area.liberacoes(), area.respostasResumo()]);
    est.pacientes = pacs; est.instrumentos = insts; est.libs = libs; est.resps = resps;
    desenharLista();
    if (est.sel) {
      if (!silencioso || !$('pfLeitura') || $('pfLeitura').classList.contains('oculto')) await desenharDetalhe();
    }
  }

  function resumoPaciente(p) {
    const libs = est.libs.filter((l) => l.paciente_id === p.id && !l.revogada);
    const resps = est.resps.filter((r) => r.paciente_id === p.id);
    const env = resps.filter((r) => r.enviado_em).length;
    const and = resps.filter((r) => !r.enviado_em).length;
    return `${libs.length} liberado(s) · ${env} enviado(s)${and ? ` · ${and} em andamento` : ''}`;
  }
  function desenharLista() {
    const l = est.pacientes.filter((p) => !est.filtro || (p.nome + ' ' + p.email).toLowerCase().includes(est.filtro));
    $('pfLista').innerHTML = l.map((p) => `<li data-id="${esc(p.id)}" class="${p.id === est.sel ? 'sel' : ''}${p.ativo ? '' : ' inativo'}">
      <b>${esc(p.nome || '(sem nome)')}</b><br><span class="suave">${esc(p.email)}</span><br><span class="suave">${esc(resumoPaciente(p))}</span></li>`).join('')
      || '<li class="suave">Nenhum paciente.</li>';
    $('pfLista').querySelectorAll('li[data-id]').forEach((li) => li.addEventListener('click', () => {
      est.sel = li.dataset.id; desenharLista(); desenharDetalhe().catch((e) => aviso(traduzErro(e)));
    }));
  }

  async function conteudoDe(id) {
    const inst = est.instrumentos.find((i) => i.id === id);
    const c = est.conteudos[id];
    if (c && inst && c.versao === inst.versao) return c;
    const novo = await area.conteudo(id);
    if (novo) est.conteudos[id] = novo;
    return novo;
  }

  async function desenharDetalhe() {
    const p = est.pacientes.find((x) => x.id === est.sel);
    const caixa = $('pfDetalhe');
    if (!p) { caixa.innerHTML = '<div class="cartao"><p class="suave">Escolha um paciente.</p></div>'; return; }
    est.cons = await area.consentimentosDe(p.id);
    const nomeInst = Object.fromEntries(est.instrumentos.map((i) => [i.id, nomeProf(i)]));
    const libs = est.libs.filter((l) => l.paciente_id === p.id);
    const porLib = Object.fromEntries(est.resps.filter((r) => r.paciente_id === p.id).map((r) => [r.liberacao_id, r]));
    const ultimoCons = est.cons.slice().sort((a, b) => (a.aceito_em < b.aceito_em ? 1 : -1))[0];
    caixa.innerHTML = `
      <div class="cartao">
        <h2>${esc(p.nome || '(sem nome)')}</h2>
        <p class="suave">${esc(p.email)} · cadastrado em ${esc(data(p.criado_em))} · ${p.ativo ? 'acesso ativo' : '<b>acesso desativado</b>'}</p>
        <p class="suave">Termo: ${ultimoCons ? `aceito em ${esc(dataHora(ultimoCons.aceito_em))} (versão ${esc(ultimoCons.versao_termo)})` : 'ainda não aceito'}</p>
        <div class="botoes">
          <button class="sec peq" id="pfRenomear">Mudar nome ou código</button>
          <button class="${p.ativo ? 'perigo' : 'sec'} peq" id="pfAtivo">${p.ativo ? 'Desativar acesso' : 'Reativar acesso'}</button>
          <button class="sec peq" id="pfZap">Avisar pelo WhatsApp</button>
          <button class="sec peq" id="pfCopiar">Copiar aviso</button>
        </div>
        <h3>Liberar instrumento</h3>
        <div class="linha-form">
          <div><label class="rotulo" for="pfInst">Instrumento</label>
            <select id="pfInst">${est.instrumentos.filter((i) => i.ativo).map((i) => `<option value="${esc(i.id)}">${esc(nomeLista(i))}</option>`).join('')}</select></div>
          <div><label class="rotulo" for="pfObs">Observação (só você vê)</label><input id="pfObs" type="text" placeholder="ex.: reavaliação"></div>
          <button id="pfLiberar">Liberar</button>
        </div>
      </div>
      <div class="cartao">
        <h2>Linha do tempo</h2>
        ${libs.length ? `<table><thead><tr><th>Instrumento</th><th>Liberado</th><th>Situação</th><th></th></tr></thead><tbody>
          ${libs.map((l) => {
            const r = porLib[l.id];
            const s = window.Area.situacao(l, r);
            const extra = r && !r.enviado_em ? `<br><span class="suave">última alteração ${esc(dataHora(r.atualizado_em))}</span>` : '';
            return `<tr><td>${esc(nomeInst[l.instrumento_id] || l.instrumento_id)}${l.observacao ? `<br><span class="suave">${esc(l.observacao)}</span>` : ''}</td>
              <td>${esc(data(l.criado_em))}</td>
              <td><span class="etiqueta ${s.classe}">${esc(s.texto)}</span>${extra}</td>
              <td class="naoimprime"><div class="botoes" style="margin:0">
                ${r ? `<button class="sec peq" data-ver="${esc(l.id)}">Ver</button>` : ''}
                ${r && r.enviado_em ? `<button class="peq" data-exp="${esc(l.id)}">Exportar para a Central</button><button class="sec peq" data-reabrir="${esc(l.id)}">Reabrir</button>` : ''}
                ${l.revogada ? `<button class="sec peq" data-revogar="${esc(l.id)}" data-v="0">Liberar de novo</button>` : (!r || !r.enviado_em ? `<button class="perigo peq" data-revogar="${esc(l.id)}" data-v="1">Revogar</button>` : '')}
              </div></td></tr>`;
          }).join('')}</tbody></table>` : '<p class="suave">Nenhum instrumento liberado ainda.</p>'}
      </div>
      <div class="cartao oculto" id="pfLeitura"></div>`;

    $('pfRenomear').onclick = async () => {
      const n = prompt('Nome ou código do paciente:', p.nome || '');
      if (n === null) return;
      try { await area.alterarPaciente(p.id, { nome: n.trim() }); await recarregar(); } catch (e) { aviso(traduzErro(e)); }
    };
    $('pfAtivo').onclick = async () => {
      if (p.ativo && !confirm('Desativar o acesso deste e-mail? O paciente deixa de ver os questionários. As respostas continuam guardadas.')) return;
      try { await area.alterarPaciente(p.id, { ativo: !p.ativo }); await recarregar(); } catch (e) { aviso(traduzErro(e)); }
    };
    // Aviso ao paciente: só o link da página e a instrução de entrar com o e-mail.
    // Sem nome, e-mail ou instrumento na mensagem (ela passa pelo WhatsApp e pela URL).
    // O contato é escolhido dentro do WhatsApp; o site não guarda telefone.
    const linkPaciente = location.origin + location.pathname.replace(/profissional\.html$/, 'paciente.html');
    const textoAviso = `Olá! Há um questionário disponível para você na Área do paciente: ${linkPaciente}\nEntre com o e-mail que você me informou. Você receberá um link de acesso nesse e-mail.`;
    $('pfZap').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(textoAviso), '_blank', 'noopener');
    $('pfCopiar').onclick = async () => {
      try { await navigator.clipboard.writeText(textoAviso); aviso('Aviso copiado. Cole no WhatsApp ou no e-mail.', 'ok'); }
      catch (e) { prompt('Copie o aviso:', textoAviso); }
    };
    $('pfLiberar').onclick = async () => {
      const id = $('pfInst').value; if (!id) return;
      const aberta = libs.find((l) => l.instrumento_id === id && !l.revogada && !(porLib[l.id] && porLib[l.id].enviado_em));
      if (aberta && !confirm('Este instrumento já está liberado e ainda não foi enviado. Liberar outra aplicação mesmo assim?')) return;
      const inst = est.instrumentos.find((i) => i.id === id);
      if (inst && inst.a_conferir && !confirm(`Este instrumento está marcado "a conferir"${inst.obs_prof ? ': ' + inst.obs_prof : ''}. Liberar mesmo assim?`)) return;
      try { await area.liberar(p.id, id, $('pfObs').value); await recarregar(); aviso('Instrumento liberado. O paciente já vê ao entrar. Para mandar o link, use "Avisar pelo WhatsApp" ou "Copiar aviso".', 'ok'); } catch (e) { aviso(traduzErro(e)); }
    };
    caixa.querySelectorAll('[data-ver]').forEach((b) => b.onclick = () => verResposta(p, libs.find((l) => l.id === b.dataset.ver)).catch((e) => aviso(traduzErro(e))));
    caixa.querySelectorAll('[data-exp]').forEach((b) => b.onclick = () => exportar(p, libs.find((l) => l.id === b.dataset.exp)).catch((e) => aviso(traduzErro(e))));
    caixa.querySelectorAll('[data-reabrir]').forEach((b) => b.onclick = async () => {
      if (!confirm('Reabrir este envio? O paciente poderá alterar as respostas e precisará enviar de novo.')) return;
      try { await area.reabrir(b.dataset.reabrir); await recarregar(); } catch (e) { aviso(traduzErro(e)); }
    });
    caixa.querySelectorAll('[data-revogar]').forEach((b) => b.onclick = async () => {
      const rev = b.dataset.v === '1';
      if (rev && !confirm('Revogar esta liberação? O paciente deixa de ver este questionário. O que já foi escrito continua guardado.')) return;
      try { await area.revogar(b.dataset.revogar, rev); await recarregar(); } catch (e) { aviso(traduzErro(e)); }
    });
  }

  async function verResposta(p, lib) {
    const [inst, resp] = await Promise.all([conteudoDe(lib.instrumento_id), area.resposta(lib.id)]);
    if (!inst || !resp) { aviso('Resposta não encontrada.'); return; }
    // Envio anterior do mesmo instrumento, para comparar (evolução).
    const anteriores = est.libs.filter((l) => l.paciente_id === p.id && l.instrumento_id === lib.instrumento_id && l.criado_em < lib.criado_em)
      .map((l) => ({ l, r: est.resps.find((r) => r.liberacao_id === l.id && r.enviado_em) })).filter((x) => x.r)
      .sort((a, b) => (a.l.criado_em < b.l.criado_em ? 1 : -1));
    const caixa = $('pfLeitura');
    const desenhar = async (comparar) => {
      let antes = null, rotuloAntes = '';
      if (comparar && anteriores.length) {
        const r = await area.resposta(anteriores[0].l.id);
        antes = (r && r.respostas) || {};
        rotuloAntes = ` · comparando com o envio de ${data(anteriores[0].r.enviado_em)} (em amarelo o que mudou)`;
      }
      caixa.innerHTML = `<div class="item-lista"><div><h2 style="margin:0">${esc(nomeProf(inst))}</h2>
          <span class="suave">${esc(p.nome || p.email)} · ${resp.enviado_em ? 'enviado em ' + esc(dataHora(resp.enviado_em)) : 'em andamento, ' + resp.progresso + '%'} · versão ${esc(resp.versao_conteudo)}${esc(rotuloAntes)}</span></div>
          <div class="botoes naoimprime" style="margin:0">
            ${anteriores.length ? `<button class="sec peq" id="pfComparar">${comparar ? 'Sem comparação' : 'Comparar com envio anterior'}</button>` : ''}
            <button class="sec peq" onclick="window.print()">Imprimir</button>
            <button class="sec peq" id="pfFechar">Fechar</button></div></div>
        ${resp.versao_conteudo && resp.versao_conteudo !== inst.versao ? '<div class="msg aviso">O conteúdo do instrumento mudou depois desta aplicação; as perguntas abaixo são as da versão atual.</div>' : ''}
        ${F.htmlLeitura(inst.conteudo, resp.respostas, antes)}`;
      caixa.classList.remove('oculto');
      $('pfFechar').onclick = () => { caixa.classList.add('oculto'); caixa.innerHTML = ''; };
      if ($('pfComparar')) $('pfComparar').onclick = () => desenhar(!comparar).catch((e) => aviso(traduzErro(e)));
    };
    await desenhar(false);
    caixa.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function exportar(p, lib) {
    const [inst, resp] = await Promise.all([conteudoDe(lib.instrumento_id), area.resposta(lib.id)]);
    if (!inst || !resp) { aviso('Resposta não encontrada.'); return; }
    const pacote = window.Area.pacoteCentral(inst, p, lib, resp);
    const nome = `${inst.id}_site_${(p.nome || 'paciente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '_').replace(/^_+|_+$/g, '')}_${(resp.enviado_em || '').slice(0, 10)}.json`;
    window.Area.baixarJson(pacote, nome);
    aviso('Arquivo salvo. Na Central, abra o módulo e use "Importar respostas do site".', 'ok');
  }

  // ---------- definir ou trocar a senha (o profissional digita; nada é guardado no site) ----------
  function fecharSenha() { const c = $('caixaSenha'); if (c) { c.classList.add('oculto'); c.innerHTML = ''; } }
  function abrirSenha() {
    const c = $('caixaSenha');
    c.innerHTML = `
      <div class="cartao">
        <h2>Definir senha</h2>
        <p class="suave">Depois disso você entra com e-mail e senha. O link por e-mail continua valendo para quando esquecer a senha.</p>
        <form id="fNovaSenha">
          <label class="rotulo" for="nsSenha">Nova senha (pelo menos 8 caracteres)</label>
          <input id="nsSenha" type="password" autocomplete="new-password" minlength="8" required>
          <label class="rotulo" for="nsSenha2">Repita a senha</label>
          <input id="nsSenha2" type="password" autocomplete="new-password" minlength="8" required>
          <div class="botoes"><button type="submit">Salvar senha</button><button type="button" class="sec" id="nsFechar">Fechar</button></div>
        </form>
        <div id="nsMsg"></div>
      </div>`;
    c.classList.remove('oculto');
    const msg = (t, tipo) => { $('nsMsg').innerHTML = t ? `<div class="msg ${tipo || 'erro'}">${esc(t)}</div>` : ''; };
    $('nsFechar').onclick = fecharSenha;
    $('fNovaSenha').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const s1 = $('nsSenha').value, s2 = $('nsSenha2').value;
      if (s1.length < 8) { msg('Use pelo menos 8 caracteres.'); return; }
      if (s1 !== s2) { msg('As duas senhas não são iguais.'); return; }
      const b = $('fNovaSenha').querySelector('button[type=submit]'); b.disabled = true; msg('');
      try {
        await area.definirSenha(s1);
        $('fNovaSenha').classList.add('oculto');
        msg('Senha salva. Da próxima vez, entre com e-mail e senha.', 'ok');
      } catch (e) { msg(traduzErro(e)); } finally { b.disabled = false; $('nsSenha').value = ''; $('nsSenha2').value = ''; }
    });
    $('nsSenha').focus();
  }

  function iniciar() {
    try { area = window.Area.api(window.Area.criarCliente()); } catch (e) { erroGeral(e.message); return; }
    $('btnSair').addEventListener('click', async () => { await area.sair(); usuarioAtual = undefined; rotear(); });
    $('btnSenha').addEventListener('click', () => { if ($('caixaSenha').classList.contains('oculto')) abrirSenha(); else fecharSenha(); });
    area.aoMudarSessao(() => { setTimeout(rotear, 0); });
    rotear();
  }
  iniciar();
})();
