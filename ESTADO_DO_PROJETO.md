# ESTADO DO PROJETO — Dialys | Piloto TOTVS

> **Última atualização:** 2026-10-06
> **Etapa atual:** Sprint 0, Fundação (em andamento)
> **Objetivo:** piloto funcional para a TOTVS avaliar se a Dialys faz sentido para a empresa
> **Arquitetura:** [docs/ARQUITETURA.md](docs/ARQUITETURA.md) · **Hipóteses e critérios de sucesso:** seção 1 da arquitetura
> **Persona:** Ricardo Alves, Diretor Comercial Regional (18 vendedores, 400+ contas, ~60 reuniões/dia)

**Legenda:** ⬜ Não iniciado · 🟦 Em andamento · ✅ Concluído · ⛔ Bloqueado
**Prioridade:** **P0** sem isso não há demo · **P1** fortalece a avaliação · **P2** se sobrar tempo

**Premissas** (ajustar se estiverem erradas): equipe pequena, sprints de 1 semana, sem acesso a dados reais da TOTVS durante a construção.

---

## 1. Resumo

| Sprint | Foco | Ao final, dá para mostrar | Status |
|---|---|---|---|
| **0** | Fundação: projeto, design system, shell, login, dados sintéticos | App com a cara da TOTVS, login das personas e 400 contas fictícias | 🟦 |
| **1** | Coração da IA: pipeline + Detalhe da Reunião | Uma reunião analisada, com sinais e evidências clicáveis | ⬜ |
| **2** | Visão do Diretor: Painel + Radar de Riscos + upload ao vivo | A jornada do Ricardo de ponta a ponta | ⬜ |
| **3** | Carteira e oportunidades | Explicação do score e mapa de cross-sell por conta | ⬜ |
| **4** | Assistente Dialys + Qualidade da IA | Briefing em voz e métricas de precisão e custo | ⬜ |
| **5** | Polimento, ensaio e opcionais | Demo ensaiada, com plano B para cada parte ao vivo | ⬜ |

---

## 2. Telas e entregas, em ordem de implementação

A ordem segue a **dependência de dados**: o Painel do Ricardo é a tela principal da apresentação, mas só fica convincente quando já existem reuniões analisadas. Por isso o pipeline e o Detalhe da Reunião vêm primeiro.

### Sprint 0: Fundação

| # | Entrega | Rota | Prio | Pronto quando | Status |
|---|---|---|---|---|---|
| T00 | Projeto Next.js + Supabase + Inngest com deploy na Vercel | — | P0 | URL pública no ar e deploy automático a cada push | 🟦 Next.js 16 criado e compilando; falta Supabase, Inngest e deploy |
| T01 | Design tokens + componentes base | `src/app/globals.css`, `src/components/ui` | P0 | Button (laranja com texto `#161616`), SignalTag (5 variantes com ícone), Tile, KpiTile e DataTable; contraste AA conferido | 🟦 Tokens, Button, TextInput, SignalTag e KpiTile prontos; faltam Tile genérico e DataTable |
| T02 | Login + personas | `/login` | P0 | Entrar como Ricardo, gerente ou vendedor; cada um vê só a própria carteira (RLS). Botão "Entrar com Microsoft" funcional | 🟦 Tela pronta (fiel ao protótipo); falta autenticação real |
| T03 | UI Shell | layout `(app)` | P0 | Header grafite `#363636` com abas Envio, Dashboard, Central de Insights e Assistente Dialys (definidas no protótipo, no lugar da side nav); menu do usuário | ✅ |
| T03b | Envio de transcrição | `/envio` | P0 | Fiel ao protótipo: texto, anexo (TXT/PDF/DOCX/MP3/WAV até 20 MB, arrastar e soltar), seleção de conta, nota de voz (Web Speech API), envio por Ctrl+Enter | 🟦 Interface pronta; envio simulado até o pipeline (T06) |
| T04 | Dados sintéticos | `scripts/`, `data/` | P0 | Equipe, 400 contas, ~60 roteiros com sinais rotulados (20% sem sinal), ~10 áudios com vozes distintas | ⬜ |
| T05 | Escolha do STT | — | P0 | 3 áudios testados nos candidatos; escolhido o que acerta a diarização em pt-BR | ⬜ |

### Sprint 1: Coração da IA

