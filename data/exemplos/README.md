# Exemplos de transcrição

As reuniões do menu **Exemplo** do `/envio` vêm da base da TOTVS (`ANON_transcricao.json`, 1.174 reuniões reais de 2026, anonimizadas), no formato exportado por eles (`ANON_TRANSCRICAO`, `ID_MEETING`, `CODT`, segmento, CNAE, UF...). Escolher uma preenche o texto e os metadados da reunião.

**Só ficam reuniões em que a IA encontra insights relevantes.** Cada uma foi analisada pelo NVIDIA Nemotron (o mesmo motor do app) e passou pelo validador de evidências; ficou quem teve ao menos um sinal com citação literal confirmada na transcrição. Reuniões sem nenhum sinal, ou cujas citações não existiam no texto, foram retiradas. São **36 reuniões de 15 empresas**, 11 delas com 2 a 4 reuniões (para mostrar o histórico do cliente):

- `totvs/amostra_reunioes.json`: 2 reuniões da amostra original enviada pela TOTVS.
- `totvs/amostra_clientes_recorrentes.json`: 34 reuniões de clientes com várias reuniões. Critérios da seleção na base completa: reunião concluída e externa, com código do cliente, CNAE e UF, entre 3 mil e 150 mil caracteres.

Os registros são os originais da TOTVS, com uma única alteração: primeiros nomes de pessoas que escaparam da anonimização no rótulo de quem fala foram trocados por `[PESSOA]`, o marcador que a própria base usa. Algumas reuniões retiradas do menu continuam nos testes das regras locais, em `src/server/ai/demo/__fixtures__/amostra-regras.json`.

No menu **Exemplo**, as reuniões aparecem **agrupadas por empresa** (com o total de reuniões de cada uma), e da mais recente para a mais antiga dentro de cada empresa. Primeiro vêm as empresas em destaque (`EMPRESAS_EM_DESTAQUE` em `src/server/ai/demo/exemplos.ts`; hoje, Plano de saúde · SP (TFCKHB), a da demonstração ao vivo), depois as demais em ordem alfabética; empresas sem nome vão para o fim.

## Nome dos clientes

A base da TOTVS é anonimizada: não tem o nome da empresa, só o código do cliente (`CODT`). Por isso o Dialys dá a cada cliente um **nome descritivo montado com os dados da própria base**: atividade pelo CNAE (descrição oficial do IBGE, em `src/lib/cnae.ts`), UF e código, por exemplo "Hospital · RS (T54451)". Sem CNAE na lista, a atividade vem do segmento; sem nenhum dos dois, fica "Cliente <código>". O mesmo nome aparece na Central, no Dashboard, em Clientes, na Home, no assistente e neste menu Exemplo.

Para usar o **nome real**, preencha `.dialys/totvs/nomes-clientes.json` (`{ "T54451": "Razão social" }`; o modelo já traz os códigos da amostra). O arquivo fica só na máquina (`.dialys/` está no `.gitignore`, porque nome de cliente é dado da TOTVS) e vale na hora, sem reprocessar. Um nome escolhido no envio continua tendo prioridade.

Para acrescentar exemplos, coloque outros `.json` no mesmo formato em `totvs/`. Reuniões repetidas (mesmo texto com outro ID) aparecem uma vez só.

A análise segue o motor configurado: o Nemotron, com `OPENROUTER_API_KEY`; o Claude, com `ANTHROPIC_API_KEY`; sem chave (ou com `DIALYS_MODO_DEMO=true`), as regras locais. Em todos os casos o validador de evidências descarta qualquer citação que não exista no texto.
