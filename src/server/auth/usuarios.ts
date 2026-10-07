// Usuários do piloto e o que cada um pode ver. Sem IdP ainda (T02): a lista é configuração do servidor.
// Na produção, usuário e escopo vêm do IdP corporativo (OIDC) e da carteira no CRM; a regra de acesso
// (podeAcessarConta) continua a mesma.

export type Papel = "diretor" | "gerente" | "vendedor";

/** "carteira_completa": vê todas as contas analisadas; "contas": só as listadas (chave da conta na Central). */
export type Escopo = { tipo: "carteira_completa" } | { tipo: "contas"; contaIds: string[] };

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  escopo: Escopo;
};

export const USUARIOS: Usuario[] = [
  {
    id: "usr_ricardo_alves",
    nome: "Ricardo Alves",
    email: "ricardo.alves@totvs.com.br",
    papel: "diretor",
    escopo: { tipo: "carteira_completa" },
  },
];

/** Persona usada quando o e-mail digitado não está na lista (piloto: qualquer credencial entra). */
export const USUARIO_PADRAO = USUARIOS[0];

export const buscarUsuario = (id: string) => USUARIOS.find((u) => u.id === id) ?? null;

export const usuarioPorEmail = (email: string) =>
  USUARIOS.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null;

export function podeAcessarConta(usuario: Usuario, contaId: string) {
  return usuario.escopo.tipo === "carteira_completa" || usuario.escopo.contaIds.includes(contaId);
}
