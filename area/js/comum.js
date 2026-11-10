// Camada comum: cliente Supabase, login e todas as consultas ao banco.
// As páginas só falam com o banco por aqui (fica fácil testar com um cliente simulado).
(function () {
  'use strict';

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);

  function dataHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function data(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
  }

  // Mesma mensagem para e-mail desconhecido, paciente sem liberação ativa ou desativado.
  const NADA_LIBERADO = 'No momento não há nada liberado para você. Fale com o profissional.';

  function traduzErro(e) {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Erro desconhecido');
    if (/rate limit|too many|security purposes/i.test(m)) return 'Muitos pedidos seguidos. Espere um minuto e tente de novo.';
    if (/not liberado|não está liberado|nada liberado|signups not allowed|hook/i.test(m)) return NADA_LIBERADO;
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos. Se ainda não definiu a senha, entre pelo link do e-mail.';
    if (/password should be at least|weak.?password/i.test(m)) return 'A senha é curta demais. Use pelo menos 8 caracteres.';
    if (/should be different from the old/i.test(m)) return 'A nova senha precisa ser diferente da atual.';
    if (/email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Entre pelo link do e-mail.';
    if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(m)) return 'Código vencido ou incorreto. Peça um novo.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão com a internet. O que você escreveu continua guardado neste aparelho.';
    if (/row-level security|violates/i.test(m)) return 'Esta ação não é permitida (o questionário pode já ter sido enviado ou não estar mais liberado).';
    return m;
  }

  function criarCliente() {
    const cfg = window.AREA_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Configuração do site incompleta (js/config.js).');
    if (!window.supabase || !window.supabase.createClient) throw new Error('Biblioteca supabase-js não carregou.');
    return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  // Lança o erro do Supabase, se houver, e devolve os dados.
  function dados(r) {
    if (r && r.error) throw r.error;
    return r ? r.data : null;
  }

  function api(sb) {
    const urlVolta = () => location.origin + location.pathname;
    return {
      cliente: sb,
      // ---------- login ----------
      async sessao() { return dados(await sb.auth.getSession()).session; },
      aoMudarSessao(fn) { return sb.auth.onAuthStateChange((ev, s) => fn(ev, s)); },
      async pedirAcesso(email) {
        dados(await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: urlVolta(), shouldCreateUser: true } }));
      },
      // Pergunta ao servidor se o e-mail pode entrar, antes de mandar o e-mail (resposta só sim ou não).
      // Se a consulta falhar, segue: os ganchos do servidor recusam do mesmo jeito.
      async podeEntrar(email) {
        const r = await sb.rpc('pode_entrar', { email: email.trim().toLowerCase() });
        if (r && r.error) return true;
        return r.data === true;
      },
      async conferirCodigo(email, codigo) {
        return dados(await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: codigo.trim(), type: 'email' }));
      },
      // Só a Área do profissional oferece senha; a do paciente continua sem senha.
      async entrarComSenha(email, senha) {
        return dados(await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha }));
      },
      async definirSenha(senha) { return dados(await sb.auth.updateUser({ password: senha })); },
      async sair() { await sb.auth.signOut(); },

      // ---------- paciente ----------
      async meuCadastro() {
        const l = dados(await sb.from('pacientes').select('id,nome,email,ativo'));
        return (l && l[0]) || null;
      },
      async meusConsentimentos() { return dados(await sb.from('consentimentos').select('id,versao_termo,aceito_em')) || []; },
      async consentir(pacienteId, versao) {
        dados(await sb.from('consentimentos').insert({ paciente_id: pacienteId, versao_termo: versao }));
      },
      async liberacoes() {
        return dados(await sb.from('liberacoes').select('id,paciente_id,instrumento_id,criado_em,revogada,observacao').order('criado_em', { ascending: false })) || [];
      },
      async instrumentosResumo() { return dados(await sb.from('instrumentos').select('id,nome,versao,ativo,uso_livre,a_conferir,obs_prof')) || []; },
      async conteudo(instrumentoId) {
        const l = dados(await sb.from('instrumentos').select('id,nome,versao,conteudo').eq('id', instrumentoId));
        return (l && l[0]) || null;
      },
      async respostasResumo(pacienteId) {
        let q = sb.from('respostas').select('id,liberacao_id,paciente_id,instrumento_id,progresso,iniciado_em,atualizado_em,enviado_em');
        if (pacienteId) q = q.eq('paciente_id', pacienteId);
        return dados(await q) || [];
      },
      async resposta(liberacaoId) {
        const l = dados(await sb.from('respostas').select('*').eq('liberacao_id', liberacaoId));
        return (l && l[0]) || null;
      },
      async salvar(liberacaoId, respostas, progresso) {
        const l = dados(await sb.from('respostas').upsert({ liberacao_id: liberacaoId, respostas, progresso }, { onConflict: 'liberacao_id' }).select('id,atualizado_em,enviado_em'));
        return (l && l[0]) || null;
      },
      async enviar(liberacaoId, respostas, progresso) {
        await this.salvar(liberacaoId, respostas, progresso);
        const l = dados(await sb.from('respostas').update({ respostas, progresso, enviado_em: new Date().toISOString() }).eq('liberacao_id', liberacaoId).select('id,enviado_em'));
        if (!l || !l.length || !l[0].enviado_em) throw new Error('O envio não foi aceito pelo servidor.');
        return l[0];
      },

      // ---------- profissional ----------
      async souProfissional() {
        const l = dados(await sb.from('profissionais').select('email'));
        return !!(l && l.length);
      },
      async pacientes() { return dados(await sb.from('pacientes').select('id,email,nome,ativo,criado_em').order('criado_em', { ascending: false })) || []; },
      async novoPaciente(email, nome) {
        const l = dados(await sb.from('pacientes').insert({ email: email.trim().toLowerCase(), nome: (nome || '').trim() }).select('id,email,nome,ativo,criado_em'));
        return l && l[0];
      },
      async alterarPaciente(id, campos) { dados(await sb.from('pacientes').update(campos).eq('id', id)); },
      async liberar(pacienteId, instrumentoId, observacao) {
        const l = dados(await sb.from('liberacoes').insert({ paciente_id: pacienteId, instrumento_id: instrumentoId, observacao: observacao || '' }).select('id'));
        return l && l[0];
      },
      async revogar(liberacaoId, revogada) { dados(await sb.from('liberacoes').update({ revogada: revogada !== false }).eq('id', liberacaoId)); },
      async reabrir(liberacaoId) { dados(await sb.from('respostas').update({ enviado_em: null }).eq('liberacao_id', liberacaoId)); },
      async consentimentosDe(pacienteId) {
        return dados(await sb.from('consentimentos').select('id,versao_termo,aceito_em').eq('paciente_id', pacienteId)) || [];
      },
    };
  }

  // Situação de uma liberação para mostrar na tela.
  function situacao(lib, resp) {
    if (lib.revogada) return { cod: 'revogada', texto: 'Revogada', classe: '' };
    if (!resp) return { cod: 'nova', texto: 'Não iniciado', classe: '' };
    if (resp.enviado_em) return { cod: 'enviada', texto: 'Enviado em ' + data(resp.enviado_em), classe: 'ok' };
    return { cod: 'andamento', texto: `Em andamento (${resp.progresso || 0}%)`, classe: 'andamento' };
  }

  // Pacote que a Central importa no módulo do instrumento (botão "Importar respostas do site").
  function pacoteCentral(inst, paciente, lib, resp) {
    return {
      type: 'area_paciente:resposta', formato: 1,
      instrumentId: inst.id, nomeInstrumento: inst.nome, versaoConteudo: resp.versao_conteudo || inst.versao,
      paciente: { nome: paciente.nome || '', codigo: paciente.id },
      liberadoEm: lib.criado_em, iniciadoEm: resp.iniciado_em, atualizadoEm: resp.atualizado_em, enviadoEm: resp.enviado_em,
      progresso: resp.progresso, respostas: resp.respostas || {},
    };
  }

  function baixarJson(obj, nome) {
    const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // Tela de login comum às duas páginas (e-mail, depois código ou link).
  // Com opcoes.senha (só na Área do profissional), abre em e-mail + senha e o link fica como alternativa.
  function montarLogin(caixa, area, opcoes) {
    const comSenha = !!opcoes.senha;
    caixa.innerHTML = `
      <div class="cartao">
        <h2>${esc(opcoes.titulo)}</h2>
        <p class="suave">${esc(opcoes.texto)}</p>
        ${comSenha ? `
        <form id="fSenha">
          <label class="rotulo" for="lgSEmail">E-mail</label>
          <input id="lgSEmail" type="email" autocomplete="username" inputmode="email" required>
          <label class="rotulo" for="lgSenha">Senha</label>
          <input id="lgSenha" type="password" autocomplete="current-password" required>
          <div class="botoes"><button type="submit">Entrar</button></div>
          <p class="suave">Primeiro acesso ou esqueceu a senha? <button type="button" class="sec peq" id="lgPorLink">Receber link por e-mail</button></p>
        </form>` : ''}
        <form id="fEmail"${comSenha ? ' class="oculto"' : ''}>
          <label class="rotulo" for="lgEmail">Seu e-mail</label>
          <input id="lgEmail" type="email" autocomplete="email" inputmode="email" required>
          <div class="botoes"><button type="submit">Receber acesso por e-mail</button>${comSenha ? '<button type="button" class="sec" id="lgVoltaSenha">Entrar com senha</button>' : ''}</div>
        </form>
        <form id="fCodigo" class="oculto">
          <p>Enviamos um e-mail para <b id="lgPara"></b>. Toque no link do e-mail. Se preferir, digite aqui o código que veio no e-mail.</p>
          <label class="rotulo" for="lgCodigo">Código</label>
          <input id="lgCodigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10">
          <div class="botoes"><button type="submit">Entrar</button><button type="button" class="sec" id="lgOutro">Usar outro e-mail</button></div>
        </form>
        <div id="lgMsg"></div>
      </div>`;
    const msg = (t, tipo) => { $('lgMsg').innerHTML = t ? `<div class="msg ${tipo || 'erro'}">${esc(t)}</div>` : ''; };
    let email = '';
    if (opcoes.aviso) msg(opcoes.aviso);
    $('fEmail').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      email = $('lgEmail').value.trim().toLowerCase();
      if (!email) return;
      const b = ev.submitter || $('fEmail').querySelector('button'); b.disabled = true; msg('');
      try {
        if (opcoes.conferir && !(await area.podeEntrar(email))) { msg(NADA_LIBERADO); return; }
        await area.pedirAcesso(email);
        $('lgPara').textContent = email;
        $('fEmail').classList.add('oculto'); $('fCodigo').classList.remove('oculto');
        $('lgCodigo').focus();
      } catch (e) { msg(traduzErro(e)); } finally { b.disabled = false; }
    });
    $('fCodigo').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const b = $('fCodigo').querySelector('button'); b.disabled = true; msg('');
      try { await area.conferirCodigo(email, $('lgCodigo').value); } catch (e) { msg(traduzErro(e)); } finally { b.disabled = false; }
    });
    $('lgOutro').addEventListener('click', () => { $('fCodigo').classList.add('oculto'); $('fEmail').classList.remove('oculto'); msg(''); });
    if (comSenha) {
      $('fSenha').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const b = $('fSenha').querySelector('button[type=submit]'); b.disabled = true; msg('');
        try { await area.entrarComSenha($('lgSEmail').value, $('lgSenha').value); }
        catch (e) { msg(traduzErro(e)); $('lgSenha').value = ''; }
        finally { b.disabled = false; }
      });
      $('lgPorLink').addEventListener('click', () => {
        $('lgEmail').value = $('lgSEmail').value.trim();
        $('fSenha').classList.add('oculto'); $('fEmail').classList.remove('oculto'); msg(''); $('lgEmail').focus();
      });
      $('lgVoltaSenha').addEventListener('click', () => {
        $('fEmail').classList.add('oculto'); $('fCodigo').classList.add('oculto'); $('fSenha').classList.remove('oculto'); msg('');
      });
    }
  }

  window.Area = { esc, $, data, dataHora, traduzErro, NADA_LIBERADO, criarCliente, api, situacao, pacoteCentral, baixarJson, montarLogin };
})();
