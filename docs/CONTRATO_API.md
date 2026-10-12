# Contrato da API REST v1 · Dialys

> Versão 1 · 2026-10-07 · Base: `/api/v1` · Formato: JSON (UTF-8)
> Para quem integra com a Dialys: frontend, CRM e outros sistemas TOTVS.

A API recebe reuniões, roda o pipeline de análise e devolve os sinais de negócio (churn, upsell e objeção) com a citação literal que os comprova.

| Método | Rota | Para quê | Caso de uso |
|---|---|---|---|
| `POST` | `/api/v1/reunioes/processar` | Enviar uma reunião para análise | UC01, UC02 |
| `GET` | `/api/v1/reunioes/{id}` | Acompanhar o pipeline e ler o resultado | UC02 |
| `GET` | `/api/v1/insights` | Listar sinais com filtros (Dashboard) | UC03, UC04 |
| `POST` | `/api/v1/assistente/mensagens` | Pergunta ao assistente Dialys (chat) | Assistente |
| `GET` | `/api/v1/assistente/conversas/{id}` | Histórico de uma conversa do próprio usuário | Assistente |
| `GET` | `/api/v1/resumo` | KPIs agregados, matriz de urgência e agenda (Dashboard e assistente Dialys) | UC03, UC05 |
| `POST` | `/api/v1/crm/sincronizar` | Enviar um insight ao CRM (webhook de enriquecimento) | UC05 / US-06 |

**Autenticação.** Todas as rotas exigem a sessão do servidor: o cookie `dialys_sessao` (httpOnly, assinado com HMAC-SHA256) criado no login. Sem sessão válida: `401 SESSAO_AUSENTE`. **Cada usuário só enxerga os próprios dados:** a reunião enviada pertence a quem a enviou, e `GET /reunioes/{id}`, `GET /insights`, `GET /resumo` e `POST /crm/sincronizar` só consideram as reuniões desse usuário (a de outro responde `404`, como inexistente). A mesma reunião pode ser enviada por usuários diferentes; o `codigo` ("Reunião 001") é numerado por usuário.

> ⚠️ **Piloto:** o envio ao CRM é simulado: o webhook fica gravado e aparece no log, mas nada sai do servidor.

---

## Convenções

- **`X-Request-Id`** em toda resposta (`req_…`). Informe esse valor ao reportar um problema; ele também aparece no log do servidor.
- **`Cache-Control: no-store`** em todas as rotas.
- **Erros** têm sempre o mesmo formato:

```json
{
  "erro": {
    "codigo": "TRANSCRICAO_VAZIA",
    "mensagem": "A transcrição precisa ter pelo menos 20 caracteres.",
    "detalhe": { "...": "opcional" },
    "requestId": "req_678dd819a71f43a6"
  }
}
```

| HTTP | Quando |
|---|---|
| `200` | Leitura ou repetição idempotente |
| `201` | Recurso criado (análise síncrona concluída, primeiro envio ao CRM) |
| `202` | Reunião aceita; o processamento continua em segundo plano |
| `400` | Entrada inválida (JSON, campos, filtros) |
| `404` | Reunião ou insight inexistente |
| `413` / `415` | Corpo acima de 20 MB / formato não suportado |
| `422` | Entrada válida que não pôde ser analisada (ex.: IA recusou) |
| `500` / `502` / `503` | Falha interna / do provedor de IA / limite de uso da IA |

**Empresa (`conta`).** Reuniões e insights trazem `conta: { id, nome }`, a empresa como aparece na Central de Insights (`/insights?conta=<id>`): a conta informada no envio, senão o código do cliente TOTVS (`codt-TB5392`), senão a própria reunião (`reuniao-reu_…`).

**IDs:** reunião `reu_<32 hex>`, análise `ana_…`, insight (sinal) `sin_…`, sincronização `crm_…`.

**Categorias** (`categoria`): `churn` (CHURN_RISK), `upsell` (OPPORTUNITY), `objection` (OBJECTION).
**Criticidade:** `ALTA`, `MÉDIA` (também aceito `MEDIA`), `BAIXA`.

---

## Pipeline

Toda reunião passa por 5 etapas. O estado de cada uma é gravado ao entrar e ao sair, então `GET /reunioes/{id}` mostra o progresso e, em caso de falha, onde ela aconteceu.

| # | Etapa (`etapas[].nome`) | O que faz |
|---|---|---|
| 1 | `RECEBIMENTO` | Valida e sanitiza a entrada e registra a reunião como `EM_PROCESSAMENTO` |
| 2 | `ANALISE_IA` | Claude Opus 5.5 (ou, sem chave, as regras locais) gera sinais, produtos e resumo |
| 4 | `VALIDACAO_EVIDENCIAS` | Só fica o sinal cuja citação existe literalmente na transcrição; os demais são descartados e contados |
| 5 | `PERSISTENCIA` | Grava `analise`, `sinal` e `mencao_produto` e conclui a reunião |

