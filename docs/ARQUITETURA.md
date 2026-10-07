# Dialys | Inteligência Conversacional TOTVS — Arquitetura do Piloto

> Versão 2.0 · 2026-10-06 · Proposta de piloto para avaliação da TOTVS

---

## 1. O que este piloto precisa provar

O piloto existe para a TOTVS decidir se vale investir na Dialys. A arquitetura foi desenhada para **provar valor rápido e com transparência**. Ela não tenta resolver toda a escala de produção agora, mas mostra que o caminho até lá existe e não exige reescrever o produto (seção 8).

| Hipótese | Como o piloto demonstra | Critério de sucesso |
|---|---|---|
| **H1. A IA detecta churn, oportunidades e objeções com precisão útil** | Conjunto de reuniões com sinais rotulados e tela de **Qualidade da IA** com precisão e revocação medidas | Precisão ≥ 85% em sinais de churn críticos; revocação ≥ 75% |
| **H2. Todo alerta é verificável** | Cada sinal mostra a citação exata e o momento da reunião, com um clique para ouvir o trecho | 100% dos sinais exibidos com evidência validada |
| **H3. O diretor encontra onde agir em minutos** | Painel Executivo + Radar de Riscos com a persona Ricardo Alves | Responder "quais as 5 contas em maior risco e por quê?" em menos de 2 min |
| **H4. Zero digitação do vendedor** | Upload ao vivo durante a apresentação: áudio entra, análise sai | Reunião de 30 min analisada em menos de 3 min |
| **H5. Custo viável em escala** | Custo real de cada análise registrado e exibido | Menos de US$ 0,30 por reunião de 1 h |
| **H6. Diferencial executivo (assistente Dialys)** | Briefing diário em voz gerado a partir da carteira | Briefing de ~90 s, em pt-BR natural, com os fatos corretos |

**O que o piloto não prova** (dito de forma explícita, porque quem avalia vai perguntar):

- Desempenho em **áudio real da TOTVS**. O piloto usa reuniões sintéticas. Áudio sintético é mais limpo que reunião real, então a próxima etapa precisa de 10 a 20 gravações reais anonimizadas, sob NDA.
- Integração com os sistemas internos TOTVS (CRM, IdP corporativo, Teams do tenant). Essas integrações ficam documentadas e com interfaces prontas, mas não conectadas.
- Carga de produção. A arquitetura de produção está descrita na seção 8.

---

## 2. Visão geral do piloto

```
┌──────────────┐        ┌────────────────────────────────────────┐
│  Navegador   │──────▶ │  Next.js (Vercel)                       │
│  avaliador   │◀────── │  UI + Route Handlers + Server Actions   │
└──────────────┘        └───┬───────────────┬────────────────┬───┘
      ▲   status ao vivo     │ leitura (RLS) │ evento          │
      │  (Supabase Realtime) ▼               ▼                 │
      │            ┌────────────────────┐  ┌──────────────────┐│
      └────────────│ Supabase           │◀─│ Inngest          ││
                   │ Postgres+pgvector  │  │ pipeline durável ││
                   │ Auth · Storage     │  │ + cron (briefing)││
                   └────────────────────┘  └──┬──────┬──────┬─┘│
                                              ▼      ▼      ▼  │
                                            STT   Claude  ElevenLabs
                                         (diariz.) Opus 5.5  (TTS)
```

**Pipeline de uma reunião** (cada etapa é um *step* do Inngest, com retry automático):

1. **Recebida.** Upload do áudio ou da transcrição para o Supabase Storage.
2. **Transcrição.** O STT com diarização produz segmentos com locutor, início, fim e texto. Etapa pulada se já vier transcrição.
3. **Análise.** Uma chamada ao Claude com resposta estruturada (detalhes na seção 3.4).
4. **Validação de evidência.** O código confere que cada citação existe no segmento indicado. O que não passa é descartado e contado.
5. **Score.** Recalcula o health score da conta, de forma determinística.
6. **Pronta.** O status muda e a tela atualiza sozinha via Supabase Realtime.

---

## 3. Stack e justificativas

Critério geral: **o mínimo de peças para o máximo de demonstração**. São 3 serviços gerenciados (Vercel, Supabase, Inngest), mais as APIs de IA, todos com deploy em minutos e uma URL pública para os avaliadores.

### 3.1 Frontend

