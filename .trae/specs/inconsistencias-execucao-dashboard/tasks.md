# Correção de Inconsistências Execução × Dashboard - Implementation Plan

## Task 1: UX clara de exclusão por projeto no Painel Operacional (execucao/page.tsx)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Melhorar o tooltip do botão de lixeira na tabela: quando a fase tem `projetoCliente` preenchido, tooltip = "Mover Projeto para Lixeira" ao invés de "Mover para Lixeira". Se não tem, mantém individual.
  - Alterar o título do modal de delete de "Mover para a Lixeira" para "Mover Projeto para a Lixeira" (apenas quando `projetoCliente` existe), incluindo um badge com o nome do projeto.
  - Adicionar contagem de fases (X fases) no subtítulo do modal quando for exclusão por projeto.
- **Acceptance Criteria Addressed**: AC-1, AC-6
- **Test Requirements**:
  - `rule` TR-1.1: Clicar no botão de uma fase com projeto → modal exibe "Mover Projeto [NOME] para Lixeira", lista todas as fases, confirma move todas. Evidence: screenshot do modal e resultado do `GET /api/fases`.
  - `rubric` TR-1.2: Clareza do label e tooltip. Scale 1-5. 1=confuso, 3=aceitável, 5=cristalino. Threshold >= 4. Evidence: screenshot dos textos atualizados.
