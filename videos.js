/* Página de vídeos: lê /videos.json e monta as duas grades. O player só carrega ao clicar. */
(function(){
  function el(tag, cls, txt){ var e = document.createElement(tag); if(cls) e.className = cls; if(txt) e.textContent = txt; return e; }

  function card(v, curto){
    var titulo = v.titulo || (curto ? 'Vídeo curto' : 'Vídeo do canal');
    var c = el('article', 'card');
    var b = el('button', 'thumb');
    b.type = 'button';
    b.setAttribute('aria-label', 'Assistir: ' + titulo);
    var img = el('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg';
    b.appendChild(img);
    b.addEventListener('click', function(){
      var f = el('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0';
      f.title = titulo;
      f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      b.classList.add('on');
      b.replaceChildren(f);
    }, {once: true});
    c.appendChild(b);
    c.appendChild(el('h3', '', titulo));
    return c;
  }

  function preencher(id, lista, curto){
    var g = document.getElementById(id);
    if(!g) return;
    g.textContent = '';
    if(!lista || !lista.length){ g.appendChild(el('p', 'vazio', 'Em breve.')); return; }
    lista.forEach(function(v){ g.appendChild(card(v, curto)); });
  }

  fetch('/videos.json', {cache: 'no-cache'})
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d){
      preencher('grade-longos', d.longos, false);
      preencher('grade-curtos', d.shorts, true);
    })
    .catch(function(){
      ['grade-longos', 'grade-curtos'].forEach(function(id){
        var g = document.getElementById(id);
        if(g){ g.textContent = ''; g.appendChild(el('p', 'vazio', 'Não foi possível carregar a lista agora. Veja os vídeos direto no canal do YouTube.')); }
      });
    });
})();
