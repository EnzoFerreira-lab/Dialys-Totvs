"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";

type Assunto = "ajuda-login" | "ajuda" | "privacidade";

const Lista = ({ itens }: { itens: ReactNode[] }) => (
  <ul className="mt-3 list-disc space-y-1.5 pl-5">
    {itens.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

/** Textos das janelas: só o que o piloto faz de fato (nada de contatos ou políticas inventadas). */
const CONTEUDO: Record<Assunto, { rotulo: string; titulo: string; corpo: ReactNode }> = {
  "ajuda-login": {
    rotulo: "Ajuda",
    titulo: "Como acessar o Dialys",
    corpo: (
      <>
        <p>Entre com o seu e-mail corporativo e a senha da sua conta Dialys.</p>
        <Lista
          itens={[
            <>
              <strong className="font-medium">Primeiro acesso:</strong> use “Criar conta”, abaixo do botão de entrar. A conta começa vazia e
              os clientes aparecem conforme você envia reuniões.
            </>,
            <>
              <strong className="font-medium">Esqueceu a senha:</strong> use “Esqueceu a senha?” para receber um código de 6 dígitos e criar
              uma senha nova.
            </>,
            <>
              <strong className="font-medium">Lembrar meu acesso:</strong> mantém você conectado neste dispositivo por 30 dias. Sem marcar, a
              sessão termina ao fechar o navegador.
            </>,
          ]}
        />
      </>
    ),
  },
  ajuda: {
    rotulo: "Ajuda",
    titulo: "Como usar o Dialys",
    corpo: (
      <>
        <p>O Dialys lê as transcrições das suas reuniões comerciais e aponta riscos de churn, oportunidades e objeções, sempre com a fala do cliente que comprova cada sinal.</p>
        <Lista
          itens={[
            <>
              <strong className="font-medium">Enviar reunião:</strong> cole a transcrição ou anexe o arquivo (.txt ou o JSON da TOTVS). Em
              “Exemplo” há reuniões reais anonimizadas para testar.
            </>,
            <>
              <strong className="font-medium">Home:</strong> sua agenda e seus clientes.
            </>,
            <>
              <strong className="font-medium">Dashboard:</strong> indicadores da carteira e alertas mais urgentes.
            </>,
            <>
              <strong className="font-medium">Clientes:</strong> a ficha de cada cliente, com saúde, alertas e histórico de reuniões.
            </>,
            <>
              <strong className="font-medium">Central de Insights:</strong> cada reunião analisada, com as evidências destacadas e o envio ao
              CRM.
            </>,
            <>
              <strong className="font-medium">Assistente Dialys:</strong> pergunte sobre a carteira em linguagem natural ou peça o briefing do
              dia em voz.
            </>,
          ]}
        />
        <p className="mt-3 text-text-secondary">Cada usuário vê apenas os clientes e as reuniões que enviou.</p>
      </>
    ),
  },
  privacidade: {
    rotulo: "Privacidade e segurança",
    titulo: "Como o Dialys trata os seus dados",
    corpo: (
      <>
        <Lista
          itens={[
            <>
              <strong className="font-medium">Senhas:</strong> guardadas apenas de forma criptografada (hash), nunca em texto.
            </>,
            <>
              <strong className="font-medium">Sessão:</strong> protegida por um cookie assinado no servidor, inacessível a scripts da página.
            </>,
            <>
              <strong className="font-medium">Seus dados são só seus:</strong> clientes, reuniões, agenda e conversas com o assistente ficam
              separados por usuário.
            </>,
            <>
              <strong className="font-medium">Análise por IA:</strong> o texto das reuniões é enviado ao serviço de IA configurado apenas para
              gerar a análise. Cada sinal só é mantido se a citação existir de fato na transcrição.
            </>,
            <>
              <strong className="font-medium">Remoção:</strong> você pode remover a transcrição de uma reunião ou excluir um cliente com todas
              as reuniões dele.
            </>,
          ]}
        />
        <p className="mt-3 text-text-secondary">
          Ambiente piloto: os dados ficam no servidor desta instalação, e as reuniões de exemplo vêm de uma amostra anonimizada da TOTVS.
        </p>
      </>
    ),
  },
};

/** Link que abre uma janela com informações (ajuda, privacidade), no lugar de levar a uma página. */
export function LinkInformativo({ assunto, className, children }: { assunto: Assunto; className?: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const { rotulo, titulo, corpo } = CONTEUDO[assunto];
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} aria-haspopup="dialog" className={className}>
        {children}
      </button>
      <Dialogo
        aberto={aberto}
        rotulo={rotulo}
        titulo={titulo}
        onFechar={() => setAberto(false)}
        rodape={
          <Button type="button" onClick={() => setAberto(false)} className="h-10 rounded-[3px] px-4 text-[13px] font-medium">
            Entendi
          </Button>
        }
      >
        {corpo}
      </Dialogo>
    </>
  );
}
