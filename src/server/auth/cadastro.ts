// Cadastro de usuários do piloto: um arquivo JSON ao lado do banco (.dialys/usuarios.json), com a senha
// guardada só como hash scrypt (sal aleatório por usuário). As personas de usuarios.ts entram com a senha de
// demonstração (DIALYS_SENHA_DEMONSTRACAO) até alguém redefini-la; a partir daí a persona também ganha
// registro aqui. Na produção, o IdP corporativo assume as senhas e este arquivo deixa de existir.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { arquivoBanco } from "../db/banco";
import { criarArmazenamentoJson } from "../db/arquivo-json";
import { emailValido, problemaNaSenha } from "./recuperacao";
import { normalizarEmail, personaPorEmail, personaPorId, type Papel, type Usuario } from "./usuarios";

const scrypt = promisify(scryptCallback) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;

export const SENHA_DEMONSTRACAO_PADRAO = "Dialys2026";
const senhaDemonstracao = () => process.env.DIALYS_SENHA_DEMONSTRACAO || SENHA_DEMONSTRACAO_PADRAO;

type UsuarioRegistro = Usuario & { senhaHash: string; criadoEm: string; atualizadoEm: string };
type Cadastro = { versao: 1; usuarios: UsuarioRegistro[] };

/** No mesmo diretório do banco: os testes, que trocam o banco por uma pasta temporária, levam o cadastro junto. */
const arquivoCadastro = () => path.join(path.dirname(arquivoBanco()), "usuarios.json");

const armazenamento = criarArmazenamentoJson<Cadastro>({ nome: "usuarios", arquivo: arquivoCadastro, vazio: () => ({ versao: 1, usuarios: [] }) });

async function gerarHash(senha: string) {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString("base64url")}$${(await scrypt(senha, sal, 32)).toString("base64url")}`;
}

async function conferirHash(senha: string, guardado: string) {
  const [algoritmo, sal, hash] = guardado.split("$");
  if (algoritmo !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64url");
  const calculado = await scrypt(senha, Buffer.from(sal, "base64url"), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

/** Compara textos sem vazar, pelo tempo, quantos caracteres batem. */
function iguais(a: string, b: string) {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}

const semSenha = ({ id, nome, email, papel, escopo }: UsuarioRegistro): Usuario => ({ id, nome, email, papel, escopo });

/** Usuário pelo id (cadastrado ou persona), sem a senha. */
export async function buscarUsuario(id: string): Promise<Usuario | null> {
  const registro = (await armazenamento.ler()).usuarios.find((u) => u.id === id);
  return registro ? semSenha(registro) : personaPorId(id);
}

/** Usuário do e-mail e senha informados, ou null (a mesma resposta para e-mail inexistente e senha errada). */
export async function autenticar(emailBruto: string, senha: string): Promise<Usuario | null> {
  const email = normalizarEmail(emailBruto);
  if (!email || !senha) return null;
  const registro = (await armazenamento.ler()).usuarios.find((u) => u.email === email);
  if (registro) return (await conferirHash(senha, registro.senhaHash)) ? semSenha(registro) : null;
  const persona = personaPorEmail(email);
  return persona && iguais(senha, senhaDemonstracao()) ? persona : null;
}

export const PAPEIS: Papel[] = ["diretor", "gerente", "vendedor"];

export type DadosNovoUsuario = { nome: string; email: string; papel: string; senha: string; confirmacao: string };
export type CampoCadastro = "nome" | "email" | "papel" | "senha" | "confirmacao";
export type RespostaCadastro = { ok: true; usuario: Usuario } | { ok: false; erro: string; campo?: CampoCadastro };

/** Cria a conta. Cada usuário começa sem clientes nem reuniões: os dados dele são só os que ele enviar. */
export async function criarUsuario(dados: DadosNovoUsuario): Promise<RespostaCadastro> {
  const nome = dados.nome.replace(/\s+/g, " ").trim();
  const email = normalizarEmail(dados.email);
  if (nome.length < 3 || nome.length > 80) return { ok: false, erro: "Informe seu nome completo (de 3 a 80 caracteres).", campo: "nome" };
  if (!emailValido(email)) return { ok: false, erro: "Informe um e-mail válido.", campo: "email" };
  if (!PAPEIS.includes(dados.papel as Papel)) return { ok: false, erro: "Escolha o seu cargo.", campo: "papel" };
  const problema = problemaNaSenha(dados.senha);
  if (problema) return { ok: false, erro: problema, campo: "senha" };
  if (dados.senha !== dados.confirmacao) return { ok: false, erro: "As senhas não são iguais.", campo: "confirmacao" };

  const senhaHash = await gerarHash(dados.senha);
  return armazenamento.transacao((cadastro): RespostaCadastro => {
    if (personaPorEmail(email) || cadastro.usuarios.some((u) => u.email === email)) {
      return { ok: false, erro: "Já existe uma conta com este e-mail. Entre com ela ou use “Esqueceu a senha?”.", campo: "email" };
    }
    const instante = new Date().toISOString();
    const registro: UsuarioRegistro = {
      id: `usr_${randomBytes(12).toString("hex")}`,
      nome,
      email,
      papel: dados.papel as Papel,
      escopo: { tipo: "carteira_completa" },
      senhaHash,
      criadoEm: instante,
      atualizadoEm: instante,
    };
    cadastro.usuarios.push(registro);
    console.info(`[dialys/auth] conta criada: ${registro.id}`);
    return { ok: true, usuario: semSenha(registro) };
  });
}

/** Troca a senha da conta do e-mail (recuperação de senha). false: nenhuma conta com este e-mail. */
export async function definirSenha(emailBruto: string, senha: string): Promise<boolean> {
  const email = normalizarEmail(emailBruto);
  const senhaHash = await gerarHash(senha);
  return armazenamento.transacao((cadastro) => {
    const instante = new Date().toISOString();
    const registro = cadastro.usuarios.find((u) => u.email === email);
    if (registro) {
      registro.senhaHash = senhaHash;
      registro.atualizadoEm = instante;
      return true;
    }
    const persona = personaPorEmail(email);
    if (!persona) return false;
    cadastro.usuarios.push({ ...persona, email, senhaHash, criadoEm: instante, atualizadoEm: instante });
    return true;
  });
}

/** Há conta (cadastrada ou persona) com este e-mail. */
export async function existeConta(emailBruto: string) {
  const email = normalizarEmail(emailBruto);
  return Boolean(personaPorEmail(email)) || (await armazenamento.ler()).usuarios.some((u) => u.email === email);
}