| # | Entrega | Rota | Prio | Pronto quando | Status |
|---|---|---|---|---|---|
| T06 | Pipeline de análise | `server/pipeline`, `server/ai` | P0 | Recebida → Transcrição → Análise (Claude) → Validação de evidência → Score → Pronta, com retry. Registra tokens, custo e duração | 🟦 Orquestração em 5 etapas (`src/server/pipeline`) com estado por etapa, persistência local e API REST v1 ([docs/CONTRATO_API.md](docs/CONTRATO_API.md)); faltam Inngest (retry por etapa), provedor de STT e score |
| T07 | **Detalhe da Reunião** ⭐ | `/reunioes/[id]` | P0 | Player com waveform e marcadores; transcrição por locutor sincronizada com o áudio; painel com resumo, sinais, produtos e próximos passos; clicar na evidência leva ao trecho; botões Confirmar e Descartar | ⬜ |
| T08 | Lista de Reuniões | `/reunioes` | P0 | Tabela com conta, vendedor, data, duração e tags; filtros na URL | ⬜ |

**Checkpoint:** as ~60 reuniões sintéticas estão processadas e o eval roda com precisão de churn ≥ 85%. Se não chegar lá, a Sprint 2 começa ajustando o prompt.

### Sprint 2: Visão do Diretor

| # | Entrega | Rota | Prio | Pronto quando | Status |
|---|---|---|---|---|---|
| T09 | **Painel Executivo** ⭐ (home) | `/dashboard` | P0 | KPIs (reuniões, contas em risco crítico e de atenção, oportunidades, top 3 objeções), feed de alertas e tendência de 90 dias; carrega em menos de 1,5 s | 🟦 KPIs clicáveis e feed com filtros prontos, com dados fictícios; faltam dados reais (T06) e tendência de 90 dias |
| T10 | **Radar de Riscos** | `/riscos` | P0 | Contas priorizadas por severidade, com o motivo em uma linha, a evidência e os dias sem ação | ⬜ |
| T11 | **Nova Reunião (upload ao vivo)** | `/reunioes/nova` | P0 | Sobe áudio ou transcrição e vê o progresso atualizar sozinho; reunião de 30 min pronta em menos de 3 min | ⬜ |

### Sprint 3: Carteira e oportunidades

| # | Entrega | Rota | Prio | Pronto quando | Status |
|---|---|---|---|---|---|
| T12 | Carteira de Contas | `/contas` | P0 | 400 contas com health score (cor, número e tendência), produtos TOTVS e vendedor; ordenação por risco | ⬜ |
| T13 | **Detalhe da Conta** (Central de Insights) | `/insights?conta=` | P0 | Linha do tempo de reuniões e sinais; **"por que este score?"** com sinais, pesos e datas; mapa de produtos TOTVS em uso × lacunas de cross-sell | 🟦 Master-detail pronto (busca, filtros, produtos NER, evidência literal destacada, diagnóstico, CRM simulado, PDF via impressão); faltam linha do tempo e explicação do score |
| T14 | Oportunidades | `/oportunidades` | P1 | Upsell e cross-sell com produto sugerido, evidência e conta | ⬜ |

### Sprint 4: Assistente Dialys e Qualidade da IA

| # | Entrega | Rota | Prio | Pronto quando | Status |
|---|---|---|---|---|---|
| T15 | **Assistente Dialys: briefing diário** | `/assistente` | P1 | Às 7h gera um MP3 de ~90 s (ElevenLabs, pt-BR) com riscos, oportunidades e agenda; player e texto do briefing; fallback para a voz do navegador | 🟦 Tela pronta com a voz do navegador (play/pausa/avanço, transcrição com a frase atual destacada, modo legenda se a voz falhar), matriz de urgência e agenda; roteiro fixo. Faltam o roteiro gerado pelo Claude e o MP3 da ElevenLabs |
| T16 | **Qualidade da IA** | `/qualidade` | P1 | Precisão e revocação por tipo de sinal contra o gabarito, taxa de falso positivo nas reuniões sem sinal, custo médio e tempo médio por reunião | ⬜ |
| T17 | Inteligência de Objeções | `/objecoes` | P1 | Ranking por categoria, por produto e por vendedor, com exemplos de boas respostas | ⬜ |

### Sprint 5: Polimento e ensaio