Status da etapa: `PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA`, `PULADA`, `FALHOU`.
Status da reunião: `EM_PROCESSAMENTO`, `CONCLUIDA`, `FALHOU`.

---

## `POST /api/v1/reunioes/processar`

Recebe uma reunião e aciona o pipeline.

| Query | Valores | Efeito |
|---|---|---|
| `modo` | `assincrono` (padrão) | Responde `202` na hora; acompanhe pelo header `Location` |
| | `sincrono` | Espera o pipeline terminar e responde `201` com o resultado (de 30 s a 2 min com o Claude) |

**Corpo, opção A: `application/json`**

```json
{
  "texto": "[LOCUTOR 1]: Como está o uso do sistema hoje?\n[LOCUTOR 2]: O Protheus atende bem o backoffice...",
  "contaId": "conta-industria-acme",
  "contaNome": "Indústria Acme",
  "contexto": { "segmento": "Manufatura", "nps": 7, "data": "2026-10-01" }
}
```

Também aceita o registro exportado pela TOTVS (`{ "ANON_TRANSCRICAO": "...", "ID_MEETING": ..., ... }`) ou uma lista deles com `"idReuniao"` indicando qual analisar. Os metadados viram o `contexto`; o `CODT` vira `contexto.codigoCliente` e o `CNAE` vira `contexto.cnae`.

**Empresa da reunião.** `contaId` + `contaNome` identificam a empresa. Sem eles, o `CODT` da TOTVS agrupa as reuniões do mesmo cliente; sem nenhum dos dois, a reunião aparece sozinha na Central de Insights. O nome devolvido em `conta.nome` segue esta ordem: `contaNome` do envio → nome real configurado em `.dialys/totvs/nomes-clientes.json` → atividade pelo CNAE + UF + código ("Distribuidora de medicamentos · RS (TB5392)") → "Cliente TB5392". O nome é calculado a cada consulta e não é gravado.

**Corpo, opção B: `multipart/form-data`**

| Campo | Obrigatório | Conteúdo |
|---|---|---|
| `arquivo` | um dos dois | `.txt` ou `.json` (formato TOTVS), até 20 MB. Áudio não é aceito (`415 AUDIO_NAO_ACEITO`) |
| `texto` | um dos dois | Transcrição em texto |
| `contaId` | não | Até 60 caracteres `[A-Za-z0-9._-]` |
| `contaNome` | não | Nome da empresa, até 120 caracteres (é o nome exibido na Central de Insights) |
| `contexto` | não | JSON em texto |
| `idReuniao` | não | `ID_MEETING` escolhido quando o `.json` tem várias reuniões |

```bash
curl -X POST "http://localhost:3000/api/v1/reunioes/processar" \
  -H "Content-Type: application/json" \
  -d '{"texto": "...", "contaId": "c-001"}'

curl -X POST "http://localhost:3000/api/v1/reunioes/processar?modo=sincrono" \
  -F "arquivo=@reuniao.txt" -F "contaId=c-001"
```

**Resposta `202 Accepted`** (modo assíncrono). Headers: `Location: /api/v1/reunioes/reu_b13a…`

```json
{
  "id": "reu_b13a502507e244e0b24dffc388ca9bed",
  "status": "EM_PROCESSAMENTO",
  "origem": "texto",
  "contaId": "c-001",
  "contaNome": "Indústria Acme",
  "contexto": null,
  "criadaEm": "2026-10-07T12:40:32.315Z",
  "atualizadaEm": "2026-10-07T12:40:32.315Z",
  "etapas": [
    { "nome": "RECEBIMENTO", "status": "CONCLUIDA", "detalhe": "Texto recebido (840 caracteres).", "iniciadaEm": "…", "concluidaEm": "…" },
    { "nome": "TRANSCRICAO", "status": "PENDENTE" },
    { "nome": "ANALISE_IA", "status": "PENDENTE" },
    { "nome": "VALIDACAO_EVIDENCIAS", "status": "PENDENTE" },
    { "nome": "PERSISTENCIA", "status": "PENDENTE" }
  ],
  "resultado": null,
  "falha": null,
  "links": { "self": "/api/v1/reunioes/reu_b13a502507e244e0b24dffc388ca9bed" }
}
```

**Resposta `201 Created`** (modo síncrono): mesmo formato de `GET /reunioes/{id}` com a reunião concluída (abaixo).

