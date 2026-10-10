// Frase de teste do projeto, dentro de uma transcrição curta com locutores.
export const FRASE_TESTE = "O Protheus atende bem o backoffice, mas o RH sofre com a folha manual...";

export const TRANSCRICAO_TESTE = `Vendedor (TOTVS): Como está o uso do sistema hoje, depois da última atualização?
Cliente (Diretor Administrativo): ${FRASE_TESTE} O pessoal viu uma demo da Senior e gostou, mas eu prefiro consolidar tudo na TOTVS se o RM for realmente integrado.
Vendedor (TOTVS): Entendi. Faz sentido mostrarmos a integração do RM Folha com o Protheus.
Cliente (Diretor Administrativo): Faz. Só preciso entender o prazo de implantação antes da renovação do contrato.`;

let contadorTranscricoes = 0;
/**
 * A transcrição de teste com uma fala final diferente a cada chamada: a mesma reunião não entra duas vezes
 * (ErroReuniaoDuplicada), então cenários com várias reuniões precisam de textos distintos. As citações do
 * TRANSCRICAO_TESTE continuam valendo.
 */
export const transcricaoTeste = () => `${TRANSCRICAO_TESTE}\nVendedor (TOTVS): Obrigado, seguimos no contato ${++contadorTranscricoes}.`;