| # | Entrega | Prio | Pronto quando | Status |
|---|---|---|---|---|
| T18 | Roteiro da demo (`docs/ROTEIRO_DEMO.md`) | P0 | Roteiro de 15 min cronometrado (seção 3), com plano B para cada parte ao vivo | ⬜ |
| T19 | Revisão visual e de acessibilidade | P0 | Todas as telas P0 consistentes com o Carbon; navegação por teclado; sem erros no axe | ⬜ |
| T20 | Ask Dialys (busca semântica) | P2 | Pergunta em linguagem natural responde com citações de reuniões | ⬜ |
| T21 | Assistente Dialys: perguntas por voz | P2 | Push-to-talk → resposta falada com links | ⬜ |
| T22 | Webhook de alerta de churn | P2 | Alerta crítico chega em um canal do Teams ou Slack durante a demo | ⬜ |

---

## 3. Roteiro da apresentação (rascunho)

| Min | Momento | Tela | Hipótese provada |
|---|---|---|---|
| 0–2 | O problema: 60 reuniões por dia, nenhuma ouvida pelo diretor | — | — |
| 2–5 | Ricardo abre o dia com o briefing do assistente Dialys | Painel + assistente Dialys | H6 |
| 5–8 | "Quais contas estão em risco e por quê?" | Radar → Detalhe da Conta → "por que este score?" | H3 |
| 8–10 | Clique na evidência: o trecho exato da fala do cliente | Detalhe da Reunião | H2 |
| 10–12 | Upload ao vivo de uma reunião nova | Nova Reunião → resultado | H4 |
| 12–14 | Quanto confiar na IA e quanto custa | Qualidade da IA | H1, H5 |
| 14–15 | Caminho para produção e próximo passo pedido à TOTVS | Arquitetura, seção 8 | — |

**Plano B:** vídeo gravado do upload ao vivo e MP3 do briefing já gerado, para o caso de rede ou API instável.

---

## 4. Fora do escopo do piloto

Ficam documentados na arquitetura (seção 8) como próximos passos, mas não serão construídos agora:

- Ingestão automática do Teams, Meet e Zoom (o piloto usa upload)
- Integração com o CRM e o IdP corporativo da TOTVS
- Telas de Admin (catálogo e taxonomia ficam em arquivos de configuração)
- Telas de Equipe e coaching por vendedor
- LGPD operacional (retenção automática, exclusão por titular)
- Infraestrutura de produção (Kubernetes, filas, observabilidade completa)

---

## 5. O que pedir à TOTVS

| Pedido | Para quê | Quando |
|---|---|---|
| 10 a 20 gravações reais anonimizadas, sob NDA | Validar precisão em áudio real. Recebida uma amostra de 17 transcrições anonimizadas (`data/demo/totvs`); falta rotular os sinais esperados para medir H1 | Próxima etapa, se aprovado |
| Papel de cada locutor nas transcrições (TOTVS ou cliente) | A amostra vem como `[LOCUTOR N]`; com o papel, a análise deixa de deduzir quem é quem | Durante o piloto |
| Lista oficial de produtos e aliases usados pelos vendedores | Melhorar o reconhecimento de produtos TOTVS | Opcional, durante o piloto |
| Um diretor comercial real para testar o painel por 1 semana | Validar H3 com o usuário de verdade | Após a apresentação |
| Posição do Jurídico e da Segurança sobre residência de dados | Definir Claude API direta × Bedrock × Vertex na produção | Próxima etapa |

---

## 6. Riscos do piloto

| Risco | Mitigação |
|---|---|
| Os avaliadores questionam os dados sintéticos | Assumir a limitação abertamente (arquitetura, seção 1) e propor a validação com áudio real como próximo passo |
| Falha de rede ou API no ao vivo | Plano B gravado, briefing pré-gerado e fallback de voz do navegador |
| Precisão abaixo da meta | Checkpoint no fim da Sprint 1, com folga para ajustar o prompt antes das telas de visão |
| Diarização falha | Teste de STT na Sprint 0; a demo também funciona com upload de transcrição já com locutores |
| Escopo cresce | Só P0 é compromisso; P2 entra apenas com sprint de folga |

---

## 7. Registro de progresso