**Falha no modo síncrono:** o status HTTP é o da falha (ex.: `422 ANALISE_RECUSADA`, `503 LIMITE_DE_USO`) e `erro.detalhe.reuniao` traz a reunião com a etapa que falhou.

| Código | HTTP | Motivo |
|---|---|---|
| `JSON_INVALIDO`, `FORMULARIO_INVALIDO` | 400 | Corpo ilegível |
| `TRANSCRICAO_VAZIA` | 400 | Menos de 20 caracteres |
| `SEM_CONTEUDO` | 400 | Nem `arquivo` nem `texto` |
| `CONTEXTO_INVALIDO`, `CONTA_INVALIDA` | 400 | Metadados fora do formato |
| `VARIAS_REUNIOES`, `REUNIAO_NAO_ENCONTRADA_NO_ARQUIVO`, `JSON_SEM_TRANSCRICAO` | 400 | JSON da TOTVS ambíguo ou sem transcrição |
| `MODO_INVALIDO` | 400 | `modo` diferente de `assincrono` ou `sincrono` |
| `TRANSCRICAO_LONGA`, `ARQUIVO_GRANDE`, `CORPO_GRANDE` | 413 | Acima de 200 mil caracteres ou de 20 MB |
| `TIPO_NAO_SUPORTADO`, `FORMATO_NAO_SUPORTADO` | 415 | Content-Type ou extensão não aceitos (PDF e DOCX ainda não) |
| `AUDIO_NAO_ACEITO` | 415 | Arquivo de áudio: o Dialys só recebe a transcrição em texto |

---

## `DELETE /api/v1/reunioes/{id}/transcricao`

Remoção **lógica** da transcrição desta reunião (só dela). Exige a sessão e acesso à conta da reunião (senão `404`, como inexistente). A reunião, o `numero` e o `codigo` continuam; a transcrição e a análise derivada só dela saem de `GET /insights`, `GET /resumo`, da Central, do assistente e de `POST /crm/sincronizar` (`404`). Nada é apagado do banco.

```json
{ "reuniaoId": "reu_…", "codigo": "Reunião 003", "conta": { "id": "c-006", "nome": "Grupo Horizonte" }, "transcricaoRemovidaEm": "2026-10-07T21:15:19.582Z", "jaRemovida": false }
```

Repetir responde `200` com `jaRemovida: true` (sem efeito novo). Reunião ainda em análise: `409 REUNIAO_EM_PROCESSAMENTO`. Depois da remoção, `GET /reunioes/{id}` devolve `resultado: null`, `transcricao: null` (com `incluirTranscricao`) e `transcricaoRemovidaEm`.

## `GET /api/v1/reunioes/{id}`

Toda reunião traz `numero` e `codigo` ("Reunião 003": número sequencial gravado na reunião, único e nunca reutilizado), `dataInformada` (`false`: a reunião não trouxe data e `criadaEm` é só a data do processamento) e `transcricaoRemovidaEm` (`null` se ativa). Os insights de `GET /insights` trazem `reuniao.codigo` e `reuniao.dataInformada`.

Estado do pipeline e, quando concluída, o resultado. Enquanto o status for `EM_PROCESSAMENTO`, a resposta traz `Retry-After: 2` (segundos até a próxima consulta). Uma reunião parada há mais de 6 minutos passa a `FALHOU` com `PROCESSAMENTO_INTERROMPIDO`.

| Query | Efeito |
|---|---|
| `incluirTranscricao=true` | Inclui `transcricao`, o texto sanitizado para o qual apontam as posições dos sinais |

**Resposta `200`**

