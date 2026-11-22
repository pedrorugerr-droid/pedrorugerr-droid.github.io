// Pacotes cifrados de ponta a ponta entre o app clínico e o app do paciente.
// Roda igual no navegador e no Node (WebCrypto e CompressionStream globais).
//
// Dois modos de chave:
//   "codigo": a primeira prescrição. A chave sai do código de seis caracteres
//             (PBKDF2), que o terapeuta passa ao paciente na sessão. Serve para
//             o paciente receber a chave pública do terapeuta sem conta nem e-mail.
//   "ecdh":   tudo depois do pareamento. Chaves P-256 dos dois lados; a chave do
//             pacote sai de ECDH + HKDF. Só o destinatário decifra.
// O cabeçalho (app, versão, tipo, modo, remetente, sal) entra como dado
// autenticado: trocar qualquer campo faz a decifragem falhar.
//
// O relay só vê o pacote cifrado e um identificador de caixa que é hash.
//
// Mudanças de interface (22/11/2026, sessão do app do paciente), sem quebrar
// o contrato anterior:
//   - idCaixaPareamento(codigo): caixa da primeira resposta do paciente. Antes
//     de receber um pacote "ecdh" do terapeuta, o paciente não sabe se o
//     terapeuta já tem a sua chave pública; manda o resumo (que leva "publica")
//     para esta caixa, que o clínico consulta pelo código que gerou. Depois do
//     primeiro pacote "ecdh" recebido, vale idCaixa(publicaTerapeuta, publicaPaciente).
//   - gerarParDeChaves({ exportavel: true }): par com privada exportável (JWK),
//     só para guardar dentro de um banco já cifrado (SQLCipher no aparelho).
//     Sem a opção, continua não exportável, como antes.
//   - exportarPrivada(privada) e importarPrivada(jwk): par da opção acima.

const APP = "mtca";
const VERSAO = 1;
const PREFIXO = "MTCA1.";
const ITERACOES_CODIGO = 300000;
export const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I, O, 0, 1
export const TIPOS = ["prescricao", "resumo"];

const enc = new TextEncoder();
const dec = new TextDecoder();
const sutil = () => globalThis.crypto.subtle;

