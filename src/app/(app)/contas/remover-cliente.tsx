"use client";

import { useRef, useState } from "react";
import { ModalConfirmacao } from "@/components/ui/modal-confirmacao";
import { useToast } from "@/components/ui/provedor-toast";
import { api, ErroDaApi } from "@/lib/api-cliente";
import { EVENTO_CARTEIRA_ALTERADA } from "@/lib/eventos";

type ClienteParaRemover = { id: string; nome: string };

/**
 * "Remover cliente" da aba Clientes (lista e ficha): confirmação, envio único (DELETE /api/v1/carteira/{id})
 * e aviso de sucesso ou erro. Remove o cliente da carteira e os insights dele; os compromissos ficam.
 */
export function ConfirmarRemocaoCliente({
  cliente,
  onFechar,
  onRemovido,
}: {
  cliente: ClienteParaRemover | null;
  onFechar: () => void;
  onRemovido: (cliente: ClienteParaRemover) => void;
}) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertoPara, setAbertoPara] = useState<string | null>(null);
  /** Trava síncrona: dois cliques seguidos em "Remover" mandam um pedido só. */
  const removendoAgora = useRef(false);

  if ((cliente?.id ?? null) !== abertoPara) {
    setAbertoPara(cliente?.id ?? null);
    setErro(null);
  }

  async function remover() {
    if (!cliente || removendoAgora.current) return;
    removendoAgora.current = true;
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await api.removerDaCarteira(cliente.id);
      // A agenda da Home atualiza a lista de clientes do formulário de compromisso.
      window.dispatchEvent(new Event(EVENTO_CARTEIRA_ALTERADA));
      const n = resposta.reunioesComInsightsRemovidos;
      toast({
        titulo: "Cliente removido",
        descricao: `${cliente.nome} saiu da sua carteira${n ? ` e os insights de ${n} ${n === 1 ? "reunião" : "reuniões"} foram removidos` : ""}. Os compromissos já marcados continuam na agenda.`,
      });
      onRemovido(cliente);
    } catch (falha) {
      // O erro fica no modal: nada foi removido.
      setErro(falha instanceof ErroDaApi ? falha.message : "Não foi possível remover o cliente. Tente novamente.");
    } finally {
      removendoAgora.current = false;
      setOcupado(false);
    }
  }

  return (
    <ModalConfirmacao
      aberto={Boolean(cliente)}
      rotulo="Clientes"
      titulo={`Remover ${cliente?.nome ?? "cliente"}?`}
      rotuloConfirmar="Remover"
      rotuloOcupado="Removendo..."
      perigo
      ocupado={ocupado}
      onConfirmar={() => void remover()}
      onCancelar={onFechar}
    >
      <p>
        <strong className="font-semibold">{cliente?.nome}</strong> sai da sua carteira e os insights dele (sinais, evidências, diagnósticos e
        ações sugeridas) deixam de aparecer na Central de Insights, no Dashboard, nos indicadores e nas respostas do Dialys. Os compromissos já
        marcados continuam na agenda.
      </p>
      {erro ? (
        <p role="alert" className="mt-3 text-[13px] text-support-error">
          {erro}
        </p>
      ) : null}
    </ModalConfirmacao>
  );
}
