// Analisador por regras do modo demonstração. Usado quando o texto não corresponde a nenhum cenário
// roteirizado: lê a transcrição (inclusive o formato real da TOTVS, com [LOCUTOR N], anonimização e
// erros de reconhecimento de fala) e devolve sinais com citações literais do próprio texto.
// É uma simulação por palavras-chave ponderadas: não substitui o modelo e não mede precisão.
import { normalizarBusca } from "@/lib/formatar";
import type { ContextoReuniao } from "@/lib/transcricao";
import type {
  AnaliseReuniao,
  MencaoProduto,
  ProdutoTotvs,
  Severidade,
  SinalNegocio,
  StatusProduto,
  TipoSinal,
} from "../schemas";

const MAX_SINAIS = 6;
const MAX_POR_TIPO = 3;
const MAX_PALAVRAS = 40;
const PALAVRAS_POR_RECORTE = 32;
const MIN_PALAVRAS = 6;
/** Pontuação mínima para um trecho virar sinal. */
const LIMIAR = 3;
/** Duas frases juntas só valem quando nenhuma das duas sozinha atinge o limiar. */
const PENALIDADE_PAR = 0.3;

type Papel = "totvs" | "cliente" | "desconhecido";
type Regra = { re: RegExp; peso: number; subtipo?: string; /** vale mesmo dito por alguém da TOTVS */ vozTotvs?: boolean };
type Produto = { produto: ProdutoTotvs; regex: RegExp; concorrente?: boolean };

/* ---------- Catálogo (com as grafias erradas mais comuns da transcrição automática) ---------- */

const PRODUTOS: Produto[] = [
  { produto: "TOTVS Protheus", regex: /\bProth?eus\b/i },
  { produto: "TOTVS RM", regex: /\bR?RM\b/ },
  { produto: "TOTVS Fluig", regex: /\bFluig\b/i },
  { produto: "TOTVS Techfin", regex: /\bTechfin\b/i },
  { produto: "RD Station", regex: /\bRD ?Station\b|\bRD\b/ },
  { produto: "TOTVS Assinatura Eletrônica", regex: /\bTAI\b|[Aa]ssinatura [Ee]letr[ôo]nica/ },
  { produto: "TOTVS Transmite", regex: /\bTransmite?\b/i },
  { produto: "TOTVS Cloud", regex: /\b(?:cloud|nuvem) (?:da |do )?(?:TOTVS|TOTUS|TOTOS)\b|\bTOTVS Cloud\b|\bT-?Cloud\b/i },
  { produto: "TOTVS Analytics", regex: /\bAnalytics\b|\bGood ?Data\b/i },
  { produto: "Senior Sistemas", regex: /\bSenior\b/, concorrente: true },
  { produto: "SAP", regex: /\bSAP\b/, concorrente: true },
  { produto: "Oracle", regex: /\bOracle\b/i, concorrente: true },
  { produto: "Sankhya", regex: /\bSankh?[yi]a\b/i, concorrente: true },
  { produto: "Omie", regex: /\bOmie\b/i, concorrente: true },
  { produto: "Ploomes", regex: /\b(?:Pl?oomes|Plumes|Plomes|Publis|Qoomis|Turbis)\b/i, concorrente: true },
  { produto: "Salesforce", regex: /\bSales ?force\b|\bseios Force\b/i, concorrente: true },
  { produto: "Mercanet", regex: /\bMercanete?\b/i, concorrente: true },
  { produto: "Power BI", regex: /\bPower ?BI\b/i, concorrente: true },
];

/* ---------- Regras (sobre texto minúsculo e sem acentos) ---------- */

