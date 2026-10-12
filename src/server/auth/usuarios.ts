// Usuários do piloto e o que cada um pode ver. Há dois tipos:
//   personas   configuradas aqui (Ricardo, da apresentação), com a senha de demonstração;
//   cadastrados  criados na tela de login ("Criar conta"), gravados em .dialys/usuarios.json (cadastro.ts).
// Cada usuário vê só os próprios dados: as reuniões que enviou (e o que derivou delas), a própria agenda e as
// próprias conversas com o assistente. Na produção, usuário e escopo vêm do IdP corporativo (OIDC) e da
// carteira no CRM; a regra de acesso (podeAcessarConta) continua a mesma.

export type Papel = "diretor" | "gerente" | "vendedor";

/**
 * Dentro dos dados do próprio usuário: "carteira_completa" vê todas as contas dele; "contas" só as listadas
 * (chave da conta na Central).
 */
export type Escopo = { tipo: "carteira_completa" } | { tipo: "contas"; contaIds: string[] };

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  escopo: Escopo;
};

/** Dono das reuniões gravadas antes de cada reunião ter dono (migração em banco.ts). */
export const ID_USUARIO_DEMONSTRACAO = "usr_ricardo_alves";

export const USUARIOS: Usuario[] = [
  {
    id: ID_USUARIO_DEMONSTRACAO,
    nome: "Ricardo Alves",
    email: "ricardo.alves@totvs.com.br",
    papel: "diretor",
    escopo: { tipo: "carteira_completa" },
  },
];

export const normalizarEmail = (email: string) => email.trim().toLowerCase();

/** Persona configurada (não inclui os cadastrados; para todos, ver cadastro.ts). */
export const personaPorId = (id: string) => USUARIOS.find((u) => u.id === id) ?? null;

export const personaPorEmail = (email: string) => USUARIOS.find((u) => normalizarEmail(u.email) === normalizarEmail(email)) ?? null;

export function podeAcessarConta(usuario: Usuario, contaId: string) {
  return usuario.escopo.tipo === "carteira_completa" || usuario.escopo.contaIds.includes(contaId);
}
