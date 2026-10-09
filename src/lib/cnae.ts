// Atividade da empresa pelo CNAE (subclasse de 7 dígitos), para identificar o cliente quando a base da
// TOTVS só traz o código anonimizado (CODT). A descrição é a oficial do IBGE (CNAE 2.3,
// servicodados.ibge.gov.br/api/v2/cnae/subclasses/<código>); o rótulo é a forma curta usada no nome.
// Cobre os CNAEs das amostras (data/exemplos/totvs); um CNAE fora da lista cai no segmento informado.

type AtividadeCnae = { descricao: string; rotulo: string };

const ATIVIDADES: Record<string, AtividadeCnae> = {
  "1112700": { rotulo: "Vinícola", descricao: "Fabricação de vinho" },
  "2222600": { rotulo: "Embalagens plásticas", descricao: "Fabricação de embalagens de material plástico" },
  "2710402": {
    rotulo: "Fabricante de transformadores",
    descricao: "Fabricação de transformadores, indutores, conversores, sincronizadores e semelhantes, peças e acessórios",
  },
  "2824102": {
    rotulo: "Fabricante de ar-condicionado",
    descricao: "Fabricação de aparelhos e equipamentos de ar condicionado para uso não industrial",
  },
  "2949299": {
    rotulo: "Autopeças",
    descricao: "Fabricação de outras peças e acessórios para veículos automotores não especificadas anteriormente",
  },
  "3011301": { rotulo: "Estaleiro", descricao: "Construção de embarcações de grande porte" },
  "3520402": { rotulo: "Distribuidora de gás", descricao: "Distribuição de combustíveis gasosos por redes urbanas" },
  "4639701": { rotulo: "Atacado de alimentos", descricao: "Comércio atacadista de produtos alimentícios em geral" },
  "4644301": { rotulo: "Distribuidora de medicamentos", descricao: "Comércio atacadista de medicamentos e drogas de uso humano" },
  "4644302": { rotulo: "Distribuidora veterinária", descricao: "Comércio atacadista de medicamentos e drogas de uso veterinário" },
  "4685100": {
    rotulo: "Atacado siderúrgico",
    descricao: "Comércio atacadista de produtos siderúrgicos e metalúrgicos, exceto para construção",
  },
  "4711302": {
    rotulo: "Supermercado",
    descricao: "Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - supermercados",
  },
  "4751201": {
    rotulo: "Varejo de informática",
    descricao: "Comércio varejista especializado de equipamentos e suprimentos de informática",
  },
  "4781400": { rotulo: "Varejo de vestuário", descricao: "Comércio varejista de artigos do vestuário e acessórios" },
  "6201501": { rotulo: "Software sob encomenda", descricao: "Desenvolvimento de programas de computador sob encomenda" },
  "6203100": {
    rotulo: "Licenciamento de software",
    descricao: "Desenvolvimento e licenciamento de programas de computador não customizáveis",
  },
  "6209100": { rotulo: "Suporte em TI", descricao: "Suporte técnico, manutenção e outros serviços em tecnologia da informação" },
  "6311900": {
    rotulo: "Hospedagem e dados",
    descricao: "Tratamento de dados, provedores de serviços de aplicação e serviços de hospedagem na internet",
  },
  "6550200": { rotulo: "Plano de saúde", descricao: "Planos de saúde" },
  "7112000": { rotulo: "Engenharia", descricao: "Serviços de engenharia" },
  "7210000": { rotulo: "Pesquisa e desenvolvimento", descricao: "Pesquisa e desenvolvimento experimental em ciências físicas e naturais" },
  "8020001": { rotulo: "Monitoramento de segurança", descricao: "Atividades de monitoramento de sistemas de segurança eletrônico" },
  "8532500": { rotulo: "Faculdade", descricao: "Educação superior - graduação e pós-graduação" },
  "8610101": {
    rotulo: "Hospital",
    descricao: "Atividades de atendimento hospitalar, exceto pronto socorro e unidades para atendimento a urgências",
  },
  "8630599": { rotulo: "Clínica ambulatorial", descricao: "Atividades de atenção ambulatorial não especificadas anteriormente" },
  "8640212": { rotulo: "Hemoterapia", descricao: "Serviços de hemoterapia" },
  "9430800": { rotulo: "Associação de direitos sociais", descricao: "Atividades de associações de defesa de direitos sociais" },
};

/** "86.10-1-01", "8610101" ou 8610101 → "8610101" (só os 7 dígitos). */
export function normalizarCnae(cnae: unknown) {
  const digitos = String(cnae ?? "").replace(/\D/g, "");
  return digitos.length === 7 ? digitos : undefined;
}

export const atividadeCnae = (cnae: unknown): AtividadeCnae | undefined => {
  const codigo = normalizarCnae(cnae);
  return codigo ? ATIVIDADES[codigo] : undefined;
};

/**
 * Nome descritivo do cliente, montado só com dados da base: atividade (CNAE, ou o segmento quando o CNAE
 * não está na lista), UF e o código do cliente. "Hospital · RS (T54451)". Sem código, não há cliente a nomear.
 */
export function nomeDescritivoCliente(dados: { codigoCliente?: string; cnae?: string; segmento?: string; uf?: string }) {
  const codigo = dados.codigoCliente?.trim();
  if (!codigo) return undefined;
  const atividade = atividadeCnae(dados.cnae)?.rotulo ?? dados.segmento?.trim();
  if (!atividade) return undefined;
  const uf = dados.uf?.trim().toUpperCase();
  return `${atividade}${uf ? ` · ${uf}` : ""} (${codigo})`;
}
