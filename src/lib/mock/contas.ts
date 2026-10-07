// Carteira FICTÍCIA do modo demonstração (empresas inventadas; ver docs/ARQUITETURA.md §4). É a fonte
// dos clientes da home e dos compromissos fictícios quando DIALYS_DADOS_DEMONSTRACAO não é "false"; os
// cenários de exemplo do /envio também apontam para estes ids. Dados reais vêm da base da empresa.
export type ContaResumo = {
  id: string;
  nome: string;
  segmento?: string;
  vendedor?: string;
};

export const CONTAS_MOCK: ContaResumo[] = [
  { id: "c-001", nome: "Metalúrgica Vale Forte", segmento: "Manufatura", vendedor: "Ana Ribeiro" },
  { id: "c-002", nome: "Rede Bom Preço Supermercados", segmento: "Varejo", vendedor: "Fernanda Lima" },
  { id: "c-003", nome: "Clínica Santa Aurora", segmento: "Saúde", vendedor: "Rafael Costa" },
  { id: "c-004", nome: "Agro Cerrado Grãos", segmento: "Agronegócio", vendedor: "Juliana Prado" },
  { id: "c-005", nome: "Lumi Logística", segmento: "Logística", vendedor: "Carlos Mendes" },
  { id: "c-006", nome: "Grupo Horizonte", segmento: "Educação", vendedor: "João Silva" },
  { id: "c-007", nome: "Construtora Pedra Alta", segmento: "Construção", vendedor: "Ana Ribeiro" },
  { id: "c-008", nome: "Distribuidora Atlas", segmento: "Distribuição", vendedor: "Fernanda Lima" },
  { id: "c-009", nome: "Laboratório Vida Plena", segmento: "Saúde", vendedor: "Rafael Costa" },
  { id: "c-010", nome: "Transportes Rota Sul", segmento: "Logística", vendedor: "Carlos Mendes" },
  { id: "c-011", nome: "Escola Novo Saber", segmento: "Educação", vendedor: "João Silva" },
  { id: "c-012", nome: "Alimentos Campo Verde", segmento: "Agronegócio", vendedor: "Juliana Prado" },
  { id: "c-013", nome: "Indústria Prisma Plásticos", segmento: "Manufatura", vendedor: "Ana Ribeiro" },
  { id: "c-014", nome: "Serviços Origem Consultoria", segmento: "Serviços", vendedor: "Fernanda Lima" },
  { id: "c-015", nome: "Rede Estação Farmácias", segmento: "Varejo", vendedor: "Rafael Costa" },
  { id: "c-016", nome: "Cooperativa Terra Firme", segmento: "Agronegócio", vendedor: "Juliana Prado" },
];