```json
{
  "id": "reu_b13a502507e244e0b24dffc388ca9bed",
  "status": "CONCLUIDA",
  "origem": "texto",
  "contaId": "c-001",
  "contaNome": "Indústria Acme",
  "contexto": null,
  "criadaEm": "2026-10-07T12:40:32.315Z",
  "atualizadaEm": "2026-10-07T12:40:33.845Z",
  "etapas": [
    { "nome": "RECEBIMENTO", "status": "CONCLUIDA", "detalhe": "Texto recebido (840 caracteres).", "iniciadaEm": "…", "concluidaEm": "…" },
    { "nome": "ANALISE_IA", "status": "CONCLUIDA", "detalhe": "Claude (claude-opus-5-5): 4 sinal(is) proposto(s).", "iniciadaEm": "…", "concluidaEm": "…" },
    { "nome": "VALIDACAO_EVIDENCIAS", "status": "CONCLUIDA", "detalhe": "4 de 4 sinal(is) com citação literal confirmada.", "iniciadaEm": "…", "concluidaEm": "…" },
    { "nome": "PERSISTENCIA", "status": "CONCLUIDA", "detalhe": "Gravados 1 análise, 4 sinal(is) e 3 menção(ões) a produto.", "iniciadaEm": "…", "concluidaEm": "…" }
  ],
  "resultado": {
    "analiseId": "ana_1b2845ccc18b42fab0523aa11c238534",
    "analise": {
      "resumoExecutivo": "Backoffice estável no Protheus, mas a folha manual pressiona o RH e a Senior já apresentou uma demo. O diretor prefere consolidar na TOTVS se o RM Folha for integrado.",
      "mencoesProdutos": [
        { "produto": "TOTVS Protheus", "status": "EM_USO", "contexto": "Atende bem o backoffice." },
        { "produto": "TOTVS RM", "status": "INTERESSE", "contexto": "Consolidaria a folha na TOTVS se o RM for integrado ao Protheus." }
      ],
      "sinais": [
        {
          "id": "sin_40d66bf7bc0e4685a6b3d0912b4bdb9f",
          "categoria": "churn",
          "tipo": "CHURN_RISK",
          "subtipo": "Avaliação de Concorrente",
          "severidade": "ALTA",
          "confianca": 0.86,
          "citacaoExata": "O pessoal viu uma demo da Senior e gostou",
          "posicaoCaracterStart": 387,
          "posicaoCaracterEnd": 428,
          "recomendacaoAcao": "Acionar o gestor de Customer Success nesta semana.",
          "evidencia": { "correspondencia": "exata", "posicaoCorrigida": true }
        }
      ],
      "proximosPassosSugeridos": [
        "Reunião de retenção com o gestor de Customer Success nesta semana.",
        "Demo técnica de integração RM Folha + Protheus com especialista."
      ]
    },
    "evidencias": {
      "sinaisDescartados": [],
      "metricas": { "total": 4, "validos": 4, "descartados": 0, "taxaValidacao": 1, "exatas": 4, "normalizadas": 0, "posicoesCorrigidas": 4 }
    },
    "auditoria": {
      "modo": "claude",
      "modeloSolicitado": "claude-opus-5-5",
      "modeloResposta": "claude-opus-5-5",
      "fallbackUsado": false,
      "versaoPrompt": "analise.v2",
      "duracaoMs": 41250,
      "tokens": { "entrada": 5120, "saida": 1830, "escritaCache": 0, "leituraCache": 3900 },
      "custoEstimadoUsd": 0.0574
    }
  },
  "falha": null,
  "links": { "self": "/api/v1/reunioes/reu_b13a502507e244e0b24dffc388ca9bed" }
}
```

`posicaoCaracterStart`/`End` são índices (base 0, fim exclusivo) na transcrição sanitizada. `auditoria.modo` é `"nemotron"` (padrão, com `OPENROUTER_API_KEY`) ou `"claude"`; com as regras locais (sem chave), é `"demonstracao"` e tokens e custo ficam zerados.

**Reunião que falhou** (`200`, porque a consulta em si deu certo):

```json
{
  "id": "reu_…",
  "status": "FALHOU",
  "etapas": [ "…", { "nome": "ANALISE_IA", "status": "FALHOU", "detalhe": "Limite de uso atingido" }, "…" ],
  "resultado": null,
  "falha": { "codigo": "LIMITE_DE_USO", "titulo": "Limite de uso atingido", "detalhe": "Muitas análises em pouco tempo. Aguarde alguns segundos e tente de novo." }
}
```

Erros: `400 ID_INVALIDO`, `404 REUNIAO_NAO_ENCONTRADA`.

---

## `GET /api/v1/insights`

Sinais das reuniões concluídas, do mais crítico para o menos e, empatados, do mais recente para o mais antigo. Alimenta o Dashboard e a Central de Insights.

| Query | Valores | Padrão |
|---|---|---|
| `categoria` | `churn`, `upsell`, `objection`; vários com vírgula ou parâmetro repetido | todas |
| `criticidade` | `ALTA`, `MÉDIA`/`MEDIA`, `BAIXA`; idem | todas |
| `contaId` | id da conta | — |
| `reuniaoId` | id da reunião | — |
| `limite` | 1 a 200 | 50 |
| `offset` | ≥ 0 | 0 |

```bash
curl "http://localhost:3000/api/v1/insights?categoria=churn,upsell&criticidade=ALTA"
```

**Resposta `200`**

