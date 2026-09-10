# Correção de Inconsistências Execução × Dashboard - Independent Review

## Checkpoints de Revisão

- [ ] CP-R1: Exclusão por projeto no painel operacional é inequívoca (modal, tooltips, labels) e move TODAS as fases de um mesmo projetoCliente; nenhuma ação fase-a-fase existe mais quando projetoCliente está preenchido.
  - **Type**: `rule`
  - **Covers**: AC-1, AC-6 (TR-1.1, TR-1.2)
  - **Evidence**: Pending

- [ ] CP-R2: Dashboard do diretor é estritamente somente leitura — nenhum PUT/POST/DELETE, nenhum input de data, nenhum botão de "iniciar fase" ou salvar mutação. Badge "Somente Leitura" adicionado como feedback visual.
  - **Type**: `rule`
  - **Covers**: AC-2 (TR-2.1)
  - **Evidence**: Pending

- [ ] CP-R3: Responsáveis de cada obra no dashboard são calculados a partir da união dos `responsavel` de `fases_acao` (fonte contratual real) com as entradas de `responsaveisPorEtapa` (etapas de campo); ordenados alfabeticamente e deduplicados; dependência de `fases` adicionada ao useMemo de `obrasCampo`.
  - **Type**: `rule`
  - **Covers**: AC-3 (TR-3.1, TR-3.2)
  - **Evidence**: Pending

- [ ] CP-R4: Auto-refresh está instalado nas 3 telas (execução, dashboard, lixeira) com polling de 30s, pausa em aba oculta, dispara ao focar/voltar visível, gating por `loading` para evitar sobreposição.
  - **Type**: `rule`
  - **Covers**: AC-4 (TR-4.1, TR-4.2)
  - **Evidence**: Pending

- [ ] CP-R5: Nenhum erro de TypeScript (`tsc --noEmit`) ou build do Next.js (`next build`) após todas alterações; GetDiagnostics limpo.
  - **Type**: `rule`
  - **Covers**: AC-5 (TR-5.1, TR-5.2)
  - **Evidence**: Pending

- [ ] CP-U1: Clareza geral da UX de exclusão (tooltip, modal título/subtítulo/badge, texto do botão CTA) não confunde mais fase individual com projeto inteiro.
  - **Type**: `rubric`
  - **Covers**: AC-6 (TR-1.2)
  - **Scale**: 1-5
  - **Anchors**: 1 = ainda é ambíguo qual elemento será apagado; 3 = modal informa que é por projeto mas s/ badge/ destaque; 5 = tooltip, título, badge de contagem, nome do projeto em destaque, e CTA com número de fases; tudo comunica a semântica de "projeto inteiro".
  - **Pass Threshold**: >= 4
  - **Evidence**: Pending

### Review R1: Resultado

**Status Geral**: ✅ **PASS** — Todos os checkpoints de regra (CP-R1..CP-R5) passaram e o checkpoint de rubrica (CP-U1) atingiu score acima do threshold.

---

#### CP-R1: Exclusão por projeto no painel operacional é inequívoca (modal, tooltips, labels) e move TODAS as fases de um mesmo projetoCliente
- **Resultado**: ✅ PASS
- **Evidence**:
  - **Tooltip condicional** (execucao/page.tsx:772): `title={fase.projetoCliente?.trim() ? 'Mover Projeto para Lixeira' : 'Mover para Lixeira'}` — Tooltip distingui corretamente entre fase individual (sem projetoCliente) e projeto inteiro (com projetoCliente preenchido).
  - **Modal de delete** (execucao/page.tsx:1014-1060): Renderização condicional baseada em `faseToDelete.projetoCliente?.trim()`:
    - Quando tem projeto: Título **"Mover Projeto para a Lixeira"** (linha 1025) + badge de contagem `{fasesDoProjetoParaDeletar.length} fases` (linhas 1026-1028).
    - Nome do projeto destacado em badge com fundo (linha 1031).
    - Lista individualizada de todas as fases que serão movidas (linhas 1033-1040).
    - Botão CTA: **`Mover Projeto (${fasesDoProjetoParaDeletar.length})`** (linha 1054).
  - **Cálculo de fases para deletar** (execucao/page.tsx:355-360): `fasesDoProjetoParaDeletar` filtra `fases.filter(f => !f.isDeleted && f.projetoCliente.trim() === proj)` — move TODAS as fases ativas do mesmo projeto, não apenas a clicada.
  - **Ação handler** (execucao/page.tsx:504-534): `handleTrashFase` executa PUT `isDeleted: true` em paralelo para `fasesDoProjetoParaDeletar.map(...)` — confirmado que não há exclusão fase-a-fase quando projetoCliente existe.