| Escolha | Por quê |
|---|---|
| **Next.js (App Router) + React 19 + TypeScript** | Frontend e backend no mesmo projeto: uma base de código e um deploy. Server Components entregam telas de dados (Painel, Contas) rápidas, sem cascata de requisições. |
| **shadcn/ui + Tailwind**, com os tokens do IBM Carbon | O shadcn copia o código dos componentes para o projeto, então aplicamos a linguagem visual do Carbon (cantos retos, grid de 8 px, escala tipográfica) sem brigar com a biblioteca. Base acessível (Radix). |
| **IBM Plex Sans / Plex Mono** via `next/font` | Tipografia oficial do Carbon, auto-hospedada e sem layout shift. |
| **TanStack Query + Zustand + nuqs** | Respectivamente: dados do servidor e cache; estado de tela (player de áudio, dock do assistente); filtros na URL, compartilháveis durante a avaliação. |
| **TanStack Table, Recharts (shadcn charts), wavesurfer.js** | Tabelas de 400 contas; gráficos do painel; waveform do áudio com os sinais marcados na linha do tempo. |

### 3.2 Backend

| Escolha | Por quê |
|---|---|
| **Route Handlers + Server Actions do Next.js** | No piloto não há motivo para um serviço de API separado. Endpoints REST (`/api/v1/...`) ficam disponíveis para mostrar o contrato de integração. |
| **Inngest** (pipeline e agendamentos) | Pipeline em etapas duráveis com retry, sem precisar operar fila nem servidor de worker. O cron gera o briefing do assistente Dialys às 7h. O painel do Inngest mostra cada execução, o que ajuda a explicar o pipeline na apresentação. |
| **Zod** | Um schema por entidade valida entradas da API, tipa o front **e** define o formato da resposta do Claude. |

### 3.3 Dados

| Escolha | Por quê |
|---|---|
| **Supabase** (Postgres 16 + pgvector + Auth + Storage + Realtime) | Um único serviço cobre banco, login, arquivos e atualização em tempo real. É Postgres padrão, então o caminho para o Postgres gerenciado da TOTVS é direto (seção 8). |
| **Row-Level Security** | Cada usuário só enxerga a própria carteira (o diretor vê os 18 vendedores dele, o vendedor vê as próprias contas). Fica demonstrado já no piloto, com logins de persona diferentes. |
| **pgvector + full-text em português** | Busca semântica nas transcrições (Ask Dialys) na mesma query que os filtros e a RLS. Um banco vetorial separado seria uma peça a mais sem ganho nesta escala. |
| **Migrations SQL versionadas** (Supabase CLI) e tipos gerados com `supabase gen types` | Schema reproduzível e tipado. |

**Entidades:** `usuario`, `equipe`, `conta`, `contato`, `reuniao`, `segmento`, `analise` (modelo, versão do prompt, tokens, custo, duração), `sinal` (tipo, subtipo, severidade, confiança, evidências, revisão humana), `mencao_produto`, `produto_totvs` (catálogo + aliases), `objecao_categoria`, `health_score_snapshot`, `briefing`, `chunk` (embedding).

### 3.4 Motor de Inteligência Conversacional

**Modelo: Claude Opus 5.5 (`claude-opus-5-5`)**, via SDK oficial `@anthropic-ai/sdk`.

- **Uma chamada por reunião faz tudo**: produtos TOTVS mencionados, sinais de churn, oportunidades, objeções, sentimento por locutor, resumo e próximos passos. Uma reunião de 1 h tem cerca de 20 mil tokens, o que cabe com folga na janela de 1 milhão. O modelo lê a conversa inteira, e isso importa porque risco de churn aparece no contexto ("se o suporte continuar assim, a diretoria vai rever o contrato"), não numa frase solta.
- **Resposta estruturada**: `client.messages.parse()` com `output_config.format` gerado do schema Zod. O formato é garantido, sem parsing frágil de texto.
- **Thinking adaptativo**, esforço `medium` na análise e `low` no roteiro do assistente, calibrados pelo conjunto rotulado.
- **Prompt caching** do prefixo fixo: instruções, catálogo de produtos TOTVS e taxonomia de objeções. Só a transcrição varia.
- **Recusa tratada**: verifica `stop_reason` antes de ler a resposta e usa fallback no servidor (`fallbacks: "default"`). Uma falha vira o status "pendente de revisão", nunca um erro silencioso.