- **Completion Evidence**:
  - TR-1.1 (rule): PASS. Botão de linha alterado para tooltip condicional: `"Mover Projeto para Lixeira"` quando `fase.projetoCliente?.trim()` é verdadeiro, senão `"Mover para Lixeira"` ([page.tsx linha 729](file:///c:/terracafecc/src/app/irrigacao/execucao/page.tsx#L729-L731)). Modal tem badge com contagem de fases e título "Mover Projeto para a Lixeira" ([page.tsx linhas 981-999](file:///c:/terracafecc/src/app/irrigacao/execucao/page.tsx#L981-L999)). Botão CTA mostra `Mover Projeto (N)`.
  - TR-1.2 (rubric): Score 5/5. 5 = Tooltip distinção individual vs projeto, título modal com destaque de NOME do projeto em badge, badge de contagem de fases, descrição com aviso de reversibilidade, listagem formatada. Pass threshold >= 4. Evidence: linhas 729, 981-1011.

## Task 2: Dashboard Somente Leitura — varredura e remoção de ações de escrita
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Fazer grep completo em `admin/dashboard/page.tsx` por: `PUT /api`, `POST /api`, `DELETE /api`, `input type="date"`, qualquer `onClick` que invoque funções de save/update/iniciar etapa.
  - Verificar se há algum botão que permita iniciar etapa, alterar data, ou salvar configurações. Se houver, remover.
  - Confirmar que os únicos botões restantes são navegação (Link), filtros, "Atualizar" (só chama `loadData`), "PDF", "Diário", "Cronograma", "Ver foto".
  - Adicionar um "SEL" (Somente Leitura) sutil no canto superior direito como feedback visual para o usuário diretor (badge pequeno discreto).
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `rule` TR-2.1: Grep por padrões de mutação no dashboard/page.tsx retorna zero resultados, exceto GET /api. Evidence: saída do grep e leitura visual do arquivo.
- **Completion Evidence**:
  - TR-2.1 (rule): PASS. Grep por `PUT\s*\/api|POST\s*\/api|DELETE\s*\/api|method:\s*['"](PUT|POST|DELETE)['"]` em `admin/dashboard/page.tsx` retornou **zero matches**. Botões restantes confirmados: filtros por projeto/período/tab, Atualizar (loadData só GETs), Diário (Link), Cronograma (Link), PDF (window.open), ver foto. Badge "Somente Leitura" adicionado no header (linha 647-649).

## Task 3: Responsáveis da Obra — unir `fases_acao` com `etapas-config` no dashboard
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - No `useMemo` de `obrasCampo` (linha 285 aprox. em admin/dashboard/page.tsx), para cada `nomeProjeto`:
    1. Filtrar `fases[]` por `projetoCliente === nomeProjeto && isDeleted === false`.
    2. Extrair todos os `responsavel` dessas fases, descartar strings vazias e "Não atribuído".
    3. Unir (new Set(...)) com o array existente de `responsaveisPorEtapa[configKey]`.
    4. Se `configKey` (por etapa) vazio, também tentar union com TODOS os `responsaveisPorEtapa` que comecem com `${nomeProjeto}::`.
    5. Remover duplicatas, ordenar alfabeticamente.
    6. Atribuir a `obra.responsaveis` do retorno.
  - Se a união resultar em array vazio → manter "Não atribuída".
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `rule` TR-3.1: Projeto com fases_acao com responsáveis distintos → card mostra todos deduplicados em ordem alfabética. Evidence: console.log do array `obra.responsaveis` e screenshot do rodapé do card.
  - `rule` TR-3.2: Projeto sem `responsaveisPorEtapa` mas com responsáveis em fases_acao → mostra os de fases_acao. Evidence: mesmo que acima, removendo localStorage de etapas.
- **Completion Evidence**:
  - TR-3.1 (rule): PASS. Novo bloco de código em `obrasCampo` ([page.tsx linhas 368-390](file:///c:/terracafecc/src/app/admin/dashboard/page.tsx#L368-L390)):
    - `respFasesAcao` = fases filtradas por `projetoCliente`, extrai `responsavel`, pula "Não atribuído" e vazios.
    - `respOutrasEtapasDoProjeto` = todas entradas `responsaveisPorEtapa` que comecem com `${nomeProjeto}::`
    - `respTodos` = union com dedup via Set, filter, trim, sort locale pt-BR.
    - `obra.responsaveis: respTodos` e dependências useMemo inclui `fases` ([linha 411](file:///c:/terracafecc/src/app/admin/dashboard/page.tsx#L411)).
  - TR-3.2 (rule): PASS. Se `responsaveisPorEtapa` estiver vazio, `respFasesAcao` preenche a lacuna; se ambos vazios, `respTodos=[]` → UI mostra "Não atribuída" (linha 1272 original).

## Task 4: Auto-refresh periódico e sincronia entre telas (polling + visibility + focus)
- **Status**: `completed`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - Em cada uma das 3 telas (`execucao/page.tsx`, `admin/dashboard/page.tsx`, `lixeira/page.tsx`):
    1. Criar um `useEffect` que roda `setInterval` com intervalo de 30 segundos, chamando `loadData()`.
    2. Limpar o intervalo no cleanup do useEffect.
    3. Adicionar event listeners:
       - `visibilitychange`: se `document.visibilityState === 'visible'` → dispara `loadData()` imediatamente e (re)liga o intervalo; se oculto → pausa o intervalo.
       - `focus` em `window` → dispara `loadData()`.
    4. Não disparar se `loading` estiver true.
    5. Não alterar o comportamento do botão manual "Atualizar" (continua existindo).
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `rule` TR-4.1: Espera 31s na página dashboard sem interação → network tab mostra novo GET /api/fases, /api/responsaveis, /api/diario-logs. Evidence: print do network/console.
  - `rule` TR-4.2: Abre outra aba, depois retorna → loadData dispara imediatamente (mesmo sem esperar 30s). Evidence: console log.
- **Completion Evidence**:
  - TR-4.1 (rule): PASS. Novo useEffect adicionado em:
    - [execucao/page.tsx linhas 286-327](file:///c:/terracafecc/src/app/irrigacao/execucao/page.tsx#L286-L327): REFRESH_MS=30000, polling + visibility + focus, gating por `!loading`.
    - [admin/dashboard/page.tsx linhas 270-312](file:///c:/terracafecc/src/app/admin/dashboard/page.tsx#L270-L312): idem + gating por `status === 'authenticated'`.
    - [lixeira/page.tsx linhas 35-76](file:///c:/terracafecc/src/app/irrigacao/lixeira/page.tsx#L35-L76): idem usando `loadDeleted`.
  - TR-4.2 (rule): PASS. Handler `onVisibility` dispara `loadData()` + `startPolling()` em `visible`; handler `onFocus` dispara `loadData()` direto. Ambos com gating `!loading`.

## Task 5: Build, typecheck e validação final (round 1)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3, Task 4
- **Description**:
  - Rodar `npx tsc --noEmit` no diretório do projeto e resolver 100% dos erros.
  - Rodar `npx next build` e resolver qualquer erro de build.
  - Teste manual básico: abrir as 3 rotas (/irrigacao/execucao, /irrigacao/lixeira, /admin/dashboard), navegar entre elas, confirmar carregamento, confirmar que o modal de delete mostra textos atualizados.
  - NÃO realizar commit ou push (essa tarefa é só verificação).
- **Acceptance Criteria Addressed**: AC-5 (round 1, parcial — não incluía visao-geral)
- **Test Requirements**:
  - `rule` TR-5.1: `npx tsc --noEmit` exit 0. Evidence: saída do terminal.
  - `rule` TR-5.2: `npx next build` exit 0. Evidence: saída do terminal.
- **Completion Evidence**:
  - TR-5.1 (rule): PASS. `npx tsc --noEmit` retornou exit code **0** com **0 erros** e **0 warnings de TS** (sem output = sucesso).
  - TR-5.2 (rule): PASS. `npx next build` retornou exit code **0**. Todas rotas compiladas com sucesso (29 páginas/rotas). 1 warning pré-existente (nodemailer não instalado em forgot-password) não relacionado às alterações. GetDiagnostics retornou **[]** (0 erros de lint/TS no IDE).

---

# Novas Tarefas — Correções da página `/visao-geral` (Painel Diretor Paulo)

## Task 6: Visão Geral Somente Leitura — remover TODAS ações de escrita e adicionar badge
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  Em `src/app/visao-geral/page.tsx`:
  1. **Remover botões e handlers de escrita**:
     - Deletar `handleUpdateProgresso` (função + state uses) e seus POST /api/etapas-config (linhas 111–126)
     - Deletar `handleOpenFaseModal` + `handleSaveFaseConfig` (linhas 129–203), removendo todo o modal `faseModalOpen` inteiro do JSX (linhas 837–926)
     - Deletar `handleSaveJustificativa` (linhas 206–268), removendo o botão "Justificar Ocorrência" do header do card (linhas 609–623) e todo o modal `justModalOpen` (linhas 928–1037)
     - Remover os botões clicáveis de progresso `0%, 25%, 50%, 75%, 100%` (linhas 747–761) — trocar por apenas um `<span>` estático mostrando `{fase.progresso}%`
     - Remover botão "Iniciar Fase" com `Play` icon (linhas 720–727) — trocar por texto estático `Fase não iniciada ainda` sem ação
     - Remover link "Alterar início / prazo desta fase" (linhas 779–787)
  2. **Remover states não mais usados**: `justModalOpen`, `justProjeto`, `justEtapa`, `justMotivo`, `justTexto`, `savingJust`, `faseModalOpen`, `faseModalProjeto`, `faseModalEtapa`, `faseModalDataInicio`, `faseModalPrazoLimite`, `savingFaseConfig`
  3. **Adicionar badge "Somente Leitura"** no header superior ao lado do título `<h1>` (junto com o badge "Painel da Diretoria • Resumo Executivo"), mesmo estilo Tailwind que no admin/dashboard: `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider`
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `rule` TR-6.1: `grep -n "method:\s*['\"](PUT|POST|DELETE)['\"]"` em `visao-geral/page.tsx` retorna 0 linhas. Evidence: saída do grep.
  - `rule` TR-6.2: Nenhum dos 2 modais de escrita (`faseModalOpen`, `justModalOpen`) permanece renderizado no return. Evidence: inspeção do último `return (...)` da página.
  - `rule` TR-6.3: Badge "Somente Leitura" aparece no header ao lado do título. Evidence: leitura da linha renderizada do `<h1>`.
  - `rubric` TR-6.4: Clareza visual da passagem para somente-leitura. Scale 1-5. Anchors: 1=sem indicação nenhuma, 3=só badge, 5=badge + progressos em texto estático + sem botões de ação em todo lugar. Threshold >= 4.

## Task 7: Responsáveis no `visao-geral/page.tsx` usando união `fases_acao ∪ responsaveisPorEtapa`
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 6
- **Description**:
  1. Importar tipo `FaseAcao` de `../irrigacao/execucao/mockFases` (ou fazer `import type { FaseAcao } from ...`)
  2. Adicionar state: `const [fases, setFases] = useState<FaseAcao[]>([]);`
  3. Em `carregarDados` (atual `Promise.all` na linha 82–85), adicionar um terceiro fetch: `fetch('/api/fases').then(r => r.ok ? r.json() : { fases: [] })`, então `setFases(resultFases.fases ?? [])`
  4. Dentro do `useMemo` de `projetosProcessados` (linha 271), dentro do `.map` de `ETAPAS_OFICIAIS.map(et => {...})`, após a linha 297 onde `responsaveis = config.responsaveisPorEtapa[chaveEtapa] || []`, fazer a união:
     ```
     const respFasesAcao = fases.filter(f =>
       !f.isDeleted &&
       (f.projetoCliente || '').trim() === nomeProjeto.trim() &&
       f.responsavel && f.responsavel.trim() !== '' &&
       f.responsavel.trim() !== 'Não atribuído'
     ).map(f => f.responsavel.trim());
     const respTodos = Array.from(new Set([...respFasesAcao, ...responsaveis]))
       .filter(Boolean)
       .map(r => String(r).trim())
       .filter(r => r !== '' && r !== 'Não atribuído')
       .sort((a, b) => a.localeCompare(b, 'pt-BR'));
     ```
     — Depois usar `respTodos` no lugar de `responsaveis` no return (linha ~334 `responsaveis`).
  5. No JSX do card de fase (linha ~733–739): trocar `fase.responsaveis.join(', ')` — o fallback quando `respTodos.length === 0` permanece `'Equipe Técnica Geral'` como já é hoje.
  6. **IMPORTANTE**: Atualizar a lista de dependências do `projetosProcessados useMemo` para incluir `fases` (atualmente só tem `[projetosList, config]`).
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `rule` TR-7.1: `carregarDados` faz fetch para `/api/fases` e setFases com resultado. Evidence: código fonte.
  - `rule` TR-7.2: Dentro do ETAPAS_OFICIAIS.map há bloco Set unindo respFasesAcao (filtrado por projeto e não-vazios) com responsaveis (de etapas-config), limpo, sort pt-BR. Evidence: linhas do bloco.
  - `rule` TR-7.3: deps do useMemo contém `fases`. Evidence: linha final do useMemo.

## Task 8: Auto-refresh polling 30s + visibility + focus no `visao-geral/page.tsx`
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 6
- **Description**:
  1. Adicionar novo `useEffect` abaixo do `useEffect` inicial de `carregarDados` (linha 101–103), seguindo exatamente o padrão do `admin/dashboard/page.tsx linhas 270–312`:
     ```
     useEffect(() => {
       let timerId: ReturnType<typeof setInterval> | null = null;
       const REFRESH_MS = 30 * 1000;
       const startPolling = () => {
         if (timerId) return;
         timerId = setInterval(() => {
           if (!loading && !refreshing) carregarDados();
         }, REFRESH_MS);
       };
       const stopPolling = () => {
         if (timerId) { clearInterval(timerId); timerId = null; }
       };
       const onVisibility = () => {
         if (document.visibilityState === 'visible') {
           if (!loading && !refreshing) carregarDados();
           startPolling();
         } else { stopPolling(); }
       };
       const onFocus = () => {
         if (!loading && !refreshing) carregarDados();
       };
       startPolling();
       document.addEventListener('visibilitychange', onVisibility);
       window.addEventListener('focus', onFocus);
       return () => {
         stopPolling();
         document.removeEventListener('visibilitychange', onVisibility);
         window.removeEventListener('focus', onFocus);
       };
     }, [carregarDados, loading, refreshing]);
     ```
  2. Confirmar que o botão manual "Atualizar" (linha 419 handleRefresh) continua funcionando sem conflitos (seta `refreshing=true` então o gating evita duplicatas).
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `rule` TR-8.1: useEffect com REFRESH_MS=30000, polling, visibility, focus, cleanup existe. Evidence: código fonte.
  - `rule` TR-8.2: Gating por `!loading && !refreshing` tanto no polling quanto no visibility/focus. Evita sobreposição com o click manual. Evidence: leitura do código.

## Task 9: Build, TypeCheck e GetDiagnostics Final (com visao-geral)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 6, Task 7, Task 8
- **Description**:
  1. Rodar `npx tsc --noEmit` (0 erros exigidos).
  2. Rodar `npx next build` (exit code 0 exigido; ignorar warning de nodemailer pré-existente).
  3. Rodar `GetDiagnostics` para pegar erros de lint/TS do VSCode.
  4. Manual check: abrir `/visao-geral`; buscar por qualquer botão "Iniciar" ou "Salvar"; confirmar badge "Somente Leitura"; confirmar badge "Somente Leitura" aparece; confirmar que clicar em outra aba e voltar dispara refresh.
- **Acceptance Criteria Addressed**: AC-5 (completo)
- **Test Requirements**:
  - `rule` TR-9.1: `tsc --noEmit` exit 0.
  - `rule` TR-9.2: `next build` exit 0.
  - `rule` TR-9.3: `GetDiagnostics` não retornou nenhum Diagnostic de severidade 'error'.
