/* Pedro Andrade Rüger: comportamento de página. Sem roteador: cada página é uma página. */
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

  /* origem do contato: ?origem=xxx fica só nesta aba (sessionStorage), para pré-marcar
     "como me encontrou" na página de contato. Nada de cookie, localStorage ou analytics,
     e nada é enviado a servidor: só entra no texto que a própria pessoa manda pelo WhatsApp. */
  var ORIGENS = {"google": "Google", "google-perfil": "Google", "doctoralia": "Doctoralia", "youtube": "YouTube",
    "instagram": "Instagram", "indicacao-profissional": "Indicação de profissional", "pdf-profissionais": "Indicação de profissional",
    "indicacao-paciente": "Indicação de paciente"};
  var origem = '';
  try {
    var m = /[?&]origem=([^&#]*)/.exec(location.search);
    if (m) {
      origem = decodeURIComponent(m[1].replace(/\+/g, ' ')).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
      if (origem) sessionStorage.setItem('origem', origem);
    }
    if (!origem) origem = (sessionStorage.getItem('origem') || '').replace(/[^a-z0-9-]/g, '').slice(0, 40);
  } catch (e) { origem = ''; }
  window.PR_ORIGEM = origem ? {codigo: origem, rotulo: ORIGENS[origem] || 'Outro'} : null;

  var prog = document.getElementById('prog');
  var gaveta = document.getElementById('gaveta');
  var b = document.getElementById('burger');
  var cab = document.querySelector('header.nav');
  function alturaNav(){
    var barra = cab && cab.querySelector('.nav-in');
    if(barra) document.documentElement.style.setProperty('--nav-h', barra.getBoundingClientRect().height + 'px');
  }
  function abrirGaveta(abrir){
    if(!gaveta) return;
    alturaNav();
    gaveta.classList.toggle('aberta', abrir);
    document.documentElement.classList.toggle('gaveta-aberta', abrir);
    if(b){ b.setAttribute('aria-expanded', abrir ? 'true' : 'false'); b.textContent = abrir ? '✕' : '☰'; }
    if(abrir) gaveta.scrollTop = 0;
  }
  if(b && gaveta){
    b.setAttribute('aria-controls', 'gaveta');
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function(){ abrirGaveta(!gaveta.classList.contains('aberta')); });
    /* fecha ao tocar num link (inclusive âncoras na mesma página) e com Esc */
    gaveta.addEventListener('click', function(e){ if(e.target.closest('a')) abrirGaveta(false); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') abrirGaveta(false); });
    window.addEventListener('resize', function(){ if(gaveta.classList.contains('aberta')) alturaNav(); });
  }

  /* botão flutuante de WhatsApp, presente em todas as páginas */
  if(!document.querySelector('.wa-flutuante')){
    var wa = document.createElement('a');
    wa.className = 'wa-flutuante';
    wa.href = 'https://wa.me/5531999846282?text=' + encodeURIComponent('Olá, Pedro. Cheguei pelo seu site e gostaria de conversar.' + (origem ? ' (Ref.: ' + origem + ')' : ''));
    wa.target = '_blank';
    wa.rel = 'noopener';
    wa.setAttribute('aria-label', 'Conversar pelo WhatsApp');
    wa.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.3.6 4.54 1.74 6.52L3 29l6.65-1.74A12.95 12.95 0 0 0 16.04 29C23.2 29 29 23.18 29 16S23.2 3 16.04 3zm0 23.62c-2 0-3.95-.54-5.65-1.55l-.4-.24-3.95 1.03 1.05-3.85-.26-.4A10.6 10.6 0 0 1 5.4 16c0-5.86 4.77-10.62 10.64-10.62 5.86 0 10.6 4.76 10.6 10.62 0 5.86-4.75 10.62-10.6 10.62zm5.83-7.95c-.32-.16-1.89-.93-2.18-1.04-.3-.1-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.18-.32-.02-.49.14-.65.15-.14.32-.37.48-.56.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.3.32-1.12 1.09-1.12 2.66 0 1.57 1.14 3.08 1.3 3.3.16.2 2.25 3.43 5.44 4.81.76.33 1.35.52 1.81.67.76.24 1.46.2 2 .12.61-.09 1.89-.77 2.15-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37z"/></svg><span>WhatsApp</span>';
    document.body.appendChild(wa);
  }

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

  /* vídeo da página inicial: o YouTube só carrega quando a pessoa clica */
  [].slice.call(document.querySelectorAll('.video-home-q button[data-yt]')).forEach(function(bt){
    bt.addEventListener('click', function(){
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(bt.getAttribute('data-yt')) + '?autoplay=1&rel=0';
      f.title = bt.getAttribute('aria-label') || 'Vídeo';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen = true;
      bt.parentNode.replaceChild(f, bt);
    });
  });
})();