| Capacidade | Abordagem |
|---|---|
| **Produtos TOTVS (NER)** | Dicionário de aliases (Protheus, "o ERP", "folha do RM", Fluig, Techfin, RD Station...) marca candidatos. O Claude classifica o **contexto** de cada menção: em uso, interesse, insatisfação, ou se é um **concorrente** (SAP, Senior, Sankhya, Omie...). |
| **Churn** | O Claude extrai **sinais** tipados (insatisfação com suporte, menção a concorrente, corte de orçamento, troca de decisor, atraso de implantação), com severidade, confiança e evidência. O **score da conta é calculado por código**: soma ponderada com decaimento no tempo. Assim dá para explicar por que a conta está vermelha, em vez de depender de uma "nota" do modelo. |
| **Objeções** | Classificadas na taxonomia (preço, prazo, funcionalidade, integração, concorrente, orçamento, risco de migração), indicando se o vendedor tratou a objeção e como. |
| **Upsell / cross-sell** | Produto que a conta ainda não tem, cruzado com uma dor verbalizada na reunião, gera uma oportunidade com produto sugerido e evidência. |
| **Evidência obrigatória** | Todo sinal traz `segmento_id` e a citação literal. O código confere a citação; sem evidência válida, o sinal não aparece. |
| **Proteção contra injeção** | A transcrição é tratada como dado: vai delimitada no prompt, a chamada não tem ferramentas e a saída é restrita ao schema. |

### 3.5 Áudio e voz

| Função | Escolha | Por quê |
|---|---|---|
| **Transcrição (STT)** | API com **diarização em pt-BR**, atrás da interface `TranscriptionProvider`. Candidatos: OpenAI (família Whisper), AssemblyAI, Deepgram. Escolha no 1º dia, testando com 3 áudios do piloto. | Saber quem falou é obrigatório: sem isso não dá para separar a objeção do cliente da fala do vendedor. A interface permite trocar de provedor na produção. |
| **Roteiro do briefing** | Claude, sobre **dados agregados** da carteira (riscos novos, oportunidades, agenda) | Texto curto (~220 palavras, ~90 s), escrito para ser ouvido. |
| **Voz do assistente Dialys (TTS)** | **ElevenLabs**, voz pt-BR fixa | Qualidade executiva em português. O MP3 é gerado no cron e guardado no Storage, então toca instantaneamente na demo. |
| **Fallback de voz** | Web Speech API do navegador | Custo zero. Garante que a demo funciona mesmo se a API externa falhar. |
| **Perguntas por voz** *(opcional)* | Microfone → STT → Ask Dialys → resposta falada | Fica para o fim do piloto, se houver tempo (ver ESTADO_DO_PROJETO). |

### 3.6 Autenticação

- **Supabase Auth com provedor OIDC (Microsoft Entra ID)** demonstra login corporativo.
- **Logins de persona para a avaliação**: Ricardo Alves (Diretor), uma gerente e um vendedor, cada um vendo a carteira correspondente. Isso mostra RBAC e RLS funcionando ao vivo.
- Na produção, o login troca para o IdP oficial TOTVS (seção 8). As policies de RLS se mantêm.

---

## 4. Dados do piloto (sintéticos e rotulados)

O piloto não depende de dados internos da TOTVS para ficar pronto. Todos os nomes de empresas e pessoas são **fictícios**.

| Item | Volume | Como é gerado |
|---|---|---|
| Diretoria, gerentes, vendedores | 1 diretor (Ricardo), 2 gerentes, 18 vendedores | Seed SQL |
| Contas fictícias | 400, com segmento, porte, produtos TOTVS contratados e vendedor | Script com distribuição realista por segmento (manufatura, varejo, serviços, saúde, agro...) |
| Reuniões com transcrição | ~60 | Roteiros gerados por script com o Claude, cada um com **sinais plantados e rotulados** (tipo, severidade, trecho) |
| Reuniões com áudio | ~10, de 10 a 15 min | Roteiros acima narrados com vozes distintas (ElevenLabs), para demonstrar transcrição e diarização |
| Histórico | 90 dias | Datas distribuídas para gerar tendência no painel e decaimento no score |

**Vantagem para a avaliação:** como os sinais foram plantados, o conjunto já nasce com gabarito. A tela de Qualidade da IA compara o que o modelo encontrou com o gabarito e calcula precisão e revocação automaticamente. Cerca de 20% das reuniões ficam **sem nenhum sinal**, para medir falsos positivos.

**Limitação** (registrada também na seção 1): roteiro sintético é mais "limpo" que conversa real. Os números do piloto são um teto otimista e precisam de validação com gravações reais na etapa seguinte.

