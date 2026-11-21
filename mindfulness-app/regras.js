/* Regras do Protocolo Mindfulness-IBE v2.1.
   Lógica pura, sem interface: triagem, ramo, roteiro do dia, dose, regras de parada,
   mudança confiável e avanço de semana. Todos os números vêm de protocolo.json. */
(function (raiz) {
  'use strict';
  var R = {};

  /* ---------- datas ---------- */
  R.hoje = function (d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dia = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + dia;
  };
  R.diasEntre = function (a, b) {
    var da = new Date(a + 'T12:00:00'), db = new Date(b + 'T12:00:00');
    return Math.round((db - da) / 86400000);
  };
  R.dataBR = function (iso) {
    if (!iso) return '';
    var p = iso.slice(0, 10).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  };

  /* ---------- questionários ---------- */
  R.completo = function (arr) {
    return Array.isArray(arr) && arr.length > 0 && arr.every(function (v) { return v !== null && v !== undefined; });
  };
  R.soma = function (arr) {
    return arr.reduce(function (a, b) { return a + (b || 0); }, 0);
  };
  R.totais = function (resp) {
    var t = {};
    ['PHQ9', 'GAD7', 'PHQ15', 'PCL5'].forEach(function (k) {
      t[k] = R.completo(resp[k]) ? R.soma(resp[k]) : null;
    });
    ['DES2', 'ASRS_A', 'ACE'].forEach(function (k) {
      t[k] = (typeof resp[k] === 'number' && !isNaN(resp[k])) ? resp[k] : null;
    });
    return t;
  };

  function sim(resp, id) { return !!(resp.perguntas && resp.perguntas[id] === true); }

  R.cumpre = function (regra, resp, tot) {
    if (!regra) return false;
    if (regra.instrumento) {
      if (regra.item) {
        var lista = resp[regra.instrumento];
        if (!Array.isArray(lista)) return false;
        var v = lista[regra.item - 1];
        return v !== null && v !== undefined && v !== regra.diferente_de;
      }
      var total = tot[regra.instrumento];
      if (total === null || total === undefined) return false;
      if (total < regra.total_min) return false;
      if (regra.e_perguntas) return regra.e_perguntas.every(function (p) { return sim(resp, p); });
      return true;
    }
    if (regra.perguntas) return regra.perguntas.some(function (p) { return sim(resp, p); });
    return false;
  };

  /* Passo 1 e Passo 2 da autotriagem. */
  R.avaliarTriagem = function (P, resp) {
    var tot = R.totais(resp);
    var alertas = P.triagem.passo1.sinais.filter(function (s) { return R.cumpre(s.regra, resp, tot); });
    var ct = P.triagem.passo2.TRAUMA.filter(function (c) { return R.cumpre(c, resp, tot); });
    var ce = P.triagem.passo2.ESTENDIDA.filter(function (c) { return R.cumpre(c, resp, tot); });
    return {
      totais: tot,
      alertas: alertas.map(function (s) { return s.id; }),
      urgente: alertas.some(function (s) { return s.urgente; }),
      criteriosTrauma: ct.map(function (c) { return c.texto; }),
      criteriosEstendida: ce.map(function (c) { return c.texto; }),
      ramo: { trauma: ct.length > 0, estendida: ce.length > 0 }
    };
  };

  R.item9 = function (lista) {
    return Array.isArray(lista) && lista[8] !== null && lista[8] !== undefined && lista[8] !== 0;
  };

  /* ---------- ramo ---------- */
  R.ramoNome = function (P, ramo) {
    if (!ramo) return P.ramos.PADRAO.nome;
    if (ramo.trauma && ramo.estendida) return P.ramos.TRAUMA.nome + ' com ' + P.ramos.ESTENDIDA.nome;
    if (ramo.trauma) return P.ramos.TRAUMA.nome;
    if (ramo.estendida) return P.ramos.ESTENDIDA.nome;
    return P.ramos.PADRAO.nome;
  };
  R.totalSemanas = function (P, ramo) {
    return ramo && ramo.estendida ? P.ramos.ESTENDIDA.total_semanas : P.semanas.length;
  };

  /* ---------- passagens (cada semana vivida do programa) ---------- */
  R.passagemAtual = function (e) {
    return e.passagens && e.passagens.length ? e.passagens[e.passagens.length - 1] : null;
  };
  R.indicePassagem = function (e) { return e.passagens ? e.passagens.length - 1 : -1; };
  R.sessoesDaPassagem = function (e, idx) {
    return (e.sessoes || []).filter(function (s) { return s.passagem === idx; });
  };
  R.passagensDaSemana = function (e, semana) {
    var r = [];
    (e.passagens || []).forEach(function (p, i) { if (p.semana === semana) r.push(i); });
    return r;
  };

  /* Número do dia (1 a 7) dentro da semana atual, contando dias com prática. */
  R.diaDaSemana = function (e, hoje) {
    hoje = hoje || R.hoje();
    var idx = R.indicePassagem(e);
    var datas = [];
    R.sessoesDaPassagem(e, idx).forEach(function (s) {
      var d = s.data.slice(0, 10);
      if (datas.indexOf(d) < 0) datas.push(d);
    });
    datas.sort();
    var pos = datas.indexOf(hoje);
    var n = pos >= 0 ? pos + 1 : datas.length + 1;
    return Math.min(n, 7);
  };

  /* ---------- dose ---------- */
  R.dose = function (P, semana, ramo) {
    var d = P.dose.por_semana[String(semana)];
    var r = { minimo: d.minimo, recomendado: d.recomendado, teto: d.teto };
    if (ramo && ramo.trauma && P.dose.trauma.semanas_12_min.indexOf(semana) >= 0) {
      r.recomendado = P.dose.trauma.sessao_min;
    }
    return r;
  };
  R.minutosPorDia = function (e, idx) {
    var m = {};
    R.sessoesDaPassagem(e, idx).forEach(function (s) {
      var d = s.data.slice(0, 10);
      m[d] = (m[d] || 0) + (s.feito_s || 0) / 60;
    });
    return m;
  };
  R.minutosHoje = function (e, hoje) {
    hoje = hoje || R.hoje();
    var t = 0;
    (e.sessoes || []).forEach(function (s) { if (s.data.slice(0, 10) === hoje) t += (s.feito_s || 0) / 60; });
    return t;
  };
  R.progressoDose = function (P, e, idx) {
    if (idx === undefined) idx = R.indicePassagem(e);
    var p = e.passagens[idx];
    if (!p) return null;
    var dose = R.dose(P, p.semana, e.ramo);
    var m = R.minutosPorDia(e, idx);
    var dias = Object.keys(m).sort().map(function (d) {
      return { data: d, minutos: Math.round(m[d] * 10) / 10, cumpriu: m[d] + 1e-9 >= dose.minimo };
    });
    return {
      dose: dose,
      alvo: P.dose.dias_por_semana,
      dias: dias,
      cumpridos: dias.filter(function (d) { return d.cumpriu; }).length
    };
  };

  /* ---------- regras de parada ---------- */
  R.regraParar = function (P) {
    return P.nota_desconforto.regras.filter(function (r) { return r.id === 'parar'; })[0];
  };
  /* Devolve 'pico', 'subida' ou null. */
  R.avaliarParada = function (P, antes, pico, depois) {
    var r = R.regraParar(P);
    if (typeof pico === 'number' && pico >= r.pico_min) return 'pico';
    if (typeof antes === 'number' && typeof depois === 'number' && depois - antes >= r.subida_depois_min) return 'subida';
    return null;
  };
  R.paradasPorNota = function (e, idx) {
    return R.sessoesDaPassagem(e, idx).filter(function (s) {
      return s.encerramento === 'pico' || s.encerramento === 'subida';
    }).length;
  };
  R.limiteDuasParadas = function (P) {
    return P.nota_desconforto.regras.filter(function (r) { return r.id === 'duas_na_semana'; })[0].sessoes;
  };

  /* Ramo trauma-informado, Semana 2: nota subiu 2 pontos ou mais em duas sessões. */
  R.semana2SoAncoras = function (P, e, idx) {
    var regra = P.semanas[1].roteiros.TRAUMA.regra;
    var n = R.sessoesDaPassagem(e, idx).filter(function (s) {
      return s.semana === 2 && s.roteiro === 'TRAUMA' &&
        typeof s.antes === 'number' && typeof s.depois === 'number' && s.depois - s.antes >= regra.subida_min;
    }).length;
    return n >= regra.sessoes;
  };

  /* ---------- alertas (pausas e restrições) ---------- */
  R.TIPOS_ALERTA = {
    triagem: 'bloqueio', ideacao: 'bloqueio', efeito: 'bloqueio', lembrancas: 'bloqueio', piora: 'bloqueio',
    estranheza: 'restricao', panico_respiracao: 'restricao'
  };
  R.alertasAtivos = function (e) {
    return (e.alertas || []).filter(function (a) { return !a.resolvido; });
  };
  R.bloqueios = function (e) {
    return R.alertasAtivos(e).filter(function (a) { return R.TIPOS_ALERTA[a.codigo] === 'bloqueio'; });
  };
  R.restricoes = function (e) {
    var at = R.alertasAtivos(e);
    return {
      soAncoras: at.some(function (a) { return a.codigo === 'estranheza'; }),
      semRespiracao: at.some(function (a) { return a.codigo === 'panico_respiracao'; })
    };
  };
  /* Sessões encerradas por estranheza desde a última liberação. */
  R.contarEstranheza = function (e) {
    var ultima = '';
    (e.alertas || []).forEach(function (a) {
      if (a.codigo === 'estranheza' && a.resolvido && a.dataResolvido > ultima) ultima = a.dataResolvido;
    });
    return (e.sessoes || []).filter(function (s) { return s.encerramento === 'estranheza' && s.data > ultima; }).length;
  };
  R.limiteEstranheza = function (P) {
    return P.seguranca.regras_parada.filter(function (r) { return r.id === 'estranheza'; })[0].sessoes_acima_de;
  };

  /* ---------- roteiro do dia ---------- */
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  R.tipoRoteiro = function (e, passagem) {
    if ((e.ramo && e.ramo.trauma) || (passagem && passagem.usarRoteiroTrauma)) return 'TRAUMA';
    return 'PADRAO';
  };

  /* op: { semana, dia, padrao, curta, ancora, escolha, passagemIdx } */
  R.montarRoteiro = function (P, e, op) {
    var semana = op.semana;
    var idx = op.passagemIdx === undefined ? R.indicePassagem(e) : op.passagemIdx;
    var passagem = e.passagens ? e.passagens[idx] : null;
    var rest = R.restricoes(e);
    var tipo = R.tipoRoteiro(e, passagem);
    var avisos = [];
    var semanaRoteiro = semana;

    if (rest.soAncoras && semana > 1) {
      semanaRoteiro = 1;
      avisos.push('Regra de parada em vigor: só âncoras externas. Hoje o roteiro é o da Semana 1.');
    } else if (semana === 2 && rest.semRespiracao) {
      semanaRoteiro = 1;
      avisos.push('Regra de parada em vigor: sem respiração ritmada. Hoje o roteiro é o das âncoras externas da Semana 1.');
    } else if (semana === 2 && tipo === 'TRAUMA' && R.semana2SoAncoras(P, e, idx)) {
      semanaRoteiro = 1;
      avisos.push(P.semanas[1].roteiros.TRAUMA.regra.texto);
    }

    var S = P.semanas[semanaRoteiro - 1];
    var ro = S.roteiros[tipo] || S.roteiros.PADRAO;
    var usaTextoTrauma = false;
    if (ro.igual_a) { usaTextoTrauma = !!ro.usa_texto_trauma; ro = S.roteiros[ro.igual_a]; }
    var tipoFinal = semanaRoteiro !== semana ? 'ANCORAS' : tipo;

    var passos = [];
    if (semanaRoteiro === 1 && op.curta && S.versao_curta) {
      passos.push({ id: 'curta', nome: 'Sessão encurtada', duracao_s: S.versao_curta.duracao_s, texto: S.versao_curta.texto });
    } else {
      ro.passos.forEach(function (p0) {
        var p = copia(p0);
        if (usaTextoTrauma && p.texto_trauma) p.texto = p.texto_trauma;
        delete p.texto_trauma;
        if (p.variantes) {
          var v = p.variantes.filter(function (x) { return x.dias.indexOf(op.dia) >= 0; })[0];
          delete p.variantes;
          if (v) { v.passos.forEach(function (q) { passos.push(copia(q)); }); return; }
        }
        if (p.por_dia) {
          var pd = p.por_dia.filter(function (x) { return x.dias.indexOf(op.dia) >= 0; })[0];
          if (pd) p.texto = pd.texto;
          delete p.por_dia;
        }
        if (p.duracao_curta_s && op.curta) p.duracao_s = p.duracao_curta_s;
        delete p.duracao_curta_s;
        if (semana === 2 && e.ramo && e.ramo.estendida && p.guia_respiracao === 'opcional') p.guia_respiracao = 'sim';
        passos.push(p);
      });
    }

    var titulo = ro.titulo;
    if (tipoFinal === 'ANCORAS') titulo = 'Âncoras externas (roteiro da Semana 1)';
    var total = passos.reduce(function (a, p) { return a + p.duracao_s; }, 0);
    return {
      semana: semana,
      semanaRoteiro: semanaRoteiro,
      tipo: tipoFinal,
      titulo: titulo,
      introducao: ro.introducao || '',
      material: ro.material || '',
      aviso: ro.aviso || '',
      notas: ro.notas || [],
      avisos: avisos,
      padrao: tipoFinal === 'TRAUMA' && ro.padrao_respiracao ? ro.padrao_respiracao : (op.padrao || null),
      passos: passos,
      total_s: total
    };
  };

  /* Âncora sugerida para o dia (Semana 1). */
  R.ancoraDoDia = function (P, dia) {
    var it = P.semanas[0].ancoras_por_dia.itens.filter(function (x) { return x.dias.indexOf(dia) >= 0; })[0];
    return it || null;
  };

  /* ---------- avanço de semana ---------- */
  R.diasSustentou = function (e, idx) {
    var d = [];
    R.sessoesDaPassagem(e, idx).forEach(function (s) {
      var x = s.data.slice(0, 10);
      if (s.sustentou === true && d.indexOf(x) < 0) d.push(x);
    });
    return d.length;
  };
  R.picoMaximo = function (sessoes) {
    var m = null;
    sessoes.forEach(function (s) {
      [s.antes, s.pico, s.depois].forEach(function (v) { if (typeof v === 'number' && (m === null || v > m)) m = v; });
    });
    return m;
  };

  /* Decide a próxima passagem ao concluir a semana atual.
     Devolve { semana, motivo, repete, bloqueio, texto, fim }. */
  R.proximaPassagem = function (P, e) {
    var idx = R.indicePassagem(e);
    var p = e.passagens[idx];
    var sem = p.semana;
    var est = P.ramos.ESTENDIDA;
    if (e.ramo && e.ramo.estendida && est.semanas_repetidas.indexOf(sem) >= 0) {
      var passes = R.passagensDaSemana(e, sem).length;
      if (passes < 2) {
        return { semana: sem, repete: true, motivo: 'Ramo ATENÇÃO ESTENDIDA: a Semana ' + sem + ' dura duas semanas.' };
      }
      var n = R.diasSustentou(e, idx);
      if (n < est.criterio_avanco.dias_min) {
        return { semana: sem, repete: true, bloqueio: true,
          motivo: 'Critério de avanço não atingido (' + n + ' de ' + est.criterio_avanco.dias_min + ' dias)',
          texto: 'Ramo ATENÇÃO ESTENDIDA: ' + est.criterio_avanco.texto + '. Nesta semana foram ' + n + ' dias.' };
      }
    }
    if (sem === 5) {
      var pre = P.semanas[5].pre_requisito;
      var passes5 = R.passagensDaSemana(e, 5);
      var alvo = R.sessoesDaPassagem(e, idx);
      if (passes5.length === 1) {
        var p4 = R.passagensDaSemana(e, 4);
        if (p4.length) alvo = alvo.concat(R.sessoesDaPassagem(e, p4[p4.length - 1]));
      }
      var mx = R.picoMaximo(alvo);
      if (mx !== null && mx >= pre.nota_min_bloqueio) {
        var ext = passes5.length - 1;
        return { semana: 5, repete: true, bloqueio: true,
          motivo: 'Pré-requisito da Semana 6 não atingido (extensão ' + (ext + 1) + ')',
          texto: pre.texto + (ext >= pre.extensoes_max ? ' A Semana 5 já foi estendida ' + ext + ' vezes: vale conversar com um profissional antes de seguir.' : '') };
      }
    }
    if (sem >= P.semanas.length) return { fim: true, semana: null, motivo: 'Fim do programa' };
    return { semana: sem + 1, motivo: 'Avanço' };
  };

  /* ---------- checagem semanal ---------- */
  R.avaliarChecagem = function (P, efeitos) {
    var lista = P.seguranca.checagem.efeitos;
    var ajuda = false, atrapalhou = [];
    lista.forEach(function (ef, i) {
      var r = efeitos[i] || {};
      if (ef.urgente && r.aconteceu) ajuda = true;
      if (r.atrapalhou) atrapalhou.push(ef.texto);
    });
    return { ajuda: ajuda, pausar: atrapalhou.length > 0, atrapalhou: atrapalhou };
  };

  /* ---------- medidas e mudança confiável ---------- */
  R.faixa = function (P, instr, total) {
    if (total === null || total === undefined) return '';
    var f = P.avaliacao.faixas;
    if (instr === 'PHQ9' && total >= f.PHQ9_alta) return 'gravidade alta';
    var nome = 'abaixo da faixa leve';
    f.limites.forEach(function (l) { if (total >= l.min) nome = l.nome; });
    return nome;
  };
  R.mudanca = function (P, instr, inicial, atual) {
    if (typeof inicial !== 'number' || typeof atual !== 'number') return null;
    var lim = P.avaliacao.mudanca_confiavel[instr];
    var delta = atual - inicial;
    var tipo = null;
    if (delta <= -lim) tipo = 'melhora';
    else if (delta >= lim) tipo = 'piora';
    var corte = P.avaliacao.faixas.recuperacao_abaixo[instr];
    var recuperacao = tipo === 'melhora' && inicial >= corte && atual < corte;
    return { delta: delta, tipo: tipo, recuperacao: recuperacao, limite: lim };
  };
  R.medidaInicial = function (e) {
    var m = (e.medidas || []).filter(function (x) { return x.momento === 'inicial'; });
    return m.length ? m[0] : null;
  };
  R.pioraConfiavel = function (P, e, medida) {
    var ini = R.medidaInicial(e);
    if (!ini || ini === medida) return [];
    var r = [];
    ['GAD7', 'PHQ9'].forEach(function (k) {
      if (!ini[k] || !medida[k]) return;
      var mu = R.mudanca(P, k, ini[k].total, medida[k].total);
      if (mu && mu.tipo === 'piora') r.push(k);
    });
    return r;
  };

  /* ---------- volta ao ramo PADRÃO ---------- */
  R.podeVoltarPadrao = function (P, e) {
    var regra = P.mudanca_de_ramo.voltar_ao_padrao;
    var concluidas = [];
    (e.passagens || []).forEach(function (p, i) { if (p.fim) concluidas.push(i); });
    var ultimas = concluidas.slice(-regra.semanas_estaveis);
    if (ultimas.length < regra.semanas_estaveis) {
      return { ok: false, texto: 'São necessárias ' + regra.semanas_estaveis + ' semanas concluídas e estáveis. Até agora: ' + ultimas.length + '.' };
    }
    var problemas = [];
    ultimas.forEach(function (i) {
      var mx = R.picoMaximo(R.sessoesDaPassagem(e, i));
      if (mx !== null && mx >= regra.nota_max_exclusiva) problemas.push('Semana ' + (i + 1) + ' do programa: nota de desconforto ' + mx + '.');
      var ch = (e.checagens || []).filter(function (c) { return c.passagem === i; })[0];
      if (!ch) problemas.push('Semana ' + (i + 1) + ' do programa: sem checagem semanal.');
      else if (ch.efeitos.some(function (x) { return x && x.atrapalhou; })) problemas.push('Semana ' + (i + 1) + ' do programa: efeito indesejado que atrapalhou o dia.');
    });
    return { ok: problemas.length === 0, texto: problemas.join(' ') };
  };

  /* ---------- retomada ---------- */
  R.diasSemPratica = function (e, hoje) {
    hoje = hoje || R.hoje();
    var ult = '';
    (e.sessoes || []).forEach(function (s) { if (s.data > ult) ult = s.data; });
    if (!ult) return null;
    return R.diasEntre(ult.slice(0, 10), hoje);
  };

  /* ---------- texto ---------- */
  R.mmss = function (s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else raiz.Regras = R;
})(this);