```json
{
  "dados": [
    {
      "id": "sin_40d66bf7bc0e4685a6b3d0912b4bdb9f",
      "categoria": "churn",
      "tipo": "CHURN_RISK",
      "subtipo": "Avaliação de Concorrente",
      "criticidade": "ALTA",
      "confianca": 0.86,
      "citacaoExata": "O pessoal viu uma demo da Senior e gostou",
      "posicao": { "inicio": 387, "fim": 428 },
      "recomendacaoAcao": "Acionar o gestor de Customer Success nesta semana.",
      "criadoEm": "2026-10-07T12:40:33.845Z",
      "reuniao": {
        "id": "reu_b13a502507e244e0b24dffc388ca9bed",
        "contaId": "c-001",
        "contaNome": "Indústria Acme",
        "contexto": null,
        "criadaEm": "2026-10-07T12:40:32.315Z",
        "link": "/api/v1/reunioes/reu_b13a502507e244e0b24dffc388ca9bed"
      },
      "crm": { "sincronizado": false }
    }
  ],
  "paginacao": { "total": 1, "limite": 50, "offset": 0 },
  "filtros": { "categoria": ["churn", "upsell"], "criticidade": ["ALTA"], "contaId": null, "reuniaoId": null },
  "resumo": {
    "total": 1,
    "porCategoria": { "churn": 1, "upsell": 0, "objection": 0 },
    "porCriticidade": { "ALTA": 1, "MÉDIA": 0, "BAIXA": 0 }
  }
}
```

`resumo` conta **todo** o resultado filtrado, não só a página: serve direto para os KPIs. Depois de sincronizado, `crm` vira `{ "sincronizado": true, "protocolo": "CRM-…", "sincronizadoEm": "…" }`.

Erros: `400 CATEGORIA_INVALIDA` e `400 CRITICIDADE_INVALIDA` (com `detalhe.aceitos`), `400 PAGINACAO_INVALIDA`.

---

## `POST /api/v1/crm/sincronizar`

Envia um insight ao CRM pelo webhook de enriquecimento. É **idempotente por insight**: o primeiro envio responde `201`; repetir devolve o mesmo protocolo com `200` e `jaSincronizado: true`, sem reenviar.

```bash
curl -X POST "http://localhost:3000/api/v1/crm/sincronizar" \
  -H "Content-Type: application/json" \
  -d '{"insightId": "sin_40d66bf7bc0e4685a6b3d0912b4bdb9f"}'
```

**Resposta `201 Created`**

```json
{
  "insightId": "sin_40d66bf7bc0e4685a6b3d0912b4bdb9f",
  "sincronizado": true,
  "protocolo": "CRM-20261007-3F5E99",
  "destino": "simulado",
  "sincronizadoEm": "2026-10-07T12:40:36.039Z",
  "jaSincronizado": false,
  "payload": {
    "evento": "dialys.insight.enriquecimento",
    "versao": 1,
    "protocolo": "CRM-20261007-3F5E99",
    "conta": { "id": "c-001", "segmento": null, "tipoRecurso": null },
    "insight": {
      "id": "sin_40d66bf7bc0e4685a6b3d0912b4bdb9f",
      "categoria": "churn",
      "subtipo": "Avaliação de Concorrente",
      "criticidade": "ALTA",
      "confianca": 0.86,
      "evidencia": "O pessoal viu uma demo da Senior e gostou",
      "recomendacaoAcao": "Acionar o gestor de Customer Success nesta semana."
    },
    "origem": {
      "reuniaoId": "reu_b13a502507e244e0b24dffc388ca9bed",
      "dataReuniao": "2026-10-07T12:40:32.315Z",
      "link": "/api/v1/reunioes/reu_b13a502507e244e0b24dffc388ca9bed"
    }
  }
}
```

`payload` é exatamente o corpo que o CRM receberá quando o webhook real for ligado. Log do servidor:

```
[dialys/crm] webhook simulado CRM-20261007-3F5E99: churn/ALTA do insight sin_40d6… (conta c-001) enviado com sucesso
```

Erros: `400 JSON_INVALIDO`, `400 INSIGHT_ID_INVALIDO`, `404 INSIGHT_NAO_ENCONTRADO`, `415 TIPO_NAO_SUPORTADO`.

---

## `GET /api/v1/resumo`

Agregado da carteira analisada, calculado a cada chamada. Alimenta os KPIs do Painel Executivo e o briefing do assistente Dialys.

```json
{
  "geradoEm": "2026-10-07T13:10:36.120Z",
  "kpis": {
    "reunioesAnalisadas": 2,
    "reunioesUltimos7Dias": 2,
    "contasAnalisadas": 2,
    "contasEmRiscoChurn": 1,
    "contasEmRiscoCritico": 1,
    "sinais": { "churn": 1, "upsell": 1, "objection": 1 },
    "npsMedio": 7.5,
    "contasComNps": 2
  },
  "urgencias": [ { "id": "sin_…", "categoria": "churn", "conta": { "id": "conta-acme", "nome": "Indústria Acme" }, "...": "mesmo formato de GET /insights" } ],
  "agenda": [
    { "conta": { "id": "conta-acme", "nome": "Indústria Acme" }, "categoria": "churn", "urgencia": "alta", "acao": "Gerente de contas liga para o diretor esta semana.", "reuniaoId": "reu_…" }
  ]
}
```