---

## 5. Design System (IBM Carbon + marca TOTVS)

Tokens em `src/styles/tokens.css`, expostos ao Tailwind.

### 5.1 Cores

| Token | Valor | Uso |
|---|---|---|
| `--background` | `#F4F5F7` | Fundo da aplicação |
| `--layer-01` | `#FFFFFF` | Cards e tiles |
| `--shell` | `#363636` | Header, side nav, dock do assistente (Grafite TOTVS, Pantone 447C) |
| `--interactive` | `#FEAC0E` | Botão primário e destaques (Laranja TOTVS, Pantone 2010C) |
| `--interactive-hover` | `#E59A00` | Hover do primário |
| `--on-interactive` | `#161616` | Texto sobre o laranja |
| `--text-primary` / `--text-secondary` | `#161616` / `#525252` | Texto |
| `--border-subtle` | `#E0E0E0` | Divisórias |
| `--focus` | `#363636` | Anel de foco (2 px) |

**Acessibilidade (WCAG 2.2 AA):**

- Texto branco sobre `#FEAC0E` tem contraste de 1,9:1 (reprovado). O botão primário usa texto `#161616`, e `#363636` sobre o laranja também passa (6,4:1).
- O laranja não serve como cor de link nem de foco em fundo claro (1,7:1). Links e foco usam grafite. No shell escuro, o foco pode ser laranja.
- O Carbon Gray 10 oficial é `#F4F4F4`; mantivemos `#F4F5F7` conforme a marca, com diferença imperceptível.

### 5.2 Tags de criticidade

Todas levam **ícone e rótulo**, nunca só cor, porque o laranja e o amarelo de alerta ficam próximos do laranja da marca.

| Tag | Fundo | Texto | Ícone |
|---|---|---|---|
| Churn crítico | `#FFD7D9` | `#750E13` | WarningFilled |
| Churn atenção | `#FFD9BE` | `#8A3800` | Warning |
| Oportunidade | `#A7F0BA` | `#044317` | Growth |
| Objeção | `#FCF4D6` | `#684E00` | Chat |
| Produto TOTVS | `#E0E0E0` | `#161616` | Product |

### 5.3 Tipografia (escala produtiva do Carbon, IBM Plex Sans)

| Token | Tamanho / linha | Peso | Uso |
|---|---|---|---|
| `heading-05` | 32 / 40 | 400 | Título de página |
| `heading-04` | 28 / 36 | 400 | KPI grande |
| `heading-03` | 20 / 28 | 400 | Título de seção |
| `heading-02` | 16 / 24 | 600 | Título de card |
| `heading-01` | 14 / 20 | 600 | Cabeçalho de tabela |
| `body-02` | 16 / 24 | 400 | Transcrição |
| `body-01` | 14 / 20 | 400 | Texto padrão |
| `label-01` | 12 / 16 | 400 | Rótulos, tags, metadados |
| `code-01` | 12 / 16 (Plex Mono) | 400 | Timestamps, IDs |

Grid de 8 px, cantos retos e cards sem sombra (separação por camada de cor), como no Carbon.

---

## 6. Estrutura de pastas

Projeto único (não monorepo), porque no piloto a velocidade vale mais que a separação em pacotes. As fronteiras internas (`server/ai`, `server/pipeline`, `server/providers`) já seguem os limites que viram serviços na produção.

