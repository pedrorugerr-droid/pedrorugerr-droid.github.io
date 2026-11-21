/* Aplicativo do Protocolo Mindfulness-IBE v2.1.
   Sem servidor, sem conta, sem rastreamento: os dados ficam só neste aparelho (IndexedDB).
   Todo o conteúdo clínico vem de protocolo.json; os itens dos questionários, de instrumentos.json. */
(function () {
  'use strict';
  var R = window.Regras;
  var P = null, I = null, E = null;
  var $app = document.getElementById('app');
  var $nav = document.getElementById('nav');
  var $camada = document.getElementById('camada');
  var TMP = {};        // estado temporário de telas (não persistido)
  var S = null;        // sessão em andamento
  var instalar = null; // evento de instalação

  /* ================= utilidades ================= */
  function h(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function agora() {
    var d = new Date();
    return R.hoje(d) + 'T' + [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  }
  function hoje() { return R.hoje(); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function semana(n) { return P.semanas[n - 1]; }
  function passagem() { return R.passagemAtual(E); }
  function idxPassagem() { return R.indicePassagem(E); }
  function ir(rota) { if (location.hash === '#' + rota) render(); else location.hash = rota; }
  function topo() { window.scrollTo(0, 0); }
  function aviso(msg) {
    var d = document.createElement('div');
    d.className = 'ok';
    d.style.cssText = 'position:fixed;left:1rem;right:1rem;bottom:calc(76px + env(safe-area-inset-bottom));z-index:120;max-width:620px;margin:0 auto;box-shadow:0 6px 20px rgba(26,0,5,.18)';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 3200);
  }
  function baixar(nome, conteudo, tipo) {
    var blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ================= armazenamento (IndexedDB) ================= */
  var DB = {
    db: null, memoria: false,
    abrir: function () {
      return new Promise(function (ok) {
        try {
          var req = indexedDB.open('mindfulness-ibe', 1);
          req.onupgradeneeded = function () { req.result.createObjectStore('estado'); };
          req.onsuccess = function () { DB.db = req.result; ok(); };
          req.onerror = function () { DB.memoria = true; ok(); };
        } catch (e) { DB.memoria = true; ok(); }
      });
    },
    ler: function () {
      if (!DB.db) return Promise.resolve(null);
      return new Promise(function (ok) {
        var tx = DB.db.transaction('estado', 'readonly');
        var r = tx.objectStore('estado').get('principal');
        r.onsuccess = function () { ok(r.result || null); };
        r.onerror = function () { ok(null); };
      });
    },
    gravar: function (obj) {
      if (!DB.db) return Promise.resolve();
      return new Promise(function (ok) {
        var tx = DB.db.transaction('estado', 'readwrite');
        tx.objectStore('estado').put(JSON.parse(JSON.stringify(obj)), 'principal');
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { ok(); };
      });
    }
  };
  function salvar() { E.atualizadoEm = agora(); return DB.gravar(E); }

  function estadoNovo() {
    return {
      app: 'mindfulness-ibe', versaoDados: 1, protocolo: P.versao_protocolo, criadoEm: agora(),
      termo: null, triagem: null, desfecho: null, acompanhamento: null, ramo: null,
      mudancasRamo: [], passagens: [], sessoes: [], registros: [], checagens: [], medidas: [], alertas: [],
      semana7: { dominios: {}, escolhidos: [], acao: '', criterios: [] },
      manutencao: { campos: {}, lembretes: ['07:00', '12:00', '18:30'] },
      blocoPendente: null, fase: 'inicio', fimPrograma: null,
      config: { voz: false, som: true, somRitmo: false }
    };
  }

  /* ================= alertas ================= */
  var TEXTO_ALERTA = {
    triagem: { titulo: 'Procure um profissional antes de começar', confirma: 'Fui avaliado(a) por um profissional e tenho acompanhamento para fazer as práticas.' },
    ideacao: { titulo: 'Pensamentos de morte ou de se machucar', confirma: 'Tenho acompanhamento profissional e vou falar com essa pessoa sobre isso.' },
    efeito: { titulo: 'Prática em pausa: efeito indesejado atrapalhou a rotina', confirma: 'Conversei com um profissional e fui orientado(a) a retomar.' },
    lembrancas: { titulo: 'Prática em pausa: lembranças traumáticas invasivas', confirma: 'Procurei terapia focada no trauma e fui orientado(a) a retomar.' },
    piora: { titulo: 'Prática em pausa: piora confiável no GAD-7 ou no PHQ-9', confirma: 'Reavaliei com um profissional e fui orientado(a) a retomar.' },
    estranheza: { titulo: 'Só âncoras externas: estranheza em mais de 2 sessões', confirma: 'Fiz a avaliação e fui orientado(a) a retomar as práticas voltadas ao corpo.' },
    panico_respiracao: { titulo: 'Sem respiração ritmada: pânico ligado à respiração', confirma: 'Reavaliei o ramo e fui orientado(a) a retomar a respiração ritmada.' }
  };
  function regraParada(id) { return P.seguranca.regras_parada.filter(function (r) { return r.id === id; })[0]; }
  function criarAlerta(codigo, detalhe) {
    var ja = R.alertasAtivos(E).filter(function (a) { return a.codigo === codigo; })[0];
    if (ja) { if (detalhe) ja.detalhe = detalhe; return ja; }
    var a = { id: uid(), codigo: codigo, data: agora(), detalhe: detalhe || '', resolvido: false };
    E.alertas.push(a);
    return a;
  }
  function htmlAlerta(a) {
    var t = TEXTO_ALERTA[a.codigo] || { titulo: a.codigo, confirma: 'Confirmo' };
    return '<div class="alerta"><h3>' + h(t.titulo) + '</h3>' +
      (a.detalhe ? '<p>' + h(a.detalhe) + '</p>' : '') +
      '<p class="mudo">Desde ' + h(R.dataBR(a.data)) + '.</p>' +
      (a.codigo === 'ideacao' || a.codigo === 'triagem' ? '<p><a href="#" data-acao="ajuda">Ver os contatos de ajuda (CVV 188, SAMU 192)</a></p>' : '') +
      '<label class="marcar"><input type="checkbox" id="conf-' + a.id + '"> <span>' + h(t.confirma) + '</span></label>' +
      '<button class="btn pequeno" data-acao="resolver" data-id="' + a.id + '">Confirmar</button></div>';
  }

  /* ================= som, voz e tela acesa ================= */
  var Audio = {
    ctx: null,
    garantir: function () {
      try {
        if (!Audio.ctx) Audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (Audio.ctx.state === 'suspended') Audio.ctx.resume();
      } catch (e) { Audio.ctx = null; }
    },
    sino: function (vol, freq) {
      if (!E.config.som || !Audio.ctx) return;
      var c = Audio.ctx, t = c.currentTime;
      [[freq || 528, 1], [(freq || 528) * 2.01, 0.25]].forEach(function (par) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = par[0];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime((vol || 0.18) * par[1], t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + 2.3);
      });
    },
    toque: function (freq) {
      if (!Audio.ctx) return;
      var c = Audio.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.55);
    }
  };
  var Voz = {
    disponivel: 'speechSynthesis' in window,
    voz: null,
    escolher: function () {
      if (!Voz.disponivel) return;
      var vs = speechSynthesis.getVoices();
      Voz.voz = vs.filter(function (v) { return /^pt[-_]BR/i.test(v.lang); })[0] || vs.filter(function (v) { return /^pt/i.test(v.lang); })[0] || null;
    },
    falar: function (t) {
      if (!E.config.voz || !Voz.disponivel || !t) return;
      try {
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(t);
        u.lang = 'pt-BR'; u.rate = 0.92; u.pitch = 1;
        if (Voz.voz) u.voice = Voz.voz;
        speechSynthesis.speak(u);
      } catch (e) { /* sem voz */ }
    },
    calar: function () { if (Voz.disponivel) try { speechSynthesis.cancel(); } catch (e) { } }
  };
  if (Voz.disponivel) { Voz.escolher(); speechSynthesis.onvoiceschanged = Voz.escolher; }
  var Tela = {
    trava: null,
    manter: function () {
      if (!('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then(function (t) { Tela.trava = t; }).catch(function () { });
    },
    soltar: function () { if (Tela.trava) { Tela.trava.release().catch(function () { }); Tela.trava = null; } }
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S && S.rodando) Tela.manter();
  });

  /* ================= guia visual de respiração ================= */
  function padraoDe(id) { return P.semanas[1].padroes.lista.filter(function (x) { return x.id === id; })[0] || P.semanas[1].padroes.lista[1]; }
  function Guia(el, padraoId, opcoes) {
    opcoes = opcoes || {};
    var pd = padraoDe(padraoId), self = this;
    el.innerHTML = '<div class="guia" role="img" aria-label="Guia de respiração ' + h(pd.id) + '"><div class="aro"></div><div class="bola"></div><div class="rot"><span class="fase">Prepare-se</span><small class="cont"></small></div></div>';
    var bola = el.querySelector('.bola'), fase = el.querySelector('.fase'), cont = el.querySelector('.cont');
    var ciclo = pd.inspirar_s + pd.expirar_s, t0 = null, raf = null, ultimaFase = '';
    this.parar = function () { if (raf) cancelAnimationFrame(raf); raf = null; };
    this.ciclos = 0;
    function quadro(ts) {
      if (t0 === null) t0 = ts;
      var t = ((ts - t0) / 1000) % ciclo, esc, nome, resta;
      self.ciclos = Math.floor((ts - t0) / 1000 / ciclo);
      if (t < pd.inspirar_s) {
        var f = t / pd.inspirar_s; esc = 0.35 + 0.65 * (0.5 - Math.cos(Math.PI * f) / 2);
        nome = 'Inspire'; resta = Math.ceil(pd.inspirar_s - t);
      } else {
        var g = (t - pd.inspirar_s) / pd.expirar_s; esc = 1 - 0.65 * (0.5 - Math.cos(Math.PI * g) / 2);
        nome = 'Expire'; resta = Math.ceil(ciclo - t);
      }
      bola.style.transform = 'translate(-50%,-50%) scale(' + esc.toFixed(4) + ')';
      if (nome !== ultimaFase) {
        ultimaFase = nome; fase.textContent = nome;
        if (E.config.somRitmo) Audio.toque(nome === 'Inspire' ? 440 : 330);
      }
      cont.textContent = resta + ' s';
      if (opcoes.ciclos && self.ciclos >= opcoes.ciclos) { self.parar(); fase.textContent = 'Pronto'; cont.textContent = ''; if (opcoes.fim) opcoes.fim(); return; }
      raf = requestAnimationFrame(quadro);
    }
    raf = requestAnimationFrame(quadro);
  }

  /* ================= componentes ================= */
  function escala(nome, valor, rotulo) {
    var b = '';
    for (var i = 0; i <= 10; i++) {
      b += '<button type="button" class="' + (valor === i ? 'sel ' : '') + (i >= 7 ? 'forte' : '') + '" data-acao="nota" data-nome="' + nome + '" data-v="' + i + '" aria-pressed="' + (valor === i) + '">' + i + '</button>';
    }
    return (rotulo ? '<label class="campo">' + h(rotulo) + '</label>' : '') + '<div class="escala" data-escala="' + nome + '">' + b + '</div>';
  }
  function ancorasEscala() {
    return '<p class="ancoras-escala">' + P.nota_desconforto.ancoras.map(function (a) { return '<b>' + a.valor + '</b> = ' + h(a.texto); }).join('; ') + '</p>';
  }
  function seletorNota(id, valor) {
    var o = '<option value="">-</option>';
    for (var i = 0; i <= 10; i++) o += '<option' + (valor === i ? ' selected' : '') + '>' + i + '</option>';
    return '<select id="' + id + '">' + o + '</select>';
  }
  function questionario(id, resp) {
    var q = I.instrumentos[id];
    var out = '<p class="enun">' + h(q.enunciado) + '</p>';
    q.itens.forEach(function (txt, i) {
      out += '<div class="questao"><p class="enun">' + (i + 1) + '. ' + h(txt) + '</p><div class="opcoes">';
      q.opcoes.forEach(function (op) {
        var sel = resp && resp[i] === op.valor;
        out += '<button type="button" class="opcao' + (sel ? ' sel' : '') + '" data-acao="resp" data-q="' + id + '" data-i="' + i + '" data-v="' + op.valor + '">' + h(op.texto) + '</button>';
      });
      out += '</div></div>';
    });
    return out;
  }
  function simNao(id, valor) {
    return '<div class="opcoes" style="grid-template-columns:1fr 1fr">' +
      '<button type="button" class="opcao' + (valor === true ? ' sel' : '') + '" data-acao="simnao" data-id="' + id + '" data-v="1">Sim</button>' +
      '<button type="button" class="opcao' + (valor === false ? ' sel' : '') + '" data-acao="simnao" data-id="' + id + '" data-v="0">Não</button></div>';
  }
  function listaTextos(arr) { return '<ul class="lista">' + arr.map(function (t) { return '<li>' + h(t) + '</li>'; }).join('') + '</ul>'; }
  function dificuldades(arr) {
    return '<ul class="lista">' + arr.map(function (d) { return '<li><b>' + h(d.situacao) + ':</b> ' + h(d.orientacao) + '</li>'; }).join('') + '</ul>';
  }
  function cartaoDose(idx) {
    var pr = R.progressoDose(P, E, idx);
    if (!pr) return '';
    var caixas = '';
    for (var i = 0; i < 7; i++) {
      var d = pr.dias[i];
      caixas += '<span class="' + (d ? (d.cumpriu ? 'feito' : 'parcial') : '') + '">' + (d ? Math.round(d.minutos) + "'" : (i + 1)) + '</span>';
    }
    var mh = Math.round(R.minutosHoje(E));
    return '<h3>Dose da semana</h3><p class="mudo">' + pr.cumpridos + ' de ' + pr.alvo + ' dias com pelo menos a dose mínima (' + pr.dose.minimo + ' min). Recomendado ' + pr.dose.recomendado + ' min/dia; teto ' + pr.dose.teto + ' min/dia.</p>' +
      '<div class="barra"><i style="width:' + Math.min(100, pr.cumpridos / pr.alvo * 100) + '%"></i></div><div class="dias">' + caixas + '</div>' +
      '<p class="mudo">Hoje: ' + mh + ' min.</p>';
  }
  function nomeSemanaPrograma(idx) {
    var p = E.passagens[idx];
    return 'Semana ' + (idx + 1) + ' do programa · Semana ' + p.semana + ' do protocolo';
  }

  /* ================= navegação ================= */
  var ICONES = {
    inicio: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    sessao: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/></svg>',
    respiracao: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="10"/></svg>',
    registros: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h4"/></svg>',
    mais: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
  };
  function desenharNav(rota) {
    var itens = [['inicio', 'Início'], ['sessao', 'Praticar'], ['respiracao', 'Respirar'], ['registros', 'Registros'], ['mais', 'Mais']];
    $nav.innerHTML = itens.map(function (it) {
      return '<a href="#' + it[0] + '" class="' + (rota === it[0] ? 'on' : '') + '">' + ICONES[it[0]] + '<span>' + it[1] + '</span></a>';
    }).join('');
    $nav.classList.toggle('oculto', !E.termo || (S && S.fase === 'rodando'));
  }

  var ROTAS = {};
  function render() {
    var rota = (location.hash || '#inicio').slice(1).split('/');
    var nome = rota[0] || 'inicio', arg = rota[1];
    if (!E.termo) nome = 'termo';
    if (S && S.fase && nome !== 'sessao') { pararTimer(); S = null; Tela.soltar(); Voz.calar(); }
    var fn = ROTAS[nome] || ROTAS.inicio;
    $app.innerHTML = fn(arg) || '';
    desenharNav(nome);
    if (ROTAS[nome + '_depois']) ROTAS[nome + '_depois'](arg);
  }
  window.addEventListener('hashchange', function () { render(); topo(); });

  /* ================= termo ================= */
  ROTAS.termo = function () {
    var t = P.termo;
    return '<div class="cartao escuro"><span class="selo">Primeira abertura</span><h1>' + h(t.titulo.replace(' (modelo)', '')) + '</h1>' +
      '<p class="mudo">' + h(P.titulo) + '. ' + h(P.autor) + '.</p></div>' +
      '<div class="cartao"><p>' + h(t.abertura) + '</p><ol class="lista" type="a">' + t.itens.map(function (i) { return '<li>' + h(i) + '</li>'; }).join('') + '</ol>' +
      '<p>' + h(P.limites.nao_substitui) + '</p>' +
      '<div class="aviso">Seus dados ficam só neste aparelho. O aplicativo não tem servidor, não pede cadastro e não envia nada pela internet. Para guardar uma cópia ou levar ao profissional, use a exportação e o relatório em PDF.</div>' +
      '<label class="marcar"><input type="checkbox" id="aceite"> <span>Li e estou ciente.</span></label>' +
      '<button class="btn largo" data-acao="aceitar-termo">Aceitar e continuar</button>' +
      '<p class="mudo" style="margin-top:.8rem">' + h(t.instrucao) + ' <a href="/mindfulness-protocolo.html#termo">Ler o termo no manual</a>.</p></div>';
  };

  /* ================= início ================= */
  ROTAS.inicio = function () {
    var out = '';
    R.bloqueios(E).forEach(function (a) { out += htmlAlerta(a); });
    var rest = R.alertasAtivos(E).filter(function (a) { return R.TIPOS_ALERTA[a.codigo] === 'restricao'; });
    rest.forEach(function (a) { out += htmlAlerta(a); });
    if (DB.memoria) out += '<div class="aviso">Este navegador não permitiu guardar dados (talvez esteja em janela anônima). O que você registrar se perde ao fechar. Exporte uma cópia antes de sair.</div>';

    if (!E.triagem) {
      return out + '<div class="cartao escuro"><span class="selo">Antes da Semana 1</span><h1>Bem-vindo(a) ao programa de 8 semanas</h1>' +
        '<p>' + h(P.visao_geral) + '</p></div>' +
        '<div class="cartao"><h2>Comece pela autotriagem</h2><p>' + h(P.triagem.instrucao) + '</p>' +
        '<a class="btn largo" href="#triagem">Fazer a autotriagem</a></div>' +
        '<div class="cartao"><h3>Situações em que o manual não deve ser iniciado por conta própria</h3>' + listaTextos(P.limites.nao_iniciar_sozinho) + '<p>' + h(P.limites.prioridade) + '</p></div>';
    }
    if (!E.passagens.length) {
      return out + '<div class="cartao escuro"><span class="selo">Autotriagem feita</span><h1>Ramo ' + h(R.ramoNome(P, E.ramo)) + '</h1>' +
        '<p class="mudo">Programa de ' + R.totalSemanas(P, E.ramo) + ' semanas. Desfecho principal: ' + h(E.desfecho === 'PHQ9' ? 'PHQ-9 (depressão)' : 'GAD-7 (ansiedade)') + '.</p></div>' +
        '<div class="cartao"><h2>Semana 1: ' + h(semana(1).titulo) + '</h2><p>' + h(semana(1).objetivo) + '</p>' +
        (R.bloqueios(E).length ? '<p class="mudo">As práticas começam depois que você confirmar o acompanhamento profissional acima.</p>' : '<button class="btn largo" data-acao="iniciar-programa">Começar a Semana 1</button>') +
        '<div class="botoes"><a class="btn alt" href="#triagem/resultado">Ver a triagem</a><a class="btn alt" href="#ramo">Ramo</a></div></div>';
    }
    if (E.fase === 'manutencao') return out + inicioManutencao();

    var idx = idxPassagem(), p = passagem(), sem = semana(p.semana);
    var dias = R.diasSemPratica(E);
    if (dias !== null && dias > P.semanas[7].regra_retomada.dias_parada) {
      out += '<div class="aviso"><b>Regra de retomada.</b> ' + h(P.semanas[7].regra_retomada.texto) + '<div class="botoes"><button class="btn pequeno" data-acao="livre" data-min="5" data-rotulo="Retomada: a prática que você mais usava">Retomar com 5 min</button><button class="btn pequeno alt" data-acao="roteiro-semana" data-s="1">Recomeçar pela âncora externa</button></div></div>';
    }
    var pr = R.progressoDose(P, E, idx);
    var diasNaSemana = R.diasEntre(p.inicio, hoje());
    var pronto = pr.cumpridos >= pr.alvo || diasNaSemana >= 7;
    var bp = E.blocoPendente && E.blocoPendente.data === hoje() && E.blocoPendente.passagem === idx ? E.blocoPendente : null;
    out += '<div class="cartao escuro"><span class="selo">' + h(nomeSemanaPrograma(idx)) + ' de ' + R.totalSemanas(P, E.ramo) + '</span>' +
      '<h1>' + h(sem.titulo) + '</h1><p class="mudo">Ramo ' + h(R.ramoNome(P, E.ramo)) + ' · iniciada em ' + h(R.dataBR(p.inicio)) + (p.motivo && p.motivo !== 'Avanço' ? ' · ' + h(p.motivo) : '') + '</p>' +
      (R.bloqueios(E).length ? '' : (bp ? '<button class="btn largo" data-acao="continuar-bloco">Continuar a prática de hoje (bloco ' + (bp.n + 1) + ')</button>' : '<a class="btn largo" href="#sessao">Começar a sessão de hoje</a>')) +
      '</div>';
    out += '<div class="cartao">' + cartaoDose(idx) +
      '<div class="botoes"><a class="btn alt" href="#semana/' + p.semana + '">Conteúdo da semana</a><a class="btn alt" href="#registros/' + p.semana + '">Registro da semana</a></div></div>';
    if (p.semana === 7 && !E.semana7.escolhidos.length) out += '<div class="aviso">Antes da Semana 7, preencha o Mapa de Domínios (15 min). <a href="#semana7">Abrir o Mapa de Domínios</a></div>';
    if (p.semana === 8) out += '<div class="aviso">Nesta semana, faça o Mapa de Manutenção (30 min). <a href="#semana8">Abrir o Mapa de Manutenção</a></div>';
    out += '<div class="cartao"><h3>Prática informal</h3>' + listaTextos(sem.pratica_informal) + '</div>';
    out += '<div class="cartao"><h3>Fim da semana</h3><p>Ao fim de cada semana: checagem dos efeitos indesejados' + (P.avaliacao.semanas_medida.indexOf(p.semana) >= 0 ? ', GAD-7 e PHQ-9' : '') + ' e passagem para a semana seguinte.</p>' +
      '<a class="btn ' + (pronto ? '' : 'alt ') + 'largo" href="#concluir">Concluir a semana</a>' +
      (pronto ? '' : '<p class="mudo" style="margin-top:.5rem">A semana começou há ' + diasNaSemana + ' dia(s). ' + h(P.dose.texto.split('. ').slice(-1)[0]) + '</p>') + '</div>';
    return out;
  };

  function inicioManutencao() {
    var m = E.manutencao.campos || {};
    var out = '<div class="cartao escuro"><span class="selo">Programa concluído em ' + h(R.dataBR(E.fimPrograma)) + '</span><h1>Manutenção</h1><p class="mudo">Ramo ' + h(R.ramoNome(P, E.ramo)) + '.</p></div>';
    var dias = R.diasSemPratica(E), rr = P.semanas[7].regra_retomada;
    if (dias !== null && dias > rr.dias_parada) {
      out += '<div class="aviso"><b>Regra de retomada.</b> ' + h(rr.texto) + '<div class="botoes"><button class="btn pequeno" data-acao="livre" data-min="' + rr.dose_min + '" data-rotulo="' + h(m.pratica_diaria || 'A prática que você mais usava') + '">Retomar com ' + rr.dose_min + ' min</button><button class="btn pequeno alt" data-acao="roteiro-semana" data-s="1">Recomeçar pela âncora externa</button></div></div>';
    }
    out += '<div class="cartao"><h2>Prática diária</h2><p>' + h(m.pratica_diaria || 'Defina no Mapa de Manutenção uma prática diária de 5 a 10 min.') + '</p>' +
      '<label class="campo" for="livre-min">Duração</label><select id="livre-min">' + [5, 6, 7, 8, 9, 10].map(function (n) { return '<option>' + n + '</option>'; }).join('') + '</select>' +
      '<label class="marcar"><input type="checkbox" id="livre-guia"> <span>Usar o guia de respiração 4-6</span></label>' +
      '<button class="btn largo" data-acao="livre" data-rotulo="' + h(m.pratica_diaria || 'Prática diária') + '">Começar a prática diária</button>' +
      '<h3>Prática semanal (20 min)</h3><p>' + h(m.pratica_semanal || P.semanas[7].mapa_manutencao.passos[2]) + '</p>' +
      '<button class="btn alt largo" data-acao="livre" data-min="20" data-rotulo="' + h(m.pratica_semanal || 'Prática semanal') + '">Começar a prática semanal</button>' +
      '<h3>Roteiro de uma semana</h3><select id="roteiro-s">' + P.semanas.map(function (s) { return '<option value="' + s.numero + '">Semana ' + s.numero + ': ' + h(s.habilidade) + '</option>'; }).join('') + '</select>' +
      '<button class="btn alt largo" style="margin-top:.5rem" data-acao="roteiro-semana">Praticar este roteiro</button></div>';
    var prox = proximoAcompanhamento();
    out += '<div class="cartao"><h3>Acompanhamento</h3><p>' + h(P.semanas[7].mapa_manutencao.passos[4]) + '</p>' +
      (prox ? '<p class="mudo">Próximo GAD-7 e PHQ-9: ' + h(R.dataBR(prox)) + '.</p>' : '') +
      '<a class="btn alt largo" href="#medida">Responder GAD-7 e PHQ-9 agora</a>' +
      '<div class="botoes"><a class="btn alt" href="#semana8">Mapa de Manutenção</a><a class="btn alt" href="#resultados">Resultados</a></div></div>';
    return out;
  }
  function proximoAcompanhamento() {
    if (!E.fimPrograma) return null;
    var ult = E.fimPrograma;
    E.medidas.forEach(function (m) { if (m.data.slice(0, 10) > ult) ult = m.data.slice(0, 10); });
    var meses = R.diasEntre(E.fimPrograma, hoje()) / 30;
    var ac = P.semanas[7].mapa_manutencao.acompanhamento;
    var d = new Date(ult + 'T12:00:00');
    d.setMonth(d.getMonth() + (meses < ac.mensal_meses ? 1 : ac.depois_a_cada_meses));
    return R.hoje(d);
  }

  /* ================= autotriagem ================= */
  function rascunho() {
    if (!E.triagemRascunho) E.triagemRascunho = { passo: 0, respostas: { PHQ9: Array(9).fill(null), GAD7: Array(7).fill(null), PHQ15: Array(15).fill(null), PCL5: Array(20).fill(null), DES2: null, ASRS_A: null, ACE: null, pularPCL5: false, perguntas: {} } };
    return E.triagemRascunho;
  }
  var PASSOS_TRIAGEM = ['intro', 'PHQ9', 'GAD7', 'PHQ15', 'PCL5', 'licenciados', 'perguntas', 'resultado'];
  ROTAS.triagem = function (arg) {
    if (arg === 'resultado' && E.triagem) return resumoTriagem();
    if (E.triagem && E.passagens.length) return resumoTriagem();
    var rs = rascunho(), passo = PASSOS_TRIAGEM[rs.passo], resp = rs.respostas;
    var prog = '<div class="progresso-q"><i style="width:' + (rs.passo / (PASSOS_TRIAGEM.length - 1) * 100) + '%"></i></div>';
    var nav = function (podeAvancar, rotuloAvancar) {
      return '<div class="botoes">' + (rs.passo > 0 ? '<button class="btn alt" data-acao="triagem-voltar">Voltar</button>' : '') +
        '<button class="btn" data-acao="triagem-avancar"' + (podeAvancar ? '' : ' disabled') + '>' + (rotuloAvancar || 'Continuar') + '</button></div>';
    };
    var out = '<div class="cartao"><span class="selo">Autotriagem · passo ' + (rs.passo + 1) + ' de ' + PASSOS_TRIAGEM.length + '</span>' + prog;
    if (passo === 'intro') {
      out += '<h1>Autotriagem e escolha do ramo</h1><p>' + h(P.triagem.instrucao) + '</p>' +
        '<p>São seis questionários e algumas perguntas. Leva cerca de 15 minutos. As respostas ficam só neste aparelho.</p>' +
        '<div class="aviso">' + h(P.ajuda.texto) + '</div>' + nav(true, 'Começar');
    } else if (I.instrumentos[passo] && I.instrumentos[passo].livre) {
      var q = I.instrumentos[passo];
      out += '<h1>' + h(q.nome) + '</h1><p class="mudo">' + h(q.descricao) + '</p>';
      if (passo === 'PCL5') {
        out += '<div class="aviso">' + h(q.aviso) + '</div><label class="marcar"><input type="checkbox" data-acao="pular-pcl5"' + (resp.pularPCL5 ? ' checked' : '') + '> <span>Prefiro pular a PCL-5 e responder com o profissional.</span></label>';
      }
      if (!(passo === 'PCL5' && resp.pularPCL5)) out += questionario(passo, resp[passo]);
      out += '<p class="mudo" id="faltam"></p>' + nav(true);
    } else if (passo === 'licenciados') {
      out += '<h1>Questionários com direitos autorais e ACE</h1>';
      ['DES2', 'ASRS_A'].forEach(function (k) {
        var q = I.instrumentos[k];
        out += '<h3>' + h(q.nome) + '</h3><p class="mudo">' + h(q.descricao) + '</p><p>' + h(q.orientacao) + '</p>' +
          '<label class="campo" for="in-' + k + '">' + h(q.entrada.rotulo) + ' (opcional)</label><input type="number" inputmode="decimal" min="' + q.entrada.min + '" max="' + q.entrada.max + '" id="in-' + k + '" value="' + (resp[k] === null ? '' : resp[k]) + '">';
      });
      var ace = I.instrumentos.ACE;
      out += '<h3>' + h(ace.nome) + ' (opcional)</h3><p>' + h(P.triagem.ace) + '</p><p class="mudo">' + h(ace.orientacao) + '</p>' +
        '<label class="campo" for="in-ACE">' + h(ace.entrada.rotulo) + '</label><input type="number" inputmode="numeric" min="0" max="10" id="in-ACE" value="' + (resp.ACE === null ? '' : resp.ACE) + '">' +
        '<p class="mudo">' + h(P.triagem.apoio_profissional) + '</p>' + nav(true);
    } else if (passo === 'perguntas') {
      out += '<h1>Algumas perguntas sobre agora</h1><p class="mudo">Responda pelo que acontece atualmente.</p>';
      var ids = ['psicose_mania', 'trauma_recente', 'substancias', 'panico_diario', 'dissociacao_intensa', 'tept_complexo', 'sintomas_fisicos', 'panico_mes', 'desconforto_corpo', 'atencao_3min'];
      if (typeof resp.ACE === 'number' && resp.ACE >= 4) ids.push('sintomas_atuais');
      ids.forEach(function (id) {
        out += '<div class="questao"><p class="enun">' + h(I.perguntas[id]) + '</p>' + simNao(id, resp.perguntas[id]) + '</div>';
      });
      out += nav(ids.every(function (id) { return typeof resp.perguntas[id] === 'boolean'; }), 'Ver o resultado');
    } else if (passo === 'resultado') {
      out += resultadoTriagemHtml(resp, true);
    }
    return out + '</div>';
  };
  function resultadoTriagemHtml(resp, editavel) {
    var res = R.avaliarTriagem(P, resp), t = res.totais, out = '';
    out += '<h1>Resultado da autotriagem</h1><table class="tabela"><tr><th>Questionário</th><th>Pontuação</th></tr>';
    [['PHQ9', 'PHQ-9'], ['GAD7', 'GAD-7'], ['PHQ15', 'PHQ-15'], ['PCL5', 'PCL-5'], ['DES2', 'DES-II'], ['ASRS_A', 'ASRS-1.1 parte A'], ['ACE', 'ACE (contagem)']].forEach(function (k) {
      var v = t[k[0]];
      out += '<tr><td>' + k[1] + '</td><td>' + (v === null ? '<span class="mudo">não respondido</span>' : v + (k[0] === 'PHQ9' || k[0] === 'GAD7' ? ' (' + h(R.faixa(P, k[0], v)) + ')' : '')) + '</td></tr>';
    });
    out += '</table>';
    out += '<h2>' + h(P.triagem.passo1.titulo) + '</h2>';
    if (res.alertas.length) {
      P.triagem.passo1.sinais.forEach(function (s) {
        if (res.alertas.indexOf(s.id) >= 0) out += '<div class="alerta"><h3>' + h(s.sinal) + '</h3><p>' + h(s.verificacao) + '</p><p><b>' + h(s.acao) + '.</b></p></div>';
      });
      out += E.acompanhamento && E.acompanhamento.confirmado ? '<p>Você confirmou ter acompanhamento profissional em ' + h(R.dataBR(E.acompanhamento.data)) + '. Leve estes resultados para essa pessoa.</p>' : '<p>As práticas ficam disponíveis depois que você confirmar, na tela inicial, que tem acompanhamento profissional.</p>';
    } else out += '<div class="ok">Nenhum dos sinais do Passo 1 apareceu nas suas respostas.</div>';
    out += '<h2>' + h(P.triagem.passo2.titulo) + '</h2>';
    var crit = res.criteriosTrauma.concat(res.criteriosEstendida);
    out += '<p>Ramo sugerido: <b>' + h(R.ramoNome(P, res.ramo)) + '</b>' + (crit.length ? ' (' + h(crit.join('; ')) + ')' : ' (nenhum critério dos ramos especiais)') + '.</p>';
    if (editavel) {
      var r = TMP.ramoEscolhido || { trauma: res.ramo.trauma, estendida: res.ramo.estendida };
      TMP.ramoEscolhido = r;
      out += '<p class="mudo">' + h(P.triagem.passo2.combinacao) + ' Você pode acrescentar um ramo especial, mas não retirar um ramo indicado pela triagem.</p>' +
        '<label class="marcar"><input type="checkbox" id="r-trauma"' + (r.trauma ? ' checked' : '') + (res.ramo.trauma ? ' disabled' : '') + '> <span>TRAUMA-INFORMADO: ' + h(P.ramos.TRAUMA.adaptacoes) + '</span></label>' +
        '<label class="marcar"><input type="checkbox" id="r-estendida"' + (r.estendida ? ' checked' : '') + (res.ramo.estendida ? ' disabled' : '') + '> <span>ATENÇÃO ESTENDIDA: ' + h(P.ramos.ESTENDIDA.adaptacoes) + '</span></label>' +
        '<h2>Desfecho principal</h2><p>' + h(P.avaliacao.desfecho) + '</p>' +
        '<select id="desfecho"><option value="GAD7"' + (E.desfecho === 'GAD7' ? ' selected' : '') + '>GAD-7 (ansiedade)</option><option value="PHQ9"' + (E.desfecho === 'PHQ9' ? ' selected' : '') + '>PHQ-9 (depressão)</option></select>' +
        '<div class="botoes"><button class="btn alt" data-acao="triagem-voltar">Voltar</button><button class="btn" data-acao="salvar-triagem">Salvar a triagem</button></div>';
    }
    return out;
  }
  function resumoTriagem() {
    var tr = E.triagem;
    return '<div class="cartao"><span class="selo">Autotriagem de ' + h(R.dataBR(tr.data)) + '</span>' + resultadoTriagemHtml(tr.respostas, false) +
      '<p>Ramo escolhido: <b>' + h(R.ramoNome(P, tr.ramoEscolhido || E.ramo)) + '</b>. Desfecho principal: ' + (E.desfecho === 'PHQ9' ? 'PHQ-9' : 'GAD-7') + '.</p>' +
      (!E.passagens.length ? '<button class="btn alt" data-acao="refazer-triagem">Refazer a triagem</button>' : '<p class="mudo">Depois de iniciado o programa, mudanças de ramo são feitas na tela Ramo.</p>') + '</div>';
  }
  ROTAS.triagem_depois = function () { faltam(); };
  function faltam() {
    var el = document.getElementById('faltam');
    if (!el) return;
    var rs = rascunho(), passo = PASSOS_TRIAGEM[rs.passo], arr = rs.respostas[passo];
    if (!Array.isArray(arr)) return;
    var n = arr.filter(function (v) { return v === null; }).length;
    el.textContent = n ? 'Faltam ' + n + ' item(ns) para responder.' : 'Todos os itens respondidos.';
    var b = document.querySelector('[data-acao="triagem-avancar"]');
    if (b) b.disabled = n > 0 && !(passo === 'PCL5' && rs.respostas.pularPCL5);
  }

  /* ================= tela de ajuda ================= */
  function abrirAjuda(origem) {
    var s = P.triagem.passo1.sinais[0];
    $camada.innerHTML = '<div class="tela" role="dialog" aria-modal="true" aria-labelledby="ajuda-t"><div class="in">' +
      '<span class="selo">Ajuda agora</span><h1 id="ajuda-t">Você não precisa passar por isso sozinho(a)</h1>' +
      '<p>' + h(s.acao) + '.</p>' +
      '<a class="fone" href="tel:188"><span>CVV, ligação gratuita, 24 horas</span><b>188</b></a>' +
      '<a class="fone" href="tel:192"><span>SAMU</span><b>192</b></a>' +
      '<p>Você também pode ir a um CAPS ou ao pronto-socorro mais próximo.</p>' +
      '<div class="aviso">' + h(P.ajuda.texto) + '</div>' +
      '<p>As práticas do aplicativo ficam suspensas até você confirmar que tem acompanhamento profissional.</p>' +
      '<label class="marcar"><input type="checkbox" id="conf-acomp"> <span>' + h(TEXTO_ALERTA.ideacao.confirma) + '</span></label>' +
      '<div class="botoes"><button class="btn" data-acao="confirmar-acomp">Confirmo que tenho acompanhamento</button>' +
      '<button class="btn alt" data-acao="fechar-ajuda">' + (origem === 'triagem' ? 'Voltar ao questionário' : 'Fechar') + '</button></div></div></div>';
  }
  function fecharCamada() { $camada.innerHTML = ''; }

  /* ================= sessão guiada ================= */
  function teto() {
    var p = passagem();
    return p ? R.dose(P, p.semana, E.ramo).teto : P.dose.teto_diario_geral_min;
  }
  ROTAS.sessao = function () {
    if (S && S.fase) return telaSessao();
    if (!E.triagem) return '<div class="cartao"><h1>Faça a autotriagem primeiro</h1><p>' + h(P.triagem.instrucao) + '</p><a class="btn" href="#triagem">Fazer a autotriagem</a></div>';
    if (R.bloqueios(E).length) return R.bloqueios(E).map(htmlAlerta).join('') + '<div class="cartao"><p>As práticas estão suspensas até a confirmação acima.</p></div>';
    if (!E.passagens.length) return '<div class="cartao"><h1>Programa ainda não iniciado</h1><button class="btn" data-acao="iniciar-programa">Começar a Semana 1</button></div>';
    if (E.fase === 'manutencao') return inicioManutencao();
    var p = passagem(), idx = idxPassagem(), dia = R.diaDaSemana(E);
    var o = TMP.op || {};
    var op = { semana: p.semana, dia: dia, padrao: o.padrao || (E.ramo && E.ramo.trauma ? '4-6' : '4-6'), curta: !!o.curta, ancora: o.ancora, escolha: o.escolha };
    var ro = R.montarRoteiro(P, E, op);
    var sem = semana(p.semana), mh = R.minutosHoje(E), t = teto();
    var out = '<div class="cartao escuro"><span class="selo">' + h(nomeSemanaPrograma(idx)) + ' · dia ' + dia + '</span><h1>' + h(ro.titulo) + '</h1>' +
      '<p class="mudo">' + h(sem.titulo) + ' · ' + Math.round(ro.total_s / 60) + ' min · ramo ' + h(R.ramoNome(P, E.ramo)) + '</p></div>';
    ro.avisos.forEach(function (a) { out += '<div class="aviso">' + h(a) + '</div>'; });
    if (mh >= t) out += '<div class="alerta"><h3>Teto de hoje atingido</h3><p>Hoje você já praticou ' + Math.round(mh) + ' min. O teto desta semana é ' + t + ' min por dia: ' + h(P.dose.texto.split('. ')[1]) + '.</p></div>';
    else if (mh + ro.total_s / 60 > t) out += '<div class="aviso">Hoje você já praticou ' + Math.round(mh) + ' min. Com esta sessão, passaria do teto de ' + t + ' min por dia. Use os blocos para parar no teto.</div>';
    out += '<div class="cartao">';
    if (ro.introducao) out += '<p>' + h(ro.introducao) + '</p>';
    if (ro.material) out += '<div class="aviso">' + h(ro.material) + '</div>';
    if (ro.semanaRoteiro === 1) {
      var ad = R.ancoraDoDia(P, dia);
      out += '<p><b>' + h(P.semanas[0].ancoras_por_dia.titulo) + ':</b> ' + h(ad ? ad.texto : '') + '</p><label class="campo" for="op-ancora">Âncora de hoje</label><select id="op-ancora" data-acao-mudar="op">' +
        ['som', 'visão', 'tato externo'].map(function (a) { var sel = (o.ancora || (ad && ad.ancora)) === a; return '<option' + (sel ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select>' +
        '<label class="marcar"><input type="checkbox" id="op-curta" data-acao-mudar="op"' + (o.curta ? ' checked' : '') + '> <span>Sessão encurtada de 5 min. ' + h(P.semanas[0].dificuldades[0].situacao) + ': ' + h(P.semanas[0].dificuldades[0].orientacao) + '</span></label>';
    }
    if (ro.semanaRoteiro === 2) {
      var pd = P.semanas[1].padroes;
      var opcoesPadrao = ro.tipo === 'TRAUMA' ? ['4-6', '6-6'] : ['5-5', '4-6', '6-6'];
      out += '<p>' + h(pd.texto) + '</p><p class="mudo">' + h(pd.qual_escolher) + '</p><p class="mudo">' + h(pd.devagar_nao_e_fundo) + '</p>' +
        '<label class="campo" for="op-padrao">Padrão de respiração</label><select id="op-padrao" data-acao-mudar="op">' +
        opcoesPadrao.map(function (x) { return '<option' + (op.padrao === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
      if (ro.tipo !== 'TRAUMA') out += '<label class="marcar"><input type="checkbox" id="op-curta" data-acao-mudar="op"' + (o.curta ? ' checked' : '') + '> <span>Manutenção de 8 min (histórico de pânico ou sensação de falta de ar).</span></label>';
    }
    if (ro.semanaRoteiro === 8) {
      var esc = sem.roteiros.PADRAO.passos[1].escolha;
      out += '<label class="campo" for="op-escolha">Bloco à escolha de hoje</label><select id="op-escolha" data-acao-mudar="op">' + esc.map(function (x) { return '<option' + (o.escolha === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
    }
    if (ro.semanaRoteiro === 7 && !E.semana7.escolhidos.length) out += '<div class="aviso">Você ainda não escolheu os domínios no Mapa de Domínios. <a href="#semana7">Preencher agora</a></div>';
    if (!(E.ramo && E.ramo.trauma) && [2, 3, 4, 5, 6].indexOf(p.semana) >= 0 && ro.tipo !== 'ANCORAS') {
      out += '<label class="marcar"><input type="checkbox" data-acao="usar-trauma"' + (p.usarRoteiroTrauma ? ' checked' : '') + '> <span>Usar o roteiro trauma-informado nesta semana' + (sem.roteiros.PADRAO.aviso ? '. ' + h(sem.roteiros.PADRAO.aviso) : '') + '</span></label>';
    }
    var est = E.ramo && E.ramo.estendida;
    out += '<h3>Como fazer</h3><label class="marcar"><input type="checkbox" id="op-blocos"' + (est || o.blocos ? ' checked' : '') + '> <span>' + (est ? 'Ramo ATENÇÃO ESTENDIDA: prática em blocos de 5 min, 3 vezes ao dia.' : h(P.dose.blocos.texto)) + '</span></label>' +
      (est ? '' : '<select id="op-bloco-min">' + [5, 6, 7, 8].map(function (n) { return '<option' + ((o.blocoMin || 5) === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select><p class="mudo">Minutos por bloco.</p>') +
      '<label class="marcar"><input type="checkbox" id="op-som"' + (E.config.som ? ' checked' : '') + '> <span>Aviso sonoro suave na troca de passo</span></label>' +
      (Voz.disponivel ? '<label class="marcar"><input type="checkbox" id="op-voz"' + (E.config.voz ? ' checked' : '') + '> <span>Ler cada passo em voz alta</span></label>' : '') +
      '<h3>Passos</h3><ol class="lista">' + ro.passos.map(function (x) { return '<li><b>' + h(x.nome) + '</b> (' + R.mmss(x.duracao_s) + ')</li>'; }).join('') + '</ol>' +
      (ro.aviso ? '<p class="mudo">' + h(ro.aviso) + '</p>' : '') +
      '<button class="btn largo" data-acao="comecar-sessao"' + (mh >= t ? ' disabled' : '') + '>Começar</button></div>';
    TMP.roPrevia = { ro: ro, op: op, dia: dia };
    return out;
  };

  function lerOpcoesSessao() {
    var o = TMP.op || {};
    var g = function (id) { return document.getElementById(id); };
    if (g('op-ancora')) o.ancora = g('op-ancora').value;
    if (g('op-curta')) o.curta = g('op-curta').checked;
    if (g('op-padrao')) o.padrao = g('op-padrao').value;
    if (g('op-escolha')) o.escolha = g('op-escolha').value;
    if (g('op-blocos')) o.blocos = g('op-blocos').checked;
    if (g('op-bloco-min')) o.blocoMin = parseInt(g('op-bloco-min').value, 10);
    if (g('op-som')) E.config.som = g('op-som').checked;
    if (g('op-voz')) E.config.voz = g('op-voz').checked;
    TMP.op = o;
    return o;
  }

  function iniciarSessao(ro, op, extra) {
    extra = extra || {};
    Audio.garantir();
    var est = E.ramo && E.ramo.estendida;
    var o = TMP.op || {};
    var blocoMin = extra.semBlocos ? 0 : (est && o.blocos !== false ? P.ramos.ESTENDIDA.bloco_min : (o.blocos ? (o.blocoMin || 5) : 0));
    S = {
      fase: 'antes', ro: ro, op: op, dia: op.dia, inicio: agora(), antes: null, notas: [], picoInformado: null, depois: null,
      passo: 0, decorrido: 0, real: 0, rodando: false, ultimo: 0, encerramento: null,
      bloco_s: blocoMin ? blocoMin * 60 : 0, blocoIni: 0, blocoN: 0, sustentou: null,
      passagem: extra.passagem === undefined ? idxPassagem() : extra.passagem,
      livre: !!extra.livre, continuar: extra.continuar || null, condicao: {}, registroCampos: {}
    };
    if (S.continuar) { S.blocoIni = S.continuar.pos; S.blocoN = S.continuar.n; posicionar(S.continuar.pos); }
    salvar();
    ir('sessao');
  }
  function posicionar(pos) {
    var acc = 0;
    for (var i = 0; i < S.ro.passos.length; i++) {
      if (pos < acc + S.ro.passos[i].duracao_s) { S.passo = i; S.decorrido = pos - acc; return; }
      acc += S.ro.passos[i].duracao_s;
    }
    S.passo = S.ro.passos.length - 1; S.decorrido = S.ro.passos[S.passo].duracao_s;
  }
  function posicao() {
    var acc = 0;
    for (var i = 0; i < S.passo; i++) acc += S.ro.passos[i].duracao_s;
    return acc + S.decorrido;
  }
  var timer = null, VEL = 1;
  function pararTimer() { if (timer) clearInterval(timer); timer = null; if (S && S.guia) { S.guia.parar(); S.guia = null; } }
  function rodar() {
    S.rodando = true; S.ultimo = Date.now(); Tela.manter();
    if (timer) clearInterval(timer);
    timer = setInterval(tique, 250);
  }
  function pausar() { S.rodando = false; if (timer) clearInterval(timer); timer = null; Voz.calar(); }
  function tique() {
    if (!S || !S.rodando) return;
    var t = Date.now(), dt = (t - S.ultimo) / 1000 * VEL; S.ultimo = t;
    var p = S.ro.passos[S.passo];
    var antes = S.decorrido;
    S.real += Math.max(0, Math.min(dt, p.duracao_s - S.decorrido));
    S.decorrido += dt;
    if (p.sinal_intervalo_s && Math.floor(antes / p.sinal_intervalo_s) !== Math.floor(S.decorrido / p.sinal_intervalo_s) && S.decorrido < p.duracao_s) Audio.sino(0.06, 660);
    if (S.bloco_s && posicao() >= S.blocoIni + S.bloco_s && posicao() < S.ro.total_s - 1) { fimDeBloco(); return; }
    if (S.decorrido >= p.duracao_s) {
      if (p.registro) { S.decorrido = p.duracao_s; atualizarTempo(); return; }
      if (S.passo >= S.ro.passos.length - 1) { S.decorrido = p.duracao_s; Audio.sino(0.2); irParaFechamento(); return; }
      S.passo++; S.decorrido = 0;
      Audio.sino(0.18);
      entrarPasso();
      return;
    }
    atualizarTempo();
  }
  function entrarPasso() {
    var p = S.ro.passos[S.passo];
    if (p.registro) { irParaFechamento(); return; }
    if (p.condicao && S.condicao[p.id] === undefined) {
      if (S.dia < p.condicao.dia_min) S.condicao[p.id] = false;
      else { pausar(); S.fase = 'condicao'; render(); return; }
    }
    S.fase = 'rodando';
    render();
    Voz.falar(p.nome + '. ' + textoPasso(p));
  }
  function textoPasso(p) {
    var t = p.texto || '';
    if (p.condicao && S.condicao[p.id] === false) {
      t = (S.dia < p.condicao.dia_min ? 'Hoje é o dia ' + S.dia + ' de prática. A aproximação começa no dia ' + p.condicao.dia_min + ': neste minuto, continue na âncora externa.' : 'Sua nota está acima de ' + p.condicao.nota_max + ': neste minuto, continue na âncora externa.');
    }
    if (p.condicao_extra) {
      var mx = maxNotas();
      t += mx !== null && mx <= p.condicao_extra.nota_max_toda_pratica ? ' ' + p.condicao_extra.texto : ' Hoje tronco e rosto ficam de fora: ' + (mx === null ? 'registre a nota para avaliar.' : 'a nota passou de ' + p.condicao_extra.nota_max_toda_pratica + ' nesta prática.');
    }
    if (p.id === 'bloco' && S.op.escolha) t += ' Hoje: ' + S.op.escolha + '.';
    if (p.id === 'ancora' && S.op.ancora) t += ' Hoje: ' + S.op.ancora + '.';
    return cap(t);
  }
  function maxNotas() {
    var v = [S.antes].concat(S.notas.map(function (n) { return n.v; })).filter(function (x) { return typeof x === 'number'; });
    return v.length ? Math.max.apply(null, v) : null;
  }
  function atualizarTempo() {
    var p = S.ro.passos[S.passo];
    var el = document.getElementById('tempo-passo');
    if (el) el.textContent = R.mmss(p.duracao_s - S.decorrido);
    var et = document.getElementById('tempo-total');
    if (et) et.textContent = 'Faltam ' + R.mmss(S.ro.total_s - posicao()) + ' no total';
  }
  function irParaFechamento() {
    pausar();
    S.fase = 'fechamento';
    Voz.falar('Agora a nota de desconforto e o registro.');
    render();
  }
  function fimDeBloco() {
    pausar();
    Audio.sino(0.2);
    S.fase = 'fimbloco';
    render();
  }

  function telaSessao() {
    var ro = S.ro, p = ro.passos[S.passo];
    if (S.fase === 'antes') {
      return '<div class="cartao"><span class="selo">' + h(ro.titulo) + (S.blocoN ? ' · bloco ' + (S.blocoN + 1) : '') + '</span><h1>Nota de desconforto antes</h1>' +
        '<p>' + h(P.nota_desconforto.texto) + '</p>' + escala('antes', S.antes) + ancorasEscala() +
        '<div class="botoes"><button class="btn alt" data-acao="cancelar-sessao">Cancelar</button><button class="btn" data-acao="iniciar-passos"' + (S.antes === null ? ' disabled' : '') + '>Começar a prática</button></div></div>';
    }
    if (S.fase === 'condicao') {
      return '<div class="cartao"><span class="selo">' + h(p.nome) + '</span><h1>Qual é a sua nota agora?</h1><p>' + h(cap(p.condicao.texto)) + '.</p>' + escala('cond', null) + ancorasEscala() + '</div>';
    }
    if (S.fase === 'rodando') {
      var trilha = ro.passos.map(function (x, i) { return '<i class="' + (i < S.passo ? 'feito' : (i === S.passo ? 'atual' : '')) + '"></i>'; }).join('');
      var guia = p.guia_respiracao === 'sim' || (p.guia_respiracao === 'opcional' && S.mostrarGuia);
      var painel = '';
      if (p.mostra === 'mapa_dominios') painel = '<div class="detalhe"><b>Seus domínios:</b> ' + (E.semana7.escolhidos.length ? E.semana7.escolhidos.map(function (d) { var x = E.semana7.dominios[d] || {}; return h(d) + ' (importância ' + (x.imp === undefined ? '-' : x.imp) + ', coerência ' + (x.coe === undefined ? '-' : x.coe) + ')'; }).join('; ') : 'ainda não escolhidos.') + '</div>';
      if (p.mostra === 'acao_semana') painel = '<div class="detalhe"><label class="campo" for="acao-semana">Ação comprometida da semana</label><input type="text" id="acao-semana" value="' + h(E.semana7.acao) + '"><p class="mudo">Critérios: ' + h(P.semanas[6].criterios_acao.join(', ')) + '.</p></div>';
      return '<div class="cartao sessao"><div class="trilha">' + trilha + '</div>' +
        '<p class="mudo">Passo ' + (S.passo + 1) + ' de ' + ro.passos.length + (S.bloco_s ? ' · bloco ' + (S.blocoN + 1) : '') + '</p>' +
        '<p class="passo-nome">' + h(p.nome) + '</p><p class="tempo" id="tempo-passo">' + R.mmss(p.duracao_s - S.decorrido) + '</p><p class="mudo" id="tempo-total"></p>' +
        (guia ? '<div id="guia"></div><p class="mudo">Padrão ' + h(ro.padrao || S.op.padrao || '4-6') + '. Nunca prenda o ar.</p>' : '') +
        (p.guia_respiracao === 'opcional' ? '<button class="btn alt pequeno" data-acao="alternar-guia">' + (S.mostrarGuia ? 'Esconder o guia visual' : 'Mostrar o guia visual') + '</button>' : '') +
        '<p class="passo-texto">' + h(textoPasso(p)) + '</p>' +
        (p.detalhe ? '<div class="detalhe">' + h(p.detalhe) + '</div>' : '') + painel +
        (ro.notas.length && S.passo === 0 ? '<div class="detalhe">' + ro.notas.map(h).join('<br>') + '</div>' : '') +
        '<div class="controles"><button class="btn escuro" data-acao="pausar">' + (S.rodando ? 'Pausar' : 'Continuar') + '</button>' +
        '<button class="btn alt" data-acao="proximo-passo">Próximo passo</button>' +
        '<button class="btn alt" data-acao="nota-agora">Nota agora' + (S.notas.length ? ' (' + S.notas[S.notas.length - 1].v + ')' : '') + '</button>' +
        '<button class="btn" data-acao="parar">Parar</button></div>' +
        '<div id="painel-nota" class="oculto" style="text-align:left;margin-top:1rem"><p><b>Nota de desconforto agora</b></p>' + escala('agora', null) + ancorasEscala() + '</div>' +
        '<div id="painel-parar" class="oculto" style="text-align:left;margin-top:1rem"><p><b>Por que parar?</b></p><div class="opcoes">' +
        '<button class="opcao" data-acao="parar-motivo" data-m="estranheza">Estranheza de si ou do ambiente</button>' +
        '<button class="opcao" data-acao="parar-motivo" data-m="lembrancas">Lembranças traumáticas invasivas</button>' +
        '<button class="opcao" data-acao="parar-motivo" data-m="panico">Ataque de pânico ligado à respiração</button>' +
        '<button class="opcao" data-acao="parar-motivo" data-m="manual">Outro motivo: só quero parar agora</button></div></div></div>';
    }
    if (S.fase === 'fimbloco') {
      return '<div class="cartao"><span class="selo">Bloco ' + (S.blocoN + 1) + ' concluído</span><h1>Pausa entre blocos</h1>' +
        '<p>' + h(E.ramo && E.ramo.estendida ? P.ramos.ESTENDIDA.adaptacoes.split('; ')[1] : P.dose.blocos.texto) + '. A próxima parte continua de onde você parou.</p>' +
        escala('depois', S.depois, 'Nota de desconforto agora (depois)') + escala('pico', S.picoInformado !== null ? S.picoInformado : picoSugerido(), 'Pico durante a prática') + ancorasEscala() +
        '<button class="btn largo" data-acao="salvar-bloco"' + (S.depois === null ? ' disabled' : '') + '>Salvar este bloco</button></div>';
    }
    if (S.fase === 'fechamento') {
      var sem = ro.semanaRoteiro ? semana(ro.semanaRoteiro) : null, reg = sem ? sem.registro : null;
      var est = E.ramo && E.ramo.estendida && P.ramos.ESTENDIDA.semanas_repetidas.indexOf(ro.semana) >= 0 && !S.livre;
      var out = '<div class="cartao"><span class="selo">' + h(ro.titulo) + '</span><h1>Fechamento</h1>' +
        escala('depois', S.depois, 'Nota de desconforto agora (depois)') +
        escala('pico', S.picoInformado !== null ? S.picoInformado : picoSugerido(), 'Pico durante a prática') + ancorasEscala();
      if (est) out += '<div class="questao"><p class="enun">Hoje você conseguiu sustentar a âncora por 3 min, com retornos?</p>' + simNao('sustentou', S.sustentou) + '<p class="mudo">' + h(P.ramos.ESTENDIDA.criterio_avanco.texto) + '.</p></div>';
      if (!S.livre && reg) {
        out += '<h2>' + h(reg.nome) + '</h2>' + (reg.instrucao ? '<p class="mudo">' + h(reg.instrucao) + '</p>' : '') + '<p class="mudo">Tempo e notas de desconforto entram no registro automaticamente.</p>' + formRegistro(reg, prefillRegistro(reg), 'f', true);
      }
      if (ro.semanaRoteiro === 7 && !S.livre) out += '<label class="campo" for="acao-semana">Ação comprometida da semana</label><input type="text" id="acao-semana" value="' + h(E.semana7.acao) + '">';
      out += '<button class="btn largo" data-acao="concluir-sessao"' + (S.depois === null ? ' disabled' : '') + '>Concluir a sessão</button></div>';
      return out;
    }
    if (S.fase === 'ancora') return telaAncora();
    return '';
  }
  function picoSugerido() {
    var v = S.notas.map(function (n) { return n.v; });
    if (typeof S.depois === 'number') v.push(S.depois);
    return v.length ? Math.max.apply(null, v) : null;
  }
  ROTAS.sessao_depois = function () {
    if (!S) return;
    if (S.fase === 'rodando') {
      var p = S.ro.passos[S.passo];
      var g = document.getElementById('guia');
      if (S.guia) { S.guia.parar(); S.guia = null; }
      if (g && S.rodando) S.guia = new Guia(g, S.ro.padrao || S.op.padrao || '4-6');
      else if (g) g.innerHTML = '<div class="guia"><div class="aro"></div><div class="bola"></div><div class="rot"><span>Em pausa</span></div></div>';
      atualizarTempo();
    }
  };

  function telaAncora() {
    var m = S.encerramento, extra = '';
    if (m === 'estranheza') extra = regraParada('estranheza').acao;
    if (m === 'lembrancas') extra = regraParada('lembrancas').acao;
    if (m === 'panico') extra = regraParada('panico_respiracao').acao;
    var regra = R.regraParar(P);
    return '<div class="cartao"><span class="selo">Regra de parada</span><h1>Volte a uma âncora externa</h1>' +
      '<p style="font-family:var(--serifa);font-size:1.1rem">' + h(regra.acao) + '.</p>' +
      (m === 'pico' || m === 'subida' ? '<p class="mudo">' + h(regra.situacao) + '.</p>' : '') +
      (extra ? '<div class="aviso">' + h(extra) + '.</div>' : '') +
      '<p>Olhe ao redor e nomeie, em silêncio, alguns objetos que você vê. Sinta os pés no chão. Ouça os sons do ambiente.</p>' +
      escala('ancora', S.notaAncora === undefined ? null : S.notaAncora, 'Nota de desconforto agora') + ancorasEscala() +
      '<button class="btn largo" data-acao="encerrar-ancora"' + (S.notaAncora === undefined || S.notaAncora === null ? ' disabled' : '') + '>A nota baixou: encerrar</button>' +
      '<p class="mudo" style="margin-top:.8rem">Se o desconforto não baixar ou se surgirem pensamentos de morte: <a href="#" data-acao="ajuda">contatos de ajuda</a>.</p></div>';
  }

  function encerrarPorRegra(motivo) {
    pausar();
    S.encerramento = motivo;
    S.fase = 'ancora';
    Voz.calar();
    render(); topo();
  }

  function gravarSessao(parcial) {
    var feito = S.real;
    var pico = S.picoInformado !== null ? S.picoInformado : picoSugerido();
    var p = S.passagem >= 0 ? E.passagens[S.passagem] : null;
    var reg = {
      id: uid(), data: S.inicio, passagem: S.passagem, semana: S.ro.semana, semanaRoteiro: S.ro.semanaRoteiro, dia: S.dia,
      roteiro: S.ro.tipo, titulo: S.ro.titulo, previsto_s: S.ro.total_s, feito_s: Math.max(0, Math.round(feito)),
      antes: S.antes, pico: pico, depois: S.depois, notas: S.notas, encerramento: S.encerramento,
      padrao: S.ro.semanaRoteiro === 2 ? (S.ro.padrao || S.op.padrao) : null, ancora: S.op.ancora || null, escolha: S.op.escolha || null,
      bloco: S.bloco_s ? S.blocoN + 1 : null, sustentou: S.sustentou, livre: S.livre, ramo: JSON.parse(JSON.stringify(E.ramo || {}))
    };
    E.sessoes.push(reg);
    if (p && p.semana === 2 && reg.roteiro === 'TRAUMA' && R.semana2SoAncoras(P, E, S.passagem) && !p.avisoSemana2) {
      p.avisoSemana2 = true;
      TMP.mensagem = P.semanas[1].roteiros.TRAUMA.regra.texto;
    }
    if (reg.encerramento === 'estranheza' && R.contarEstranheza(E) > R.limiteEstranheza(P)) criarAlerta('estranheza', regraParada('estranheza').acao + '.');
    if (reg.encerramento === 'lembrancas') criarAlerta('lembrancas', regraParada('lembrancas').acao + '.');
    if (reg.encerramento === 'panico') criarAlerta('panico_respiracao', regraParada('panico_respiracao').acao + '.');
    return reg;
  }
  function registroDaSessao(reg) {
    if (S.livre || !S.ro.semanaRoteiro) return;
    var def = semana(S.ro.semanaRoteiro).registro;
    if (!def) return;
    var campos = completarAuto(def, lerForm(def, 'f'));
    var algum = Object.keys(campos).some(function (k) { var v = campos[k]; return v !== '' && v !== null && !(Array.isArray(v) && v.every(function (x) { return x === null || x === ''; })); });
    if (!algum) return;
    E.registros.push({ id: uid(), data: agora(), semana: S.ro.semanaRoteiro, passagem: S.passagem, dia: S.dia, sessao: reg.id, campos: campos });
  }
  function depoisDeSalvar(reg) {
    S = null; pararTimer(); Tela.soltar(); Voz.calar();
    var idx = reg.passagem, p = idx >= 0 ? E.passagens[idx] : null;
    if (p && (reg.encerramento === 'pico' || reg.encerramento === 'subida') && R.paradasPorNota(E, idx) >= R.limiteDuasParadas(P) && !p.sugeridoDuas) {
      p.sugeridoDuas = true;
      salvar(); abrirSugestaoRamo(); ir('inicio'); return;
    }
    salvar();
    if (p && !reg.encerramento && !(E.ramo && E.ramo.trauma) && !p.usarRoteiroTrauma) {
      var ro = semana(p.semana).roteiros.PADRAO;
      var lim = ro.sugerir_roteiro_trauma_se_nota_min, lim2 = ro.sugerir_roteiro_trauma_se_nota_acima;
      if ((lim !== undefined && reg.pico >= lim) || (lim2 !== undefined && reg.pico > lim2)) {
        TMP.mensagem = (ro.aviso || semana(p.semana).dificuldades.filter(function (d) { return /ramo padrão/.test(d.situacao); }).map(function (d) { return d.situacao + ': ' + d.orientacao; })[0] || '') + ' Você pode ativar o roteiro trauma-informado desta semana na tela Praticar.';
      }
    }
    ir('inicio');
    aviso(TMP.mensagem || 'Sessão registrada. ' + Math.round(R.minutosHoje(E)) + ' min de prática hoje.');
    if (TMP.mensagem) { var m = TMP.mensagem; TMP.mensagem = null; setTimeout(function () { alert(m); }, 300); }
  }
  function abrirSugestaoRamo() {
    var r = P.nota_desconforto.regras[1], trauma = E.ramo && E.ramo.trauma, sem = passagem().semana;
    $camada.innerHTML = '<div class="tela" role="dialog" aria-modal="true"><div class="in"><span class="selo">Regra de parada</span><h1>Duas sessões encerradas nesta semana</h1>' +
      '<p>' + h(r.situacao) + ': ' + h(r.acao) + '.</p>' +
      (trauma ? (sem > 1 ? '<button class="btn largo" data-acao="voltar-semana">Voltar ao roteiro da Semana ' + (sem - 1) + '</button>' : '<p>Você já está na Semana 1. Fique com as âncoras externas e, se houver acompanhamento, avise o profissional.</p>')
        : '<button class="btn largo" data-acao="sugestao-trauma">Passar para o ramo trauma-informado</button>') +
      '<button class="btn alt largo" style="margin-top:.6rem" data-acao="fechar-ajuda">Agora não</button></div></div>';
  }

  /* ================= registros ================= */
  function opcoesCampo(c) {
    if (c.opcoes) return c.opcoes;
    if (c.opcoes_de === 'frases_desfusao') return P.semanas[3].frases_desfusao.opcoes;
    if (c.opcoes_de === 'dominios_escolhidos') return E.semana7.escolhidos.length ? E.semana7.escolhidos : P.semanas[6].mapa_dominios.dominios;
    return [];
  }
  function formRegistro(def, val, pre, ocultarAuto) {
    val = val || {};
    return def.campos.filter(function (c) { return !(ocultarAuto && c.da_sessao && c.da_sessao !== 'padrao' && c.da_sessao !== 'escolha'); }).map(function (c) {
      var id = pre + '-' + c.id, v = val[c.id], html = '<label class="campo" for="' + id + '">' + h(c.rotulo) + '</label>';
      if (c.tipo === 'escolha') html += '<select id="' + id + '"><option value="">-</option>' + opcoesCampo(c).map(function (o) { return '<option' + (v === o ? ' selected' : '') + '>' + h(o) + '</option>'; }).join('') + '</select>';
      else if (c.tipo === 'numero') html += '<input type="number" inputmode="numeric" min="0" id="' + id + '" value="' + (v === undefined || v === null ? '' : v) + '">';
      else if (c.tipo === 'texto') html += '<input type="text" id="' + id + '" value="' + h(v || '') + '">';
      else if (c.tipo === 'data') html += '<input type="date" id="' + id + '" value="' + h(v || '') + '">';
      else if (c.tipo === 'nota') html += seletorNota(id, typeof v === 'number' ? v : null);
      else if (c.tipo === 'notas3' || c.tipo === 'notas2') {
        var n = c.tipo === 'notas3' ? 3 : 2, rot = n === 3 ? ['antes', 'pico', 'depois'] : ['antes', 'depois'];
        v = v || [];
        html += '<div style="display:grid;grid-template-columns:repeat(' + n + ',1fr);gap:.4rem">' + rot.map(function (r, i) { return '<div><small>' + r + '</small>' + seletorNota(id + '-' + i, typeof v[i] === 'number' ? v[i] : null) + '</div>'; }).join('') + '</div>';
      } else if (c.tipo === 'par_numeros') {
        v = v || [];
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem">' + ['antes', 'depois'].map(function (r, i) { return '<div><small>' + r + '</small><input type="number" inputmode="numeric" id="' + id + '-' + i + '" value="' + (v[i] === undefined || v[i] === null ? '' : v[i]) + '"></div>'; }).join('') + '</div>';
      }
      return html;
    }).join('');
  }
  function lerForm(def, pre) {
    var out = {};
    var num = function (el) { if (!el || el.value === '') return null; var n = parseFloat(el.value); return isNaN(n) ? null : n; };
    def.campos.forEach(function (c) {
      var id = pre + '-' + c.id, el = document.getElementById(id);
      if (c.tipo === 'notas3' || c.tipo === 'notas2' || c.tipo === 'par_numeros') {
        var n = c.tipo === 'notas3' ? 3 : 2, arr = [];
        for (var i = 0; i < n; i++) arr.push(num(document.getElementById(id + '-' + i)));
        out[c.id] = arr;
      } else if (c.tipo === 'numero' || c.tipo === 'nota') out[c.id] = num(el);
      else out[c.id] = el ? el.value.trim() : '';
    });
    return out;
  }
  function prefillRegistro(def) {
    var v = {}, pico = S.picoInformado !== null ? S.picoInformado : picoSugerido();
    def.campos.forEach(function (c) {
      if (c.da_sessao === 'minutos') v[c.id] = Math.round((S.real + (S.continuar ? S.continuar.feitoAntes : 0)) / 60);
      if (c.da_sessao === 'notas3') v[c.id] = [S.antes, pico, S.depois];
      if (c.da_sessao === 'notas2') v[c.id] = [S.antes, S.depois];
      if (c.da_sessao === 'padrao') v[c.id] = S.ro.padrao || S.op.padrao;
      if (c.da_sessao === 'escolha') v[c.id] = S.op.escolha;
      if (c.id === 'ancora' && S.op.ancora) v[c.id] = S.op.ancora;
    });
    return v;
  }
  function completarAuto(def, campos) {
    var auto = prefillRegistro(def);
    def.campos.forEach(function (c) {
      if (c.da_sessao && c.da_sessao !== 'padrao' && c.da_sessao !== 'escolha') campos[c.id] = auto[c.id];
      else if ((campos[c.id] === '' || campos[c.id] === null || campos[c.id] === undefined) && auto[c.id] !== undefined) campos[c.id] = auto[c.id];
    });
    return campos;
  }
  function valorCampo(c, v) {
    if (v === null || v === undefined || v === '') return '-';
    if (Array.isArray(v)) return v.map(function (x) { return x === null ? '-' : x; }).join(' / ');
    return String(v);
  }
  ROTAS.registros = function (arg) {
    var atual = passagem() ? passagem().semana : 1;
    var s = parseInt(arg, 10) || atual, sem = semana(s), def = sem.registro;
    var abas = '<div class="botoes" style="margin-top:0">' + P.semanas.map(function (x) { return '<a class="btn pequeno ' + (x.numero === s ? '' : 'alt') + '" style="flex:0 0 auto" href="#registros/' + x.numero + '">' + x.numero + '</a>'; }).join('') + '</div>';
    var lista = E.registros.filter(function (r) { return r.semana === s; }).sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var edit = TMP.editar ? E.registros.filter(function (r) { return r.id === TMP.editar; })[0] : null;
    var out = '<div class="cartao"><span class="selo">Registros</span><h1>' + h(def.nome) + '</h1><p class="mudo">Semana ' + s + ': ' + h(sem.titulo) + '</p>' + abas + '</div>';
    out += '<div class="cartao"><h2>' + (edit ? 'Editar registro' : 'Novo registro') + '</h2>' + (def.instrucao ? '<p class="mudo">' + h(def.instrucao) + '</p>' : '') +
      '<label class="campo" for="r-dia">Dia</label><select id="r-dia">' + [1, 2, 3, 4, 5, 6, 7].map(function (d) { var sel = edit ? edit.dia === d : (s === atual && R.diaDaSemana(E) === d); return '<option' + (sel ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
      formRegistro(def, edit ? edit.campos : {}, 'r') +
      '<div class="botoes">' + (edit ? '<button class="btn alt" data-acao="cancelar-edicao">Cancelar</button>' : '') + '<button class="btn" data-acao="salvar-registro" data-s="' + s + '">Salvar</button></div></div>';
    out += '<div class="cartao historico"><h2>Histórico (' + lista.length + ')</h2>';
    if (!lista.length) out += '<p class="mudo">Nenhum registro nesta semana ainda.</p>';
    lista.forEach(function (r) {
      out += '<div class="item"><b>Dia ' + h(r.dia) + '</b> · ' + h(R.dataBR(r.data)) + (r.passagem >= 0 && E.passagens[r.passagem] ? ' · semana ' + (r.passagem + 1) + ' do programa' : '') + '<br>' +
        def.campos.map(function (c) { return '<small>' + h(c.rotulo) + ':</small> ' + h(valorCampo(c, r.campos[c.id])); }).join('<br>') +
        '<div class="botoes"><button class="btn pequeno alt" data-acao="editar-registro" data-id="' + r.id + '">Editar</button><button class="btn pequeno alt" data-acao="apagar-registro" data-id="' + r.id + '">Apagar</button></div></div>';
    });
    return out + '</div>';
  };

  /* ================= checagem e conclusão da semana ================= */
  function formChecagem(val) {
    var ch = P.seguranca.checagem;
    val = val || [];
    return '<p>' + h(ch.instrucao) + '</p>' + ch.efeitos.map(function (ef, i) {
      var v = val[i] || {};
      return '<div class="efeito"><p class="nome">' + h(ef.texto) + '</p><div class="marcas">' + ['aconteceu', 'durou', 'atrapalhou'].map(function (k, j) {
        return '<label class="marcar"><input type="checkbox" id="ef-' + i + '-' + k + '"' + (v[k] ? ' checked' : '') + '> <span>' + h(ch.colunas[j]) + '</span></label>';
      }).join('') + '</div></div>';
    }).join('') + '<p class="mudo">' + h(ch.como_usar) + '</p>';
  }
  function lerChecagem() {
    return P.seguranca.checagem.efeitos.map(function (ef, i) {
      var g = function (k) { var el = document.getElementById('ef-' + i + '-' + k); return !!(el && el.checked); };
      return { aconteceu: g('aconteceu') || g('durou') || g('atrapalhou'), durou: g('durou'), atrapalhou: g('atrapalhou') };
    });
  }
  ROTAS.checagem = function () {
    var lista = E.checagens.slice().reverse();
    var out = '<div class="cartao"><span class="selo">Segurança</span><h1>' + h(P.seguranca.checagem.titulo) + '</h1><p>' + h(P.seguranca.texto) + '</p>' +
      '<p>A checagem faz parte da conclusão de cada semana. <a href="#concluir">Concluir a semana</a></p></div>';
    out += '<div class="cartao"><h2>Regras de parada</h2><table class="tabela"><tr><th>Sinal</th><th>Ação</th></tr>' + P.seguranca.regras_parada.map(function (r) { return '<tr><td>' + h(r.sinal) + '</td><td>' + h(r.acao) + '</td></tr>'; }).join('') + '</table></div>';
    out += '<div class="cartao historico"><h2>Checagens feitas</h2>' + (lista.length ? '' : '<p class="mudo">Nenhuma ainda.</p>');
    lista.forEach(function (c) {
      var marc = P.seguranca.checagem.efeitos.map(function (ef, i) { var v = c.efeitos[i]; return v && v.aconteceu ? ef.texto + (v.atrapalhou ? ' (atrapalhou)' : v.durou ? ' (durou mais de 1 dia)' : '') : null; }).filter(Boolean);
      out += '<div class="item"><b>' + h(R.dataBR(c.data)) + '</b> · semana ' + (c.passagem + 1) + ' do programa<br>' + (marc.length ? h(marc.join('; ')) : 'Nenhum efeito marcado.') + '</div>';
    });
    return out + '</div>';
  };

  ROTAS.concluir = function () {
    if (!E.passagens.length || E.fase === 'manutencao') { setTimeout(function () { ir('inicio'); }); return ''; }
    var c = TMP.concluir || (TMP.concluir = { passo: 0, resp: { GAD7: Array(7).fill(null), PHQ9: Array(9).fill(null) } });
    var idx = idxPassagem(), p = passagem(), pr = R.progressoDose(P, E, idx), prox = R.proximaPassagem(P, E);
    var medir = P.avaliacao.semanas_medida.indexOf(p.semana) >= 0 && !E.medidas.some(function (m) { return m.passagem === idx; });
    var out = '<div class="cartao"><span class="selo">' + h(nomeSemanaPrograma(idx)) + '</span><h1>Concluir a semana</h1>';
    if (c.passo === 0) {
      var ses = R.sessoesDaPassagem(E, idx);
      out += '<p>' + pr.cumpridos + ' de ' + pr.alvo + ' dias com pelo menos a dose mínima (' + pr.dose.minimo + ' min). ' + ses.length + ' sessão(ões); ' + R.paradasPorNota(E, idx) + ' encerrada(s) pela regra de parada.</p>' +
        (pr.cumpridos < pr.alvo ? '<div class="aviso">' + h(P.dose.texto) + ' Você pode continuar nesta semana mais alguns dias antes de concluir.</div>' : '');
      if (prox.bloqueio) out += '<div class="aviso"><b>Esta semana continua.</b> ' + h(prox.texto) + '</div>';
      else if (prox.repete) out += '<p>' + h(prox.motivo) + '</p>';
      else if (prox.fim) out += '<p>Esta é a última semana: depois da conclusão começa a manutenção.</p>';
      else out += '<p>Próxima: Semana ' + prox.semana + ', ' + h(semana(prox.semana).titulo) + '.</p>';
      out += '<div class="botoes"><a class="btn alt" href="#inicio">Continuar nesta semana</a><button class="btn" data-acao="concluir-passo" data-p="1">Fazer a checagem</button></div>';
    } else if (c.passo === 1) {
      out += '<h2>' + h(P.seguranca.checagem.titulo) + '</h2>' + formChecagem(c.efeitos) +
        '<div class="botoes"><button class="btn alt" data-acao="concluir-passo" data-p="0">Voltar</button><button class="btn" data-acao="concluir-checagem" data-medir="' + (medir ? 1 : 0) + '">' + (medir ? 'Continuar para GAD-7 e PHQ-9' : 'Concluir a semana') + '</button></div>';
    } else if (c.passo === 2) {
      out += '<p>' + h(P.avaliacao.quando) + '</p><h2>GAD-7</h2>' + questionario('GAD7', c.resp.GAD7) + '<h2>PHQ-9</h2>' + questionario('PHQ9', c.resp.PHQ9) +
        '<p class="mudo" id="faltam-med"></p><div class="botoes"><button class="btn" data-acao="concluir-medidas">Concluir a semana</button></div>';
    }
    return out + '</div>';
  };

  function concluirSemana() {
    var c = TMP.concluir, idx = idxPassagem(), p = passagem(), msgs = [];
    var prox = R.proximaPassagem(P, E);
    var ch = { id: uid(), data: agora(), passagem: idx, semana: p.semana, efeitos: c.efeitos };
    E.checagens.push(ch);
    var av = R.avaliarChecagem(P, c.efeitos);
    if (av.ajuda) { criarAlerta('ideacao', cap(P.seguranca.checagem.regras[1].texto)); msgs.push('ajuda'); }
    if (av.pausar) { criarAlerta('efeito', 'Efeitos que atrapalharam: ' + av.atrapalhou.join('; ') + '. ' + cap(P.seguranca.checagem.regras[0].texto)); }
    if (c.medir) {
      var med = { id: uid(), data: agora(), momento: 'semana' + p.semana, passagem: idx,
        GAD7: { itens: c.resp.GAD7, total: R.soma(c.resp.GAD7) }, PHQ9: { itens: c.resp.PHQ9, total: R.soma(c.resp.PHQ9) } };
      E.medidas.push(med);
      if (R.item9(c.resp.PHQ9)) { criarAlerta('ideacao', regraParada('ideacao').sinal + ': ' + regraParada('ideacao').acao + '.'); msgs.push('ajuda'); }
      var piora = R.pioraConfiavel(P, E, med);
      if (piora.length) criarAlerta('piora', 'Piora confiável em ' + piora.map(function (k) { return k === 'GAD7' ? 'GAD-7' : 'PHQ-9'; }).join(' e ') + '. ' + regraParada('piora').acao + '.');
    }
    p.fim = hoje();
    if (prox.fim) { E.fase = 'manutencao'; E.fimPrograma = hoje(); }
    else E.passagens.push({ semana: prox.semana, inicio: hoje(), fim: null, motivo: prox.motivo });
    TMP.concluir = null;
    E.blocoPendente = null;
    salvar();
    ir('inicio');
    if (msgs.indexOf('ajuda') >= 0) abrirAjuda('checagem');
    else aviso(prox.fim ? 'Programa concluído. Começa a manutenção.' : 'Semana concluída.');
  }

  /* ================= medidas e resultados ================= */
  ROTAS.medida = function () {
    var c = TMP.medida || (TMP.medida = { GAD7: Array(7).fill(null), PHQ9: Array(9).fill(null) });
    return '<div class="cartao"><span class="selo">Acompanhamento</span><h1>GAD-7 e PHQ-9</h1><h2>GAD-7</h2>' + questionario('GAD7', c.GAD7) + '<h2>PHQ-9</h2>' + questionario('PHQ9', c.PHQ9) +
      '<p class="mudo" id="faltam-med"></p><button class="btn largo" data-acao="salvar-medida">Salvar</button></div>';
  };
  function grafico(instr) {
    var pts = E.medidas.filter(function (m) { return m[instr]; });
    if (!pts.length) return '<p class="mudo">Sem medidas ainda.</p>';
    var max = I.instrumentos[instr].maximo, W = 320, H = 170, x0 = 28, y0 = 140, w = W - 40, hh = 120;
    var ini = R.medidaInicial(E);
    var n = pts.length, px = function (i) { return x0 + (n === 1 ? w / 2 : i * w / (n - 1)); }, py = function (v) { return y0 - v / max * hh; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico do ' + instr + '">';
    var cortes = [5, 10, 15].concat(instr === 'PHQ9' ? [20] : []);
    cortes.forEach(function (c) { s += '<line x1="' + x0 + '" x2="' + (x0 + w) + '" y1="' + py(c) + '" y2="' + py(c) + '" stroke="#E8C0C0" stroke-dasharray="3 3"/><text x="4" y="' + (py(c) + 3) + '" font-size="9" fill="#8B4A4A">' + c + '</text>'; });
    s += '<line x1="' + x0 + '" x2="' + (x0 + w) + '" y1="' + y0 + '" y2="' + y0 + '" stroke="#8B4A4A"/><text x="4" y="' + (y0 + 3) + '" font-size="9" fill="#8B4A4A">0</text>';
    s += '<polyline fill="none" stroke="#1A0005" stroke-width="2" points="' + pts.map(function (m, i) { return px(i) + ',' + py(m[instr].total); }).join(' ') + '"/>';
    pts.forEach(function (m, i) {
      var mu = ini && m !== ini && ini[instr] ? R.mudanca(P, instr, ini[instr].total, m[instr].total) : null;
      var cor = mu && mu.tipo === 'piora' ? '#E02C14' : (mu && mu.tipo === 'melhora' ? '#2F6F4F' : '#1A0005');
      s += '<circle cx="' + px(i) + '" cy="' + py(m[instr].total) + '" r="' + (mu && mu.tipo ? 6 : 4) + '" fill="' + cor + '"/>';
      s += '<text x="' + px(i) + '" y="' + (py(m[instr].total) - 9) + '" font-size="10" text-anchor="middle" font-weight="700" fill="' + cor + '">' + m[instr].total + '</text>';
      s += '<text x="' + px(i) + '" y="' + (y0 + 14) + '" font-size="8.5" text-anchor="middle" fill="#4A1414">' + rotuloMomento(m) + '</text>';
    });
    return s + '</svg>';
  }
  function rotuloMomento(m) {
    if (m.momento === 'inicial') return 'Início';
    if (/^semana/.test(m.momento)) return 'Sem. ' + m.momento.replace('semana', '');
    return R.dataBR(m.data).slice(0, 5);
  }
  ROTAS.resultados = function () {
    var ini = R.medidaInicial(E), out = '<div class="cartao"><span class="selo">Como avaliar os resultados</span><h1>GAD-7 e PHQ-9</h1><p>' + h(P.avaliacao.quando) + '</p>' +
      (E.desfecho ? '<p>Desfecho principal: <b>' + (E.desfecho === 'PHQ9' ? 'PHQ-9 (depressão)' : 'GAD-7 (ansiedade)') + '</b>.</p>' : '') + '</div>';
    ['GAD7', 'PHQ9'].forEach(function (k) {
      var nome = I.instrumentos[k].nome;
      out += '<div class="cartao grafico"><h2>' + nome + (E.desfecho === k ? ' · desfecho principal' : '') + '</h2>' + grafico(k) +
        '<div class="legenda"><span><b style="background:#2F6F4F"></b>melhora confiável</span><span><b style="background:#E02C14"></b>piora confiável</span><span>linhas tracejadas: faixas 5, 10, 15' + (k === 'PHQ9' ? ', 20' : '') + '</span></div>' +
        '<table class="tabela"><tr><th>Momento</th><th>Total</th><th>Faixa</th><th>Mudança desde o início</th></tr>';
      E.medidas.filter(function (m) { return m[k]; }).forEach(function (m) {
        var mu = ini && m !== ini && ini[k] ? R.mudanca(P, k, ini[k].total, m[k].total) : null;
        out += '<tr><td>' + h(rotuloMomento(m)) + ' (' + h(R.dataBR(m.data)) + ')</td><td>' + m[k].total + '</td><td>' + h(R.faixa(P, k, m[k].total)) + '</td><td>' +
          (mu ? (mu.delta > 0 ? '+' : '') + mu.delta + (mu.tipo ? ' · <b>' + mu.tipo + ' confiável</b>' : ' · dentro do erro de medida') + (mu.recuperacao ? ' · critério de recuperação' : '') : '-') + '</td></tr>';
      });
      out += '</table><p class="mudo">Mudança confiável: pelo menos ' + P.avaliacao.mudanca_confiavel[k] + ' pontos, nos dois sentidos.</p></div>';
    });
    out += '<div class="cartao"><p class="mudo">' + h(P.avaliacao.mudanca_confiavel.texto) + '</p><p class="mudo">' + h(P.avaliacao.faixas.texto) + '</p><a class="btn alt largo" href="#medida">Responder GAD-7 e PHQ-9 agora</a></div>';
    return out;
  };

  /* ================= ramo ================= */
  ROTAS.ramo = function () {
    if (!E.ramo) return '<div class="cartao"><p>Faça a autotriagem para definir o ramo.</p><a class="btn" href="#triagem">Autotriagem</a></div>';
    var pv = R.podeVoltarPadrao(P, E), out = '<div class="cartao escuro"><span class="selo">Ramo atual</span><h1>' + h(R.ramoNome(P, E.ramo)) + '</h1></div>';
    out += '<div class="cartao"><h2>Mudança de ramo</h2><p>' + h(P.mudanca_de_ramo.texto) + '</p>' +
      '<label class="campo" for="ramo-motivo">Motivo da mudança</label><input type="text" id="ramo-motivo" placeholder="Escreva o motivo">';
    if (!E.ramo.trauma) out += '<button class="btn largo" style="margin-top:.6rem" data-acao="ramo-mudar" data-m="trauma">Passar para o ramo TRAUMA-INFORMADO</button>';
    if (!E.ramo.estendida) out += '<button class="btn alt largo" style="margin-top:.6rem" data-acao="ramo-mudar" data-m="estendida">Acrescentar o ramo ATENÇÃO ESTENDIDA</button>';
    if (E.ramo.trauma || E.ramo.estendida) {
      out += '<h3>Voltar ao ramo PADRÃO</h3>' + (pv.ok ? '<div class="ok">Duas semanas estáveis: a volta é possível.</div>' : '<p class="mudo">' + h(pv.texto) + '</p>') +
        '<label class="marcar"><input type="checkbox" id="ramo-conjunta"> <span>Se tenho acompanhamento, decidi junto com o profissional.</span></label>' +
        '<button class="btn alt largo" data-acao="ramo-mudar" data-m="padrao"' + (pv.ok ? '' : ' disabled') + '>Voltar ao ramo PADRÃO</button>';
    }
    out += '</div><div class="cartao historico"><h2>Histórico</h2>' + E.mudancasRamo.slice().reverse().map(function (m) {
      return '<div class="item"><b>' + h(R.dataBR(m.data)) + '</b>: ' + (m.de ? h(R.ramoNome(P, m.de)) + ' para ' : '') + h(R.ramoNome(P, m.para)) + '<br><small>Motivo: ' + h(m.motivo) + '</small></div>';
    }).join('') + '</div>';
    out += '<div class="cartao"><h3>Os três ramos</h3>' + ['PADRAO', 'TRAUMA', 'ESTENDIDA'].map(function (k) { var r = P.ramos[k]; return '<p><b>' + h(r.nome) + '.</b> ' + h(r.descricao) + ' <small>Indicação: ' + h(r.indicacao) + '.</small></p>'; }).join('') + '<p class="mudo">' + h(P.ramos.combinacao) + '</p></div>';
    return out;
  };
  function mudarRamo(novo, motivo) {
    E.mudancasRamo.push({ data: agora(), de: JSON.parse(JSON.stringify(E.ramo)), para: novo, motivo: motivo });
    E.ramo = novo;
    salvar();
  }

  /* ================= conteúdo da semana ================= */
  ROTAS.semana = function (arg) {
    var n = parseInt(arg, 10) || (passagem() ? passagem().semana : 1), s = semana(n);
    var tipo = E.ramo && E.ramo.trauma ? 'TRAUMA' : 'PADRAO';
    var abas = '<div class="botoes" style="margin-top:0">' + P.semanas.map(function (x) { return '<a class="btn pequeno ' + (x.numero === n ? '' : 'alt') + '" style="flex:0 0 auto" href="#semana/' + x.numero + '">' + x.numero + '</a>'; }).join('') + '</div>';
    var out = '<div class="cartao"><span class="selo">Semana ' + n + '</span><h1>' + h(s.titulo) + '</h1>' + abas + '</div><div class="cartao"><h2>Objetivo</h2><p>' + h(s.objetivo) + '</p>';
    if (s.diferenca) out += '<p>' + h(s.diferenca) + '</p>';
    if (s.pre_requisito) out += '<div class="aviso">' + h(s.pre_requisito.texto) + '</div>';
    if (s.limite) out += '<div class="aviso">' + h(s.limite) + '</div>';
    if (s.padroes) out += '<h3>' + h(s.padroes.titulo) + '</h3><p>' + h(s.padroes.texto) + '</p><p>' + h(s.padroes.devagar_nao_e_fundo) + '</p><p>' + h(s.padroes.qual_escolher) + '</p>';
    ['PADRAO', 'TRAUMA'].forEach(function (k) {
      var ro = s.roteiros[k];
      if (!ro) return;
      if (ro.igual_a) { if (k === tipo || k === 'TRAUMA') out += '<h3>Ramo TRAUMA-INFORMADO</h3><p>' + h(ro.nota || 'Igual ao roteiro acima.') + '</p>'; return; }
      out += '<h3>' + h(ro.titulo) + (k === tipo ? ' · seu ramo' : '') + '</h3>' + (ro.introducao ? '<p>' + h(ro.introducao) + '</p>' : '') + (ro.material ? '<p>' + h(ro.material) + '</p>' : '') +
        '<ol class="lista">' + ro.passos.map(function (p) { return '<li><b>' + h(p.nome) + ' (' + R.mmss(p.duracao_s) + '):</b> ' + h(p.texto || '') + (p.detalhe ? '<br><small>' + h(p.detalhe) + '</small>' : '') + '</li>'; }).join('') + '</ol>' +
        (ro.aviso ? '<p class="mudo">' + h(ro.aviso) + '</p>' : '') + (ro.regra ? '<p class="mudo">' + h(ro.regra.texto) + '</p>' : '') + (ro.notas || []).map(function (t) { return '<p class="mudo">' + h(t) + '</p>'; }).join('');
    });
    if (s.ancoras_por_dia) out += '<h3>' + h(s.ancoras_por_dia.titulo) + '</h3>' + listaTextos(s.ancoras_por_dia.itens.map(function (i) { return i.texto; }));
    if (s.regular_ou_fugir) out += '<h3>' + h(s.regular_ou_fugir.titulo) + '</h3><p>' + h(s.regular_ou_fugir.texto) + '</p><p>' + h(s.regular_ou_fugir.ferramenta) + '</p><p>' + h(s.regular_ou_fugir.fuga) + '</p><p>' + h(s.regular_ou_fugir.depois) + '</p>';
    if (s.frases_desfusao) out += '<h3>' + h(s.frases_desfusao.titulo) + '</h3>' + listaTextos(s.frases_desfusao.itens);
    if (s.postura_mental) out += '<h3>' + h(s.postura_mental.titulo) + '</h3><p>' + h(s.postura_mental.texto) + '</p>';
    if (s.pausa_90s) out += '<h3>' + h(s.pausa_90s.titulo) + '</h3><p>' + h(s.pausa_90s.texto) + '</p><button class="btn alt pequeno" data-acao="pausa90">Cronômetro de 90 segundos</button><p id="p90" class="tempo" style="font-size:1.6rem"></p>';
    if (s.aviso_lembrancas) out += '<div class="aviso">' + h(s.aviso_lembrancas) + '</div>';
    if (s.medida) out += '<p class="mudo">' + h(s.medida) + '</p>';
    if (n === 7) out += '<p><a class="btn alt" href="#semana7">Mapa de Domínios e ação da semana</a></p>';
    if (n === 8) out += '<p><a class="btn alt" href="#semana8">Mapa de Manutenção</a></p>';
    out += '<h3>Prática informal</h3>' + listaTextos(s.pratica_informal) + '<h3>Dificuldades comuns</h3>' + dificuldades(s.dificuldades) +
      '<h3>Quadro-resumo</h3><p><b>Âncora (PADRÃO):</b> ' + h(s.resumo.ancora_padrao) + '. <b>Adaptação TRAUMA-INFORMADO:</b> ' + h(s.resumo.adaptacao_trauma) + '. <b>O que acompanhar:</b> ' + h(s.resumo.acompanhar) + '.</p></div>';
    return out;
  };

  /* ================= Semana 7 ================= */
  ROTAS.semana7 = function () {
    var s = P.semanas[6], md = s.mapa_dominios, v = E.semana7;
    var linhas = md.dominios.map(function (d, i) {
      var x = v.dominios[d] || {};
      return '<tr><td><label class="marcar" style="margin:0"><input type="checkbox" data-acao="dominio" data-d="' + h(d) + '"' + (v.escolhidos.indexOf(d) >= 0 ? ' checked' : '') + '> <span>' + h(d) + '</span></label></td><td>' + seletorNota('imp-' + i, typeof x.imp === 'number' ? x.imp : null) + '</td><td>' + seletorNota('coe-' + i, typeof x.coe === 'number' ? x.coe : null) + '</td></tr>';
    }).join('');
    var dif = md.dominios.map(function (d) { var x = v.dominios[d] || {}; return { d: d, g: (typeof x.imp === 'number' && typeof x.coe === 'number') ? x.imp - x.coe : null, imp: x.imp }; })
      .filter(function (x) { return x.g !== null; }).sort(function (a, b) { return b.g - a.g || b.imp - a.imp; }).slice(0, 3);
    var out = '<div class="cartao"><span class="selo">Semana 7</span><h1>' + h(md.titulo) + '</h1><p>' + h(s.escolha_livre) + '</p><p>' + h(md.texto) + '</p></div>' +
      '<div class="cartao"><table class="tabela"><tr><th>Domínio (marque 1 ou 2)</th><th>' + h(md.colunas[0]) + '</th><th>' + h(md.colunas[1]) + '</th></tr>' + linhas + '</table>' +
      (dif.length ? '<p class="mudo">Maior distância entre importância e coerência nas suas notas: ' + dif.map(function (x) { return h(x.d) + ' (' + x.g + ')'; }).join(', ') + '. A escolha é sua.</p>' : '') +
      '<p>' + h(md.escolha.split('. Para aprofundar')[0]) + '.</p><p class="mudo">Para aprofundar: <a href="' + md.link_valores + '">Inventário de Valores Pessoais</a>, gratuito e com dados salvos só no seu dispositivo.</p>' +
      '<h2>Ação comprometida da semana</h2><p>' + h(s.roteiros.PADRAO.passos[3].texto) + '</p><input type="text" id="s7-acao" value="' + h(v.acao) + '">' +
      s.criterios_acao.map(function (c) { return '<label class="marcar"><input type="checkbox" data-crit="' + h(c) + '"' + (v.criterios.indexOf(c) >= 0 ? ' checked' : '') + '> <span>' + h(c) + '</span></label>'; }).join('') +
      '<button class="btn largo" data-acao="salvar-s7">Salvar</button></div>';
    out += '<div class="cartao"><h2>' + h(s.personalidade.titulo) + '</h2><p>' + h(s.personalidade.texto) + '</p>' +
      '<a class="btn alt" href="' + s.personalidade.link + '" target="_blank" rel="noopener">Abrir o Inventário de Personalidade (opcional)</a>' +
      '<table class="tabela"><tr><th>Fator</th><th>Se estiver alto</th><th>Se estiver baixo</th></tr>' + s.personalidade.fatores.map(function (f) { return '<tr><td>' + h(f.fator) + '</td><td>' + h(f.alto) + '</td><td>' + h(f.baixo) + '</td></tr>'; }).join('') + '</table></div>';
    out += '<div class="cartao"><h3>Dificuldades comuns</h3>' + dificuldades(s.dificuldades) + '</div>';
    return out;
  };

  /* ================= Semana 8 ================= */
  ROTAS.semana8 = function () {
    var s = P.semanas[7], mm = s.mapa_manutencao, m = E.manutencao;
    var out = '<div class="cartao"><span class="selo">Semana 8</span><h1>' + h(mm.titulo) + '</h1><ol class="lista">' + mm.passos.map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ol></div>';
    out += '<div class="cartao"><h2>Minha escolha</h2>' + mm.campos.map(function (c) {
      var v = (m.campos || {})[c.id] || '';
      return '<label class="campo" for="mm-' + c.id + '">' + h(c.rotulo) + '</label><input type="' + (c.tipo === 'data' ? 'date' : 'text') + '" id="mm-' + c.id + '" value="' + h(v) + '"' + (c.sugestao ? ' placeholder="' + h(c.sugestao) + '"' : '') + '>';
    }).join('') + '<button class="btn largo" style="margin-top:1rem" data-acao="salvar-s8">Salvar o Mapa de Manutenção</button></div>';
    out += '<div class="cartao"><h2>Lembretes nos 3 momentos do dia</h2><p>' + h(mm.passos[3]) + '</p><p class="mudo">O aplicativo não usa servidor, por isso os lembretes vão para a agenda do seu celular: o arquivo cria três lembretes diários, que você pode apagar quando quiser.</p>' +
      [0, 1, 2].map(function (i) { return '<label class="campo" for="lem-' + i + '">Momento ' + (i + 1) + (m.campos && m.campos['momento' + (i + 1)] ? ': ' + h(m.campos['momento' + (i + 1)]) : '') + '</label><input type="time" id="lem-' + i + '" value="' + h(m.lembretes[i] || '') + '">'; }).join('') +
      '<button class="btn largo" style="margin-top:1rem" data-acao="lembretes">Adicionar os lembretes à agenda</button></div>';
    out += '<div class="cartao"><h2>Regra de retomada</h2><p>' + h(s.regra_retomada.texto) + '</p><h3>Prática informal</h3>' + listaTextos(s.pratica_informal) + '<h3>Dificuldades comuns</h3>' + dificuldades(s.dificuldades) + '</div>';
    return out;
  };
  function arquivoLembretes() {
    var m = E.manutencao, linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mindfulness-IBE//PT-BR', 'CALSCALE:GREGORIAN'];
    var d = hoje().replace(/-/g, ''), carimbo = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    m.lembretes.forEach(function (hora, i) {
      if (!hora) return;
      var nome = (m.campos && m.campos['momento' + (i + 1)]) || ['ao acordar', 'antes do almoço', 'ao chegar em casa'][i];
      var pd = (m.campos && m.campos.pratica_diaria) || 'prática diária';
      linhas.push('BEGIN:VEVENT', 'UID:mindfulness-ibe-' + d + '-' + i + '@pedroruger.com.br', 'DTSTAMP:' + carimbo,
        'DTSTART:' + d + 'T' + hora.replace(':', '') + '00', 'DURATION:PT5M', 'RRULE:FREQ=DAILY',
        'SUMMARY:Mindfulness: ' + nome, 'DESCRIPTION:Momento ' + (i + 1) + ' do Mapa de Manutenção. ' + pd.replace(/[,;]/g, ' '),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Mindfulness: ' + nome, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    });
    linhas.push('END:VCALENDAR');
    return linhas.join('\r\n');
  }

  /* ================= respiração ================= */
  ROTAS.respiracao = function () {
    var rest = R.restricoes(E), p = passagem();
    var semanaProt = p ? p.semana : 0;
    var pd = P.semanas[1].padroes;
    var out = '<div class="cartao"><span class="selo">Guia visual de respiração</span><h1>Respiração lenta, sem prender o ar</h1><p>' + h(pd.texto) + '</p><p class="mudo">' + h(pd.devagar_nao_e_fundo) + '</p></div>';
    if (rest.semRespiracao) return out + '<div class="alerta"><h3>Respiração ritmada suspensa</h3><p>' + h(regraParada('panico_respiracao').acao) + '.</p></div>';
    if (E.fase !== 'manutencao' && semanaProt < 2) return out + '<div class="aviso">Na Semana 1: ' + h(P.semanas[0].pratica_informal[2]) + ' O guia de respiração fica disponível a partir da Semana 2.</div>';
    var o = TMP.resp || { padrao: E.ramo && E.ramo.trauma ? '4-6' : '4-6', dur: '6c' };
    TMP.resp = o;
    out += '<div class="cartao" style="text-align:center"><div id="guia-livre"><div class="guia"><div class="aro"></div><div class="bola"></div><div class="rot"><span>Pronto</span></div></div></div>' +
      '<div style="text-align:left"><label class="campo" for="rp-padrao">Padrão</label><select id="rp-padrao">' + pd.lista.map(function (x) { return '<option value="' + x.id + '"' + (o.padrao === x.id ? ' selected' : '') + '>' + x.id + ': ' + h(x.quando) + '</option>'; }).join('') + '</select>' +
      '<label class="campo" for="rp-dur">Duração</label><select id="rp-dur">' +
      [['3c', '3 ciclos (cerca de 30 segundos)'], ['6c', 'Minipausa: 6 ciclos (60 segundos)'], ['3m', '3 minutos'], ['8m', '8 minutos'], ['10m', '10 minutos'], ['livre', 'Sem limite']].map(function (x) { return '<option value="' + x[0] + '"' + (o.dur === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
      '<label class="marcar"><input type="checkbox" id="rp-som"' + (E.config.somRitmo ? ' checked' : '') + '> <span>Som suave marcando o ritmo (como um metrônomo)</span></label></div>' +
      '<div class="botoes"><button class="btn" data-acao="resp-iniciar">Começar</button><button class="btn alt" data-acao="resp-parar">Parar</button></div></div>' +
      '<div class="cartao"><h3>' + h(P.semanas[1].regular_ou_fugir.titulo) + '</h3><p>' + h(P.semanas[1].regular_ou_fugir.ferramenta) + '</p><p>' + h(P.semanas[1].regular_ou_fugir.fuga) + '</p><p class="mudo">' + h(P.semanas[1].regular_ou_fugir.depois) + '</p>' +
      '<h3>Prática informal</h3>' + listaTextos(P.semanas[1].pratica_informal) + '<h3>Dificuldades comuns</h3>' + dificuldades(P.semanas[1].dificuldades.slice(0, 4)) + '</div>';
    return out;
  };
  var guiaLivre = null, guiaFim = null;
  function pararGuiaLivre() { if (guiaLivre) guiaLivre.parar(); guiaLivre = null; if (guiaFim) clearTimeout(guiaFim); guiaFim = null; }
  window.addEventListener('hashchange', pararGuiaLivre);

  /* ================= prática livre (manutenção e retomada) ================= */
  function sessaoLivre(minutos, rotulo, guia) {
    var ro = { semana: 0, semanaRoteiro: 0, tipo: 'LIVRE', titulo: rotulo, introducao: '', material: '', aviso: '', notas: [], avisos: [],
      padrao: guia ? '4-6' : null, total_s: minutos * 60,
      passos: [{ id: 'livre', nome: rotulo, duracao_s: minutos * 60, texto: 'Prática de ' + minutos + ' min. Quando perceber que se distraiu, note e volte com gentileza.', guia_respiracao: guia ? 'sim' : null }] };
    iniciarSessao(ro, { semana: 0, dia: 7 }, { livre: true, passagem: -1, semBlocos: true });
  }

  /* ================= dados, exportação e relatório ================= */
  ROTAS.dados = function () {
    return '<div class="cartao"><span class="selo">Seus dados</span><h1>Cópia de segurança e relatório</h1><p>Tudo o que você registra fica só neste aparelho, no armazenamento do navegador. Ninguém mais tem acesso, nem o autor do manual. Se você apagar os dados do navegador ou trocar de celular, os registros se perdem: exporte uma cópia de vez em quando.</p></div>' +
      '<div class="cartao"><h2>Relatório em PDF para o profissional</h2><label class="campo" for="pdf-nome">Nome no relatório (opcional, não fica guardado)</label><input type="text" id="pdf-nome">' +
      '<label class="marcar"><input type="checkbox" id="pdf-reg" checked> <span>Incluir os textos dos registros e diários</span></label>' +
      '<button class="btn largo" data-acao="pdf">Gerar o relatório em PDF</button></div>' +
      '<div class="cartao"><h2>Cópia de segurança (arquivo JSON)</h2><button class="btn alt largo" data-acao="exportar">Exportar a cópia</button>' +
      '<label class="campo" for="importar">Importar uma cópia (substitui os dados atuais)</label><input type="file" id="importar" accept="application/json,.json" data-acao-mudar="importar"></div>' +
      '<div class="cartao"><h2>Instalar no celular</h2>' + (instalar ? '<button class="btn alt largo" data-acao="instalar">Instalar o aplicativo</button>' : '<p class="mudo">No Android, use o menu do navegador e escolha "Instalar aplicativo" ou "Adicionar à tela inicial". No iPhone, toque em Compartilhar e depois em "Adicionar à Tela de Início". Depois de aberto uma vez, o aplicativo funciona sem internet.</p>') + '</div>' +
      '<div class="cartao"><h2>Apagar tudo</h2><p class="mudo">Remove todos os registros deste aparelho. Não pode ser desfeito.</p><button class="btn alt largo" data-acao="apagar-tudo">Apagar todos os dados</button></div>';
  };
  function exportar() {
    var nome = 'mindfulness-ibe-copia-' + hoje() + '.json';
    baixar(nome, JSON.stringify(E, null, 2), 'application/json');
  }
  function importar(arquivo) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var obj = JSON.parse(fr.result);
        if (!obj || obj.app !== 'mindfulness-ibe' || !Array.isArray(obj.sessoes)) throw new Error('arquivo');
        if (!confirm('Substituir os dados deste aparelho pela cópia de ' + R.dataBR(obj.atualizadoEm || obj.criadoEm) + '?')) return;
        var base = estadoNovo();
        Object.keys(base).forEach(function (k) { if (obj[k] === undefined) obj[k] = base[k]; });
        E = obj; salvar().then(function () { aviso('Cópia importada.'); ir('inicio'); });
      } catch (e) { alert('Este arquivo não é uma cópia válida do aplicativo.'); }
    };
    fr.readAsText(arquivo);
  }

  function relatorio(nome, comRegistros) {
    var d = PDF.novo();
    d.paragrafo('Protocolo Mindfulness-IBE v' + P.versao_protocolo + ': relatório da prática domiciliar', { tam: 16, negrito: true, cor: '#1A0005', depois: 2 });
    d.paragrafo((nome ? nome + ' · ' : '') + 'Gerado em ' + R.dataBR(hoje()) + ' pelo aplicativo do protocolo, com dados guardados no aparelho da pessoa.', { tam: 9, cor: '#8B4A4A', depois: 6 });
    d.linha('#92000A');
    d.titulo('Situação');
    d.paragrafo('Termo de ciência aceito em ' + R.dataBR(E.termo && E.termo.data) + '. Ramo atual: ' + R.ramoNome(P, E.ramo) + '. Desfecho principal: ' + (E.desfecho === 'PHQ9' ? 'PHQ-9' : 'GAD-7') + '.');
    if (E.passagens.length) d.paragrafo('Início do programa: ' + R.dataBR(E.passagens[0].inicio) + '. ' + (E.fase === 'manutencao' ? 'Programa concluído em ' + R.dataBR(E.fimPrograma) + '; fase de manutenção.' : 'Em andamento: ' + nomeSemanaPrograma(idxPassagem()) + '.'));
    var at = R.alertasAtivos(E);
    d.paragrafo('Alertas ativos: ' + (at.length ? at.map(function (a) { return (TEXTO_ALERTA[a.codigo] || {}).titulo + ' (desde ' + R.dataBR(a.data) + ')'; }).join('; ') : 'nenhum') + '.');
    var res = (E.alertas || []).filter(function (a) { return a.resolvido; });
    if (res.length) d.paragrafo('Alertas resolvidos: ' + res.map(function (a) { return (TEXTO_ALERTA[a.codigo] || {}).titulo + ' (' + R.dataBR(a.data) + ' a ' + R.dataBR(a.dataResolvido) + ')'; }).join('; ') + '.', { tam: 9 });

    if (E.triagem) {
      d.titulo('Autotriagem (' + R.dataBR(E.triagem.data) + ')');
      var rt = R.avaliarTriagem(P, E.triagem.respostas), t = rt.totais;
      d.tabela(['Questionário', 'Pontuação'], [['PHQ-9', t.PHQ9], ['GAD-7', t.GAD7], ['PHQ-15', t.PHQ15], ['PCL-5', t.PCL5], ['DES-II', t.DES2], ['ASRS-1.1 parte A', t.ASRS_A], ['ACE (contagem)', t.ACE]].map(function (l) { return [l[0], l[1] === null ? 'não respondido' : String(l[1])]; }), [0.6, 0.4]);
      d.paragrafo('Passo 1: ' + (rt.alertas.length ? P.triagem.passo1.sinais.filter(function (s) { return rt.alertas.indexOf(s.id) >= 0; }).map(function (s) { return s.sinal + ' (' + s.acao + ')'; }).join('; ') : 'nenhum sinal.'));
      d.paragrafo('Passo 2: ramo sugerido ' + R.ramoNome(P, rt.ramo) + (rt.criteriosTrauma.concat(rt.criteriosEstendida).length ? ' (' + rt.criteriosTrauma.concat(rt.criteriosEstendida).join('; ') + ')' : '') + '.');
      var perg = Object.keys(E.triagem.respostas.perguntas || {}).filter(function (k) { return E.triagem.respostas.perguntas[k] === true; });
      if (perg.length) d.paragrafo('Respostas "sim": ' + perg.map(function (k) { return I.perguntas[k]; }).join(' '), { tam: 9 });
    }
    if (E.mudancasRamo.length) {
      d.titulo('Ramo: histórico');
      d.tabela(['Data', 'Mudança', 'Motivo'], E.mudancasRamo.map(function (m) { return [R.dataBR(m.data), (m.de ? R.ramoNome(P, m.de) + ' para ' : '') + R.ramoNome(P, m.para), m.motivo]; }), [0.16, 0.42, 0.42]);
    }
    if (E.passagens.length) {
      d.titulo('Prática por semana');
      d.tabela(['Semana', 'Datas', 'Dias com dose mínima', 'Sessões', 'Desconforto médio antes / depois', 'Pico máx.', 'Paradas'], E.passagens.map(function (p, i) {
        var ses = R.sessoesDaPassagem(E, i), pr = R.progressoDose(P, E, i);
        var med = function (k) { var v = ses.map(function (s) { return s[k]; }).filter(function (x) { return typeof x === 'number'; }); return v.length ? (R.soma(v) / v.length).toFixed(1) : '-'; };
        var mx = R.picoMaximo(ses);
        return [(i + 1) + ' (prot. ' + p.semana + ')', R.dataBR(p.inicio) + (p.fim ? ' a ' + R.dataBR(p.fim) : ''), pr.cumpridos + ' de ' + pr.alvo, String(ses.length), med('antes') + ' / ' + med('depois'), mx === null ? '-' : String(mx),
          String(ses.filter(function (s) { return s.encerramento && s.encerramento !== 'manual'; }).length)];
      }), [0.13, 0.2, 0.14, 0.1, 0.19, 0.1, 0.14]);
      var paradas = E.sessoes.filter(function (s) { return s.encerramento; });
      if (paradas.length) {
        var nomes = { pico: 'pico de 7 ou mais', subida: 'nota depois 3 pontos acima da nota antes', estranheza: 'estranheza de si ou do ambiente', lembrancas: 'lembranças traumáticas invasivas', panico: 'pânico ligado à respiração', manual: 'parada pela pessoa' };
        d.paragrafo('Sessões encerradas: ' + paradas.map(function (s) { return R.dataBR(s.data) + ', semana ' + s.semana + ': ' + nomes[s.encerramento]; }).join('; ') + '.', { tam: 9 });
      }
    }
    if (E.checagens.length) {
      d.titulo('Checagem semanal dos efeitos indesejados');
      d.tabela(['Data', 'Efeitos marcados'], E.checagens.map(function (c) {
        var m = P.seguranca.checagem.efeitos.map(function (ef, i) { var v = c.efeitos[i]; return v && v.aconteceu ? ef.texto + (v.durou ? ', durou mais de 1 dia' : '') + (v.atrapalhou ? ', atrapalhou a rotina' : '') : null; }).filter(Boolean);
        return [R.dataBR(c.data), m.length ? m.join('; ') : 'nenhum'];
      }), [0.18, 0.82]);
    }
    if (E.medidas.length) {
      d.titulo('GAD-7 e PHQ-9');
      var ini = R.medidaInicial(E);
      d.tabela(['Momento', 'GAD-7', 'PHQ-9', 'Mudança desde o início'], E.medidas.map(function (m) {
        var g = ini && m !== ini ? R.mudanca(P, 'GAD7', ini.GAD7.total, m.GAD7.total) : null, ph = ini && m !== ini ? R.mudanca(P, 'PHQ9', ini.PHQ9.total, m.PHQ9.total) : null;
        var txt = function (n, mu) { return mu ? n + ' ' + (mu.delta > 0 ? '+' : '') + mu.delta + (mu.tipo ? ' (' + mu.tipo + ' confiável' + (mu.recuperacao ? ', recuperação' : '') + ')' : '') : ''; };
        return [rotuloMomento(m) + ' ' + R.dataBR(m.data), m.GAD7.total + ' (' + R.faixa(P, 'GAD7', m.GAD7.total) + ')', m.PHQ9.total + ' (' + R.faixa(P, 'PHQ9', m.PHQ9.total) + ')' + (R.item9(m.PHQ9.itens) ? ' item 9 > 0' : ''), [txt('GAD-7', g), txt('PHQ-9', ph)].filter(Boolean).join('; ') || '-'];
      }), [0.24, 0.2, 0.24, 0.32]);
      ['GAD7', 'PHQ9'].forEach(function (k) {
        var pts = E.medidas.map(function (m) { var mu = ini && m !== ini ? R.mudanca(P, k, ini[k].total, m[k].total) : null; return { rotulo: rotuloMomento(m), valor: m[k].total, marca: mu && mu.tipo }; });
        d.grafico(I.instrumentos[k].nome + (E.desfecho === k ? ' (desfecho principal)' : ''), pts, I.instrumentos[k].maximo, [5, 10, 15].concat(k === 'PHQ9' ? [20] : []));
      });
      d.paragrafo('Mudança confiável: ' + P.avaliacao.mudanca_confiavel.GAD7 + ' pontos no GAD-7 e ' + P.avaliacao.mudanca_confiavel.PHQ9 + ' no PHQ-9, nos dois sentidos (NHS Talking Therapies).', { tam: 8.5, cor: '#8B4A4A' });
    }
    if (E.semana7.escolhidos.length || E.semana7.acao) {
      d.titulo('Semana 7: valores');
      d.paragrafo('Domínios escolhidos: ' + (E.semana7.escolhidos.map(function (x) { var v = E.semana7.dominios[x] || {}; return x + ' (importância ' + (v.imp === undefined ? '-' : v.imp) + ', coerência ' + (v.coe === undefined ? '-' : v.coe) + ')'; }).join('; ') || '-') + '. Ação comprometida: ' + (E.semana7.acao || '-') + '.');
    }
    var mc = E.manutencao.campos || {};
    if (Object.keys(mc).some(function (k) { return mc[k]; })) {
      d.titulo('Mapa de Manutenção');
      d.tabela(['Item', 'Escolha'], P.semanas[7].mapa_manutencao.campos.map(function (c) { return [c.rotulo, c.tipo === 'data' ? R.dataBR(mc[c.id]) : (mc[c.id] || '-')]; }), [0.45, 0.55]);
    }
    if (comRegistros && E.registros.length) {
      d.titulo('Registros e diários');
      P.semanas.forEach(function (s) {
        var lista = E.registros.filter(function (r) { return r.semana === s.numero; });
        if (!lista.length) return;
        d.paragrafo(s.registro.nome + ' (Semana ' + s.numero + ')', { tam: 10, negrito: true, depois: 1 });
        d.tabela(['Dia', 'Data'].concat(s.registro.campos.map(function (c) { return c.rotulo; })), lista.map(function (r) {
          return [String(r.dia), R.dataBR(r.data)].concat(s.registro.campos.map(function (c) { return valorCampo(c, r.campos[c.id]); }));
        }), (function () { var n = s.registro.campos.length, f = [0.06, 0.12], resto = 0.82 / n; for (var i = 0; i < n; i++) f.push(resto); return f; })(), { tam: 7.5 });
      });
    }
    d.titulo('Observação');
    d.paragrafo('Os questionários da autotriagem não fazem diagnóstico. A nota de desconforto é a escala SUDS, usada como guia prático, não como teste validado. ' + P.limites.nao_substitui, { tam: 8.5, cor: '#4A1414' });
    d.rodape('Protocolo Mindfulness-IBE v' + P.versao_protocolo + ' · pedroruger.com.br/mindfulness-protocolo.html');
    var b = d.bytes();
    baixar('mindfulness-ibe-relatorio-' + hoje() + '.pdf', new Blob([b], { type: 'application/pdf' }));
  }

  /* ================= mais ================= */
  ROTAS.mais = function () {
    var itens = [['ramo', 'Ramo', R.ramoNome(P, E.ramo)], ['resultados', 'Resultados', 'GAD-7 e PHQ-9'], ['checagem', 'Segurança', 'checagem e regras de parada'],
      ['triagem/resultado', 'Autotriagem', E.triagem ? R.dataBR(E.triagem.data) : 'não feita'], ['semana', 'Conteúdo das semanas', ''], ['semana7', 'Semana 7', 'Mapa de Domínios'],
      ['semana8', 'Semana 8', 'Mapa de Manutenção e lembretes'], ['dados', 'Dados e relatório', 'PDF, cópia, instalar'], ['sobre', 'Sobre e termo', '']];
    return '<div class="cartao"><h1>Mais</h1><div class="menu-lista">' + itens.map(function (i) { return '<a href="#' + i[0] + '">' + h(i[1]) + '<span>' + h(i[2]) + '</span></a>'; }).join('') + '</div></div>' +
      '<div class="cartao"><a class="fone" href="tel:188"><span>CVV, 24 horas</span><b>188</b></a><a class="fone" href="tel:192"><span>SAMU</span><b>192</b></a></div>';
  };
  ROTAS.sobre = function () {
    var t = P.termo;
    return '<div class="cartao"><span class="selo">Sobre</span><h1>' + h(P.titulo) + '</h1><p>' + h(P.autor) + '.</p><p>' + h(P.limites.texto) + '</p><p>' + h(P.limites.nao_substitui) + '</p>' +
      '<p>Este aplicativo segue a versão ' + h(P.versao_protocolo) + ' do manual. <a href="/mindfulness-protocolo.html">Ler o manual completo</a>.</p>' +
      '<p class="mudo">Sem servidor, sem cadastro, sem rastreamento. Os dados ficam só neste aparelho.</p></div>' +
      '<div class="cartao"><h2>' + h(t.titulo) + '</h2><p>' + h(t.abertura) + '</p><ol class="lista" type="a">' + t.itens.map(function (i) { return '<li>' + h(i) + '</li>'; }).join('') + '</ol>' +
      '<p class="mudo">Aceito em ' + h(R.dataBR(E.termo && E.termo.data)) + '.</p></div>' +
      '<div class="cartao"><h3>Questionários</h3><p class="mudo">' + h(I.observacao) + '</p></div>';
  };

  /* ================= ações ================= */
  var ACOES = {};
  ACOES['aceitar-termo'] = function () {
    if (!document.getElementById('aceite').checked) { alert('Marque "Li e estou ciente" para continuar.'); return; }
    E.termo = { aceito: true, data: agora(), versao: P.versao_protocolo };
    salvar(); ir('inicio');
  };
  ACOES['triagem-avancar'] = function () {
    var rs = rascunho(), passo = PASSOS_TRIAGEM[rs.passo];
    if (passo === 'licenciados') {
      ['DES2', 'ASRS_A', 'ACE'].forEach(function (k) {
        var el = document.getElementById('in-' + k), q = I.instrumentos[k];
        var v = el && el.value !== '' ? parseFloat(el.value) : null;
        if (v !== null && (isNaN(v) || v < q.entrada.min || v > q.entrada.max)) v = null;
        rs.respostas[k] = v;
      });
    }
    rs.passo = Math.min(rs.passo + 1, PASSOS_TRIAGEM.length - 1);
    salvar(); render(); topo();
  };
  ACOES['triagem-voltar'] = function () { var rs = rascunho(); rs.passo = Math.max(0, rs.passo - 1); salvar(); render(); topo(); };
  ACOES['pular-pcl5'] = function (el) { rascunho().respostas.pularPCL5 = el.checked; salvar(); render(); };
  ACOES.resp = function (el) {
    var q = el.dataset.q, i = +el.dataset.i, v = +el.dataset.v, alvo;
    if (location.hash.indexOf('#concluir') === 0) alvo = TMP.concluir.resp;
    else if (location.hash.indexOf('#medida') === 0) alvo = TMP.medida;
    else alvo = rascunho().respostas;
    alvo[q][i] = v;
    document.querySelectorAll('[data-acao="resp"][data-q="' + q + '"][data-i="' + i + '"]').forEach(function (b) { b.classList.toggle('sel', b === el); });
    if (q === 'PHQ9' && i === 8 && v !== 0) {
      criarAlerta('ideacao', regraParada('ideacao').sinal + ': ' + regraParada('ideacao').acao + '.');
      abrirAjuda('triagem');
    }
    salvar();
    faltam(); faltamMed();
  };
  function faltamMed() {
    var el = document.getElementById('faltam-med');
    if (!el) return;
    var alvo = location.hash.indexOf('#concluir') === 0 ? TMP.concluir.resp : TMP.medida;
    var n = alvo.GAD7.concat(alvo.PHQ9).filter(function (v) { return v === null; }).length;
    el.textContent = n ? 'Faltam ' + n + ' item(ns).' : 'Todos os itens respondidos.';
  }
  ACOES.simnao = function (el) {
    var id = el.dataset.id, v = el.dataset.v === '1';
    if (S && id === 'sustentou') { S.sustentou = v; }
    else { rascunho().respostas.perguntas[id] = v; salvar(); }
    document.querySelectorAll('[data-acao="simnao"][data-id="' + id + '"]').forEach(function (b) { b.classList.toggle('sel', b === el); });
    var bt = document.querySelector('[data-acao="triagem-avancar"]');
    if (bt && !S) {
      var all = Array.prototype.every.call(document.querySelectorAll('.questao'), function (qq) { return qq.querySelector('.opcao.sel'); });
      bt.disabled = !all;
    }
  };
  ACOES['salvar-triagem'] = function () {
    var rs = rascunho(), resp = rs.respostas, res = R.avaliarTriagem(P, resp);
    if (resp.pularPCL5) resp.PCL5 = null;
    var ramo = { trauma: res.ramo.trauma || document.getElementById('r-trauma').checked, estendida: res.ramo.estendida || document.getElementById('r-estendida').checked };
    E.desfecho = document.getElementById('desfecho').value;
    E.triagem = { data: agora(), respostas: resp, resultado: res, ramoEscolhido: ramo };
    var motivo = 'Autotriagem' + (res.criteriosTrauma.concat(res.criteriosEstendida).length ? ': ' + res.criteriosTrauma.concat(res.criteriosEstendida).join('; ') : ': nenhum critério dos ramos especiais');
    if (ramo.trauma !== res.ramo.trauma || ramo.estendida !== res.ramo.estendida) motivo += '; ramo mais cuidadoso escolhido pela pessoa';
    E.mudancasRamo.push({ data: agora(), de: null, para: ramo, motivo: motivo });
    E.ramo = ramo;
    E.medidas = E.medidas.filter(function (m) { return m.momento !== 'inicial'; });
    E.medidas.unshift({ id: uid(), data: agora(), momento: 'inicial', passagem: -1, GAD7: { itens: resp.GAD7, total: R.soma(resp.GAD7) }, PHQ9: { itens: resp.PHQ9, total: R.soma(resp.PHQ9) } });
    var outros = res.alertas.filter(function (a) { return a !== 'ideacao'; });
    if (outros.length) criarAlerta('triagem', P.triagem.passo1.sinais.filter(function (s) { return outros.indexOf(s.id) >= 0; }).map(function (s) { return s.sinal + ': ' + s.acao; }).join('. ') + '.');
    var jaConfirmou = E.acompanhamento && E.acompanhamento.confirmado && E.acompanhamento.data.slice(0, 10) === hoje() && E.alertas.some(function (x) { return x.codigo === 'ideacao' && x.resolvido && x.dataResolvido.slice(0, 10) === hoje(); });
    if (res.alertas.indexOf('ideacao') >= 0 && !jaConfirmou) criarAlerta('ideacao', regraParada('ideacao').sinal + ': ' + regraParada('ideacao').acao + '.');
    delete E.triagemRascunho; TMP.ramoEscolhido = null;
    salvar(); ir('inicio');
    if (res.urgente && R.bloqueios(E).some(function (a) { return a.codigo === 'ideacao'; })) abrirAjuda('inicio');
  };
  ACOES['refazer-triagem'] = function () { if (!confirm('Refazer a autotriagem? As respostas anteriores serão substituídas.')) return; E.triagem = null; delete E.triagemRascunho; salvar(); ir('triagem'); };
  ACOES['iniciar-programa'] = function () {
    if (R.bloqueios(E).length) return;
    E.passagens.push({ semana: 1, inicio: hoje(), fim: null, motivo: 'Início do programa' });
    E.fase = 'programa';
    salvar(); ir('inicio');
  };
  ACOES.ajuda = function () { abrirAjuda('inicio'); };
  ACOES['fechar-ajuda'] = function () { fecharCamada(); };
  ACOES['confirmar-acomp'] = function () {
    if (!document.getElementById('conf-acomp').checked) { alert('Marque a confirmação para liberar as práticas.'); return; }
    E.acompanhamento = { confirmado: true, data: agora() };
    E.alertas.forEach(function (a) { if (!a.resolvido && (a.codigo === 'ideacao' || a.codigo === 'triagem')) { a.resolvido = true; a.dataResolvido = agora(); } });
    salvar(); fecharCamada(); render();
  };
  ACOES.resolver = function (el) {
    var a = E.alertas.filter(function (x) { return x.id === el.dataset.id; })[0];
    var cb = document.getElementById('conf-' + el.dataset.id);
    if (!cb || !cb.checked) { alert('Marque a confirmação primeiro.'); return; }
    a.resolvido = true; a.dataResolvido = agora();
    if (a.codigo === 'ideacao' || a.codigo === 'triagem') E.acompanhamento = { confirmado: true, data: agora() };
    salvar(); render();
  };
  ACOES.op = function () { lerOpcoesSessao(); salvar(); render(); };
  ACOES['usar-trauma'] = function (el) { passagem().usarRoteiroTrauma = el.checked; salvar(); render(); };
  ACOES['comecar-sessao'] = function () {
    lerOpcoesSessao();
    var pv = TMP.roPrevia, p = passagem();
    var ro = R.montarRoteiro(P, E, { semana: p.semana, dia: pv.dia, padrao: TMP.op.padrao || pv.op.padrao, curta: TMP.op.curta, ancora: TMP.op.ancora, escolha: TMP.op.escolha || (p.semana === 8 ? P.semanas[7].roteiros.PADRAO.passos[1].escolha[0] : undefined) });
    var op = { semana: p.semana, dia: pv.dia, padrao: TMP.op.padrao || pv.op.padrao, ancora: TMP.op.ancora || (ro.semanaRoteiro === 1 ? (R.ancoraDoDia(P, pv.dia) || {}).ancora : undefined), escolha: TMP.op.escolha || (p.semana === 8 ? P.semanas[7].roteiros.PADRAO.passos[1].escolha[0] : undefined) };
    if (op.ancora === 'a que trouxe mais estabilidade') op.ancora = 'som';
    iniciarSessao(ro, op);
  };
  ACOES['continuar-bloco'] = function () {
    var bp = E.blocoPendente, p = passagem();
    var ro = R.montarRoteiro(P, E, bp.op);
    TMP.op = bp.opcoes || TMP.op;
    iniciarSessao(ro, bp.op, { continuar: bp });
  };
  ACOES.livre = function (el) {
    var min = el.dataset.min ? parseInt(el.dataset.min, 10) : parseInt((document.getElementById('livre-min') || {}).value || '5', 10);
    var guia = !!(document.getElementById('livre-guia') && document.getElementById('livre-guia').checked && !el.dataset.min);
    sessaoLivre(min, el.dataset.rotulo || 'Prática', guia);
  };
  ACOES['roteiro-semana'] = function (el) {
    var s = parseInt(el.dataset.s || (document.getElementById('roteiro-s') || {}).value || '1', 10);
    var ro = R.montarRoteiro(P, E, { semana: s, dia: 7, padrao: '4-6', passagemIdx: E.fase === 'manutencao' ? -1 : idxPassagem(), escolha: s === 8 ? P.semanas[7].roteiros.PADRAO.passos[1].escolha[0] : undefined });
    iniciarSessao(ro, { semana: s, dia: 7, padrao: '4-6', ancora: s === 1 ? 'som' : undefined }, { passagem: E.fase === 'manutencao' ? -1 : idxPassagem(), semBlocos: true });
  };
  ACOES['cancelar-sessao'] = function () { S = null; pararTimer(); ir('sessao'); };
  ACOES.nota = function (el) {
    var nome = el.dataset.nome, v = +el.dataset.v;
    var marcar = function () { document.querySelectorAll('[data-escala="' + nome + '"] button').forEach(function (b) { b.classList.toggle('sel', b === el); }); };
    if (!S) return;
    if (nome === 'antes') { S.antes = v; marcar(); document.querySelector('[data-acao="iniciar-passos"]').disabled = false; return; }
    if (nome === 'agora') {
      S.notas.push({ t: Math.round(posicao()), v: v });
      document.getElementById('painel-nota').classList.add('oculto');
      if (v >= R.regraParar(P).pico_min) { S.picoInformado = v; encerrarPorRegra('pico'); return; }
      render(); return;
    }
    if (nome === 'cond') {
      var p = S.ro.passos[S.passo];
      S.notas.push({ t: Math.round(posicao()), v: v });
      if (v >= R.regraParar(P).pico_min) { S.picoInformado = v; encerrarPorRegra('pico'); return; }
      S.condicao[p.id] = v <= p.condicao.nota_max;
      S.fase = 'rodando'; rodar(); render();
      Voz.falar(p.nome + '. ' + textoPasso(p));
      return;
    }
    if (nome === 'depois') { S.depois = v; marcar(); var b = document.querySelector('[data-acao="concluir-sessao"],[data-acao="salvar-bloco"]'); if (b) b.disabled = false; return; }
    if (nome === 'pico') { S.picoInformado = v; marcar(); return; }
    if (nome === 'ancora') { S.notaAncora = v; marcar(); document.querySelector('[data-acao="encerrar-ancora"]').disabled = false; return; }
  };
  ACOES['iniciar-passos'] = function () {
    if (S.antes === null) return;
    Audio.garantir();
    S.fase = 'rodando'; S.ultimo = Date.now();
    rodar();
    var p = S.ro.passos[S.passo];
    if (p.condicao && S.condicao[p.id] === undefined) { entrarPasso(); return; }
    render();
    Voz.falar(p.nome + '. ' + textoPasso(p));
  };
  ACOES.pausar = function () {
    if (S.rodando) pausar(); else rodar();
    render();
  };
  ACOES['proximo-passo'] = function () {
    if (S.passo >= S.ro.passos.length - 1) { irParaFechamento(); return; }
    S.passo++; S.decorrido = 0;
    if (S.bloco_s && posicao() >= S.blocoIni + S.bloco_s) { fimDeBloco(); return; }
    Audio.sino(0.18);
    entrarPasso();
  };
  ACOES['alternar-guia'] = function () { S.mostrarGuia = !S.mostrarGuia; render(); };
  ACOES['nota-agora'] = function () { document.getElementById('painel-parar').classList.add('oculto'); document.getElementById('painel-nota').classList.toggle('oculto'); };
  ACOES.parar = function () { document.getElementById('painel-nota').classList.add('oculto'); document.getElementById('painel-parar').classList.toggle('oculto'); };
  ACOES['parar-motivo'] = function (el) {
    var m = el.dataset.m;
    if (m === 'manual') { pausar(); S.encerramento = 'manual'; S.fase = 'fechamento'; render(); topo(); return; }
    encerrarPorRegra(m);
  };
  ACOES['encerrar-ancora'] = function () {
    if (S.depois === null || S.depois === undefined) S.depois = S.notaAncora;
    var reg = gravarSessao(false);
    reg.notaAposAncora = S.notaAncora;
    if (S.fase === 'ancora' && S.registroPendente) registroDaSessao(reg);
    E.blocoPendente = null;
    depoisDeSalvar(reg);
  };
  ACOES['concluir-sessao'] = function () {
    if (S.depois === null) return;
    var acaoEl = document.getElementById('acao-semana');
    if (acaoEl) E.semana7.acao = acaoEl.value.trim();
    var pico = S.picoInformado !== null ? S.picoInformado : picoSugerido();
    var regra = S.encerramento === 'manual' ? null : R.avaliarParada(P, S.antes, pico, S.depois);
    var def = !S.livre && semana(S.ro.semanaRoteiro) ? semana(S.ro.semanaRoteiro).registro : null;
    if (regra) {
      if (def) TMP.formSalvo = completarAuto(def, lerForm(def, 'f'));
      S.encerramento = regra;
      var reg0 = gravarSessao(false);
      if (def && TMP.formSalvo) { var algum = Object.keys(TMP.formSalvo).length; if (algum) E.registros.push({ id: uid(), data: agora(), semana: S.ro.semanaRoteiro, passagem: S.passagem, dia: S.dia, sessao: reg0.id, campos: TMP.formSalvo }); }
      E.sessoes.pop(); E.sessoes.push(reg0);
      S.salva = reg0;
      E.blocoPendente = null;
      salvar();
      S.fase = 'ancora'; render(); topo();
      ACOES['encerrar-ancora'] = function () { reg0.notaAposAncora = S.notaAncora; ACOES['encerrar-ancora'] = encerrarAncoraPadrao; depoisDeSalvar(reg0); };
      return;
    }
    var reg = gravarSessao(false);
    registroDaSessao(reg);
    E.blocoPendente = null;
    depoisDeSalvar(reg);
  };
  var encerrarAncoraPadrao = ACOES['encerrar-ancora'];
  ACOES['salvar-bloco'] = function () {
    if (S.depois === null) return;
    var pico = S.picoInformado !== null ? S.picoInformado : picoSugerido();
    var regra = R.avaliarParada(P, S.antes, pico, S.depois);
    if (regra) { S.encerramento = regra; S.fase = 'ancora'; E.blocoPendente = null; render(); topo(); return; }
    var pos = posicao();
    var reg = gravarSessao(true);
    E.blocoPendente = { data: hoje(), passagem: S.passagem, pos: pos, n: S.blocoN + 1, op: S.op, opcoes: TMP.op, feitoAntes: (S.continuar ? S.continuar.feitoAntes : 0) + reg.feito_s };
    depoisDeSalvar(reg);
  };
  ACOES['sugestao-trauma'] = function () {
    mudarRamo({ trauma: true, estendida: !!(E.ramo && E.ramo.estendida) }, 'Regra de parada: 2 sessões encerradas na Semana ' + passagem().semana + ' (semana ' + (idxPassagem() + 1) + ' do programa)');
    fecharCamada(); render(); aviso('Ramo trauma-informado ativado.');
  };
  ACOES['voltar-semana'] = function () {
    var p = passagem(), idx = idxPassagem();
    p.fim = hoje(); p.interrompida = true;
    E.passagens.push({ semana: p.semana - 1, inicio: hoje(), fim: null, motivo: 'Regra de parada: 2 sessões encerradas; volta ao roteiro da semana anterior' });
    E.mudancasRamo.push({ data: agora(), de: JSON.parse(JSON.stringify(E.ramo)), para: JSON.parse(JSON.stringify(E.ramo)), motivo: 'Mesmo ramo; volta da Semana ' + p.semana + ' para a Semana ' + (p.semana - 1) + ' (regra de parada, semana ' + (idx + 1) + ' do programa)' });
    salvar(); fecharCamada(); render();
  };
  ACOES['salvar-registro'] = function (el) {
    var s = +el.dataset.s, def = semana(s).registro, campos = lerForm(def, 'r'), dia = parseInt(document.getElementById('r-dia').value, 10);
    if (TMP.editar) {
      var r = E.registros.filter(function (x) { return x.id === TMP.editar; })[0];
      r.campos = campos; r.dia = dia; TMP.editar = null;
    } else {
      var p = passagem(), idx = p && p.semana === s ? idxPassagem() : (function () { var l = R.passagensDaSemana(E, s); return l.length ? l[l.length - 1] : -1; })();
      E.registros.push({ id: uid(), data: agora(), semana: s, passagem: idx, dia: dia, campos: campos });
    }
    salvar(); render(); aviso('Registro salvo.');
  };
  ACOES['editar-registro'] = function (el) { TMP.editar = el.dataset.id; render(); topo(); };
  ACOES['cancelar-edicao'] = function () { TMP.editar = null; render(); };
  ACOES['apagar-registro'] = function (el) {
    if (!confirm('Apagar este registro?')) return;
    E.registros = E.registros.filter(function (r) { return r.id !== el.dataset.id; });
    salvar(); render();
  };
  ACOES['concluir-passo'] = function (el) {
    if (TMP.concluir.passo === 1) TMP.concluir.efeitos = lerChecagem();
    TMP.concluir.passo = +el.dataset.p; render(); topo();
  };
  ACOES['concluir-checagem'] = function (el) {
    TMP.concluir.efeitos = lerChecagem();
    TMP.concluir.medir = el.dataset.medir === '1';
    var av = R.avaliarChecagem(P, TMP.concluir.efeitos);
    if (av.ajuda) abrirAjuda('checagem');
    if (TMP.concluir.medir) { TMP.concluir.passo = 2; render(); topo(); faltamMed(); return; }
    concluirSemana();
  };
  ACOES['concluir-medidas'] = function () {
    var r = TMP.concluir.resp;
    if (!R.completo(r.GAD7) || !R.completo(r.PHQ9)) { alert('Responda todos os itens do GAD-7 e do PHQ-9.'); return; }
    concluirSemana();
  };
  ACOES['salvar-medida'] = function () {
    var c = TMP.medida;
    if (!R.completo(c.GAD7) || !R.completo(c.PHQ9)) { alert('Responda todos os itens do GAD-7 e do PHQ-9.'); return; }
    var med = { id: uid(), data: agora(), momento: E.fase === 'manutencao' ? 'manutencao' : 'avulsa', passagem: idxPassagem(), GAD7: { itens: c.GAD7, total: R.soma(c.GAD7) }, PHQ9: { itens: c.PHQ9, total: R.soma(c.PHQ9) } };
    E.medidas.push(med);
    var piora = R.pioraConfiavel(P, E, med);
    if (piora.length) criarAlerta('piora', 'Piora confiável em ' + piora.map(function (k) { return k === 'GAD7' ? 'GAD-7' : 'PHQ-9'; }).join(' e ') + '. ' + regraParada('piora').acao + '.');
    TMP.medida = null;
    salvar(); ir('resultados');
    if (R.item9(c.PHQ9)) { criarAlerta('ideacao', regraParada('ideacao').acao + '.'); salvar(); abrirAjuda('medida'); }
  };
  ACOES['ramo-mudar'] = function (el) {
    var motivo = (document.getElementById('ramo-motivo').value || '').trim();
    if (!motivo) { alert('Escreva o motivo da mudança.'); return; }
    var m = el.dataset.m, novo = JSON.parse(JSON.stringify(E.ramo));
    if (m === 'trauma') novo.trauma = true;
    if (m === 'estendida') novo.estendida = true;
    if (m === 'padrao') {
      var pv = R.podeVoltarPadrao(P, E);
      if (!pv.ok) { alert(pv.texto); return; }
      if (E.acompanhamento && E.acompanhamento.confirmado && !document.getElementById('ramo-conjunta').checked) { alert('Com acompanhamento, a volta ao ramo PADRÃO é uma decisão conjunta com o profissional. Marque a confirmação.'); return; }
      novo = { trauma: false, estendida: false };
    }
    mudarRamo(novo, motivo); render(); aviso('Mudança de ramo registrada.');
  };
  ACOES.dominio = function (el) {
    var d = el.dataset.d, l = E.semana7.escolhidos;
    if (el.checked) {
      if (l.length >= P.semanas[6].mapa_dominios.escolher_max) { el.checked = false; alert('Escolha no máximo ' + P.semanas[6].mapa_dominios.escolher_max + ' domínios.'); return; }
      l.push(d);
    } else E.semana7.escolhidos = l.filter(function (x) { return x !== d; });
  };
  ACOES['salvar-s7'] = function () {
    P.semanas[6].mapa_dominios.dominios.forEach(function (d, i) {
      var a = document.getElementById('imp-' + i).value, b = document.getElementById('coe-' + i).value;
      E.semana7.dominios[d] = { imp: a === '' ? undefined : +a, coe: b === '' ? undefined : +b };
    });
    E.semana7.acao = document.getElementById('s7-acao').value.trim();
    E.semana7.criterios = Array.prototype.map.call(document.querySelectorAll('[data-crit]:checked'), function (x) { return x.dataset.crit; });
    E.semana7.data = agora();
    salvar(); render(); aviso('Mapa de Domínios salvo.');
  };
  ACOES['salvar-s8'] = function () {
    P.semanas[7].mapa_manutencao.campos.forEach(function (c) { E.manutencao.campos[c.id] = document.getElementById('mm-' + c.id).value.trim(); });
    [0, 1, 2].forEach(function (i) { E.manutencao.lembretes[i] = document.getElementById('lem-' + i).value; });
    E.manutencao.data = agora();
    salvar(); render(); aviso('Mapa de Manutenção salvo.');
  };
  ACOES.lembretes = function () {
    [0, 1, 2].forEach(function (i) { E.manutencao.lembretes[i] = document.getElementById('lem-' + i).value; });
    salvar();
    baixar('mindfulness-lembretes.ics', arquivoLembretes(), 'text/calendar');
  };
  ACOES['resp-iniciar'] = function () {
    Audio.garantir();
    pararGuiaLivre();
    var pad = document.getElementById('rp-padrao').value, dur = document.getElementById('rp-dur').value;
    E.config.somRitmo = document.getElementById('rp-som').checked;
    TMP.resp = { padrao: pad, dur: dur }; salvar();
    var pd = padraoDe(pad), ciclo = pd.inspirar_s + pd.expirar_s;
    var ciclos = /c$/.test(dur) ? parseInt(dur, 10) : (/m$/.test(dur) ? Math.round(parseInt(dur, 10) * 60 / ciclo) : 0);
    Tela.manter();
    guiaLivre = new Guia(document.getElementById('guia-livre'), pad, { ciclos: ciclos, fim: function () { Audio.sino(0.15); Tela.soltar(); } });
  };
  ACOES['resp-parar'] = function () { pararGuiaLivre(); Tela.soltar(); render(); };
  ACOES.pausa90 = function () {
    Audio.garantir();
    var el = document.getElementById('p90'), fim = Date.now() + 90000;
    var t = setInterval(function () {
      var r = (fim - Date.now()) / 1000;
      if (!document.body.contains(el)) { clearInterval(t); return; }
      if (r <= 0) { clearInterval(t); el.textContent = 'Note o que mudou.'; Audio.sino(0.15); return; }
      el.textContent = R.mmss(r);
    }, 250);
  };
  ACOES.pdf = function () {
    try { relatorio(document.getElementById('pdf-nome').value.trim(), document.getElementById('pdf-reg').checked); }
    catch (e) { alert('Não foi possível gerar o PDF: ' + e.message); }
  };
  ACOES.exportar = exportar;
  ACOES.importar = function (el) { if (el.files && el.files[0]) importar(el.files[0]); };
  ACOES.instalar = function () { if (instalar) { instalar.prompt(); instalar = null; } };
  ACOES['apagar-tudo'] = function () {
    if (!confirm('Apagar todos os dados deste aparelho? Isso não pode ser desfeito.')) return;
    if (!confirm('Tem certeza? Se quiser guardar, exporte uma cópia antes.')) return;
    E = estadoNovo(); salvar().then(function () { ir('inicio'); });
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-acao]');
    if (!el || el.tagName === 'SELECT') return;
    var fn = ACOES[el.dataset.acao];
    if (!fn) return;
    if (el.tagName === 'A') ev.preventDefault();
    if (el.type === 'checkbox') { fn(el); return; }
    fn(el);
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.dataset && el.dataset.acaoMudar) { var fn = ACOES[el.dataset.acaoMudar]; if (fn) fn(el); }
  });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); instalar = e; });

  /* ================= início ================= */
  function carregarJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); });
  }
  Promise.all([carregarJSON('protocolo.json'), carregarJSON('instrumentos.json'), DB.abrir()]).then(function (v) {
    P = v[0]; I = v[1];
    return DB.ler();
  }).then(function (salvo) {
    E = salvo || estadoNovo();
    var base = estadoNovo();
    Object.keys(base).forEach(function (k) { if (E[k] === undefined) E[k] = base[k]; });
    render();
  }).catch(function (e) {
    $app.innerHTML = '<div class="cartao"><h1>Não foi possível abrir o aplicativo</h1><p>Abra esta página uma vez com internet para que ela funcione depois sem conexão.</p><p class="mudo">' + h(e.message) + '</p></div>';
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { });
  }
  window.__mindfulness = { estado: function () { return E; }, regras: R, velocidade: function (v) { VEL = v; } };
})();
