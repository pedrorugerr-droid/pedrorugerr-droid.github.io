/* Gerador mínimo de PDF (A4, Helvetica, codificação WinAnsi), sem bibliotecas externas.
   Suporta texto com quebra de linha, títulos, linhas, retângulos, tabelas simples e gráfico de linhas. */
(function (raiz) {
  'use strict';

  /* Larguras da Helvetica (unidades por 1000), caracteres 32 a 126. */
  var LARG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var EXTRA = { '•': 0x95, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '€': 0x80 };
  var TROCA = { '≥': '>=', '≤': '<=', '−': '-', '√': 'raiz de ', '→': '->', ' ': ' ' };

  function normalizar(s) {
    s = String(s === null || s === undefined ? '' : s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (TROCA[c] !== undefined) { out += TROCA[c]; continue; }
      var code = c.charCodeAt(0);
      if (code < 256 || EXTRA[c]) { out += c; continue; }
      var base = c.normalize ? c.normalize('NFD')[0] : '?';
      out += base.charCodeAt(0) < 128 ? base : '?';
    }
    return out;
  }
  function byteDe(c) {
    if (EXTRA[c]) return EXTRA[c];
    var code = c.charCodeAt(0);
    return code < 256 ? code : 63;
  }
  function largura(s, tam, negrito) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i], code = c.charCodeAt(0), lw;
      if (code >= 32 && code <= 126) lw = LARG[code - 32];
      else if (c === '•') lw = 350;
      else {
        var b = c.normalize ? c.normalize('NFD')[0].charCodeAt(0) : 101;
        lw = (b >= 32 && b <= 126) ? LARG[b - 32] : 556;
      }
      w += lw;
    }
    return w * tam / 1000 * (negrito ? 1.06 : 1);
  }
  function escapar(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '\\' || c === '(' || c === ')') out += '\\' + c;
      else out += String.fromCharCode(byteDe(c));
    }
    return out;
  }
  function cor(c) {
    var h = c.replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]
      .map(function (v) { return v.toFixed(3); }).join(' ');
  }

  function Documento() {
    this.L = 595.28; this.A = 841.89; this.M = 48;
    this.paginas = [];
    this.novaPagina();
  }
  Documento.prototype.novaPagina = function () {
    this.ops = [];
    this.paginas.push(this.ops);
    this.y = this.A - this.M;
  };
  Documento.prototype.espaco = function (h) {
    if (this.y - h < this.M + 20) this.novaPagina();
  };
  Documento.prototype.texto = function (x, y, s, tam, negrito, c) {
    s = normalizar(s);
    this.ops.push('BT /' + (negrito ? 'F2' : 'F1') + ' ' + tam + ' Tf ' + cor(c || '#1A0005') + ' rg ' +
      x.toFixed(2) + ' ' + y.toFixed(2) + ' Td (' + escapar(s) + ') Tj ET');
  };
  Documento.prototype.quebrar = function (s, tam, negrito, w) {
    s = normalizar(s);
    var linhas = [];
    s.split('\n').forEach(function (par) {
      var palavras = par.split(' '), atual = '';
      palavras.forEach(function (p) {
        var t = atual ? atual + ' ' + p : p;
        if (largura(t, tam, negrito) > w && atual) { linhas.push(atual); atual = p; }
        else atual = t;
      });
      linhas.push(atual);
    });
    return linhas;
  };
  Documento.prototype.paragrafo = function (s, op) {
    op = op || {};
    var tam = op.tam || 10, neg = !!op.negrito, rec = op.recuo || 0;
    var w = this.L - 2 * this.M - rec;
    var lh = tam * 1.35;
    var self = this;
    this.quebrar(s, tam, neg, w).forEach(function (l) {
      self.espaco(lh);
      self.y -= lh;
      self.texto(self.M + rec, self.y, l, tam, neg, op.cor);
    });
    this.y -= (op.depois === undefined ? 4 : op.depois);
  };
  Documento.prototype.titulo = function (s, tam) {
    tam = tam || 13;
    this.espaco(tam * 3);
    this.y -= 8;
    this.paragrafo(s, { tam: tam, negrito: true, cor: '#92000A', depois: 2 });
    this.linha('#E8C0C0');
    this.y -= 4;
  };
  Documento.prototype.linha = function (c) {
    this.ops.push(cor(c || '#1A0005') + ' RG 0.6 w ' + this.M + ' ' + this.y.toFixed(2) + ' m ' + (this.L - this.M) + ' ' + this.y.toFixed(2) + ' l S');
  };
  Documento.prototype.retangulo = function (x, y, w, h, c) {
    this.ops.push(cor(c) + ' rg ' + [x, y, w, h].map(function (v) { return v.toFixed(2); }).join(' ') + ' re f');
  };
  Documento.prototype.segmento = function (x1, y1, x2, y2, c, w) {
    this.ops.push(cor(c) + ' RG ' + (w || 1) + ' w ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S');
  };
  /* Tabela: cabeçalho e linhas de texto, larguras em fração da área útil. */
  Documento.prototype.tabela = function (cab, linhas, fr, op) {
    op = op || {};
    var tam = op.tam || 8.5, self = this;
    var W = this.L - 2 * this.M;
    var ws = fr.map(function (f) { return f * W; });
    function desenhar(cels, negrito, fundo) {
      var partes = cels.map(function (c, i) { return self.quebrar(c, tam, negrito, ws[i] - 6); });
      var n = Math.max.apply(null, partes.map(function (p) { return p.length; }));
      var h = n * tam * 1.3 + 5;
      self.espaco(h);
      if (fundo) self.retangulo(self.M, self.y - h, W, h, fundo);
      var x = self.M;
      partes.forEach(function (p, i) {
        p.forEach(function (l, j) { self.texto(x + 3, self.y - 3 - (j + 1) * tam * 1.3 + 2, l, tam, negrito, negrito && fundo === '#1A0005' ? '#FFF8E7' : '#1A0005'); });
        x += ws[i];
      });
      self.y -= h;
      self.segmento(self.M, self.y, self.M + W, self.y, '#E8C0C0', 0.4);
    }
    desenhar(cab, true, '#1A0005');
    linhas.forEach(function (l, i) { desenhar(l, false, i % 2 ? '#FBF1EC' : null); });
    this.y -= 8;
  };
  /* Gráfico de linhas simples: pontos [{rotulo, valor, marca}] de 0 a max. */
  Documento.prototype.grafico = function (titulo, pontos, max, cortes) {
    var h = 120, W = this.L - 2 * this.M, self = this;
    this.espaco(h + 40);
    this.paragrafo(titulo, { tam: 10, negrito: true, depois: 2 });
    var x0 = this.M + 24, y0 = this.y - h, w = W - 40;
    (cortes || []).forEach(function (c) {
      var yy = y0 + c / max * h;
      self.segmento(x0, yy, x0 + w, yy, '#E8C0C0', 0.4);
      self.texto(self.M, yy - 3, String(c), 7, false, '#8B4A4A');
    });
    this.segmento(x0, y0, x0 + w, y0, '#8B4A4A', 0.6);
    this.texto(this.M, y0 - 3, '0', 7, false, '#8B4A4A');
    var n = pontos.length;
    var px = function (i) { return x0 + (n === 1 ? w / 2 : i * w / (n - 1)); };
    var py = function (v) { return y0 + Math.min(v, max) / max * h; };
    for (var i = 1; i < n; i++) this.segmento(px(i - 1), py(pontos[i - 1].valor), px(i), py(pontos[i].valor), '#1A0005', 1.4);
    pontos.forEach(function (p, i) {
      var c = p.marca === 'piora' ? '#E02C14' : (p.marca === 'melhora' ? '#2F6F4F' : '#1A0005');
      self.retangulo(px(i) - 2.5, py(p.valor) - 2.5, 5, 5, c);
      self.texto(px(i) - 4, py(p.valor) + 5, String(p.valor) + (p.marca ? ' (' + p.marca + ')' : ''), 7, true, c);
      self.texto(px(i) - 10, y0 - 12, p.rotulo, 7, false, '#4A1414');
    });
    this.y = y0 - 22;
  };
  Documento.prototype.rodape = function (s) {
    var self = this, total = this.paginas.length;
    this.paginas.forEach(function (ops, i) {
      ops.push('BT /F1 7.5 Tf ' + cor('#8B4A4A') + ' rg ' + self.M + ' 24 Td (' + escapar(normalizar(s + '  |  página ' + (i + 1) + ' de ' + total)) + ') Tj ET');
    });
  };
  Documento.prototype.bytes = function () {
    var objs = [];
    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    objs.push(null);
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var kids = [], self = this;
    this.paginas.forEach(function (ops) {
      var conteudo = ops.join('\n');
      objs.push('<< /Length ' + conteudo.length + ' >>\nstream\n' + conteudo + '\nendstream');
      var nConteudo = objs.length;
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + self.L + ' ' + self.A + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + nConteudo + ' 0 R >>');
      kids.push(objs.length + ' 0 R');
    });
    objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
    var out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info << /Producer (Mindfulness-IBE) >> >>\nstartxref\n' + xref + '\n%%EOF';
    var b = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255;
    return b;
  };

  var PDF = { novo: function () { return new Documento(); }, normalizar: normalizar };
  if (typeof module !== 'undefined' && module.exports) module.exports = PDF;
  else raiz.PDF = PDF;
})(this);