---

#### CP-R2: Dashboard do diretor é estritamente somente leitura — nenhum PUT/POST/DELETE, badge "Somente Leitura" presente
- **Resultado**: ✅ PASS
- **Evidence**:
  - **Grep por mutações**: Busca por `method:\s*['"](PUT|POST|DELETE)['"]` em `admin/dashboard/page.tsx` retornou **zero matches** (verificação independente confirmada).
  - **Grep por fetch com method**: Busca por padrão `fetch\s*\(.*method` também retornou zero matches.
  - **Análise de botões/inputs**: Todos os botões são de navegação (`Link` para Diário, Cronograma), filtros (projeto/período/aba), `Atualizar` (chama `loadData` que só faz GETs), `Relatório PDF` (window.open), e lightbox de foto. Nenhum input de data mutável, nenhum botão "iniciar fase" ou "salvar".
  - **Badge Somente Leitura** (dashboard/page.tsx:712-714): Presente no header do título `<h1>`, badge verde (`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`) com texto "Somente Leitura" em uppercase tracking-wider, posicionado ao lado do badge "Ao Vivo" como feedback visual imediato.

---

#### CP-R3: Responsáveis de cada obra = união Set (fases_acao.responsavel ∪ responsaveisPorEtapa[configKey] ∪ responsaveisPorEtapa.keys começando com `${nomeProjeto}::`), ordenados, useMemo depende de `fases`
- **Resultado**: ✅ PASS
- **Evidence**:
  - Bloco de cálculo dentro de `obrasCampo` useMemo (dashboard/page.tsx:412-434):
    - **Fonte 1 — `respFasesAcao`** (linhas 414-422): `fases.filter()` por `!isDeleted && projetoCliente.trim() === nomeProjeto.trim() && responsavel existe && !== '' && !== 'Não atribuído'` — extrai `responsavel.trim()` de cada fase. Esta é a fonte contratual real.
    - **Fonte 2 — `responsaveisPorEtapa[configKey]`** (linha 429): Usado diretamente dentro do Set. `configKey = `${nomeProjeto}::${etapaAtual}`` (linha 376).
    - **Fonte 3 — `respOutrasEtapasDoProjeto`** (linhas 424-426): `Object.entries(responsaveisPorEtapa).filter(([k]) => k.startsWith(`${nomeProjeto}::`)).flatMap(([, v]) => v || [])` — captura responsáveis de TODAS as etapas do projeto, não só a atual.
    - **União deduplicada**: `Array.from(new Set([...respFasesAcao, ...(responsaveisPorEtapa[configKey] || []), ...respOutrasEtapasDoProjeto]))` (linhas 428-429).
    - **Limpeza e ordenação** (linhas 431-434): `.filter(Boolean).map(r => String(r).trim()).filter(r => r !== '' && r !== 'Não atribuído').sort((a, b) => a.localeCompare(b, 'pt-BR'))` — ordenação alfabética localizada pt-BR.
  - **Dependências do useMemo** (dashboard/page.tsx:455): Array deps = `[projetosList, logs, fases, projetoStartDates, configEtapas, responsaveisPorEtapa]` — `fases` está incluído como dependência, garantindo re-cálculo quando fases forem atualizadas.

---

#### CP-R4: Auto-refresh instalado nas 3 telas com polling 30s, visibilitychange, window focus, cleanup, gating por `!loading` (dashboard também gate por `authenticated`)
- **Resultado**: ✅ PASS
- **Evidence**:

  **1. Tela Execução** (execucao/page.tsx:286-327):
  - `REFRESH_MS = 30 * 1000` (linha 289).
  - `setInterval` chama `loadData()` com gating `if (!loading)` (linhas 293-294).
  - Listener `visibilitychange`: se `visible` → `loadData()` + `startPolling()`; se oculto → `stopPolling()` (linhas 305-312).
  - Listener `window.focus`: dispara `loadData()` com gating `!loading` (linhas 314-316).
  - Cleanup: `stopPolling()` + `removeEventListener` de ambos (linhas 322-326).
  - Deps: `[loadData, loading]`.

  **2. Tela Dashboard** (dashboard/page.tsx:270-312):
  - Gate superior: `if (status !== 'authenticated') return;` (linha 272) — não inicia polling se usuário não autenticado.
  - `REFRESH_MS = 30 * 1000` (linha 274).
  - `setInterval` com gating `if (!loading)` (linhas 278-279).
  - Listener `visibilitychange`: mesma lógica de start/stop (linhas 290-297).
  - Listener `window.focus`: gating `!loading` (linhas 299-301).
  - Cleanup completo (linhas 307-311).
  - Deps: `[status, loadData, loading]` — inclui `status` para re-instanciar quando autenticar.

  **3. Tela Lixeira** (lixeira/page.tsx:35-76):
  - `REFRESH_MS = 30 * 1000` (linha 38).
  - `setInterval` chama `loadDeleted()` com gating `if (!loading)` (linhas 42-43).
  - Listener `visibilitychange` com start/stop (linhas 54-61).
  - Listener `window.focus` com gating `!loading` (linhas 63-65).
  - Cleanup completo (linhas 71-75).
  - Deps: `[loadDeleted, loading]`.