- `contasEmRiscoChurn`: contas cuja reunião mais recente tem sinal de churn (mesmo critério do filtro da Central).
- `npsMedio`: média por conta, só das reuniões que trouxeram NPS (como o JSON da TOTVS); `null` se nenhuma trouxe.
- `urgencias`: até 3 insights na ordem do assistente, o mais crítico de churn, depois de oportunidade, depois de objeção.
- `agenda`: a ação principal das até 4 contas mais críticas. São **ações sugeridas**, sem horário; não são compromissos (esses ficam em `/api/v1/agenda`).

---

## Assistente Dialys (chat)

As duas rotas exigem a **sessão do servidor**: o cookie `dialys_sessao` (httpOnly, assinado com HMAC-SHA256) criado no login. O usuário vem só da sessão; ids de usuário ou permissões enviados no corpo são ignorados. Sem sessão válida: `401 SESSAO_AUSENTE`.

### `POST /api/v1/assistente/mensagens`

```json
{
  "mensagem": "Qual ação devo priorizar?",
  "conversaId": "cnv_8f2c…",
  "idCliente": "3b1f6c1e-2d7a-4c1b-9a51-6e0f8c2b7d10",
  "filtros": { "contaId": "conta-grupo-horizonte" }
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `mensagem` | sim | 1 a 2.000 caracteres |
| `conversaId` | não | `cnv_<32 hex>`. Ausente ou `null`: começa uma conversa nova (contexto limpo) |
| `idCliente` | não | Id da pergunta gerado pelo cliente. Reenviar o mesmo devolve a resposta já dada (`repetida: true`), sem duplicar |
| `filtros.contaId` | não | Empresa em foco (ex.: vinda da Central). Validada contra o escopo do usuário: fora dele, `404` |
| `filtros.compromissoId` | não | `cmp_<32 hex>`: compromisso aberto em "Preparar com o Dialys". Precisa ser do usuário (senão `404 COMPROMISSO_NAO_ENCONTRADO`). O cliente dele, se tiver reuniões analisadas e estiver no escopo, vira o foco; título e observações entram no contexto como dados |
| `acao` | não | `"briefing"`: pede o briefing do dia (botão). Também é reconhecido pelo texto ("briefing", "resumo do dia", "como está meu dia") |

**Resposta `200`**

```json
{
  "conversaId": "cnv_8f2c…",
  "pergunta": { "id": "msg_…", "papel": "usuario", "texto": "Qual ação devo priorizar?", "criadaEm": "…", "modo": null, "fontes": [] },
  "resposta": {
    "id": "msg_…",
    "papel": "assistente",
    "texto": "**Grupo Horizonte** (reunião de 07/10/2026)
Ação registrada: …",
    "criadaEm": "…",
    "modo": "claude",
    "fontes": [
      { "tipo": "reuniao", "id": "reu_…", "contaId": "conta-grupo-horizonte", "rotulo": "Grupo Horizonte · 07/10/2026", "data": "2026-10-07", "link": "/insights?conta=conta-grupo-horizonte" }
    ]
  },
  "repetida": false
}
```

- `modo`: `"nemotron"` ou `"claude"` (resposta da IA) ou `"demonstracao"` (montada pelas regras locais a partir do banco, sem IA: sem chave ou com `DIALYS_MODO_DEMO=true`); `null` no briefing.
- `tipo`: `"briefing"` quando a resposta é o briefing do dia (montado dos dados do usuário, sem IA); `null` nas demais. Só respostas `briefing` são lidas em voz pela tela.
- `fala`: no briefing, o roteiro em frases `[{ texto, fala?, novoParagrafo? }]` para a síntese de voz (`fala`, quando presente, é a versão para ouvir); `null` nas demais.
- `fontes`: empresas e reuniões que as consultas devolveram nesta resposta, não o que o texto afirma.
- A auditoria das consultas (ferramenta, argumentos, resumo) fica gravada no servidor e não é devolvida.

Erros: `400 PEDIDO_INVALIDO`/`PERGUNTA_VAZIA`/`PERGUNTA_LONGA`, `401 SESSAO_AUSENTE`, `404 CONVERSA_NAO_ENCONTRADA` (inexistente ou de outro usuário), `404 CONTA_NAO_ENCONTRADA`, `422 ASSISTENTE_RECUSOU`, `500 CHAVE_NAO_CONFIGURADA` (com `detalhe.semChave`), `502`/`503` falhas da API de IA (`SEM_CONEXAO_API`, `LIMITE_DE_USO`...). Em erro, nada é gravado: a mesma pergunta pode ser reenviada.

### `GET /api/v1/assistente/conversas/{id}`

Devolve `{ conversaId, mensagens: [...], contasEmFoco: [...] }` no mesmo formato de mensagem. Conversa de outro usuário responde `404`, como se não existisse.

### Consultas que o assistente pode fazer

Executadas no servidor, com argumentos validados por schema e filtro de permissão em todas; o modelo nunca recebe SQL, credenciais nem o banco inteiro.

| Consulta | O que devolve | Limite |
|---|---|---|
| `consultar_empresa` | Empresas pelo nome/id (ou a carteira em ordem de criticidade), com sinais, NPS, produtos e diagnóstico; marca `ambigua` | 10 (máx. 20) |
| `buscar_reunioes` | Reuniões por empresa e período (`de`/`ate`, fuso de Brasília) | 10 (máx. 20) |
| `consultar_insights` | Sinais com citação literal, criticidade, reunião e data | 10 (máx. 20) |
| `consultar_acoes_sugeridas` | Ações e próximos passos já registrados | 5 (máx. 10) |
| `obter_detalhes_reuniao` | Resumo, sinais e trechos da transcrição em volta das citações (não a transcrição inteira). Por `reuniaoId` ou pelo `numero` do código ("Reunião 003" → 3) | 6 trechos |
| `consultar_agenda` | **Compromissos** do próprio usuário entre `de` e `ate` (padrão: hoje), com cliente, horário, status e se o cliente tem reuniões analisadas. Separados das ações sugeridas; marca `agendaDeDemonstracao` | 31 dias, 30 itens |

Toda lista informa `total` e `truncado`. Conta ou reunião fora do escopo responde igual a "não encontrada". Toda reunião devolvida traz `reuniaoId`, `codigo` e `dataInformada`; reuniões com transcrição removida não aparecem. As fontes de reunião levam a `/insights?reuniao=<id>`. Todas as consultas são de leitura: o assistente não cria nem altera compromissos.

---

## Clientes, carteira e agenda (Home)

Mesma sessão do assistente (`401 SESSAO_AUSENTE` sem ela). O usuário vem só da sessão. A home, a barra lateral do assistente e a consulta `consultar_agenda` usam o mesmo serviço ([src/server/agenda/agenda.ts](../src/server/agenda/agenda.ts)), então os ids são os mesmos em todo lugar.

Clientes são as contas com reunião analisada (mais a base da empresa, quando ligada); a agenda fica na tabela `compromisso` do banco.

### `DELETE /api/v1/carteira/{contaId}`

"Excluir cliente" da aba Clientes: **apaga de vez** todas as reuniões do cliente e o que derivou delas (análises, sinais, menções de produto, sincronizações do CRM), para todos os usuários. Não há como desfazer: uma reunião nova desse cliente começa um histórico novo, só com ela. Os compromissos continuam na agenda; citações do assistente a reuniões apagadas deixam de abrir. Vale também para o cliente que só tem reuniões sem transcrição ativa. A versão anterior (remoção lógica com `PUT` para desfazer, tabela `carteira_remocao` e marca `motivo: "cliente_removido"`) saiu; o que ela gravou é convertido na leitura do banco: saem as reuniões que existiam na remoção e ficam as enviadas depois.

```json
{ "excluido": true, "cliente": { "id": "c-001", "nome": "Metalúrgica Vale Forte" }, "reunioesExcluidas": 2 }
```

Erros: `401 SESSAO_AUSENTE`, `404 CLIENTE_NAO_ENCONTRADO` (inexistente, sem acesso ou já excluído; mesma resposta), `409 REUNIAO_EM_PROCESSAMENTO` (uma reunião do cliente ainda está em análise; nada é apagado). Depois de excluído, o cliente sai de `GET /api/v1/clientes` e não pode ser usado em compromissos **novos** (`422 CLIENTE_INVALIDO`); compromissos existentes continuam com ele e podem ser editados.

### `GET /api/v1/clientes`

| Parâmetro | Regra |
|---|---|
| `busca` | Parte do nome, sem diferenciar acento ou caixa (até 100 caracteres) |
| `limite` | 1 a 50 (padrão 10) |
| `offset` | a partir de 0 |

```json
{
  "dados": [
    { "id": "c-006", "nome": "Grupo Horizonte", "segmento": "Educação", "situacao": { "faixa": "risco", "nota": 4.5 } },
    { "id": "c-004", "nome": "Agro Cerrado Grãos", "segmento": "Agronegócio", "situacao": null }
  ],
  "paginacao": { "total": 24, "limite": 10, "offset": 0 }
}
```

`situacao: null` = **sem avaliação** (nenhuma reunião analisada), diferente de `"saudavel"`. Só voltam contas que o usuário pode acessar.

### Compromisso

```json
{
  "id": "cmp_9131e50e97e540d3b914b191f0bafd8b",
  "titulo": "Revisão trimestral de conta",
  "cliente": { "id": "c-006", "nome": "Grupo Horizonte" },
  "inicio": "2026-10-07T17:30:00.000Z",
  "fim": "2026-10-07T18:15:00.000Z",
  "status": "agendado",
  "local": "Escritório do cliente",
  "observacoes": null,
  "origem": "usuario",
  "criadoEm": "…",
  "atualizadoEm": "…"
}
```

`inicio`/`fim` em ISO UTC; a tela exibe no fuso devolvido pela listagem. `cliente: null` = compromisso interno. `status`: `agendado`, `realizado` ou `cancelado`. `origem`: sempre `usuario` (cadastrado na tela ou pela API).

### `GET /api/v1/agenda?de=AAAA-MM-DD&ate=AAAA-MM-DD`

Compromissos do usuário que acontecem entre as datas (inclusive), no fuso `DIALYS_FUSO_HORARIO`, em ordem de início. Sem parâmetros: hoje. No máximo 62 dias por consulta (`400 PERIODO_INVALIDO`).

```json
{ "fuso": "America/Sao_Paulo", "hoje": "2026-10-07", "periodo": { "de": "2026-10-05", "ate": "2026-10-11" }, "dados": [ { "id": "cmp_…" } ] }
```

### `POST /api/v1/agenda`

```json
{ "titulo": "Visita técnica", "contaId": "c-016", "inicio": "2026-10-08T09:30:00-03:00", "fim": "2026-10-08T10:15:00-03:00", "local": "Escritório do cliente", "observacoes": "Levar a proposta." }
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `titulo` | sim | 1 a 120 caracteres |
| `inicio`, `fim` | sim | ISO 8601 com fuso; `fim` depois de `inicio` e no mesmo dia (no fuso configurado) |
| `contaId` | não | Cliente da carteira do usuário; fora dela, `422 CLIENTE_INVALIDO` (mesma resposta para inexistente) |
| `local` | não | até 120 caracteres |
| `observacoes` | não | até 1.000 caracteres |

