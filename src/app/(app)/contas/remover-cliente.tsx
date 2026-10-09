"use client";

import { useRef, useState } from "react";
import { ModalConfirmacao } from "@/components/ui/modal-confirmacao";
import { useToast } from "@/components/ui/provedor-toast";
import { api, ErroDaApi } from "@/lib/api-cliente";
import { EVENTO_CARTEIRA_ALTERADA } from "@/lib/eventos";

type ClienteParaExcluir = { id: string; nome: string; totalReunioes?: number };

const reunioesTexto = (n: number) => `${n} ${n === 1 ? "reunião" : "reuniões"}`;

/**
 * "Excluir cliente" da aba Clientes (lista e ficha): confirmação, envio único (DELETE /api/v1/carteira/{id})
 * e aviso de sucesso ou erro. Apaga de vez as reuniões do cliente e o que derivou delas; os compromissos ficam.
 */
export function ConfirmarRemocaoCliente({
  cliente,
  onFechar,
  onRemovido,
}: {
  cliente: ClienteParaExcluir | null;
  onFechar: () => void;
  onRemovido: (cliente: ClienteParaExcluir) => void;
}) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertoPara, setAbertoPara] = useState<string | null>(null);
  /** Trava síncrona: dois cliques seguidos em "Excluir" mandam um pedido só. */
  const excluindoAgora = useRef(false);

  if ((cliente?.id ?? null) !== abertoPara) {
    setAbertoPara(cliente?.id ?? null);
    setErro(null);
  }

  async function excluir() {
    if (!cliente || excluindoAgora.current) return;
    excluindoAgora.current = true;
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await api.excluirCliente(cliente.id);
      // A agenda da Home atualiza a lista de clientes do formulário de compromisso.
      window.dispatchEvent(new Event(EVENTO_CARTEIRA_ALTERADA));
      const n = resposta.reunioesExcluidas;
      toast({
        titulo: "Cliente excluído",
        descricao: `${cliente.nome} foi excluído${n ? ` com ${reunioesTexto(n)}` : ""}. Os compromissos já marcados continuam na agenda.`,
      });
      onRemovido(cliente);
    } catch (falha) {
      // O erro fica no modal: nada foi excluído.
      setErro(falha instanceof ErroDaApi ? falha.message : "Não foi possível excluir o cliente. Tente novamente.");
    } finally {
      excluindoAgora.current = false;
      setOcupado(false);
    }
  }

  const total = cliente?.totalReunioes;
  return (
    <ModalConfirmacao
      aberto={Boolean(cliente)}
      rotulo="Clientes"
      titulo={`Excluir ${cliente?.nome ?? "cliente"}?`}
      rotuloConfirmar="Excluir"
      rotuloOcupado="Excluindo..."
      perigo
      ocupado={ocupado}
      onConfirmar={() => void excluir()}
      onCancelar={onFechar}
    >
      <p>
        <strong className="font-semibold">{cliente?.nome}</strong> e{" "}
        {total === 1 ? "a reunião" : total ? `as ${reunioesTexto(total)}` : "todas as reuniões"} dele
        (transcrições, sinais, evidências, diagnósticos e ações sugeridas) serão apagados da Central de Insights, do Dashboard, de Clientes e
        das respostas do Dialys. <strong className="font-semibold">Não é possível desfazer.</strong>
      </p>
      <p className="mt-2">
        Se você enviar outra reunião desse cliente, ele volta só com ela. Os compromissos já marcados continuam na agenda.
      </p>
      {erro ? (
        <p role="alert" className="mt-3 text-[13px] text-support-error">
          {erro}
        </p>
      ) : null}
    </ModalConfirmacao>
  );
}
