/** Códigos lançados pelas funções do banco -> mensagens. Texto desconhecido NUNCA é exibido ao usuário. */
const MAP: Record<string, string> = {
  nao_autenticado: "Entre novamente para continuar.",
  sem_permissao: "Você não tem permissão para esta ação.",
  nao_encontrado: "Registro não encontrado.",
  status_invalido: "Esta ação não está disponível no status atual da nota.",
  nota_bloqueada: "A nota já foi enviada e não pode mais ser alterada.",
  aprovacao_desatualizada: "Os dados mudaram depois da aprovação. Revise e aprove novamente.",
  aprovador_deve_ser_outro: "Pela regra da empresa, quem criou a nota não pode aprová-la.",
  cnpj_invalido: "CNPJ inválido.",
  cnpj_duplicado: "Este CNPJ já está cadastrado.",
  documento_invalido: "CPF/CNPJ do tomador inválido.",
  competencia_futura: "A competência não pode ser posterior ao mês atual.",
  codigo_servico_invalido: "Código de serviço não habilitado para esta empresa.",
  limite_cnpj_plano: "Seu plano permite apenas 1 CNPJ.",
  limite_organizacoes: "Limite de organizações atingido.",
  producao_exige_agente: "Produção exige o agente local com certificado A1.",
  homologacao_pendente: "Conclua uma emissão autorizada em homologação antes de habilitar produção.",
  empresa_sem_agente: "Configure a empresa com emissor 'agente' antes de criar um agente.",
  ja_em_producao: "A empresa já está em produção.",
  ultimo_admin: "A organização precisa de ao menos um administrador ativo.",
  empresa_invalida: "Empresa inválida para esta organização.",
  agente_invalido: "Agente não autorizado.",
  cep_invalido: "CEP do tomador inválido.",
  dados_fiscais_incompletos: "Complete os dados fiscais da empresa (código de tributação e município da prestação).",
  campos_invalidos: "Confira os campos do formulário.",
  credenciais: "E-mail ou senha incorretos.",
  senha_fraca: "Use uma senha com 10 ou mais caracteres.",
  confirme_email: "Enviamos um e-mail de confirmação. Abra-o para ativar a conta.",
};

export function errorCode(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? "";
  const hit = Object.keys(MAP).find((k) => msg.includes(k));
  if (hit) return hit;
  if (/permission denied|row-level security/i.test(msg)) return "sem_permissao";
  return "erro_generico";
}
export const errorMessage = (code: string | undefined) =>
  (code && MAP[code]) || (code ? "Não foi possível concluir a operação. Tente novamente." : undefined);
