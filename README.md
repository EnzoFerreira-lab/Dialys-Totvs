# Dialys | Inteligência Conversacional TOTVS

Piloto de plataforma que transforma reuniões comerciais em sinais de negócio: risco de churn, oportunidades de upsell/cross-sell, objeções e presença de produtos TOTVS.

- Arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Status e ordem de implementação: [ESTADO_DO_PROJETO.md](ESTADO_DO_PROJETO.md)

## Rodando localmente

Requer Node.js 22+.

```bash
npm install
cp .env.example .env.local   # configuração local (não vai para o git); o padrão já roda em modo demonstração
npm run dev        # http://localhost:3000 → redireciona para /login
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (inclui checagem de tipos) |
| `npm run start` | Serve o build de produção |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários (Vitest). O teste com o Claude real só roda com `ANTHROPIC_API_KEY` definida |

## Modo demonstração (sem custo)

Com `DIALYS_MODO_DEMO=true` no `.env.local`, a análise do `/envio` não chama a API. Transcrições conhecidas usam os cenários JSON de [data/demo/cenarios/](data/demo/cenarios/). Qualquer outra transcrição passa por um analisador local por regras, que entende o formato real da TOTVS.

O `/envio` aceita o JSON exportado pela TOTVS (`ANON_TRANSCRICAO`) por anexo, arraste ou colagem. As reuniões da amostra em [data/demo/totvs/](data/demo/totvs/) aparecem no botão **Exemplo**. Detalhes em [data/demo/README.md](data/demo/README.md).

## Motor de IA

[src/server/ai/](src/server/ai/) contém os schemas Zod da análise, `analisarReuniao()` (Claude Opus 5.5 com saída estruturada) e o validador que descarta sinais sem citação literal na transcrição. O prompt é versionado em [src/server/ai/prompts/](src/server/ai/prompts/); qualquer mudança no texto sobe a versão.

## Rotas

| Rota | Tela |
|---|---|
| `/login` | Login enterprise (piloto: qualquer credencial entra) |
| `/clientes` | **Home** (início após o login; a rota continua `/clientes`): saudação, **Minha agenda** (semana no computador, lista do dia no celular, criar/editar/cancelar compromissos) e **Meus clientes** (lista compacta com busca, "Ver cliente" e "Remover cliente" no menu ⋮) |
| `/envio` | Envio de transcrição para análise |
| `/dashboard` | Dashboard Comercial: KPIs, alertas prioritários, radar da carteira, exportação CSV |
| `/insights?reuniao=&conta=` | Central de Insights: **Reuniões processadas**, uma linha por reunião (Reunião · Cliente · Data · Criticidade · Análise) + detalhe com evidências. `reuniao` abre aquela reunião; `conta` abre a mais recente do cliente (sem reunião analisada: "Sem avaliação"). Menu ⋮ da linha e detalhe têm "Remover transcrição" |
| `/assistente?conta=&compromisso=` | Assistente Dialys: chat sobre os dados (o briefing do dia, pedido no chat, é a única resposta lida em voz); ao lado, **Compromissos de hoje** e **Ações sugeridas · sem horário**. `compromisso` vem de "Preparar com o Dialys" (`/jarvis` redireciona para cá) |

## Home: agenda e clientes

A Home (antes "Meu dia") tem só dois blocos. Os detalhes (KPIs, reuniões, evidências, diagnósticos) continuam no Dashboard e na Central.

- **Minha agenda**: compromissos com título, cliente opcional, início, término, status (agendado, realizado, cancelado), local e observações. Valida campos obrigatórios e término depois do início, no mesmo dia, nas duas pontas (tela e servidor). Horários no fuso `DIALYS_FUSO_HORARIO` (padrão `America/Sao_Paulo`). Ações sugeridas pela IA **não** viram compromissos.
- **Meus clientes**: só os clientes que o usuário pode ver (filtrados no servidor), com busca por nome e "Carregar mais". "Sem avaliação" = nenhuma reunião analisada, diferente de "Saudável".
- **Remover cliente** (menu ⋮ de cada cliente, com confirmação): tira o cliente **só da carteira de quem removeu**. Cadastro, reuniões, transcrições, histórico na Central e compromissos já marcados continuam; a carteira de outros usuários não muda; nada é apagado nem em cascata. A remoção fica registrada por usuário: em demonstração em `.dialys/demonstracao.json` (`carteiras`), com dados reais na tabela `carteira_remocao` do banco. Compromissos antigos continuam mostrando o cliente e podem ser editados; novos compromissos só com clientes da carteira. `PUT /api/v1/carteira/{id}` devolve o cliente; "Restaurar demonstração" também.
- **Assistente**: lê a mesma agenda pelo mesmo serviço (mesmos ids, sem cópia). "Preparar com o Dialys" abre o chat com o compromisso em foco, sem enviar pergunta. O servidor confere que o compromisso é do usuário. Se o cliente não tem reunião analisada, o Dialys diz isso e não inventa histórico. O briefing do dia cita os compromissos de hoje separados das ações sugeridas.

Código: [src/server/agenda/](src/server/agenda/) (serviço, repositórios, semente fictícia), [src/server/clientes/](src/server/clientes/), [src/lib/agenda.ts](src/lib/agenda.ts) (contrato e validação compartilhados) e [src/app/(app)/clientes/](src/app/(app)/clientes/).

**Modo demonstração dos dados (padrão).** Com `DIALYS_DADOS_DEMONSTRACAO` ausente ou `true`, a carteira são as 16 empresas fictícias de [src/lib/mock/contas.ts](src/lib/mock/contas.ts) mais as contas já analisadas, e a agenda é fictícia: 27 compromissos na semana atual e na seguinte, gerados na primeira visita de cada usuário. Ficam em `.dialys/demonstracao.json`, separado do banco, um bloco por usuário. As alterações sobrevivem ao recarregamento. "Restaurar demonstração" volta ao estado inicial. Se a semente ficar numa semana passada e o usuário não tiver mexido, ela é refeita para a semana atual. A tela mostra o selo "Dados de demonstração".

**Dados reais.** Com `DIALYS_DADOS_DEMONSTRACAO=false`, a agenda passa a usar a tabela `compromisso` de `.dialys/banco.json` (começa vazia; bancos antigos ganham a tabela ao serem lidos, sem perder nada) e a carteira passa a ser só as contas analisadas. Para ligar a base da empresa falta:

1. Implementar `cadastroReal()` em [src/server/clientes/clientes.ts](src/server/clientes/clientes.ts) com a carteira do CRM/ERP (id = chave da conta usada nas reuniões).
2. Trocar o escopo fixo de [src/server/auth/usuarios.ts](src/server/auth/usuarios.ts) pelo IdP corporativo e pela carteira de cada vendedor (`podeAcessarConta` continua a mesma regra).
3. Migrar `.dialys/banco.json` (incluindo `compromisso`) para Postgres, reescrevendo só os repositórios.
4. Integração de calendário (Outlook/Teams) não faz parte desta etapa: os compromissos são cadastrados no Dialys.

## API REST v1

Pipeline de 5 etapas em [src/server/pipeline/](src/server/pipeline/) exposto em `/api/v1`: processar reunião, consultar o resultado, listar insights e sincronizar com o CRM (simulado). Contrato com exemplos em [docs/CONTRATO_API.md](docs/CONTRATO_API.md). Os dados ficam em `.dialys/banco.json` (fora do git). Para começar do zero, apague o arquivo.

Todas as telas leem as reuniões analisadas pela API: Dashboard (`/api/v1/insights` e `/api/v1/resumo`, atualizado a cada 10 s), Central de Insights (uma linha por reunião) e Assistente Dialys (briefing montado do resumo). Começam vazias e se preenchem a cada transcrição enviada pelo `/envio`. Os dados fictícios restantes (carteira e agenda da Home) ficam isolados no modo demonstração dos dados (ver **Home**). A agenda e a carteira têm suas próprias rotas: `/api/v1/agenda`, `/api/v1/clientes` e `/api/v1/carteira/{id}`.

### Reuniões: código estável e remoção de transcrição

- **Cada reunião é um registro próprio** (`reu_…`), ligado ao cliente pela chave da conta. Um cliente pode ter várias reuniões; uma nova nunca sobrescreve a anterior.
- **Código "Reunião 001"**: vem do campo `numero` gravado na reunião, emitido pela sequência `sequencias.reuniao` do banco, que só cresce. Não depende da posição na tabela nem da quantidade de linhas, então não muda ao ordenar, filtrar, recarregar ou remover, e números nunca são reutilizados. Único no sistema.
- **Migração (não destrutiva, automática)**: bancos antigos não têm `numero` nem `sequencias`. Na leitura, as reuniões sem número são numeradas pela ordem de criação, depois do maior número existente; a próxima escrita grava esses mesmos números. As tabelas novas (`carteira_remocao`, `sequencias`) entram vazias. Nada é apagado.
- **Data da reunião**: quando a reunião não trouxe data (`contexto.data`), a Central mostra "Sem data" / "não informada (processada em …)", o Dashboard mostra "Data não informada" e o assistente recebe `dataInformada: false`. A data do processamento só é usada para ordenar.
- **Remover transcrição** (menu ⋮ da linha ou detalhe, com confirmação): remoção **lógica** da transcrição daquela reunião (`transcricaoRemovida` com data e usuário). O texto e a análise continuam no banco, mas a transcrição e a análise derivada só dela saem das consultas ativas: Central (a linha fica, com o código e o estado "Sem transcrição ativa"), Dashboard, `/api/v1/insights`, `/api/v1/resumo`, KPIs, briefing, assistente e envio ao CRM. As outras reuniões do cliente não mudam. No modelo atual cada reunião tem uma transcrição; a marcação é por reunião, então nunca atinge outra. Insights já enviados ao CRM não são apagados de lá.

## Assistente Dialys (chat)

Na página `/assistente`, a área **Converse com o Dialys** responde perguntas sobre empresas, reuniões, insights e ações já registradas, mantendo o contexto da conversa ("e qual ação devo priorizar?"). O código fica em [src/server/assistente/](src/server/assistente/):

| Arquivo | Papel |
|---|---|
| `assistente.ts` | Ponto de entrada `responderPergunta()`: valida, garante que a conversa é do usuário, chama o motor, grava a troca. Um canal de voz futuro reutiliza esta função (fala → texto → `responderPergunta` → texto → fala) |
| `ferramentas.ts` | As 6 consultas controladas (schema Zod, permissão por usuário, limite de volume), incluindo `consultar_agenda` (compromissos do usuário, separados das ações sugeridas). Toda reunião volta com `reuniaoId`, `codigo` ("Reunião 003") e `dataInformada`; `obter_detalhes_reuniao` aceita o `numero` do código. Reuniões com transcrição removida não aparecem |
| `motor-claude.ts` | Mesma integração da análise (`@anthropic-ai/sdk`, `claude-opus-5-5`): consultas como tools no Tool Runner do SDK |
| `briefing.ts` | Briefing do dia dentro da conversa: pedido pelo botão "Briefing do dia" ou por texto ("briefing", "resumo do dia"). Montado dos dados do usuário, sem IA; é a única resposta que a tela lê em voz (`window.speechSynthesis`) |
| `motor-demonstracao.ts` | Sem IA (`DIALYS_MODO_DEMO=true`): regras em português sobre as mesmas consultas; a tela marca "sem IA" |

**Sessão.** O login cria um cookie de sessão assinado no servidor (piloto: qualquer credencial entra como a persona Ricardo Alves; a senha não é verificada até a T02). As rotas do assistente exigem essa sessão e checam a permissão de conta em toda consulta. Usuários e escopo ficam em [src/server/auth/usuarios.ts](src/server/auth/usuarios.ts).

| Variável (`.env.local`) | Obrigatória | Para quê |
|---|---|---|
| `DIALYS_MODO_DEMO` | não | `true`: chat por regras, sem IA e sem custo (padrão quando não há chave) |
| `ANTHROPIC_API_KEY` | para usar o Claude | A mesma chave da análise. Só no servidor |
| `DIALYS_SESSAO_SEGREDO` | recomendada | 32+ caracteres aleatórios para assinar a sessão. Sem ela, um segredo temporário é gerado e as sessões caem ao reiniciar o servidor |
| `DIALYS_MODELO_ASSISTENTE` | não | Outro modelo para o chat (padrão: o da análise) |
| `DIALYS_ESFORCO_ASSISTENTE` | não | `low`/`medium`/`high`/`xhigh`/`max` (padrão `medium`) |
| `DIALYS_COOKIE_INSEGURO` | não | `true` para o build de produção servido por HTTP fora de `localhost` (ex.: demo em rede local) |
| `DIALYS_DADOS_DEMONSTRACAO` | não | `false`: clientes e agenda reais (contas analisadas e tabela `compromisso`). Padrão: carteira e agenda fictícias. Independe de `DIALYS_MODO_DEMO`, que só troca o motor de IA |
| `DIALYS_FUSO_HORARIO` | não | Fuso IANA da agenda (padrão `America/Sao_Paulo`) |
| `DIALYS_DEMONSTRACAO_ARQUIVO` | não | Outro arquivo para os dados de demonstração: agenda e carteira fictícias (padrão: `demonstracao.json` ao lado do banco) |

Para conversar: `npm run dev`, entre por `/login` e abra **Assistente Dialys** no menu (ou "Perguntar ao Dialys" numa conta da Central de Insights).

## Design System

Tokens IBM Carbon + marca TOTVS em [src/app/globals.css](src/app/globals.css), expostos como utilitários Tailwind (`bg-shell`, `bg-interactive`, `text-on-interactive`, `border-border-subtle`...). Tipografia IBM Plex Sans / Plex Mono via `next/font`. Ícones: `@carbon/icons-react`.

O logo em [src/components/brand/totvs-logo.tsx](src/components/brand/totvs-logo.tsx) foi vetorizado do PNG oficial da marca (azul `#012233`; usa `currentColor`, em branco sobre o grafite). Variante `simbolo` para o símbolo isolado; o ícone da aba é [src/app/icon.svg](src/app/icon.svg).