const REGRAS: Record<TipoSinal, Regra[]> = {
  CHURN_RISK: [
    { re: /\b(cancelar|cancelamento|rescindir|rescisao|distrato)\b/, peso: 3, subtipo: "Ameaça de Cancelamento" },
    { re: /\b(cancelou|cancelamos|cancelei)\b/, peso: 1.5, subtipo: "Ameaça de Cancelamento" },
    { re: /\bnao (vamos |vai |vou )?renova/, peso: 3, subtipo: "Ameaça de Cancelamento" },
    {
      re: /\b(pode|vai|deve) (dar|gerar|causar) (um )?(problema|risco)|\bo cliente (esta|ta) (insatisfeito|reclamando|chateado)|\bquestione os valores|\brisco de (perder|cancelamento)/,
      peso: 3,
      subtipo: "Risco na Conta",
      vozTotvs: true,
    },
    { re: /\bnao (recebi|recebemos)\b|\bainda nao (vi|vimos|tivemos|recebemos)\b|\bna expectativa de\b/, peso: 2, subtipo: "Expectativa de Implantação" },
    { re: /\bmigr(ar|acao|amos|ou)\b|\btrocar (de |o )?(sistema|erp|fornecedor|ferramenta)|\bsubstituir/, peso: 2, subtipo: "Risco de Migração" },
    {
      re: /\bnao (tem|temos) (usado|utilizado)|\bnao (usa|usamos|utilizamos) mais|\bdeixamos de usar|\bsacando fora|\btiramos o\b|\btirou o\b|\bdesativ/,
      peso: 3,
      subtipo: "Baixo Uso / Descontinuação",
    },
    {
      re: /\bnao (esta|estava|estao) (nos )?(gerando|funcionando|rodando|fluindo|processando|atendendo)|\bnao funciona/,
      peso: 2.5,
      subtipo: "Insatisfação Operacional",
    },
    { re: /\blent[oa]\b|\btravand|\btravou\b|\bcaiu\b|\binstavel|\bdemorad|\bdemora\b|\bnivel de stress|\bestresse/, peso: 1.5, subtipo: "Desempenho" },
    {
      re: /\bdificuldade|\bproblema|\bruim\b|\breclam|\binsatisf|\bfrustr|\bsofre\b|\bcomplicado\b|\bresistentes?\b|\bamorosidade|\bmorosidade/,
      peso: 1.5,
      subtipo: "Insatisfação Operacional",
    },
    {
      re: /\bvoces (estao|tem|tiveram|estavam) (com )?(algumas? |muitas? )?(dificuldades?|problemas?)/,
      peso: 3,
      subtipo: "Insatisfação com Produto",
      vozTotvs: true,
    },
    { re: /\bsuporte\b|\bchamados?\b|\batendimento\b/, peso: 0.5, subtipo: "Insatisfação Suporte" },
    {
      re: /\bconcorrente|\boutra solucao|\boutra ferramenta|\boutro fornecedor|\boutra plataforma/,
      peso: 1.5,
      subtipo: "Avaliação de Concorrente",
      vozTotvs: true,
    },
    { re: /\b(viu|vimos|viram|fizeram|teve|tivemos) (uma )?demo(nstracao)?\b/, peso: 1.5, subtipo: "Avaliação de Concorrente", vozTotvs: true },
    {
      re: /\b(a gente|nos) (avaliou|avaliamos|contratou|contratamos|optou|optamos|escolheu|esta implementando|estamos implementando|esta implantando)/,
      peso: 1,
      subtipo: "Avaliação de Concorrente",
    },
  ],
  OPPORTUNITY: [
    // "o que eu tenho aprovado" é teto de orçamento (objeção), não aprovação do projeto.
    { re: /(?<!tenho |tinha |temos )\baprovad[oa]s?\b|\baprovou\b|\baprovamos\b/, peso: 3, subtipo: "Projeto Aprovado" },
    { re: /\bpretend(o|emos) (ver|avaliar|contratar|implantar|fazer)\b/, peso: 2, subtipo: "Interesse Declarado" },
    {
      re: /\bbater o martelo|\bfechar (o |esse |este )?(negocio|projeto|contrato)|\bter (o )?contrato assinado ate|\bassinar (o |a )?(contrato|proposta)|\bconsigo a assinatura/,
      peso: 2.5,
      subtipo: "Fechamento Próximo",
      vozTotvs: true,
    },
    {
      re: /\b(esse|este) tipo de (servico|solucao|coisa) que (eu|a gente)|\bficar (bem )?mais atrativo/,
      peso: 2,
      subtipo: "Interesse Declarado",
    },
    {
      re: /\binteress(e|ante|ad[oa]|a)\b|\bgostaria|\bqueria (ver|entender|saber|conhecer|ter)|\bquero\b|\bqueremos\b|\bprefiro\b|\bquerendo|\bprocurando|\bbuscando|\batrativ|\bprecis(a|amos|o|aria|ariamos) (de |ter |fazer |contratar |melhorar )/,
      peso: 1.5,
      subtipo: "Interesse Declarado",
    },
    {
      re: /\blevar (esse|este|o) (ponto|assunto|tema)|\breuniao de socios|\blevar (para|pra) (a )?(diretoria|direcao)/,
      peso: 2,
      subtipo: "Decisão em Andamento",
    },
    {
      re: /\bexpan(dir|sao)|\bampliar|\bampliac|\bcrescer|\bnovas? (unidades?|filia(l|is)|empresas?|lojas?)|\bmais usuarios|\bmais licencas|\boutros processos|\bincluir (essas|estas|mais|tambem)|\bsegunda onda|\bterceira onda/,
      peso: 2,
      subtipo: "Expansão",
    },
    {
      re: /\bmanual\b|\bplanilhas?\b|\bpapelada|\bdigitando|\bretrabalho|\bum trabalhao|\bparar de usar|\bcontrole[^.]{0,40}dentro do sistema|\bacabar com (esse|essa|isso)|\bficar fazendo|\bse preocupar(ndo)? com/,
      peso: 2,
      subtipo: "Dor Operacional",
    },
    {
      re: /\bautomatiz|\bintegrad[oa]|\bintegrar\b|\bum so lugar|\bunica ferramenta|\bmesmo lugar|\bcentraliz|\bfornecedor unico|\bunico fornecedor/,
      peso: 1,
      subtipo: "Integração / Automação",
    },
    { re: /\bvender mais|\bpode(mos)? vender|\bupsell|\bcross[- ]?sell|\bregulariza/, peso: 3, subtipo: "Upsell na Base", vozTotvs: true },
    {
      re: /\b(tomar|preciso tomar|tenho que tomar) (uma |essa )?decisao|\bdecisao (em|ate|neste|nesse)/,
      peso: 2,
      subtipo: "Decisão em Andamento",
    },
    { re: /\bproposta\b|\bcotacao|\bquanto (custa|custaria|fica)|\bvisao de investimento|\bprecific/, peso: 1, subtipo: "Pedido de Proposta" },
    {
      re: /\b(dificuldade|problema|resistentes?|nao atendia|nao atende)\b[^.]*\b(fornecedor|sistema atual|ferramenta atual|com eles)\b|\b(fornecedor|sistema atual)\b[^.]*\b(dificuldade|resistentes?|nao atende)/,
      peso: 3,
      subtipo: "Dor com Fornecedor Atual",
    },
    { re: /\bessa dor\b|\bnos procurar\b/, peso: 1, subtipo: "Dor com Fornecedor Atual" },
    { re: /\bfaz sentido|\bisso interessa|\bvale a pena|\bperfeito\b|\bta otimo|\besta otimo|\bgostei/, peso: 0.5 },
  ],
  OBJECTION: [
    {
      re: /\bcaro\b|\bcarissim|\b(mais|muito|bem|tao) cara\b|\bmuito alto|\bbem alto|\bvalor alto|\bdesproporcional|\boneros/,
      peso: 2.5,
      subtipo: "Preço",
    },
    {
      re: /\bnao (tenho|temos|tem|ha) orcamento|\bsem orcamento|\borcamento (apertado|limitado|curto)|\bquebrando orcamento|\bnao (tenho|temos) verba/,
      peso: 3,
      subtipo: "Orçamento",
    },
    { re: /\borcamento\b|\bo que eu tenho aprovado|\bverba\b/, peso: 1, subtipo: "Orçamento" },
    { re: /\bparcel(ar|ado|amento|as|ada)\b/, peso: 3, subtipo: "Condição de Pagamento" },
    {
      re: /\bdesconto|\bbaixad[ao]\b|\bajustada\b|\breduc(ao|ir)|\bmais proximo d[oa]s?\b|\bchegar (um pouco mais |mais )?(perto|proximo)/,
      peso: 1.5,
      subtipo: "Preço",
    },
    { re: /\bmil reais|\br\$ ?\d|\b\d+ mil\b|\bmensalidade|\binvestimento (unico|inicial)/, peso: 1, subtipo: "Preço" },
    { re: /\bpara nos,? (e|eh)\b|\bpara nos,? pode ser|\bnao seja muito/, peso: 2, subtipo: "Preço" },
    { re: /\bcusto\b|\bdiferenca (da|de|entre) (proposta|preco|valor)/, peso: 0.5, subtipo: "Preço" },
    {
      re: /\bdefender o projeto|\bmostrar (um pouco )?a necessidade|\bversus o custo|\bjustificar (o|a) (investimento|projeto|compra)/,
      peso: 2.5,
      subtipo: "Aprovação Interna",
    },
    {
      re: /\bhoje a gente (\[pessoa\] |nao )tem (realmente )?uma solucao especifica|\bnao temos (uma )?solucao especifica|\bnosso roadmap/,
      peso: 3,
      subtipo: "Lacuna de Produto",
      vozTotvs: true,
    },
    {
      re: /\b(preciso|precisamos|queria) (entender|saber|ver) (o |a |os |as )?(prazo|preco|valor|custo|investimento)/,
      peso: 1.5,
      subtipo: "Preço",
    },
    {
      re: /\bpagar (antes|uma licenca|licenca)|\bnao (vou|vamos) (estar )?(nem )?(usando|usar)|\bantes de executar|\bcarencia|\bfree\b|\bcomecar a pagar/,
      peso: 2.5,
      subtipo: "Cobrança antes do Uso",
    },
    { re: /\bprazo|\bcronograma|\blevam mais tempo|\batras(o|ad)|\barriscad|\bnunca e redondinho/, peso: 1.5, subtipo: "Prazo de Implantação" },
    { re: /\bprevisao de implantacao|\bquanto tempo (a gente precisa|leva|demora)/, peso: 2.5, subtipo: "Prazo de Implantação" },
    { re: /\bimplantac/, peso: 0.5, subtipo: "Prazo de Implantação" },
    {
      re: /\bnao (posso|consigo) apresentar|\bnao recomendaria|\bnao faz sentido|\bnao vale a pena/,
      peso: 2.5,
      subtipo: "Resistência",
    },
    {
      re: /\batende bem|\bnao (temos|tem) o que reclamar|\bsistema proprio|\bnao (tem|temos) (nenhuma )?pretensao|\bpretensao alguma|\bnao (vamos|vou|pretendemos) (mudar|trocar)/,
      peso: 3,
      subtipo: "Sem Necessidade Percebida",
    },
    {
      re: /\bpontos? de atrito|\bmais uma ferramenta|\b(dois|duas|tres) (ferramentas|aplicativos|telas|sistemas)|\bcultura de utilizacao|\bnao se adequou/,
      peso: 2.5,
      subtipo: "Adoção / Complexidade",
    },
    { re: /\bpermanencia minima|\bfidelidade|\bmulta\b/, peso: 1.5, subtipo: "Condição Contratual" },
    {
      re: /\boutro canal|\boutra proposta|\bproposta (maior|menor)|\bcomparativo|\bbenchmark|\bdepara\b|\bmatriz (de )?compara/,
      peso: 2,
      subtipo: "Comparação com Concorrência",
    },
    { re: /\broi\b|\bse paga\b|\bretorno do investimento|\bcusto[- ]beneficio/, peso: 1.5, subtipo: "Dúvida ROI" },
  ],
};

