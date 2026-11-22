// Estado do Trilha Psicológica Livre sobre o armazém cifrado (app/comum/armazem.js).
// Tudo fica no aparelho. Sem conta, sem relay, sem envio. Coleções:
//   config/principal   consentimento (versão do termo, data, idade confirmada), triagem
//   config/licenca     ver licenca.js
//   feitas/<id>        { id, id_estavel, data, em, antes, depois, segundos }
//   registros/<id>     { id, tipo, id_estavel, data, em, campos }
//   hierarquias/<id_estavel>  { itens: [{ id, texto, nota, feito }] }
//   plano/principal    plano de segurança preenchido pela própria pessoa

import { abrirArmazem } from "./comum/armazem.js";
import { avaliarTriagem, dataLocal, limparPlano, ordenarHierarquia, VERSAO_TERMO } from "./logica.js";

let contador = 0;
const novoId = () =>
  `${Date.now().toString(36).padStart(9, "0")}-${(contador++ % 1679616).toString(36).padStart(4, "0")}-${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

const nota = (v) => (typeof v === "number" && v >= 0 && v <= 10 ? Math.round(v) : null);

export async function abrirEstado(backend) {
  const a = await abrirArmazem(backend);
  const valores = async (c) => (await a.listar(c)).map((x) => x.valor);

  const api = {
    armazem: a,
    async config() {
      return (await a.ler("config", "principal")) ?? null;
    },
    async salvarConfig(mudancas) {
      const nova = { ...((await api.config()) ?? {}), ...mudancas };
      await a.gravar("config", "principal", nova);
      return nova;
    },
    /** Entrada: 18 anos ou mais (D-132) e consentimento registrado com versão do termo e data. */
    async registrarEntrada({ maior, aceite, agora = new Date() }) {
      if (maior !== true) throw new Error("o app é só para maiores de 18 anos");
      if (aceite !== true) throw new Error("aceite o termo de uso e a política de privacidade");
      return api.salvarConfig({
        consentimento: { versao_termo: VERSAO_TERMO, em: agora.toISOString(), maior_de_18: true, base_legal: "consentimento (LGPD, art. 11, I)" },
      });
    },
    /** Guarda a triagem. Só a resposta e a data; nada sai do aparelho. */
    async registrarTriagem(respostas, agora = new Date()) {
      const r = avaliarTriagem(respostas, agora);
      if (!r.completa) throw new Error("responda todas as perguntas");
      await api.salvarConfig({ triagem: r });
      return r;
    },
    async feitas() {
      return valores("feitas");
    },
    async marcarFeita({ id_estavel, antes = null, depois = null, segundos = null, agora = new Date() }) {
      const id = novoId();
      const v = { id, id_estavel, data: dataLocal(agora), em: agora.toISOString(), antes: nota(antes), depois: nota(depois), segundos: typeof segundos === "number" ? segundos : null };
      await a.gravar("feitas", id, v);
      return v;
    },
    async registros() {
      return valores("registros");
    },
    async salvarRegistro({ tipo, id_estavel = null, campos, agora = new Date() }) {
      const id = novoId();
      const v = { id, tipo, id_estavel, data: dataLocal(agora), em: agora.toISOString(), campos };
      await a.gravar("registros", id, v);
      return v;
    },
    async removerRegistro(id) {
      await a.remover("registros", id);
    },
    async hierarquia(idEstavel) {
      return ordenarHierarquia((await a.ler("hierarquias", idEstavel))?.itens ?? []);
    },
    async salvarHierarquia(idEstavel, itens) {
      const o = ordenarHierarquia(itens);
      await a.gravar("hierarquias", idEstavel, { itens: o.itens });
      return o;
    },
    async plano() {
      return (await a.ler("plano", "principal")) ?? null;
    },
    async salvarPlano(entrada, agora = new Date()) {
      const p = { ...limparPlano(entrada), atualizado_em: agora.toISOString() };
      await a.gravar("plano", "principal", p);
      return p;
    },
    /** Apagar tudo dentro do app: valores, chave mestra e licença. */
    async apagarTudo() {
      await a.apagarTudo();
    },
  };
  return api;
}
