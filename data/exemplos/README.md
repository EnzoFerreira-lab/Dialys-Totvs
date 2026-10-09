# Exemplos de transcrição

`totvs/amostra_reunioes.json` é a amostra enviada pela TOTVS: reuniões reais, anonimizadas, no formato exportado por eles (`ANON_TRANSCRICAO`, `ID_MEETING`, `CODT`, segmento, NPS...). Elas aparecem no botão **Exemplo** do `/envio`; escolher uma preenche o texto e os metadados da reunião.

`totvs/amostra_clientes_recorrentes.json` traz mais 54 reuniões da base completa da TOTVS (`ANON_transcricao.json`, 1.174 reuniões de 2026), escolhidas para a demonstração ter **clientes com várias reuniões** e **insights relevantes**: 16 clientes novos com 2 a 4 reuniões cada (risco de churn alto, objeções, oportunidades), mais reuniões para 4 clientes da amostra original. Critérios: reunião concluída e externa, com código do cliente, CNAE e UF, entre 3 mil e 150 mil caracteres, e com ao menos um sinal encontrado pelas regras locais. Os registros são os originais da TOTVS, com uma única alteração: primeiros nomes de pessoas que escaparam da anonimização no rótulo de quem fala (7 nomes) foram trocados por `[PESSOA]`, o marcador que a própria base usa. A reunião 1389855 ficou de fora por repetir a transcrição da 1394492.

No menu **Exemplo**, as reuniões aparecem **agrupadas por empresa** (com o total de reuniões de cada uma), em ordem alfabética, e da mais recente para a mais antiga dentro de cada empresa; empresas sem nome vão para o fim.

## Nome dos clientes

A base da TOTVS é anonimizada: não tem o nome da empresa, só o código do cliente (`CODT`). Por isso o Dialys dá a cada cliente um **nome descritivo montado com os dados da própria base**: atividade pelo CNAE (descrição oficial do IBGE, em `src/lib/cnae.ts`), UF e código, por exemplo "Hospital · RS (T54451)". Sem CNAE na lista, a atividade vem do segmento; sem nenhum dos dois, fica "Cliente <código>". O mesmo nome aparece na Central, no Dashboard, em Clientes, na Home, no assistente e neste menu Exemplo.

Para usar o **nome real**, preencha `.dialys/totvs/nomes-clientes.json` (`{ "T54451": "Razão social" }`; o modelo já traz os códigos da amostra). O arquivo fica só na máquina (`.dialys/` está no `.gitignore`, porque nome de cliente é dado da TOTVS) e vale na hora, sem reprocessar. Um nome escolhido no envio continua tendo prioridade.

Para acrescentar exemplos, coloque outros `.json` no mesmo formato em `totvs/`. Reuniões repetidas (mesmo texto com outro ID) aparecem uma vez só.

A análise segue o motor configurado: o Claude, com `ANTHROPIC_API_KEY`; sem chave (ou com `DIALYS_MODO_DEMO=true`), as regras locais. Nos dois casos o validador de evidências descarta qualquer citação que não exista no texto.