/** Expressões que contêm palavra-chave mas não indicam problema ("não tem problema", "meu caro"). */
const NEUTROS =
  /\bnao (tem|ha|teve|vai ter|e|seja)( nenhum)? problema\b|\bsem problemas?\b|\bproblema nenhum\b|\bmeu caro\b|\bnao tem segredo\b|\bse foi aprovado\b|\bcancelar (todos os itens|os itens|esse para)\b|\batende bem\b(?=[^.]*\bmas\b)/g;

/** Peso das regras quando quem fala é da TOTVS: apresentar a solução não é sinal do cliente. */
const FATOR_VOZ_TOTVS: Record<TipoSinal, number> = { CHURN_RISK: 0.3, OPPORTUNITY: 0.5, OBJECTION: 0.3 };

const FORCA_ALTA = new Set(["Projeto Aprovado", "Fechamento Próximo"]);

const RECOMENDACAO: Record<string, (produto?: string) => string> = {
  "Ameaça de Cancelamento": () =>
    "Acionar o gestor de Customer Success hoje e agendar reunião de retenção com o decisor ainda nesta semana.",
  "Risco de Migração": (p) =>
    `Agendar reunião de retenção com o decisor e levar um plano de evolução${p ? ` de ${p}` : ""} antes que a migração avance.`,
  "Baixo Uso / Descontinuação": (p) =>
    `Agendar visita de Customer Success para entender por que a conta deixou de usar${p ? ` ${p}` : " a solução TOTVS"} e propor plano de reativação.`,
  "Insatisfação Operacional": (p) =>
    `Abrir plano de ação${p ? ` para ${p}` : ""} com suporte e serviços e retornar ao cliente com causa e prazo em até 5 dias úteis.`,
  Desempenho: (p) =>
    `Envolver o time técnico${p ? ` de ${p}` : ""} em um diagnóstico de desempenho e devolver ao cliente a causa raiz com prazo.`,
  "Insatisfação Suporte": () => "Revisar os chamados abertos da conta com o suporte e dar retorno ao cliente com plano e responsável.",
  "Risco na Conta": () => "Registrar o risco no plano da conta e definir dono e prazo para resolvê-lo antes que chegue ao cliente.",
  "Expectativa de Implantação": () =>
    "Confirmar com o GP agenda, consultores e próximos marcos e enviar ao cliente ainda nesta semana.",
  "Insatisfação com Produto": (p) =>
    `Levar a dificuldade com ${p ?? "o produto"} ao time de produto e agendar devolutiva técnica com o cliente nesta semana.`,
  "Avaliação de Concorrente": (c) =>
    `Preparar comparativo frente a ${c ?? "a solução concorrente"} e reunir-se com o decisor antes da escolha.`,
  "Projeto Aprovado": () =>
    "Formalizar a proposta e coletar os dados dos signatários hoje; alinhar com o GP a data do kick-off.",
  "Fechamento Próximo": () =>
    "Priorizar a aprovação interna das condições pedidas para não perder a janela de assinatura.",
  "Interesse Declarado": (p) =>
    p
      ? `Agendar demonstração de ${p} focada na necessidade citada, com especialista do produto.`
      : "Mapear a necessidade citada e apresentar a solução TOTVS aderente com um especialista.",
  Expansão: (p) => `Dimensionar a expansão${p ? ` de ${p}` : ""} e enviar proposta complementar.`,
  "Dor Operacional": (p) =>
    `Mostrar como ${p ?? "o ecossistema TOTVS"} elimina o processo manual citado, com estimativa de horas economizadas.`,
  "Integração / Automação": (p) =>
    `Apresentar a integração nativa${p ? ` de ${p}` : " do ecossistema TOTVS"} com o fluxo descrito pelo cliente.`,
  "Upsell na Base": () =>
    "Pedir o escopo ao pré-vendas e posicionar a proposta de upgrade na próxima agenda com o cliente.",
  "Decisão em Andamento": () =>
    "Entregar o estudo de custos (TCO) antes da decisão e combinar data de retorno com o decisor.",
  "Pedido de Proposta": () => "Enviar a proposta com volumetria validada em até 48 h e agendar a apresentação dos valores.",
  "Dor com Fornecedor Atual": () =>
    "Explorar a dor com o fornecedor atual em uma demonstração das integrações TOTVS.",
  "Dor com Concorrente": (c) =>
    `Explorar a insatisfação com ${c ?? "o concorrente"} e apresentar a alternativa TOTVS com um caso de migração do segmento.`,
  "Aprovação Interna": () =>
    "Entregar ao interlocutor material de defesa interna (ROI, escopo e cronograma) para a apresentação à diretoria.",
  "Lacuna de Produto": () =>
    "Levar a lacuna ao time de produto com prazo de resposta e alinhar a expectativa com o cliente na próxima agenda.",
  Preço: () => "Montar cenário de preço com ROI/TCO do segmento e levar ao gerente comercial a margem de negociação.",
  Orçamento: () =>
    "Propor faseamento ou início no próximo ciclo orçamentário, com carência alinhada ao gerente comercial.",
  "Condição de Pagamento": () =>
    "Levar ao gerente comercial o parcelamento solicitado e responder ao cliente em até 48 h.",
  "Cobrança antes do Uso": () =>
    "Negociar carência alinhada ao início da implantação e registrar a condição na proposta.",
  "Prazo de Implantação": () => "Enviar cronograma de implantação com marcos, responsáveis e plano de contingência.",
  Resistência: () => "Entender a restrição com o interlocutor e ajustar escopo ou formato da proposta antes de reenviar.",
  "Sem Necessidade Percebida": () =>
    "Manter o relacionamento e mapear gatilhos de dor (reforma tributária, integração) para nova abordagem em 90 dias.",
  "Adoção / Complexidade": () =>
    "Apresentar plano de adoção (treinamento e jornada única do usuário) para reduzir pontos de atrito.",
  "Condição Contratual": () => "Esclarecer as condições contratuais por escrito e validar com o jurídico do cliente.",
  "Comparação com Concorrência": () =>
    "Entregar matriz comparativa de funcionalidades e preço frente à proposta concorrente.",
  "Dúvida ROI": () => "Apresentar estudo de ROI com casos do mesmo segmento.",
};

