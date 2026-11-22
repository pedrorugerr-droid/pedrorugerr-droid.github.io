// Licença do Trilha Psicológica Livre. Modelo de cobrança A DEFINIR pelo Pedro
// (D-129: assinatura nas lojas, planos e preços a definir). Mesmo desenho do
// app clínico (clinico/src/licenca.js): estado lido do armazém local, sem rede
// a cada abertura; a loja só entra quando houver provedor (StoreKit e Google
// Play Billing, via plugin Capacitor). Até lá, o provedor é o de avaliação.
//
// Estados: "teste" (a partir da primeira abertura), "ativa" (assinatura
// confirmada pela loja), "vencida". Enquanto MODELO for "a_definir", o app
// trata tudo como liberado.
//
// Regra fixa, qualquer que seja o modelo: Ajuda agora, plano de segurança,
// triagem, termo, privacidade e apagar os dados nunca ficam atrás de pagamento.

export const MODELO = "a_definir";
export const DIAS_TESTE = 7;
const DIA = 86400000;

/** Recursos que nunca dependem de licença. */
export const SEMPRE_LIVRE = new Set(["ajuda", "plano", "triagem", "texto", "ajustes", "entrada", "registros", "progresso"]);

export const provedorAvaliacao = {
  nome: "avaliacao",
  async consultarAssinatura() {
    return null;
  },
};

/** Lê (e cria na primeira vez) o registro de licença no armazém do app (ler/gravar). */
export async function lerLicenca(armazem, agora = new Date()) {
  let l = await armazem.ler("config", "licenca");
  if (!l) {
    l = { inicio_teste: agora.toISOString(), assinatura: null };
    await armazem.gravar("config", "licenca", l);
  }
  return l;
}

export function estadoLicenca(l, agora = new Date()) {
  if (l?.assinatura?.valida_ate && new Date(l.assinatura.valida_ate).getTime() > agora.getTime()) return "ativa";
  const inicio = l?.inicio_teste ? new Date(l.inicio_teste).getTime() : agora.getTime();
  return agora.getTime() - inicio <= DIAS_TESTE * DIA ? "teste" : "vencida";
}

/** O recurso está liberado? Com o modelo a definir, sempre. */
export function pode(recurso, l, agora = new Date(), modelo = MODELO) {
  if (SEMPRE_LIVRE.has(recurso)) return true;
  if (modelo === "a_definir") return true;
  return estadoLicenca(l, agora) !== "vencida";
}

/** Consulta a loja e guarda a assinatura confirmada. Sem provedor, nada muda. */
export async function atualizarAssinatura(armazem, provedor = provedorAvaliacao, agora = new Date()) {
  const l = await lerLicenca(armazem, agora);
  const a = await provedor.consultarAssinatura();
  if (!a) return l;
  const nova = { ...l, assinatura: { valida_ate: a.valida_ate, produto: a.produto ?? null, conferida_em: agora.toISOString(), provedor: provedor.nome } };
  await armazem.gravar("config", "licenca", nova);
  return nova;
}
