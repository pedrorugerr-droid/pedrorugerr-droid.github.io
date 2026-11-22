// Armazém local cifrado, igual para o navegador e para o aparelho.
//
// O resto do código só conhece a interface de `abrirArmazem`:
//   ler(colecao, id), gravar(colecao, id, valor), listar(colecao),
//   remover(colecao, id), lerChave(nome), gravarChave(nome, chave),
//   apagarTudo(), fechar().
// Valores são JSON. Chaves (CryptoKey) vão por lerChave/gravarChave, porque
// não viram JSON.
//
// Por baixo, um "backend" com operações brutas. Três prontos:
//   backendIndexedDb(): navegador. Cada valor vai cifrado com AES-GCM por uma
//     chave mestra não exportável do WebCrypto, guardada no próprio IndexedDB
//     (o navegador guarda o objeto CryptoKey sem expor os bytes).
//   backendSqlite(conexao): aparelho, com @capacitor-community/sqlite e
//     SQLCipher (o banco inteiro já é cifrado no disco; a senha do banco fica
//     no Keychain ou Keystore, gerida pelo plugin). As chaves ECDH vão como
//     JWK dentro do banco cifrado.
//   backendMemoria(): testes e modo sem armazenamento. Também cifra.
// Nada aqui fala com a rede.

const enc = new TextEncoder();
const dec = new TextDecoder();
const sutil = () => globalThis.crypto.subtle;

async function novaChaveMestra() {
  return sutil().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function cifrarValor(chave, colecao, id, valor) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ad = enc.encode(`${colecao}/${id}`);
  const dados = new Uint8Array(
    await sutil().encrypt({ name: "AES-GCM", iv, additionalData: ad }, chave, enc.encode(JSON.stringify(valor))),
  );
  return { iv, dados };
}

async function decifrarValor(chave, colecao, id, bruto) {
  const ad = enc.encode(`${colecao}/${id}`);
  const claro = await sutil().decrypt({ name: "AES-GCM", iv: bruto.iv, additionalData: ad }, chave, bruto.dados);
  return JSON.parse(dec.decode(claro));
}

function checarNome(x, o) {
  if (typeof x !== "string" || !x || x.length > 200) throw new Error(`${o} inválido`);
}

/**
 * Abre o armazém sobre um backend. Se o backend não cifra no disco
 * (`cifraNoDisco` falso), cada valor é cifrado aqui com a chave mestra.
 */