Resposta `201` com o compromisso. Campos extras (ex.: `usuarioId`) são recusados.

### `GET /api/v1/agenda/{id}` e `PATCH /api/v1/agenda/{id}`

`PATCH` aceita qualquer subconjunto de `titulo`, `inicio`, `fim`, `contaId` (`null` remove o cliente), `local`, `observacoes` e `status`. O resultado completo é validado de novo. **Cancelar** = `{ "status": "cancelado" }`; não há exclusão. Compromisso de outro usuário responde `404 COMPROMISSO_NAO_ENCONTRADO`, como se não existisse.

Erros de validação: `422 DADOS_INVALIDOS` com a mensagem de cada campo em `detalhe.campos`:

```json
{ "erro": { "codigo": "DADOS_INVALIDOS", "mensagem": "O término deve ser depois do início.", "detalhe": { "campos": { "fim": "O término deve ser depois do início." } }, "requestId": "req_…" } }
```

## Fluxo típico de integração

```
POST /reunioes/processar        → 202 { id, status: EM_PROCESSAMENTO }   Location: /api/v1/reunioes/{id}
GET  /reunioes/{id}             → 200 { status: EM_PROCESSAMENTO }        Retry-After: 2
GET  /reunioes/{id}             → 200 { status: CONCLUIDA, resultado }
GET  /insights?categoria=churn  → 200 { dados: [ { id: sin_… } ] }
POST /crm/sincronizar           → 201 { protocolo }
```

## Do piloto para a produção

| Hoje (piloto) | Produção |
|---|---|
| Etapas 2 a 5 rodam no próprio servidor Next, depois da resposta (`after()`) | Cada etapa vira um step de fila durável (Inngest/BullMQ), com retentativa por etapa |
| Banco em arquivo JSON local (`.dialys/banco.json`), um processo só | Postgres (tabelas `reuniao`, `analise`, `sinal`, `mencao_produto`, `sincronizacao_crm`, `conversa_assistente`, `compromisso`); só os repositórios mudam |
| Carteira = contas analisadas | Carteira do CRM/ERP em `cadastroReal()`; calendário externo (Outlook/Teams) numa etapa futura |
| Webhook do CRM simulado | POST assinado (HMAC) para a URL do CRM, com retentativa |
| Sessão por cookie, com usuários em `.dialys/usuarios.json` | Token OAuth2 (client credentials) para sistemas e sessão do IdP para o frontend |
