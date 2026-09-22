/* Pedro Andrade Rüger — comportamento de página. Sem roteador: cada página é uma página. */
(function(){
  /* links antigos no formato #/slug continuam funcionando: redireciona para a URL real */
  var LEGADO = {"home": "/", "o-que-eu-faco": "/o-que-eu-faco/", "avaliacao-neuropsicologica": "/avaliacao-neuropsicologica/", "psicoterapia": "/psicoterapia/", "psicodiagnostico": "/psicodiagnostico/", "orientacao-profissional": "/orientacao-profissional/", "grupo-de-estudos": "/grupo-de-estudos/", "mindfulness-8-semanas": "/mindfulness-8-semanas/", "mindfulness-protocolo-integra": "/mindfulness-protocolo/", "mindfulness-adolescentes-integra": "/mindfulness-adolescentes/", "mindfulness-pre-adolescentes-integra": "/mindfulness-pre-adolescentes/", "idnap": "/idnap/", "modelo-4-camadas": "/modelo-4-camadas/", "modelo-12-dominios-integra": "/modelo-12-dominios/", "tratado-hitop-integra": "/tratado-hitop/", "big-five": "/big-five/", "big-five-integra": "/big-five-integracao/", "biotipos-circuitos": "/biotipos-circuitos/", "demencias": "/demencias/", "linguagem": "/neurobiologia-da-linguagem/", "bilinguismo-cerebro": "/bilinguismo-e-cerebro/", "autismo-alimentacao": "/autismo-e-alimentacao/", "intervencoes-tea-tdah": "/intervencoes-tea-tdah/", "farmacologia-neurotransmissores": "/farmacologia-neurotransmissores/", "neuro-age": "/neuro-age/", "projeto-terapeutico-integra": "/projeto-terapeutico/"};
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