export function b64url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deB64url(texto) {
  const s = String(texto).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const aleatorio = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function sha256(texto) {
  return new Uint8Array(await sutil().digest("SHA-256", enc.encode(texto)));
}

// ---------- Código de pareamento ----------

export function gerarCodigo() {
  const b = aleatorio(6);
  return Array.from(b, (x) => ALFABETO_CODIGO[x % 32]).join("");
}

/** Maiúsculas, sem espaço nem hífen. Devolve null se não for um código válido. */
export function normalizarCodigo(texto) {
  const c = String(texto ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (c.length !== 6) return null;
  for (const ch of c) if (!ALFABETO_CODIGO.includes(ch)) return null;
  return c;
}

/** Caixa do relay onde fica a primeira prescrição de um código. */
export async function idCaixaDoCodigo(codigo) {
  return b64url(await sha256(`${APP}-codigo-v${VERSAO}:${codigo}`));
}

/** Caixa do relay da primeira resposta do paciente (pareamento). */
export async function idCaixaPareamento(codigo) {
  return b64url(await sha256(`${APP}-pareamento-v${VERSAO}:${codigo}`));
}

/** Caixa do relay para pacotes de `origem` para `destino` (chaves públicas em base64url). */
export async function idCaixa(publicaDestino, publicaOrigem) {
  return b64url(await sha256(`${APP}-caixa-v${VERSAO}:${publicaDestino}:${publicaOrigem}`));
}

// ---------- Chaves ----------

const ECDH = { name: "ECDH", namedCurve: "P-256" };

/**
 * Par de chaves ECDH. Por padrão a privada não sai do aparelho (não exportável).
 * `exportavel: true` só para guardar a privada num banco já cifrado.
 */
export async function gerarParDeChaves({ exportavel = false } = {}) {
  const par = await sutil().generateKey(ECDH, exportavel, ["deriveBits"]);
  const bruta = await sutil().exportKey("raw", par.publicKey);
  return { publica: b64url(bruta), privada: par.privateKey };
}

/** JWK da privada (só se gerada com exportavel: true). */
export async function exportarPrivada(privada) {
  return sutil().exportKey("jwk", privada);
}

/** Privada a partir do JWK, de novo não exportável. */
export async function importarPrivada(jwk) {
  return sutil().importKey("jwk", jwk, ECDH, false, ["deriveBits"]);
}

async function importarPublica(b64) {
  return sutil().importKey("raw", deB64url(b64), ECDH, false, []);
}

/** Impressão curta da chave pública, para conferir na sessão (4 grupos de 4). */
export async function impressao(publica) {
  const h = await sha256(`${APP}-impressao:${publica}`);
  const hex = Array.from(h.slice(0, 8), (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.match(/.{4}/g).join(" ");
}

async function chaveDoCodigo(codigo, sal) {
  const base = await sutil().importKey("raw", enc.encode(codigo), "PBKDF2", false, ["deriveKey"]);
  return sutil().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: ITERACOES_CODIGO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function chaveEcdh(privada, publicaOutro, sal, tipo) {
  const pub = await importarPublica(publicaOutro);
  const bits = await sutil().deriveBits({ name: "ECDH", public: pub }, privada, 256);
  const hk = await sutil().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return sutil().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: sal, info: enc.encode(`${APP} v${VERSAO} ${tipo}`) },
    hk,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function cabecalho(p) {
  return enc.encode(JSON.stringify({ app: p.app, v: p.v, tipo: p.tipo, modo: p.modo, de: p.de ?? null, sal: p.sal }));
}

function checarTipo(tipo) {
  if (!TIPOS.includes(tipo)) throw new Error(`tipo de pacote desconhecido: ${tipo}`);
}

// ---------- Cifrar e decifrar ----------

export async function cifrarComCodigo(conteudo, tipo, codigo) {
  checarTipo(tipo);
  const c = normalizarCodigo(codigo);
  if (!c) throw new Error("código inválido");
  const sal = aleatorio(16);
  const iv = aleatorio(12);
  const p = { app: APP, v: VERSAO, tipo, modo: "codigo", sal: b64url(sal) };
  const chave = await chaveDoCodigo(c, sal);
  const dados = await sutil().encrypt({ name: "AES-GCM", iv, additionalData: cabecalho(p) }, chave, enc.encode(JSON.stringify(conteudo)));
  return { ...p, iv: b64url(iv), dados: b64url(dados) };
}

/** Cifra para o dono de `publicaDestino`. `de` é a chave pública do remetente. */
export async function cifrarParaChave(conteudo, tipo, { privada, publica }, publicaDestino) {
  checarTipo(tipo);
  const sal = aleatorio(16);
  const iv = aleatorio(12);
  const p = { app: APP, v: VERSAO, tipo, modo: "ecdh", de: publica, sal: b64url(sal) };
  const chave = await chaveEcdh(privada, publicaDestino, sal, tipo);
  const dados = await sutil().encrypt({ name: "AES-GCM", iv, additionalData: cabecalho(p) }, chave, enc.encode(JSON.stringify(conteudo)));
  return { ...p, iv: b64url(iv), dados: b64url(dados) };
}

export class PacoteInvalido extends Error {}

/**
 * Decifra um pacote. `segredo` é { codigo } para o modo "codigo" ou
 * { privada } para o modo "ecdh". Falha com PacoteInvalido se o pacote foi
 * alterado, se a chave não é a certa ou se o formato não é reconhecido.
 */
export async function decifrar(pacote, segredo) {
  if (!pacote || pacote.app !== APP || pacote.v !== VERSAO) throw new PacoteInvalido("pacote de outro aplicativo ou versão");
  checarTipo(pacote.tipo);
  let chave;
  try {
    const sal = deB64url(pacote.sal);
    if (pacote.modo === "codigo") {
      const c = normalizarCodigo(segredo?.codigo);
      if (!c) throw new PacoteInvalido("código inválido");
      chave = await chaveDoCodigo(c, sal);
    } else if (pacote.modo === "ecdh") {
      if (!segredo?.privada || !pacote.de) throw new PacoteInvalido("falta a chave");
      chave = await chaveEcdh(segredo.privada, pacote.de, sal, pacote.tipo);
    } else throw new PacoteInvalido("modo desconhecido");
    const claro = await sutil().decrypt(
      { name: "AES-GCM", iv: deB64url(pacote.iv), additionalData: cabecalho(pacote) },
      chave,
      deB64url(pacote.dados),
    );
    return JSON.parse(dec.decode(claro));
  } catch (e) {
    if (e instanceof PacoteInvalido) throw e;
    throw new PacoteInvalido("não foi possível abrir o pacote: código ou chave errados, ou pacote alterado");
  }
}

// ---------- Texto e QR code ----------

async function comprimir(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function descomprimir(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Pacote em texto compacto, para relay, QR code ou copiar e colar. */
export async function serializar(pacote) {
  return PREFIXO + b64url(await comprimir(enc.encode(JSON.stringify(pacote))));
}

export async function desserializar(texto) {
  const t = String(texto ?? "").trim();
  if (!t.startsWith(PREFIXO)) throw new PacoteInvalido("este texto não é um pacote do app");
  try {
    return JSON.parse(dec.decode(await descomprimir(deB64url(t.slice(PREFIXO.length)))));
  } catch {
    throw new PacoteInvalido("pacote incompleto ou corrompido");
  }
}

/** Parte um texto em pedaços para QR codes em sequência ("MTCAQ:2/3:..."). */
export function partirParaQr(texto, tamanho = 900) {
  const n = Math.max(1, Math.ceil(texto.length / tamanho));
  if (n === 1) return [texto];
  return Array.from({ length: n }, (_, i) => `MTCAQ:${i + 1}/${n}:${texto.slice(i * tamanho, (i + 1) * tamanho)}`);
}

/**
 * Junta pedaços lidos em qualquer ordem. Devolve { completo, texto, faltam }.
 * Aceita também um texto inteiro (QR único).
 */
export function juntarQr(pedacos) {
  const lista = [...pedacos];
  if (lista.length === 1 && !lista[0].startsWith("MTCAQ:")) return { completo: true, texto: lista[0], faltam: [] };
  const partes = new Map();
  let total = 0;
  for (const p of lista) {
    const m = /^MTCAQ:(\d+)\/(\d+):(.*)$/s.exec(p);
    if (!m) continue;
    total = Number(m[2]);
    partes.set(Number(m[1]), m[3]);
  }
  const faltam = [];
  for (let i = 1; i <= total; i++) if (!partes.has(i)) faltam.push(i);
  if (!total || faltam.length) return { completo: false, texto: null, faltam: total ? faltam : [1] };
  return { completo: true, texto: Array.from({ length: total }, (_, i) => partes.get(i + 1)).join(""), faltam: [] };
}
