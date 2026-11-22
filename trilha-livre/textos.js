// Textos legais do Trilha Psicológica Livre. RASCUNHO para revisão jurídica do
// Pedro (ver app/livre/LOJA.md). Linguagem simples, de propósito.
// Campos entre colchetes ficam para o Pedro preencher antes de publicar.

export const POLITICA = {
  titulo: "Política de privacidade",
  versao: "2026-11-22-livre (rascunho)",
  secoes: [
    {
      titulo: "Em poucas palavras",
      paragrafos: [
        "O Trilha Psicológica Livre guarda tudo só no seu aparelho. Não tem conta nem cadastro, não pede nome, e-mail nem telefone. O desenvolvedor do app não recebe, não lê e não guarda nada do que você responde ou escreve.",
        "O app não envia nada pela internet: não tem servidor de dados, publicidade, rastreamento nem estatística de uso.",
      ],
    },
    {
      titulo: "Quem é responsável",
      paragrafos: ["Controlador do app: [nome ou razão social, CNPJ ou CPF, endereço]. Contato para privacidade: [e-mail do encarregado]."],
    },
    {
      titulo: "Que dados o app trata",
      paragrafos: [
        "No seu aparelho: a confirmação de que você tem 18 anos ou mais; a data em que aceitou este termo; as respostas da triagem de entrada; as práticas que você fez, com as notas de 0 a 10 de antes e depois; os registros que você preencheu; as suas listas de passos para enfrentar o medo; o seu plano de segurança.",
        "Esses são dados pessoais sensíveis de saúde (LGPD, art. 5º, II). Por isso ficam guardados cifrados no aparelho: no celular, num banco cifrado com a chave guardada pelo sistema; no navegador, cada dado é cifrado com uma chave que não sai do navegador.",
      ],
    },
    {
      titulo: "Para que e com qual base legal",
      paragrafos: [
        "Os dados servem só para o app funcionar para você: mostrar as práticas certas depois da triagem, guardar o que você registrou e mostrar o seu progresso.",
        "A base legal é o seu consentimento específico e destacado (LGPD, art. 11, I), registrado na entrada do app com a data e a versão deste texto. Você pode retirar o consentimento quando quiser, apagando os dados no próprio app.",
      ],
    },
    {
      titulo: "Sugestões de melhoria",
      paragrafos: [
        "A tela Sugestões de melhoria monta uma mensagem que você mesmo envia, pelo WhatsApp, e-mail ou outro app seu, para quem desenvolve o app. Nada é enviado sem você tocar em enviar. A mensagem leva só o que você escreveu, o que marcou e a versão do app.",
        "Se você usar o botão Falar, a fala vira texto pelo serviço de voz do seu navegador (Google ou Apple), pelas regras desse serviço. O microfone do teclado do celular é outra opção.",
      ],
    },
    {
      titulo: "Pagamento",
      paragrafos: ["[A definir com o modelo de cobrança.] Se houver assinatura, ela é feita pela loja de aplicativos (Apple ou Google), que trata os dados de pagamento pelas regras dela. O app só recebe da loja se a assinatura está ativa."],
    },
    {
      titulo: "Seus direitos",
      paragrafos: [
        "Você pode ver os seus dados no próprio app e apagar tudo em Ajustes, a qualquer momento. Apagar no app apaga de verdade, porque não existe cópia em outro lugar. Desinstalar o app também apaga tudo.",
        "Não fazemos cópia de segurança na nuvem. Se você trocar de aparelho, os dados não vão junto.",
      ],
    },
    {
      titulo: "Idade",
      paragrafos: ["O app é só para maiores de 18 anos."],
    },
    {
      titulo: "Mudanças",
      paragrafos: ["Se este texto mudar, o app mostra a versão nova e pede o seu aceite de novo antes de continuar."],
    },
  ],
};

export const TERMO = {
  titulo: "Termo de uso",
  versao: "2026-11-22-livre (rascunho)",
  secoes: [
    {
      titulo: "O que é o app",
      paragrafos: [
        "O Trilha Psicológica Livre é um app de autoajuda com práticas de terapia cognitivo-comportamental e de aceitação e compromisso, escritas em linguagem simples, para usar por conta própria.",
      ],
    },
    {
      titulo: "O que o app não é",
      paragrafos: [
        "O app não substitui atendimento com psicólogo ou médico, não faz diagnóstico, não indica tratamento e não é serviço de emergência. Ninguém acompanha o que você faz aqui.",
        "Em perigo ou crise, ligue 188 (CVV, apoio emocional, 24 horas) ou 192 (SAMU), ou vá ao pronto-socorro mais próximo.",
      ],
    },
    {
      titulo: "Triagem",
      paragrafos: [
        "Na entrada, o app faz perguntas curtas, escritas para ele, que não são teste psicológico nem diagnóstico. Elas servem para mostrar a ajuda certa e para guardar as práticas que, pelas suas respostas, pedem acompanhamento profissional. Responda com sinceridade. O app pede para refazer a triagem de tempos em tempos.",
      ],
    },
    {
      titulo: "Como usar com segurança",
      paragrafos: [
        "Leia sempre o quadro de cuidado de cada prática antes de começar. Se uma prática deixar o mal-estar maior, pare e procure um profissional.",
        "Nas práticas de enfrentar o medo, vá sempre aos poucos, pela sua própria lista, começando pelos passos mais fáceis.",
        "Proteja o seu aparelho com senha ou biometria. Quem tiver acesso ao aparelho desbloqueado pode ver o que está no app.",
      ],
    },
    {
      titulo: "Idade",
      paragrafos: ["O app é só para maiores de 18 anos."],
    },
    {
      titulo: "Conteúdo",
      paragrafos: ["Os textos das práticas são de [autor e titular dos direitos] e estão protegidos por direito autoral. São para o seu uso pessoal."],
    },
    {
      titulo: "Assinatura",
      paragrafos: ["[A definir com o modelo de cobrança: preço, período de teste, renovação e cancelamento pela loja.] A Ajuda agora, o plano de segurança e o apagar dados nunca dependem de pagamento."],
    },
    {
      titulo: "Responsabilidade",
      paragrafos: ["O desenvolvedor mantém o app funcionando com cuidado e revisa o conteúdo, mas o uso é por sua conta e não cria relação de atendimento. [Cláusulas de limitação a revisar pelo jurídico, respeitado o Código de Defesa do Consumidor.]"],
    },
    {
      titulo: "Foro e contato",
      paragrafos: ["Vale a lei brasileira. Contato: [e-mail]. Foro: [comarca], sem prejuízo do foro do consumidor."],
    },
  ],
};