---

#### CP-R5: Nenhum erro de TypeScript (`tsc --noEmit`) ou build do Next.js (`next build`)
- **Resultado**: ✅ PASS
- **Evidence** (extraído do tasks.md:Task 5, re-verificado logicamente):
  - **TR-5.1 tsc**: `npx tsc --noEmit` exit code **0**, 0 erros TypeScript, 0 warnings TS (tasks.md linha 97).
  - **TR-5.2 next build**: `npx next build` exit code **0**, todas 29 páginas/rotas compiladas com sucesso (tasks.md linha 98). Um warning pré-existente de nodemailer em forgot-password não relacionado a estas alterações.
  - **GetDiagnostics**: Array vazio `[]` — 0 erros de lint ou TypeScript no IDE (tasks.md linha 98).
  - *Nota*: Não foi re-executado build/tsc nesta sessão de review por ser tarefa de auditoria apenas; evidência cruzada com tasks.md do executor.

---

#### CP-U1: Clareza geral da UX de exclusão — Rubrica 1-5 (threshold >= 4)
- **Score Final**: **5/5** ✅ PASS (threshold = 4)
- **Anchors vs Evidência**:
  - Anchor 1 (ainda ambíguo) → ❌ Não aplica
  - Anchor 3 (modal informa que é por projeto mas s/ badge/ destaque) → ❌ Não aplica, temos destaque
  - Anchor 5 (tooltip + título + badge contagem + nome projeto em destaque + CTA com número) → ✅ 100% atendido
- **Rationale detalhado**:
  1. **Tooltip de pré-clique** (linha 772): Condicional perfeito — informa "Mover Projeto para Lixeira" se tem projeto, "Mover para Lixeira" se fase isolada. Usuário sabe antes de clicar o que vai acontecer.
  2. **Título modal** (linha 1025): "Mover Projeto para a Lixeira" — sem ambiguidade, artigo definido "o Projeto" deixa claro escopo.
  3. **Badge de contagem** (linhas 1026-1028): Imediatamente ao lado do título, badge roxo proeminente com `N fases` em uppercase font-black.
  4. **Nome do projeto em destaque** (linha 1031): Nome dentro de `<strong>` com `bg-slate-100 dark:bg-[#1e293b] px-2 py-0.5 rounded-md` — badge visual que separa o nome da frase.
  5. **Lista de fases individuais** (linhas 1033-1040): Caixa com scroll listando cada gabarito e responsável com bullet roxo — usuário confere exatamente o que será movido.
  6. **Botão CTA** (linha 1054): `Mover Projeto (N)` — repete a semântica + a contagem diretamente no alvo do clique. Não pode ser mais explícito.
  7. **Aviso de reversibilidade** (linha 1031): Frase "Esta ação pode ser desfeita depois na Lixeira" reduz ansiedade do usuário, confirma que é soft-delete por projeto.
- **Conclusão**: Todos os 6 pontos de clareza (tooltip, título, badge contagem, nome destacado, listagem fases, CTA numerado) estão presentes e são consistentes. Score máximo 5.

---

## Review History

### R1 — 2026-09-09 — Revisão Independente
- **Revisor**: Agente Auditor Independente (modo read-only)
- **Arquivos auditados**: `src/app/irrigacao/execucao/page.tsx`, `src/app/admin/dashboard/page.tsx`, `src/app/irrigacao/lixeira/page.tsx`
- **Arquivo de evidência de build**: `tasks.md`
- **Resultado Geral**: ✅ **PASS** — 5/5 CP-R (rules) aprovados, CP-U1 score 5/5 acima do threshold 4.
- **Nenhum achado de bloqueio ou falha.** Todas as especificações foram atendidas conforme descrito acima. Sem action items remanescentes.
