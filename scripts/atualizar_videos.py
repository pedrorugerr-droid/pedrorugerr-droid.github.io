#!/usr/bin/env python3
"""Atualiza videos.json com os vídeos mais recentes do canal (feed RSS do YouTube).

- Mantém tudo o que já está no arquivo (inclusive a carga inicial).
- Acrescenta vídeos novos no começo da lista certa (longos ou shorts).
- Preenche títulos vazios usando o oEmbed do YouTube.
- Um vídeo é Short quando youtube.com/shorts/ID responde 200 sem redirecionar.
Só usa a biblioteca padrão; não precisa de chave de API.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ARQUIVO = sys.argv[1] if len(sys.argv) > 1 else "videos.json"
UA = {"User-Agent": "Mozilla/5.0 (compatible; atualizar-videos)"}
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}


class SemRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def abrir(url, seguir=True):
    req = urllib.request.Request(url, headers=UA)
    op = urllib.request.build_opener() if seguir else urllib.request.build_opener(SemRedirect)
    return op.open(req, timeout=30)


def eh_short(vid):
    try:
        return abrir(f"https://www.youtube.com/shorts/{vid}", seguir=False).status == 200
    except urllib.error.HTTPError:
        return False  # 303 para /watch = vídeo longo
    except Exception:
        return None  # indeterminado


def titulo_de(vid):
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(
        f"https://www.youtube.com/watch?v={vid}", safe="")
    try:
        return json.load(abrir(url)).get("title", "").strip()
    except Exception:
        return ""


def feed(canal):
    xml = abrir(f"https://www.youtube.com/feeds/videos.xml?channel_id={canal}").read()
    for e in ET.fromstring(xml).findall("a:entry", NS):
        yield e.find("yt:videoId", NS).text, e.find("a:title", NS).text.strip()


def main():
    dados = json.load(open(ARQUIVO, encoding="utf-8"))
    conhecidos = {v["id"] for v in dados["longos"] + dados["shorts"]}

    novos = [(i, t) for i, t in feed(dados["canal"]) if i not in conhecidos]
    for vid, titulo in reversed(novos):  # feed vem do mais novo ao mais antigo
        curto = eh_short(vid)
        if curto is None:
            print(f"sem classificar {vid}; tentará de novo na próxima execução")
            continue
        (dados["shorts"] if curto else dados["longos"]).insert(0, {"id": vid, "titulo": titulo})
        print(("short" if curto else "longo"), vid, titulo)

    for v in dados["longos"] + dados["shorts"]:
        if not v.get("titulo"):
            v["titulo"] = titulo_de(v["id"])

    with open(ARQUIVO, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
