// Termo de consentimento mostrado ao paciente na primeira entrada.
// Texto aprovado pelo Pedro em 06/11/2026. Ao mudar o texto, mudar também a versão
// (quem aceitou a versão anterior verá o termo novo e aceitará de novo).
window.TERMO = {
  versao: 'v1-2026-11-06',
  html: `
<h3>Termo de consentimento: Área do paciente</h3>
<p><b>Responsável:</b> Pedro Andrade Rüger, neuropsicólogo, CRP 04/63435.</p>
<p><b>O que é guardado:</b> seu e-mail (para você entrar), seu nome ou um código, as respostas que você escrever nos questionários liberados para você e as datas de início, de salvamento e de envio.</p>
<p><b>Para quê:</b> somente para a sua avaliação ou acompanhamento com o profissional responsável. Suas respostas não são usadas para nenhuma outra finalidade e não são compartilhadas com terceiros.</p>
<p><b>Dados de saúde:</b> as respostas podem conter informações sobre saúde, que a Lei Geral de Proteção de Dados (Lei 13.709/2018) trata como dados pessoais sensíveis. Elas são tratadas com base no seu consentimento e para a tutela da sua saúde, com sigilo profissional.</p>
<p><b>Onde ficam:</b> num serviço de banco de dados na internet (Supabase), com servidores em São Paulo, Brasil. O acesso exige login pelo seu e-mail e regras do banco permitem que só você e o profissional responsável vejam as suas respostas. A conexão é criptografada.</p>
<p><b>Por quanto tempo:</b> as respostas ficam no serviço on-line enquanto durar a avaliação ou o acompanhamento. Depois, são copiadas para o prontuário do profissional, guardado pelo prazo exigido pelas normas do Conselho Federal de Psicologia, e podem ser apagadas do serviço on-line.</p>
<p><b>Seus direitos:</b> você pode pedir acesso, correção ou exclusão dos seus dados, e pode retirar este consentimento a qualquer momento, falando com o profissional responsável. Retirar o consentimento não apaga o que já foi usado na avaliação até aquele momento.</p>
<p><b>Neste aparelho:</b> enquanto você preenche, uma cópia do que você escreveu fica guardada neste navegador, para não perder nada se a internet cair. Ela é apagada quando você envia. Se o aparelho for compartilhado, toque em "Sair" ao terminar.</p>
`,
};
