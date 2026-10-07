# Modo demonstração

Simula a IA na apresentação, sem chamar a API do Claude e sem custo. Ative com a linha abaixo no `.env.local` e reinicie o `npm run dev`:

```
DIALYS_MODO_DEMO=true
```

Sem `ANTHROPIC_API_KEY` configurada, a análise entra no modo demonstração automaticamente, mesmo sem a linha acima. Para usar o Claude real, configure a chave e troque para `false` (ou apague a linha). Com `false` e sem chave, a tela mostra o passo a passo de configuração.

## Transcrições da TOTVS (`totvs/`)

`totvs/amostra_reunioes.json` é a amostra enviada pela TOTVS: uma lista de reuniões com a transcrição anonimizada em `ANON_TRANSCRICAO` e metadados (`ID_MEETING`, `DT_MEETING`, `NOME_SEGMENTO`, `UF`, `NOTA_NPS`, `FLG_EXTERNO`...). Todo `.json` nesse formato colocado na pasta aparece no menu **Exemplo** (repetidos são ignorados).

Na tela `/envio` também dá para:

- anexar ou arrastar um `.json` nesse formato: com uma reunião, ela vai direto para o campo; com várias, abre uma lista para escolher;
- colar um registro JSON, ou um trecho copiado de dentro do arquivo (com `\n` literal): o texto é convertido;
- colar qualquer transcrição em texto puro.

Segmento, UF e NPS entram no resumo (NPS até 6 marca o cliente como detrator e sobe a severidade dos riscos de churn).

## Como a resposta é escolhida

1. Se o texto colado contém a `transcricao` de um cenário, ou citações dele, a análise daquele cenário é usada.
2. Se nenhum cenário corresponde, o analisador por regras (`src/server/ai/demo/heuristica.ts`) lê o próprio texto. Ele:
   - deduz qual `[LOCUTOR N]` fala pela TOTVS, pelo vocabulário de cada um, para não tratar a apresentação do vendedor como sinal do cliente;
   - pontua cada frase com regras ponderadas de churn, oportunidade e objeção, e mantém só as que passam do limiar;
   - reconhece produtos e concorrentes, inclusive com erros comuns de transcrição ("TOTUS", "Proteus", "Sankia", "Plumes").

   É uma simulação: serve para a apresentação, não para medir precisão.

Em ambos os casos o validador de evidências roda normalmente: citação que não existe no texto colado é descartada. A tela mostra o rótulo **Modo demonstração** no resultado.

## Formato de um cenário

Um arquivo `.json` por cenário em `cenarios/`. Os arquivos são lidos em ordem alfabética.

```json
{
  "id": "minha-conta",
  "titulo": "Nome que aparece no menu Exemplo",
  "contaId": "c-006",
  "transcricao": "Vendedor (TOTVS): ...\nCliente (Diretor): ...",
  "analise": {
    "resumoExecutivo": "Até 3 linhas para o diretor.",
    "mencoesProdutos": [
      { "produto": "TOTVS Protheus", "status": "EM_USO", "contexto": "Uma frase." }
    ],
    "sinais": [
      {
        "tipo": "CHURN_RISK",
        "subtipo": "Avaliação de Concorrente",
        "severidade": "ALTA",
        "confianca": 0.85,
        "citacaoExata": "trecho copiado exatamente da transcricao",
        "recomendacaoAcao": "Ação prática para a gestão comercial."
      }
    ],
    "proximosPassosSugeridos": ["Passo 1", "Passo 2"]
  }
}
```

| Campo | Valores aceitos |
|---|---|
| `contaId` | Opcional. `c-001` a `c-006` (contas de `src/lib/mock/contas.ts`) |
| `produto` | `TOTVS Protheus`, `TOTVS RM`, `TOTVS Fluig`, `TOTVS Techfin`, `RD Station`, `TOTVS Assinatura Eletrônica`, `TOTVS Transmite`, `TOTVS Cloud`, `TOTVS Analytics`, `Senior Sistemas`, `SAP`, `Oracle`, `Sankhya`, `Omie`, `Ploomes`, `Salesforce`, `Mercanet`, `Power BI` |
| `status` | `EM_USO`, `INTERESSE`, `INSATISFAÇÃO`, `CONCORRENTE` |
| `tipo` | `CHURN_RISK`, `OPPORTUNITY`, `OBJECTION` |
| `severidade` | `ALTA`, `MÉDIA`, `BAIXA` |
| `confianca` | Número de 0 a 1 |
| `citacaoExata` | Precisa existir **exatamente** na `transcricao` |

`posicaoCaracterStart`/`posicaoCaracterEnd` são opcionais: o sistema calcula. Rode `npm test` depois de criar ou editar um cenário: o teste aponta JSON inválido e citações que não existem na transcrição.