| Data | Entrega | Observações |
|---|---|---|
| 2026-10-06 | Arquitetura v1 (visão enterprise) | Substituída pela v2 |
| 2026-10-06 | Arquitetura v2 (piloto) e este documento | Escopo reduzido para piloto de avaliação; produção descrita como caminho |
| 2026-10-06 | Projeto Next.js, design tokens, telas `/login` e `/envio`, shell | Navegação segue o protótipo (Envio, Dashboard, Central de Insights, Jarvis). As três últimas abas são placeholders. O logo TOTVS é uma aproximação e precisa do SVG oficial |
| 2026-10-06 | Painel Executivo `/dashboard` + placeholder `/contas/[id]` | Dados fictícios em `src/lib/mock/`. Cliente do card de churn trocado de "Senior Sistemas" (empresa real, concorrente) para conta fictícia; total "Todos" calculado (58) |
| 2026-10-06 | Central de Insights `/insights` (master-detail 40/60) | Fonte única de dados em `src/lib/mock/insights.ts`, usada pelo Dashboard e pela Central. O card de churn do Dashboard passou a ser o Grupo Horizonte (mesma reunião da evidência). "Ver Detalhes da Conta" abre `/insights?conta=`. `/contas/[id]` removido. CRM (UC05) simulado; PDF (US-07) via impressão do navegador |
| 2026-10-06 | Jarvis `/jarvis` | A matriz lê os mesmos 3 alertas do Dashboard (a Urgência 1 é o Grupo Horizonte, não "Senior Sistemas"). Testado no Edge com voz pt-BR real: play, pausa, avanço e retomada funcionando, sem erros no console |
| 2026-10-06 | Motor de IA `src/server/ai` | Schemas Zod, `analisarReuniao()` (Claude Opus 5.5, saída estruturada, prompt em cache, fallback do servidor, auditoria de tokens/custo/tempo) e validador de evidências determinístico. 12 testes unitários com cliente simulado; o teste com a API real fica pulado sem `ANTHROPIC_API_KEY`. Ainda não conectado à tela `/envio` |
| 2026-10-06 | `/envio` conectado ao motor de IA | Server Action `analisarTranscricao` (texto colado ou .txt), tela de resultado com sinais, citações, produtos, transcrição destacada, sinais descartados e auditoria de custo/tempo. Testado ponta a ponta contra uma API simulada local e sem chave (mostra o passo a passo). PDF/DOCX/áudio ainda não analisados. Sem autenticação: não publicar a URL antes de T02 |
| 2026-10-06 | Modo demonstração (`DIALYS_MODO_DEMO=true`) | Simula a IA sem custo: cenários JSON em `data/demo/cenarios` (3 prontos, menu "Exemplo" no `/envio`) e analisador por regras para textos desconhecidos. Passa pelo mesmo validador de evidências; o resultado mostra "Modo demonstração". Não serve para medir H1 (precisão) nem H5 (custo) |
| 2026-10-06 | Amostra real da TOTVS (`data/demo/totvs/amostra_reunioes.json`) | 17 reuniões anonimizadas (16 únicas; 1070373 repete 1070370). O `/envio` aceita o JSON da TOTVS por anexo, arraste ou colagem (lista para escolher quando há várias) e trecho copiado de dentro do JSON (`\n` literal). As 16 reuniões entram no menu "Exemplo". O analisador por regras foi refeito para o formato real: deduz qual `[LOCUTOR N]` fala pela TOTVS (acerta 14 de 16), reconhece erros de transcrição ("TOTUS", "Proteus", "Sankia", "Plumes") e usa segmento e NPS no resumo. Catálogo ampliado (Assinatura Eletrônica/TAI, Transmite, Cloud, Analytics; Ploomes, Salesforce, Mercanet, Power BI) e prompt do Claude atualizado para `analise.v2`. Limites: reuniões sem sinal explícito (ex.: kick-off 1082750) saem sem sinais; o modo Claude ainda não recebe os metadados |
| 2026-10-07 | Pipeline + API REST v1 | `POST /api/v1/reunioes/processar` (202 assíncrono via `after()`, ou `?modo=sincrono` → 201), `GET /api/v1/reunioes/{id}`, `GET /api/v1/insights` (filtros por categoria/criticidade, paginação e resumo para KPIs) e `POST /api/v1/crm/sincronizar` (webhook simulado, idempotente). Persistência em `.dialys/banco.json` (tabelas `reuniao`, `analise`, `sinal`, `mencao_produto`, `sincronizacao_crm`). O `/envio` passou a usar o mesmo pipeline, então o que se analisa na tela aparece na API. Contrato em `docs/CONTRATO_API.md`; 23 testes novos de pipeline e de rotas; testado com `curl` no build de produção. STT segue desligado (áudio → 422) e a API ainda não tem autenticação (T02) |
| 2026-10-07 | Central de Insights com dados reais | `/insights` deixou de usar as 6 contas fictícias: lê as reuniões analisadas a cada visita, agrupadas por empresa (conta escolhida no envio, código do cliente TOTVS `CODT` ou a própria reunião). Detalhe da última reunião com sinais, produtos, um trecho de evidência por fala (citações destacadas), diagnóstico e próximos passos. Botão do CRM chama `POST /api/v1/crm/sincronizar` de verdade. No `/envio`, o seletor "Criar ˅" lista as empresas já analisadas e "Nova conta" cadastra pelo nome. Dashboard e Jarvis seguem com dados fictícios (os links "Ver detalhes" do Dashboard abrem a primeira conta da Central) |
| 2026-10-07 | Telas conectadas à API (fluxo de ponta a ponta) | `/envio` envia por `POST /api/v1/reunioes/processar` e mostra as etapas reais do pipeline; ao concluir, toast "Análise concluída com sucesso! N sinais identificados." e redirecionamento ao Dashboard com os alertas novos destacados. Dashboard lê `GET /api/v1/insights` e a nova `GET /api/v1/resumo` (KPIs, abas e lista reais, atualizados a cada 10 s). Central pede confirmação em modal antes de sincronizar o CRM. Jarvis monta o briefing do resumo real e o lê com `speechSynthesis`; a "agenda" são as ações recomendadas para as contas mais críticas (sem calendário integrado). Dados fictícios de alertas, insights e Jarvis removidos de `src/lib/mock`. Verificado no Edge headless: envio → dashboard → insights → CRM → Jarvis, sem erros no console e sem rolagem horizontal a 390 px |
| 2026-10-07 | Dashboard Comercial no visual do protótipo + logo oficial | `/dashboard` refeito conforme o print: KPIs com valor colorido e etiqueta, feed compacto de alertas (valor em risco quando a reunião cita um montante), **Radar da carteira** (sinais por categoria e valor em risco destacado) e **Sua operação comercial** (equipe e carteira por configuração: `DIALYS_EQUIPE_VENDEDORES`/`DIALYS_CARTEIRA_CONTAS`, padrão 18 e 400, marcados como ilustrativos, mais a cobertura real de contas analisadas). Botões **Exportar alertas** (CSV para Excel) e **Nova análise**. Logo TOTVS oficial vetorizado do PNG do brand book em `src/components/brand/totvs-logo.tsx` (header, login, PDF da Central) e símbolo como ícone da aba (`src/app/icon.svg`). Selo "Ambiente demonstrativo" no header quando `DIALYS_MODO_DEMO=true` |
| 2026-10-07 | Central de Insights no visual do protótipo | `/insights` refeito conforme o print: tabela "Contas processadas" (cliente, data, criticidade Alta/Atenção/Baixa, análise, menu ⋮ com detalhamento, CRM e copiar link), busca, menu de filtro por sinal e ordenação, paginação de 8 em 8; detalhe com NPS e data, produtos (recolhível), evidência textual com botão de copiar e destaques por criticidade (churn crítico vermelho, churn atenção laranja, oportunidade verde, objeção amarela; legenda única), diagnóstico e ação sugerida da IA, próximos passos e os botões de CRM e PDF lado a lado. Botão "Enviar nova reunião" no topo |
| 2026-10-07 | Assistente renomeado (Jarvis → Dialys) + chat de texto | Página `/assistente` (`/jarvis` redireciona), menu "Assistente Dialys". Chat "Converse com o Dialys" abaixo do briefing: histórico, sugestões, Enter/Shift+Enter, nova tentativa, nova conversa, fontes com link para a Central e empresa em foco vinda da Central. Backend em `src/server/assistente` com 5 consultas controladas (permissão por usuário, schema, limites), motor Claude (Tool Runner do SDK, mesma chave da análise) e motor de demonstração por regras. Sessão assinada no servidor (cookie httpOnly) criada no login; conversas gravadas por usuário na nova tabela `conversa_assistente` (migração não destrutiva). Testado: 26 testes novos (inclui o Tool Runner real com fetch simulado; teste com a API real em `assistente-ia-real.test.ts`, desligado sem chave) e ponta a ponta no Edge em modo demonstração. **Não validado contra a API real do Claude: não há `ANTHROPIC_API_KEY` no ambiente** |
| 2026-10-07 | Briefing unificado ao chat; voz só no briefing | Saíram da página `/assistente` a matriz de alertas por urgência e a caixa separada do briefing. O briefing virou uma capacidade do chat: botão "Briefing do dia", sugestão "Ouvir o briefing do dia" ou pedido em texto. É montado no servidor com as contas do usuário (sem IA, igual com Claude ou demonstração) e é a única resposta lida em voz: começa a falar quando chega, com player, onda e frase atual destacada; vindo do histórico, só toca no play; uma voz por vez; "Nova conversa" interrompe. Agenda do dia ficou ao lado do chat. Testado: 4 testes novos (briefing sem IA, ação explícita, foco para o acompanhamento, escopo do usuário) e no Edge com voz real |
| 2026-10-07 | Minha Carteira (`/clientes`), nova página inicial | Primeira aba e destino do login (exige sessão). Indicadores da carteira (contas sob gestão por configuração, marcado como ilustrativo; clientes em risco; oportunidades; NPS médio), lista de clientes com busca por nome/produto, filtro por saúde e cards expansíveis com o histórico de reuniões e "Ver insights da reunião" (abre a Central na reunião, `?reuniao=`, com seletor de reuniões e aviso de reunião anterior). **Saúde 0–10** calculada por código (`src/lib/saude.ts`: sinais da reunião mais recente + 30% NPS, com o cálculo visível) e indicador de confiança relacional. Agenda de hoje = reuniões do dia já analisadas, em ordem de horário, com alerta principal e próxima ação; prioridades sem horário abaixo (sem calendário integrado). Pendências = próximos passos registrados, com checklist salvo só no navegador. Corrigido: "reunião mais recente" passa a ser a que aconteceu por último, não a analisada por último. Sem Shadcn/Lucide: segue os componentes e ícones Carbon do projeto. Testado: 9 testes novos e no Edge (login → home, filtros, busca, card → Central na reunião certa, pendências, celular) |
| 2026-10-07 | Home simplificada "Meu dia" (`/clientes`) com agenda | Substitui a Minha Carteira. Só dois blocos: **Minha agenda** (semana Seg–Dom com grade de horas, Hoje, anterior/próxima, seletor de data; lista do dia no celular; criar, editar, cancelar, reativar e marcar como realizado; validação de obrigatórios, término depois do início e no mesmo dia, na tela e no servidor; fuso `DIALYS_FUSO_HORARIO`, padrão São Paulo) e **Meus clientes** (lista compacta filtrada no servidor, busca, "Carregar mais", "Sem avaliação" separado de "Saudável", "Ver cliente" → Central, que agora mostra estado vazio para cliente sem análise e "não encontrado" para conta desconhecida). Saíram da home KPIs, tabelas, pendências e cards expansíveis. API nova: `GET /api/v1/clientes`, `GET/POST /api/v1/agenda`, `GET/PATCH /api/v1/agenda/{id}`, `POST /api/v1/agenda/demonstracao`. Dados de demonstração (`DIALYS_DADOS_DEMONSTRACAO`, padrão ligado): 16 empresas fictícias e 27 compromissos fictícios na semana atual e na seguinte, em `.dialys/demonstracao.json` por usuário, separados do banco; persistem entre recarregamentos; "Restaurar demonstração". Dados reais: nova tabela `compromisso` no banco (migração não destrutiva) e ponto de integração `cadastroReal()` para a carteira do CRM. Assistente usa o mesmo serviço: barra lateral com "Compromissos de hoje" e "Ações sugeridas · sem horário"; "Preparar com o Dialys" abre o chat com o compromisso em foco (posse validada no servidor, nada enviado automaticamente); nova consulta `consultar_agenda`; o briefing cita os compromissos de hoje separados das ações sugeridas; cliente sem reunião analisada: o Dialys diz que não tem dados, sem inventar evidências. Testado: 20 testes novos (157 no total) e no Edge com build de produção (calendário, navegação, validação, criação, persistência após recarregar, edição, cancelamento, restaurar, busca, carregar mais, celular a 390 px sem rolagem horizontal, preparar no assistente, abas Dashboard/Envio/Central/Assistente). **Só com dados de demonstração e o motor por regras: integração real (CRM, IdP, Claude) não validada** |
| 2026-10-07 | Home, remover cliente, Central por reunião e remover transcrição | **"Meu dia" virou "Home"** (menu, título, aba e trilha da Central; rota `/clientes` mantida). **Remover cliente** (menu ⋮ em Meus clientes, confirmação, toast, lista atualizada sem recarregar): tira o cliente só da carteira de quem removeu; cadastro, reuniões, transcrições, histórico e compromissos ficam; outros usuários não mudam; sem exclusão em cascata. Registro por usuário em `.dialys/demonstracao.json` (demonstração) ou na nova tabela `carteira_remocao` (dados reais); `DELETE`/`PUT /api/v1/carteira/{id}`. **Central por reunião**: seção "Reuniões processadas", uma linha por reunião (Reunião · Cliente · Data · Criticidade · Análise), código "Reunião 001" vindo do novo campo `numero` da reunião (sequência `sequencias.reuniao`, nunca reutilizada), estável ao ordenar, filtrar, recarregar e remover. Seleção, links (Dashboard, exportação CSV, envio, ações sugeridas, fontes do assistente) e ferramentas do assistente usam o id da reunião; o assistente aceita "Reunião 003". Reunião sem data informada aparece como "Sem data"/"não informada", nunca com a data do processamento. Migração não destrutiva na leitura (numera reuniões antigas pela ordem de criação). **Remover transcrição** (menu ⋮ e detalhe, confirmação com código e cliente): remoção lógica (`transcricaoRemovida`), a linha e o código ficam com o estado "Sem transcrição ativa"; a análise derivada sai da Central, Dashboard, `/insights`, `/resumo`, KPIs, briefing, assistente e CRM; outras reuniões do cliente intactas; trava contra clique duplo; `DELETE /api/v1/reunioes/{id}/transcricao` (409 em processamento, idempotente). Central passou a exigir sessão e a filtrar pelo escopo do usuário. Testado: 9 testes novos (166 no total) e no Edge com build de produção (Home, remover cliente com cancelar e confirmar, persistência após recarregar, compromisso com cliente removido, Central com 12 reuniões, dois clientes com códigos distintos, ordenação e filtro, remoção com clique duplo, indicadores e API sem a reunião, Dashboard com link por reunião, assistente com código removido e ativo, calendário e demais páginas). **Só com dados de demonstração, banco JSON local e motor por regras** |
| 2026-10-08 | Sem demonstração, sem áudio, remover cliente com insights, análise sem espera longa | **Demonstração fora da tela:** saíram o selo "Ambiente demonstrativo", os avisos de "modo demonstração" (Envio, Dashboard, Central, chat), a carteira fictícia (16 empresas), a agenda fictícia (semente, "Restaurar demonstração", `DIALYS_DADOS_DEMONSTRACAO`, `.dialys/demonstracao.json` deixa de ser usado), os 3 cenários roteirizados e os números ilustrativos de equipe/carteira do Dashboard (agora só se configurados). O motor por regras ficou como reserva invisível quando não há chave do Claude; a tela só deixa de dizer "IA" onde a análise veio das regras. A amostra da TOTVS continua no menu Exemplo (`data/exemplos/totvs`). As 7 reuniões do banco local foram mantidas. **Áudio e microfone:** saíram a nota de voz do Envio, o envio de áudio (API responde `415 AUDIO_NAO_ACEITO`) e a etapa de transcrição de áudio (pipeline com 4 etapas); a voz do briefing continua. **Remover cliente** agora remove também os insights dele (remoção lógica, motivo `cliente_removido`; somem da Central, Dashboard, indicadores, briefing e assistente; `PUT /api/v1/carteira/{id}` desfaz). **Espera longa no envio:** não reproduzida (2 a 4 s em produção e em `next dev`); corrigido o caso que causa espera de até 6 min: reunião "em processamento" que não está rodando (servidor reiniciado, código recarregado, `after()` que não rodou) é retomada na hora a partir do texto gravado (até 2 vezes). **Redirecionamento:** só depois de todas as etapas concluídas e o resultado gravado; a tela mostra "Análise concluída" antes de abrir o Dashboard ou a Central. Testado: 156 testes e no Edge com build de produção (nenhum texto de demonstração em Home, Envio, Dashboard, Central e Assistente; Envio sem microfone e sem áudio; reunião travada retomada e concluída em ~1,6 s; envio mostrando "Análise concluída" antes de ir ao Dashboard; remover Grupo Horizonte zerou os insights dele na API, no resumo e na Central). **Só com o motor por regras: o Claude real segue sem validação (sem chave)** |