/* ---------- Quem fala (rótulos e inferência de papel) ---------- */

const ROTULO_COLCHETE = /^\s*\[([^\]\n]{1,40})\]:\s*/;
const ROTULO_NOME = /^\s*([A-ZÀ-Ú][^:\n[\]]{0,58}):\s+/;
const PAPEL_EM_ROTULO = /\(|^(vendedor|cliente|consultor|executivo|gerente|diretor|cs|totvs)\b/i;
const FALA_DA_TOTVS = /totvs|vendedor|consultor|executivo de contas|gerente de contas|\bcs\b/i;

// Quem vende fala da empresa do outro ("vocês", "de vocês") e do próprio catálogo; quem compra fala
// da própria casa ("nosso", "a gente usa", "para nós") e pede coisas ("me manda", "quanto custa").
const VOZ_TOTVS: Array<[RegExp, number]> = [
  [/\b(aqui|nos|gente|dentro|sou|somos|nova)( \w+){0,2} (da|na|de) (totvs|totus|totos|tots)\b/g, 3],
  [/\bnossas? (solucao|solucoes|plataforma|plataformas|ferramenta|proposta|metodologia|nuvem|cloud|consultoria)\b/g, 3],
  [/\bnosso (crm|produto|especialista|consultor|time de (projetos|produto|consultoria|implantacao)|diretor de cloud|engenheiro)\b/g, 3],
  [/\ba gente tem (uma |a |as |o |os )?(solucao|solucoes|plataforma|ferramenta|modulo|produto)|\btemos (uma |a )?(solucao|plataforma|ferramenta)/g, 2],
  [/\b(de|pra|para) voces\b|\bvoces (tem|usam|utilizam|estao|precisam|vao|querem|fazem)\b/g, 1.5],
  [/\b(vou|vamos) (te |lhe |pra voces |para voces )?(mandar|enviar|encaminhar|formalizar|apresentar|mostrar)\b|\bte mando\b/g, 1.5],
  [/\b(eu )?consigo (te )?(dar|fazer|oferecer|ajustar|parcelar)\b|\ba gente (consegue|pode) (fazer|dar|parcelar|ajustar|atender)\b/g, 1.5],
  [/\b(licenc\w*|capex|opex|setup|onboarding|parametriz\w*|consultor\w*|especialista|clientes?|meta|carteira)\b/g, 1],
  [/\bte (devolvo|retorno|trago)\b|\bdevolutiva\b|\btua proposta\b|\b(conseguimos|a gente conseguiu) (mexer|manter|baixar|reduzir|ajustar)\b/g, 1],
  // Descrever o que o produto permite ao comprador: "você vai conseguir", "tu pode".
  [/\b(voce|tu) (vai|vai ter|vai poder|consegue|pode|tem)\b/g, 1],
  [/\bproposta\b/g, 0.5],
  [/\bimplantac/g, 0.5],
];

const VOZ_CLIENTE: Array<[RegExp, number]> = [
  [/\bnoss[oa]s?\b/g, 1],
  [/\ba gente (usa|utiliza|usava|tinha|precisa|tem que|esta|nao tem|faz|avaliou|contratou|optou)\b|\bhoje a gente\b/g, 1],
  [/\b(para|pra) nos\b|\baqui na empresa\b|\baqui dentro\b/g, 1.5],
  [/\b(me|nos) (manda|passa|mostra|envia)\b|\bmanda (pra|para) mim\b|\bvoce(s)? (consegue|conseguem|pode|podem|conseguirem) (me )?(mandar|passar|mostrar|enviar|dar)/g, 1.5],
  [/\bcom voces\b|\bvoces da (totvs|totus|totos)\b|\bse voces\b|\bvoces me\b/g, 1.5],
  [/\bquanto (custa|fica|custaria)\b|\bqual (e |que e )?o (valor|custo|prazo)\b|\bcomo (que )?funciona\b/g, 1.5],
  [/\b(tenho|temos|tinha) (aprovado|orcamento)\b|\bo que eu tenho aprovado\b|\b(a|minha) diretora\b|\b(o|meu) diretor\b|\bdiretoria\b|\bsocios\b|\bminha (equipe|empresa|area)\b|\beu (investi|preciso|tenho que)\b/g, 1],
];

/** Locutores com menos que isso falaram pouco demais para ter o papel deduzido. */
const MIN_PALAVRAS_LOCUTOR = 60;

type Fala = { inicio: number; fim: number; locutor: string | null; papelRotulo?: Papel };

function lerFalas(texto: string): Fala[] {
  const falas: Fala[] = [];
  let anterior: string | null = null;
  let papelAnterior: Papel | undefined;
  for (const linha of texto.matchAll(/[^\n]+/g)) {
    let inicio = linha.index;
    const fim = linha.index + linha[0].length;
    let locutor: string | null = null;
    let papelRotulo: Papel | undefined;

    // "[LOCUTOR 7]: [LOCUTOR 1]: texto" (diarização encadeada): vale o último rótulo.
    for (let rotulo = texto.slice(inicio, fim).match(ROTULO_COLCHETE); rotulo; rotulo = texto.slice(inicio, fim).match(ROTULO_COLCHETE)) {
      locutor = rotulo[1];
      inicio += rotulo[0].length;
    }
    if (!locutor) {
      const nome = texto.slice(inicio, fim).match(ROTULO_NOME);
      if (nome && PAPEL_EM_ROTULO.test(nome[1]) && nome[1].split(/\s+/).length <= 6) {
        locutor = nome[1];
        papelRotulo = FALA_DA_TOTVS.test(nome[1]) ? "totvs" : "cliente";
        inicio += nome[0].length;
      }
    }
    if (!locutor) {
      // Linha sem rótulo continua a fala anterior.
      locutor = anterior;
      papelRotulo = papelAnterior;
    }
    while (inicio < fim && /\s/.test(texto[inicio])) inicio++;
    if (inicio < fim) falas.push({ inicio, fim, locutor, papelRotulo });
    anterior = locutor;
    papelAnterior = papelRotulo;
  }
  return falas;
}

function contar(texto: string, regras: Array<[RegExp, number]>) {
  return regras.reduce((soma, [re, peso]) => soma + (texto.match(re)?.length ?? 0) * peso, 0);
}

/**
 * Saldo "vendedor menos comprador" por 100 palavras de cada locutor relevante. A reunião é externa,
 * então há os dois lados: os extremos definem a régua e cada locutor fica do lado mais próximo.
 */
function saldosDosLocutores(falado: Map<string, string>): Array<{ locutor: string; saldo: number; palavras: number }> {
  const saldos: Array<{ locutor: string; saldo: number; palavras: number }> = [];
  for (const [locutor, conteudo] of falado) {
    const palavras = conteudo.split(/\s+/).length;
    if (palavras < MIN_PALAVRAS_LOCUTOR) continue;
    saldos.push({ locutor, palavras, saldo: ((contar(conteudo, VOZ_TOTVS) - contar(conteudo, VOZ_CLIENTE)) * 100) / palavras });
  }
  return saldos;
}

/**
 * Deduz quem é da TOTVS quando os locutores são só números ([LOCUTOR 7]): pelo vocabulário de quem
 * vende ("nossa solução", "vou mandar a proposta") contra o de quem compra ("nosso sistema", "para nós").
 */
function inferirPapeis(texto: string, falas: Fala[], contexto?: ContextoReuniao): Papel[] {
  // Reunião interna: todos são da TOTVS e os sinais descritos são da conta.
  if (contexto?.externa === false) return falas.map(() => "desconhecido");
  const locutores = new Set(falas.filter((f) => !f.papelRotulo && f.locutor).map((f) => f.locutor));
  if (locutores.size < 2) return falas.map((f) => f.papelRotulo ?? "desconhecido");

  const falado = new Map<string, string>();
  for (const fala of falas) {
    if (fala.papelRotulo || !fala.locutor) continue;
    falado.set(fala.locutor, `${falado.get(fala.locutor) ?? ""} ${normalizarBusca(texto.slice(fala.inicio, fala.fim))}`);
  }

  const saldos = saldosDosLocutores(falado);
  const papel = new Map<string, Papel>();
  // A régua sai só de quem falou bastante: quem disse três frases tem saldo extremo por acaso.
  const total = saldos.reduce((soma, s) => soma + s.palavras, 0);
  const principais = saldos.filter((s) => s.palavras >= Math.max(150, 0.08 * total));
  if (principais.length >= 2) {
    const valores = principais.map((s) => s.saldo);
    const maximo = Math.max(...valores);
    const minimo = Math.min(...valores);
    // Diferença pequena demais: não dá para separar os lados com segurança.
    if (maximo - minimo >= 0.8) {
      const meio = (maximo + minimo) / 2;
      for (const { locutor, saldo } of saldos) papel.set(locutor, saldo >= meio ? "totvs" : "cliente");
    }
  }
  return falas.map((f) => f.papelRotulo ?? (f.locutor ? (papel.get(f.locutor) ?? "desconhecido") : "desconhecido"));
}

/** Papel deduzido de cada locutor (para testes e diagnóstico). */
export function papeisDosLocutores(texto: string, contexto?: ContextoReuniao) {
  const falas = lerFalas(texto);
  const papeis = inferirPapeis(texto, falas, contexto);
  const falado = new Map<string, string>();
  for (const fala of falas) {
    if (fala.locutor) falado.set(fala.locutor, `${falado.get(fala.locutor) ?? ""} ${normalizarBusca(texto.slice(fala.inicio, fala.fim))}`);
  }
  const saldos = new Map(saldosDosLocutores(falado).map((s) => [s.locutor, s.saldo]));
  const resultado: Record<string, { papel: Papel; saldo?: number }> = {};
  falas.forEach((fala, indice) => {
    if (fala.locutor) resultado[fala.locutor] = { papel: papeis[indice], saldo: saldos.get(fala.locutor) };
  });
  return resultado;
}

/* ---------- Frases e trechos candidatos ---------- */

type Unidade = { inicio: number; fim: number; palavras: number; fala: number; papel: Papel };

/** Divide frases longas (comuns em transcrição sem pontuação) em recortes de até ~32 palavras. */
function recortar(texto: string, a: number, b: number): Array<[number, number, number]> {
  const tokens = [...texto.slice(a, b).matchAll(/\S+/g)];
  const recortes: Array<[number, number, number]> = [];
  let i = 0;
  while (i < tokens.length) {
    const restante = tokens.length - i;
    let j = i + (restante <= MAX_PALAVRAS ? restante : PALAVRAS_POR_RECORTE);
    if (j < tokens.length) {
      for (let k = j - 1; k > i + 15; k--) {
        if (/[,;:]$/.test(tokens[k][0])) {
          j = k + 1;
          break;
        }
      }
    }
    const ultimo = tokens[j - 1];
    recortes.push([a + tokens[i].index, a + ultimo.index + ultimo[0].length, j - i]);
    i = j;
  }
  return recortes;
}

function lerUnidades(texto: string, falas: Fala[], papeis: Papel[]): Unidade[] {
  const unidades: Unidade[] = [];
  falas.forEach((fala, indice) => {
    let inicioFrase = fala.inicio;
    const finais = [...texto.slice(fala.inicio, fala.fim).matchAll(/[.!?…]+(?=\s|$)/g)].map(
      (m) => fala.inicio + m.index + m[0].length,
    );
    if (finais.at(-1) !== fala.fim) finais.push(fala.fim);
    for (const fimFrase of finais) {
      for (const [inicio, fim, palavras] of recortar(texto, inicioFrase, fimFrase)) {
        unidades.push({ inicio, fim, palavras, fala: indice, papel: papeis[indice] });
      }
      inicioFrase = fimFrase;
    }
  });
  return unidades;
}

type Candidato = Unidade & { citacao: string; normalizado: string; /** início da 2ª frase, se for par */ meio?: number };

const normalizar = (texto: string) => normalizarBusca(texto).replace(NEUTROS, " ");

function candidato(texto: string, a: Unidade, b?: Unidade): Candidato {
  const fim = b ? b.fim : a.fim;
  const citacao = texto.slice(a.inicio, fim);
  return {
    ...a,
    fim,
    palavras: a.palavras + (b?.palavras ?? 0),
    citacao,
    normalizado: normalizar(citacao),
    meio: b?.inicio,
  };
}

/* ---------- Pontuação e escolha ---------- */

type Pontuado = Candidato & { tipo: TipoSinal; pontos: number; subtipo: string; produto?: string };

function pontuar(c: Candidato, tipo: TipoSinal): Pontuado | null {
  const fator = c.papel === "totvs" ? FATOR_VOZ_TOTVS[tipo] : 1;
  let pontos = 0;
  let principal: Regra | undefined;
  for (const regra of REGRAS[tipo]) {
    if (!regra.re.test(c.normalizado)) continue;
    pontos += regra.peso * (regra.vozTotvs ? 1 : fator);
    if (regra.subtipo && (!principal || regra.peso > principal.peso)) principal = regra;
  }

  let subtipo = principal?.subtipo;
  const citados = PRODUTOS.filter(({ regex }) => regex.test(c.citacao));
  const concorrente = citados.find((p) => p.concorrente)?.produto;
  const totvs = citados.find((p) => !p.concorrente)?.produto;
  let produto = totvs;

  if (tipo === "CHURN_RISK") {
    if (concorrente) {
      pontos += 1.5 * fator;
      if (!principal || principal.peso < 3) subtipo = "Avaliação de Concorrente";
      produto = concorrente;
    } else if (totvs) {
      pontos += 0.5;
    }
  } else if (tipo === "OPPORTUNITY") {
    if (totvs) pontos += c.papel === "totvs" ? 0.5 : 1;
    // Cliente (ou prospect) reclamando de um concorrente é porta aberta para a TOTVS.
    if (concorrente && NEGATIVO.test(c.normalizado)) {
      pontos += 2.5;
      subtipo = "Dor com Concorrente";
      produto = concorrente;
    }
  } else if (tipo === "OBJECTION" && concorrente) {
    pontos += 1;
  }
  if (c.meio !== undefined) pontos -= PENALIDADE_PAR;
  if (pontos < LIMIAR || !subtipo) return null;
  return { ...c, tipo, pontos, subtipo, produto };
}

const sobrepoe = (a: { inicio: number; fim: number }, b: { inicio: number; fim: number }) =>
  a.inicio < b.fim && b.inicio < a.fim;

function escolherSinais(texto: string, unidades: Unidade[]): Pontuado[] {
  const tipos: TipoSinal[] = ["CHURN_RISK", "OPPORTUNITY", "OBJECTION"];
  const porTipo: Record<TipoSinal, Pontuado[]> = { CHURN_RISK: [], OPPORTUNITY: [], OBJECTION: [] };
  const singularBasta = new Set<string>();

  unidades.forEach((unidade) => {
    if (unidade.palavras < MIN_PALAVRAS) return;
    for (const tipo of tipos) {
      const pontuado = pontuar(candidato(texto, unidade), tipo);
      if (!pontuado) continue;
      porTipo[tipo].push(pontuado);
      singularBasta.add(`${tipo}:${unidade.inicio}`);
    }
  });
  unidades.forEach((unidade, i) => {
    const proxima = unidades[i + 1];
    if (!proxima || proxima.fala !== unidade.fala || unidade.palavras + proxima.palavras > MAX_PALAVRAS) return;
    for (const tipo of tipos) {
      if (singularBasta.has(`${tipo}:${unidade.inicio}`) || singularBasta.has(`${tipo}:${proxima.inicio}`)) continue;
      const pontuado = pontuar(candidato(texto, unidade, proxima), tipo);
      if (pontuado) porTipo[tipo].push(pontuado);
    }
  });

  const escolhidos: Pontuado[][] = tipos.map((tipo) => {
    const ordenados = porTipo[tipo].sort((a, b) => b.pontos - a.pontos || a.palavras - b.palavras || a.inicio - b.inicio);
    const aceitos: Pontuado[] = [];
    for (const item of ordenados) {
      if (aceitos.length === MAX_POR_TIPO) break;
      if (aceitos.some((aceito) => sobrepoe(aceito, item))) continue;
      // Variedade: no máximo dois sinais do mesmo subtipo.
      if (aceitos.filter((aceito) => aceito.subtipo === item.subtipo).length >= 2) continue;
      aceitos.push(item);
    }
    return aceitos;
  });

  // Garante pelo menos um sinal de cada tipo encontrado; o resto entra por pontuação.
  const primeiros = escolhidos.flatMap((lista) => lista.slice(0, 1));
  const demais = escolhidos.flatMap((lista) => lista.slice(1)).sort((a, b) => b.pontos - a.pontos);
  return [...primeiros, ...demais].slice(0, MAX_SINAIS);
}

const NIVEIS: Severidade[] = ["BAIXA", "MÉDIA", "ALTA"];
const PESO_SEVERIDADE: Record<Severidade, number> = { ALTA: 0, MÉDIA: 1, BAIXA: 2 };
const PESO_TIPO: Record<TipoSinal, number> = { CHURN_RISK: 0, OPPORTUNITY: 1, OBJECTION: 2 };

const detrator = (contexto?: ContextoReuniao) => contexto?.nps !== undefined && contexto.nps <= 6;

function paraSinal(item: Pontuado, contexto?: ContextoReuniao): SinalNegocio {
  let nivel = item.pontos >= 5 ? 2 : item.pontos >= 3.5 ? 1 : 0;
  if (FORCA_ALTA.has(item.subtipo)) nivel = 2;
  if (item.tipo === "CHURN_RISK" && detrator(contexto)) nivel = Math.min(2, nivel + 1);
  const confianca = Math.min(0.88, 0.4 + 0.07 * item.pontos) - (item.papel === "desconhecido" ? 0.05 : 0);
  const recomendar = RECOMENDACAO[item.subtipo] ?? (() => "Registrar o ponto e definir a ação com o gerente comercial.");
  const subtipo =
    item.subtipo === "Interesse Declarado" && item.produto
      ? `Interesse ${item.produto}`
      : item.subtipo === "Avaliação de Concorrente" && item.produto
        ? `Concorrente: ${item.produto}`
        : item.subtipo;
  return {
    tipo: item.tipo,
    subtipo,
    severidade: NIVEIS[nivel],
    confianca: Math.round(Math.max(0.45, confianca) * 100) / 100,
    citacaoExata: item.citacao,
    posicaoCaracterStart: item.inicio,
    posicaoCaracterEnd: item.fim,
    recomendacaoAcao: recomendar(item.produto),
  };
}

/* ---------- Produtos citados ---------- */

const NEGATIVO =
  /\blent[oa]\b|\btrav|\bnao (esta|estava|estao) (processando|rodando|funcionando|fluindo|renderizando|gerando)|\bdificuldades?\b|\bproblema|\bruim\b|\bstress|\bnao atende|\binsatisf|\breclam/;
const EM_USO =
  /\b(a gente|nos|voces|eles?) (ja )?(usa|usam|usamos|utiliza|utilizam|utilizamos|usava|usavam|tem|temos|tinha|roda|rodam)\b|\bem uso\b|\bja (tem|temos|usa|usam|possui|possuem)\b|\bde voces\b|\bque voces tem\b|\b(do|no|o) (seu|nosso)\b|\brodando\b|\bem producao\b|\bfaz parte da licenca\b/;
/** Na fala da TOTVS, só conta como "em uso" se a frase for sobre o cliente ("de vocês", "o seu"). */
const SOBRE_O_CLIENTE = /\bvoces\b|\b(do|no|o) seu\b/;

const ROTULO_STATUS: Record<StatusProduto, string> = {
  EM_USO: "em uso",
  INTERESSE: "interesse",
  INSATISFAÇÃO: "insatisfação",
  CONCORRENTE: "concorrente",
};

function unidadeEm(unidades: Unidade[], posicao: number): Unidade | undefined {
  let baixo = 0;
  let alto = unidades.length - 1;
  while (baixo <= alto) {
    const meio = (baixo + alto) >> 1;
    const unidade = unidades[meio];
    if (posicao < unidade.inicio) alto = meio - 1;
    else if (posicao >= unidade.fim) baixo = meio + 1;
    else return unidade;
  }
  return undefined;
}

/** Até ~140 caracteres da frase, centrados na menção. */
function trechoAoRedor(texto: string, unidade: { inicio: number; fim: number }, posicao: number) {
  let inicio = unidade.inicio;
  let fim = unidade.fim;
  if (fim - inicio > 140) {
    inicio = Math.max(unidade.inicio, posicao - 60);
    fim = Math.min(unidade.fim, inicio + 140);
  }
  const trecho = texto.slice(inicio, fim).replace(/\s+/g, " ").trim();
  return `${inicio > unidade.inicio ? "…" : ""}${trecho}${fim < unidade.fim ? "…" : ""}`;
}

function mencionarProdutos(texto: string, unidades: Unidade[]): MencaoProduto[] {
  const mencoes: Array<{ mencao: MencaoProduto; vezes: number }> = [];
  for (const { produto, regex, concorrente } of PRODUTOS) {
    const ocorrencias = [...texto.matchAll(new RegExp(regex.source, `${regex.flags}g`))];
    if (ocorrencias.length === 0) continue;
    const frases = ocorrencias.map((m) => ({
      posicao: m.index,
      unidade: unidadeEm(unidades, m.index) ?? { inicio: Math.max(0, m.index - 70), fim: m.index + 70, papel: "desconhecido" as Papel },
    }));
    const insatisfeita = concorrente
      ? undefined
      : frases.find(({ unidade }) => {
          const normal = normalizar(texto.slice(unidade.inicio, unidade.fim));
          return NEGATIVO.test(normal) && (unidade.papel !== "totvs" || /\bvoces\b/.test(normal));
        });
    const emUso = concorrente
      ? undefined
      : frases.find(({ unidade }) => {
          const normal = normalizar(texto.slice(unidade.inicio, unidade.fim));
          return EM_USO.test(normal) && (unidade.papel !== "totvs" || SOBRE_O_CLIENTE.test(normal));
        });
    const status: StatusProduto = concorrente ? "CONCORRENTE" : insatisfeita ? "INSATISFAÇÃO" : emUso ? "EM_USO" : "INTERESSE";
    // Para o contexto, prefere uma frase completa a um fragmento ("Plumes.").
    const base = insatisfeita ?? emUso ?? frases.find(({ unidade }) => texto.slice(unidade.inicio, unidade.fim).split(/\s+/).length >= MIN_PALAVRAS) ?? frases[0];
    const vezes = ocorrencias.length;
    mencoes.push({
      mencao: {
        produto,
        status,
        contexto: `“${trechoAoRedor(texto, base.unidade, base.posicao)}”${vezes > 1 ? ` · ${vezes} menções` : ""}`,
      },
      vezes,
    });
  }
  // Produtos TOTVS primeiro, depois concorrentes; dentro de cada grupo, os mais citados.
  const concorrente = (item: (typeof mencoes)[number]) => Number(item.mencao.status === "CONCORRENTE");
  return mencoes.sort((a, b) => concorrente(a) - concorrente(b) || b.vezes - a.vezes).map(({ mencao }) => mencao);
}

/* ---------- Resumo e próximos passos ---------- */

const COMPROMISSO =
  /\b(vou|vamos|eu) (te |lhe |ja |pra voce |para voce |pra voces |para voces )*(mandar|enviar|encaminhar|marcar|agendar|retornar|voltar|formalizar|passar|chamar|trazer)\b|\bte (mando|envio|ligo|retorno)\b/;
const PRAZO =
  /\b(hoje|amanha|segunda|terca|quarta|quinta|sexta|semana que vem|proxima semana|ate (o )?(final|fim)|dia \d+|ainda hoje|de manha|na sequencia|logo)\b/;

/** Compromissos com prazo ditos na reunião ("te mando a proposta ainda hoje"): os dois últimos. */
function compromissos(texto: string, unidades: Unidade[]) {
  return unidades
    .filter((u) => u.palavras >= MIN_PALAVRAS && u.palavras <= 35)
    .filter((u) => {
      const normal = normalizar(texto.slice(u.inicio, u.fim));
      return COMPROMISSO.test(normal) && PRAZO.test(normal);
    })
    .slice(-2)
    .map((u) => `Cumprir o combinado na reunião: “${texto.slice(u.inicio, u.fim).replace(/\s+/g, " ")}”`);
}

function abertura(contexto?: ContextoReuniao) {
  if (!contexto) return "Reunião";
  const quem =
    contexto.externa === false ? "Reunião interna sobre a conta" : contexto.tipoRecurso === "lead" ? "Reunião com prospect" : "Reunião com cliente";
  const onde = `${contexto.segmento ? ` de ${contexto.segmento}` : ""}${contexto.uf ? ` (${contexto.uf})` : ""}`;
  const nps =
    contexto.nps === undefined
      ? ""
      : `, NPS ${contexto.nps} (${contexto.nps <= 6 ? "detrator" : contexto.nps <= 8 ? "neutro" : "promotor"})`;
  return `${quem}${onde}${nps}`;
}

const curto = (texto: string, limite: number) =>
  texto.length <= limite ? texto : `${texto.slice(0, limite).replace(/\s+\S*$/, "")}…`;

function resumir(sinais: SinalNegocio[], mencoes: MencaoProduto[], contexto?: ContextoReuniao) {
  const totvs = mencoes.filter((m) => m.status !== "CONCORRENTE").slice(0, 4);
  const concorrentes = mencoes.filter((m) => m.status === "CONCORRENTE");
  const produtos = [
    totvs.length ? ` Produtos TOTVS: ${totvs.map((m) => `${m.produto.replace(/^TOTVS /, "")} (${ROTULO_STATUS[m.status]})`).join(", ")}.` : "",
    concorrentes.length ? ` Concorrentes citados: ${concorrentes.map((m) => m.produto).join(", ")}.` : "",
  ].join("");

  if (sinais.length === 0) return `${abertura(contexto)}: sem sinais claros de risco de churn, oportunidade ou objeção.${produtos}`;

  const [principal] = sinais;
  const quantos = (tipo: TipoSinal, um: string, varios: string) => {
    const n = sinais.filter((s) => s.tipo === tipo).length;
    return `${n} ${n === 1 ? um : varios}`;
  };
  const rotulo = { CHURN_RISK: "risco de churn", OPPORTUNITY: "oportunidade", OBJECTION: "objeção" }[principal.tipo];
  return (
    `${abertura(contexto)}. Destaque: ${rotulo} (${principal.subtipo}, severidade ${principal.severidade.toLowerCase()}) — ` +
    `“${curto(principal.citacaoExata.replace(/\s+/g, " "), 130)}”. No total: ${quantos("CHURN_RISK", "risco de churn", "riscos de churn")}, ` +
    `${quantos("OPPORTUNITY", "oportunidade", "oportunidades")} e ${quantos("OBJECTION", "objeção", "objeções")}.${produtos}`
  );
}

/* ---------- Entrada ---------- */

export function analisarPorRegras(texto: string, contexto?: ContextoReuniao): AnaliseReuniao {
  const falas = lerFalas(texto);
  const unidades = lerUnidades(texto, falas, inferirPapeis(texto, falas, contexto));

  const sinais = escolherSinais(texto, unidades)
    .map((item) => ({ item, sinal: paraSinal(item, contexto) }))
    .sort(
      (a, b) =>
        PESO_SEVERIDADE[a.sinal.severidade] - PESO_SEVERIDADE[b.sinal.severidade] ||
        PESO_TIPO[a.sinal.tipo] - PESO_TIPO[b.sinal.tipo] ||
        b.item.pontos - a.item.pontos,
    )
    .map(({ sinal }) => sinal);

  const mencoesProdutos = mencionarProdutos(texto, unidades);

  const recomendacoes = [...new Set(sinais.map((s) => s.recomendacaoAcao))];
  const passos = [
    ...(detrator(contexto) && !sinais.some((s) => s.tipo === "CHURN_RISK")
      ? [`Cliente detrator (NPS ${contexto?.nps}): agendar contato de Customer Success para entender a nota, mesmo sem sinal explícito de churn nesta reunião.`]
      : []),
    ...recomendacoes.slice(0, 3),
    ...compromissos(texto, unidades),
    ...recomendacoes.slice(3),
  ].slice(0, 5);

  return {
    resumoExecutivo: resumir(sinais, mencoesProdutos, contexto),
    mencoesProdutos,
    sinais,
    proximosPassosSugeridos: passos.length ? passos : ["Registrar a reunião no CRM e manter a cadência de relacionamento da conta."],
  };
}
