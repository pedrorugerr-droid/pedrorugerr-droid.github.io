/* Pedro Andrade Rüger — comportamento de página. Sem roteador: cada página é uma página. */
(function(){
  /* links antigos no formato #/slug continuam funcionando: redireciona para a URL real */
  var LEGADO = {"home": "/", "o-que-eu-faco": "/o-que-eu-faco.html", "avaliacao-neuropsicologica": "/avaliacao-neuropsicologica.html", "psicoterapia": "/psicoterapia.html", "psicodiagnostico": "/psicodiagnostico.html", "orientacao-profissional": "/orientacao-profissional.html", "grupo-de-estudos": "/grupo-de-estudos.html", "mindfulness-8-semanas": "/mindfulness-8-semanas.html", "mindfulness-protocolo-integra": "/mindfulness-protocolo.html", "mindfulness-adolescentes-integra": "/mindfulness-adolescentes.html", "mindfulness-pre-adolescentes-integra": "/mindfulness-pre-adolescentes.html", "idnap": "/idnap.html", "modelo-4-camadas": "/modelo-4-camadas.html", "modelo-12-dominios-integra": "/modelo-12-dominios.html", "tratado-hitop-integra": "/tratado-hitop.html", "big-five": "/big-five.html", "big-five-integra": "/big-five-integracao.html", "biotipos-circuitos": "/biotipos-circuitos.html", "demencias": "/demencias.html", "linguagem": "/neurobiologia-da-linguagem.html", "bilinguismo-cerebro": "/bilinguismo-e-cerebro.html", "autismo-alimentacao": "/autismo-e-alimentacao.html", "intervencoes-tea-tdah": "/intervencoes-tea-tdah.html", "farmacologia-neurotransmissores": "/farmacologia-neurotransmissores.html", "neuro-age": "/neuro-age.html", "projeto-terapeutico-integra": "/projeto-terapeutico.html"};
  if (location.hash.indexOf('#/') === 0) {
    var partes = location.hash.slice(2).split('/');
    var destino = LEGADO[partes[0] || 'home'];
    if (destino && destino !== location.pathname) {
      location.replace(destino + (partes[1] ? '#' + partes[0] + '--' + partes[1] : ''));
      return;
    }
  }

  var prog = document.getElementById('prog');
  var gaveta = document.getElementById('gaveta');
  var b = document.getElementById('burger');
  if(b && gaveta) b.addEventListener('click', function(){ gaveta.classList.toggle('aberta'); });

  /* abas de conteúdo */
  [].forEach.call(document.querySelectorAll('.tab'), function(t){
    t.addEventListener('click', function(){
      var pai = t.closest('main') || document;
      [].forEach.call(pai.querySelectorAll('.tab'), function(x){x.classList.remove('active')});
      [].forEach.call(pai.querySelectorAll('.panel'), function(x){x.classList.remove('active')});
      t.classList.add('active');
      var alvo = pai.querySelector('[id$="--'+t.dataset.p+'"]') || document.getElementById(t.dataset.p);
      if(alvo) alvo.classList.add('active');
    });
  });

  /* barra de progresso de leitura + sumário ativo */
  var art = document.querySelector('main article');
  var linksToc = [].slice.call(document.querySelectorAll('.toc a'));
  var alvosToc = linksToc.map(function(a){ return document.getElementById((a.getAttribute('href')||'#').slice(1)); });
  function atualizar(){
    if(!art || !prog){ if(prog) prog.style.width='0'; return; }
    var r = art.getBoundingClientRect(), vh = window.innerHeight;
    var total = r.height - vh, feito = Math.min(Math.max(-r.top,0), Math.max(total,1));
    prog.style.width = (total>0 ? (feito/total*100) : 0) + '%';
    var melhor = 0;
    for(var i=0;i<alvosToc.length;i++){ if(alvosToc[i] && alvosToc[i].getBoundingClientRect().top < 140) melhor = i; }
    linksToc.forEach(function(a,i){ a.classList.toggle('on', i===melhor); });
  }
  window.addEventListener('scroll', atualizar, {passive:true});
  window.addEventListener('resize', atualizar);
  atualizar();
})();
