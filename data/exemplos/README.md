# Exemplos de transcrição

`totvs/amostra_reunioes.json` é a amostra enviada pela TOTVS: reuniões reais, anonimizadas, no formato exportado por eles (`ANON_TRANSCRICAO`, `ID_MEETING`, `CODT`, segmento, NPS...). Elas aparecem no botão **Exemplo** do `/envio`; escolher uma preenche o texto e os metadados da reunião.

Para acrescentar exemplos, coloque outros `.json` no mesmo formato em `totvs/`. Reuniões repetidas (mesmo texto com outro ID) aparecem uma vez só.

A análise segue o motor configurado: o Claude, com `ANTHROPIC_API_KEY`; sem chave (ou com `DIALYS_MODO_DEMO=true`), as regras locais. Nos dois casos o validador de evidências descarta qualquer citação que não exista no texto.