export async function abrirArmazem(backend) {
  await backend.abrir();
  let mestra = null;
  if (!backend.cifraNoDisco) {
    mestra = await backend.lerChaveBruta("__mestra");
    if (!mestra) {
      mestra = await novaChaveMestra();
      await backend.gravarChaveBruta("__mestra", mestra);
    }
  }
  return {
    tipo: backend.tipo,
    async ler(colecao, id) {
      checarNome(colecao, "coleção");
      checarNome(id, "id");
      const b = await backend.lerBruto(colecao, id);
      if (b == null) return null;
      return mestra ? decifrarValor(mestra, colecao, id, b) : JSON.parse(b);
    },
    async gravar(colecao, id, valor) {
      checarNome(colecao, "coleção");
      checarNome(id, "id");
      const b = mestra ? await cifrarValor(mestra, colecao, id, valor) : JSON.stringify(valor);
      await backend.gravarBruto(colecao, id, b);
    },
    /** Todos os valores da coleção, como [{ id, valor }], em ordem de id. */
    async listar(colecao) {
      checarNome(colecao, "coleção");
      const brutos = await backend.listarBruto(colecao);
      const out = [];
      for (const { id, bruto } of brutos) {
        out.push({ id, valor: mestra ? await decifrarValor(mestra, colecao, id, bruto) : JSON.parse(bruto) });
      }
      return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    async remover(colecao, id) {
      await backend.removerBruto(colecao, id);
    },
    async lerChave(nome) {
      checarNome(nome, "nome da chave");
      return backend.lerChaveBruta(`k:${nome}`);
    },
    async gravarChave(nome, chave) {
      checarNome(nome, "nome da chave");
      await backend.gravarChaveBruta(`k:${nome}`, chave);
    },
    /** Apaga tudo, inclusive a chave mestra. O armazém fica fechado. */
    async apagarTudo() {
      await backend.apagarTudo();
      mestra = null;
    },
    async fechar() {
      await backend.fechar?.();
    },
  };
}

// ---------- Memória ----------

export function backendMemoria() {
  let dados = new Map();
  let chaves = new Map();
  return {
    tipo: "memoria",
    cifraNoDisco: false,
    async abrir() {},
    async lerBruto(c, id) {
      return dados.get(`${c}\u0000${id}`) ?? null;
    },
    async gravarBruto(c, id, b) {
      dados.set(`${c}\u0000${id}`, b);
    },
    async listarBruto(c) {
      const out = [];
      for (const [k, bruto] of dados) {
        const [cc, id] = k.split("\u0000");
        if (cc === c) out.push({ id, bruto });
      }
      return out;
    },
    async removerBruto(c, id) {
      dados.delete(`${c}\u0000${id}`);
    },
    async lerChaveBruta(n) {
      return chaves.get(n) ?? null;
    },
    async gravarChaveBruta(n, k) {
      chaves.set(n, k);
    },
    async apagarTudo() {
      dados = new Map();
      chaves = new Map();
    },
    /** Só para teste: o que está gravado, para conferir que está cifrado. */
    _bruto: () => dados,
  };
}

// ---------- IndexedDB (navegador) ----------

const pedido = (r) =>
  new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

export function backendIndexedDb({ nome = "trilha-paciente", idb = globalThis.indexedDB } = {}) {
  let db = null;
  const loja = (nomeLoja, modo) => db.transaction(nomeLoja, modo).objectStore(nomeLoja);
  return {
    tipo: "indexeddb",
    cifraNoDisco: false,
    async abrir() {
      if (!idb) throw new Error("IndexedDB indisponível neste navegador");
      const r = idb.open(nome, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("valores");
        r.result.createObjectStore("chaves");
      };
      db = await pedido(r);
      // Outra aba pediu para apagar tudo (deleteDatabase): esta conexão fecha
      // para não bloquear o pedido, que senão fica pendurado para sempre.
      db.onversionchange = () => {
        db?.close();
        db = null;
      };
    },
    async lerBruto(c, id) {
      return (await pedido(loja("valores", "readonly").get([c, id]))) ?? null;
    },
    async gravarBruto(c, id, b) {
      await pedido(loja("valores", "readwrite").put(b, [c, id]));
    },
    async listarBruto(c) {
      const faixa = IDBKeyRange.bound([c, ""], [c, "￿"]);
      const s = loja("valores", "readonly");
      const [ks, vs] = await Promise.all([pedido(s.getAllKeys(faixa)), pedido(s.getAll(faixa))]);
      return ks.map((k, i) => ({ id: k[1], bruto: vs[i] }));
    },
    async removerBruto(c, id) {
      await pedido(loja("valores", "readwrite").delete([c, id]));
    },
    async lerChaveBruta(n) {
      return (await pedido(loja("chaves", "readonly").get(n))) ?? null;
    },
    async gravarChaveBruta(n, k) {
      await pedido(loja("chaves", "readwrite").put(k, n));
    },
    async apagarTudo() {
      db?.close();
      db = null;
      await pedido(idb.deleteDatabase(nome));
    },
    async fechar() {
      db?.close();
      db = null;
    },
  };
}

// ---------- SQLite cifrado (aparelho) ----------

/**
 * `conexao` é uma SQLiteDBConnection do @capacitor-community/sqlite já aberta
 * com criptografia (modo "secret"). Usa só execute, run e query.
 * As chaves ECDH precisam ser geradas com gerarParDeChaves({ exportavel: true })
 * para irem como JWK; a chave lida volta não exportável.
 */
export function backendSqlite(conexao, { importarPrivada } = {}) {
  return {
    tipo: "sqlite",
    cifraNoDisco: true,
    async abrir() {
      await conexao.execute(
        "CREATE TABLE IF NOT EXISTS valores (colecao TEXT NOT NULL, id TEXT NOT NULL, valor TEXT NOT NULL, PRIMARY KEY (colecao, id));" +
          "CREATE TABLE IF NOT EXISTS chaves (nome TEXT PRIMARY KEY, jwk TEXT NOT NULL);",
      );
    },
    async lerBruto(c, id) {
      const r = await conexao.query("SELECT valor FROM valores WHERE colecao = ? AND id = ?", [c, id]);
      return r.values?.[0]?.valor ?? null;
    },
    async gravarBruto(c, id, b) {
      await conexao.run("INSERT OR REPLACE INTO valores (colecao, id, valor) VALUES (?, ?, ?)", [c, id, b]);
    },
    async listarBruto(c) {
      const r = await conexao.query("SELECT id, valor FROM valores WHERE colecao = ?", [c]);
      return (r.values ?? []).map((l) => ({ id: l.id, bruto: l.valor }));
    },
    async removerBruto(c, id) {
      await conexao.run("DELETE FROM valores WHERE colecao = ? AND id = ?", [c, id]);
    },
    async lerChaveBruta(n) {
      const r = await conexao.query("SELECT jwk FROM chaves WHERE nome = ?", [n]);
      const j = r.values?.[0]?.jwk;
      if (!j) return null;
      return importarPrivada ? importarPrivada(JSON.parse(j)) : JSON.parse(j);
    },
    async gravarChaveBruta(n, k) {
      const jwk = typeof CryptoKey !== "undefined" && k instanceof CryptoKey ? await sutil().exportKey("jwk", k) : k;
      await conexao.run("INSERT OR REPLACE INTO chaves (nome, jwk) VALUES (?, ?)", [n, JSON.stringify(jwk)]);
    },
    async apagarTudo() {
      await conexao.execute("DELETE FROM valores; DELETE FROM chaves;");
    },
  };
}