```
dialys/
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (app)/                         # layout com UI Shell grafite
│   │   │   ├── painel/                     # Painel Executivo (home)
│   │   │   ├── riscos/                     # Radar de Riscos
│   │   │   ├── contas/  contas/[id]/
│   │   │   ├── reunioes/  reunioes/[id]/  reunioes/nova/
│   │   │   ├── oportunidades/
│   │   │   ├── objecoes/
│   │   │   ├── busca/                      # Ask Dialys (opcional)
│   │   │   └── qualidade/                  # Qualidade da IA (métricas do piloto)
│   │   └── api/
│   │       ├── inngest/route.ts            # endpoint do pipeline
│   │       ├── v1/                         # REST público (contrato de integração)
│   │       └── webhooks/stt/route.ts       # callback do provedor de transcrição
│   ├── components/
│   │   ├── ui/                             # shadcn adaptado ao Carbon
│   │   ├── shell/                          # Header, SideNav, AssistenteDock
│   │   ├── reuniao/                        # Player, TranscriptView, PainelSinais
│   │   ├── sinais/                         # SignalTag, EvidenciaCard
│   │   └── graficos/
│   ├── server/
│   │   ├── ai/
│   │   │   ├── prompts/                    # versionados (analise.v1.md, briefing.v1.md)
│   │   │   ├── schemas.ts                  # Zod da saída do Claude
│   │   │   ├── analisar-reuniao.ts
│   │   │   ├── validar-evidencia.ts
│   │   │   └── gerar-briefing.ts
│   │   ├── pipeline/                       # funções Inngest (etapas + cron)
│   │   ├── providers/                      # stt/, tts/, embeddings/ (interfaces + adapters)
│   │   ├── score/                          # health score determinístico
│   │   └── queries/                        # acesso a dados por domínio
│   ├── lib/                                # clientes Supabase, formatação, utils
│   └── styles/tokens.css
├── supabase/
│   ├── migrations/                         # schema + policies RLS
│   └── seed.sql
├── data/sintetico/
│   ├── roteiros/                           # JSON: transcrição + sinais rotulados
│   └── audios/
├── scripts/
│   ├── gerar-carteira.ts                   # 400 contas, equipe, histórico
│   ├── gerar-reunioes.ts                   # roteiros com sinais plantados
│   ├── gerar-audios.ts                     # narração com múltiplas vozes
│   └── avaliar.ts                          # roda o eval contra o gabarito
├── docs/
│   ├── ARQUITETURA.md
│   └── ROTEIRO_DEMO.md
├── ESTADO_DO_PROJETO.md
└── package.json
```

---

## 7. Segurança e LGPD no piloto

- Somente dados **fictícios**. Nenhuma gravação real entra sem NDA e anonimização.
- RLS ativa e segredos apenas no servidor (chaves de API nunca no navegador). Áudios acessados só por URL assinada de curta duração.
- Cada análise registra modelo, versão do prompt, tokens e custo, o que permite rastrear qualquer resultado.
- Para a produção, já ficam documentados: aviso de gravação e base legal, retenção configurável, exclusão por titular e trilha de auditoria.

---

## 8. Caminho do piloto para a produção

Cada peça do piloto tem um equivalente enterprise. A troca é de infraestrutura, não de produto.

| Piloto | Produção TOTVS | O que muda no código |
|---|---|---|
| Next.js na Vercel | Next.js em contêiner (Kubernetes na nuvem TOTVS) | Nada; muda o deploy |
| Route Handlers | API dedicada (NestJS) quando houver integrações externas em volume | Extrair `server/` para um serviço; os schemas Zod continuam valendo |
| Inngest | Filas (BullMQ/Redis) com workers que escalam conforme a fila | Reescrever a orquestração em `server/pipeline/`; as etapas são as mesmas funções |
| Supabase Postgres + pgvector | Postgres gerenciado com pgvector | Migrations SQL portáveis; ajustar as policies de RLS para o claim do novo IdP |
| Supabase Auth + Entra ID | IdP corporativo TOTVS (OIDC) + SCIM | Trocar o provedor de login |
| Supabase Storage | Object storage com criptografia KMS e retenção | Adapter de storage |
| Upload manual | Ingestão automática do Teams/Meet/Zoom e do calendário, priorizando a transcrição nativa | Novos adapters em `server/providers/` |
| Claude API direta | Claude API, Amazon Bedrock ou Google Vertex, conforme residência de dados | Trocar a classe do cliente da SDK |
| Dados sintéticos | Gravações reais + revisão humana alimentando o eval | O eval já existe; ganha dados reais |

**Escala de referência para produção:** 5.000 reuniões/dia (todas as regionais). Postgres + pgvector suporta o volume de um ano (~50 milhões de trechos indexados). O custo de IA estimado fica em torno de US$ 0,15 a 0,25 por reunião de 1 h, a ser confirmado com as medições do próprio piloto (H5).

---

## 9. Custos do piloto

| Item | Ordem de grandeza |
|---|---|
| Claude (geração dos roteiros + análises + rodadas de eval) | Dezenas de dólares |
| ElevenLabs (~10 áudios de reunião + briefings) | Plano intermediário por 1 mês |
| STT (~10 áudios de 15 min) | Poucos dólares |
| Vercel, Supabase e Inngest | **Planos pagos básicos durante a avaliação**, porque planos gratuitos podem pausar por inatividade ou limitar o tempo de execução no dia da demo |

Total estimado: **na casa de algumas centenas de dólares** para todo o piloto.
