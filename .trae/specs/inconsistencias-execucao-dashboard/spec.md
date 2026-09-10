# Correção de Inconsistências Execução × Dashboard - Product Requirements Document

## Overview
- **Summary**: Correção de quatro inconsistências operacionais no módulo de Irrigação: (1) exclusão de projetos de forma agrupada (não fase a fase) no painel operacional e na lixeira, (2) remoção de quaisquer controles de escrita (iniciar data de fase) na visão do diretor (dashboard executivo), (3) responsáveis das obras no dashboard lidos da fonte de verdade `fases_acao` (não mais apenas da configuração isolada `etapas-config`), (4) atualização automática e sincronia entre telas quando fases são iniciadas/alteradas.
- **Purpose**: Garantir estabilidade do sistema, coerência semântica (projeto = unidade atômica de remoção), segurança de permissões (diretor = viewer, não editor) e integridade dos dados de responsabilidade exibida à diretoria.
- **Target Users**: Diretoria (visualização somente leitura) e Equipe Operacional (edição e exclusão).

## Goals
- Remover/deletar SEMPRE o projeto como um todo (todas as fases); nunca permitir exclusão fase-a-fase individual.
- Dashboard do diretor ter apenas ações de visualização, filtros, navegação e exportação (PDF); nenhum botão ou input para iniciar/alterar datas de fases.
- Responsáveis exibidos no painel do diretor serem sempre a união dos responsáveis de `fases_acao` (fonte operacional real) com eventuais sobrescritas de `etapas-config`.
- Dados se manterem consistentes e sincronizados entre execução, lixeira e dashboard após qualquer ação; atualização periódica automática.

## Non-Goals
- Não alterar schema do banco (`fases_acao`, `historico_fases`, `etapas_config`, `diario_logs`).
- Não criar novas tabelas ou colunas.
- Não alterar regras de negócio de rollback/de versões (V0→V1) em retorno de cliente.
- Não alterar fluxo de autenticação ou roles no NextAuth.
- Não refatorar o Diário de Campo (exceto o necessário para compatibilidade dos responsáveis).

## Background & Context
Do início da sessão e exploração dos arquivos (atualizado 2026-09-09 — adição da página `visao-geral`):
- [page.tsx - Execução](file:///c:/terracafecc/src/app/irrigacao/execucao/page.tsx): ✅ Já corrigido. Botão de lixeira com tooltip condicional (linha 772), `handleTrashFase` move todas as fases do mesmo projeto (linhas 504–534), modal com título "Mover Projeto para a Lixeira", badge de contagem, listagem de fases e CTA "Mover Projeto (N)" (linhas 1015–1060). Polling 30s instalado (linhas 286–327).
- [page.tsx - Lixeira](file:///c:/terracafecc/src/app/irrigacao/lixeira/page.tsx): ✅ Já correto. Agrupa por projeto, "Restaurar Projeto" (linhas 98–128), "Excluir Permanentemente" por projeto (linhas 131–152). Polling 30s (linhas 35–76).
- [page.tsx - Admin Dashboard](file:///c:/terracafecc/src/app/admin/dashboard/page.tsx): ✅ Já corrigido. Somente leitura (0 POST/PUT/DELETE), badge "Somente Leitura", responsáveis unidos de `fases_acao ∪ responsaveisPorEtapa` (linhas 412–434), polling 30s (linhas 270–312).
- **⚠️ [page.tsx - Visão Geral (Painel Diretor Paulo)](file:///c:/terracafecc/src/app/visao-geral/page.tsx): AINDA COM PROBLEMAS.** É a página `/visao-geral` (título "Resumo Geral de Projetos (Paulo - Diretor)") que possui 4 ações de escrita não autorizadas: (1) `handleOpenFaseModal` + `handleSaveFaseConfig` → `POST /api/etapas-config` para iniciar/alterar datas de fase (linhas 129–203, botão "Iniciar Fase" na linha 720, "Alterar início/prazo" na linha 780); (2) `handleUpdateProgresso` → `POST /api/etapas-config` com cliques 0%/25%/50%/75%/100% (linhas 111–126, botões na linha 747); (3) `handleSaveJustificativa` → `POST /api/etapas-config` + `POST /api/diario-logs` (linhas 206–268, botão "Justificar Ocorrência" linha 609); (4) Responsáveis por fase vêm **apenas** de `config.responsaveisPorEtapa[chaveEtapa]` (linha 297) sem carregar `/api/fases` para obter `fases_acao.responsavel`; (5) Sem polling automático — só botão manual "Atualizar" (linha 105–108).
- [route.ts - fases API](file:///c:/terracafecc/src/app/api/fases/route.ts): ✅ Delete soft/hard por projeto OK com cascata `diario_logs` (linhas 305–319).

## Functional Requirements
- **FR-1 — Exclusão por Projeto (Painel Operacional / Execução)**: O clique no botão de exclusão deve, inequivocamente, comunicar ao usuário que TODO O PROJETO será movido à lixeira. Nenhuma interface deve permitir excluir uma única fase individual de um projeto (se a fase não tiver `projetoCliente` preenchido, a exclusão individual é aceitável como exceção). ✅ Já implementado em `execucao/page.tsx`.
- **FR-2 — Dashboard Somente Leitura (TODOS dashboards de diretor)**: Em BOTH `/admin/dashboard` E `/visao-geral` (Painel Paulo Diretor): nenhum input de data, botão "Iniciar Etapa", modal de edição, botão de progresso %, botão de justificativa com escrita, ou qualquer `onClick` que execute `POST /api/*`, `PUT /api/*`, `DELETE /api/*` deve existir. Apenas: filtros, busca por projeto, botão Atualizar (GET apenas), botão Diário (Link navegação), visualizar justificativas já registradas (somente leitura), badge "Somente Leitura" visível no header.
  - Observação para o `/visao-geral`: Botão "Justificar Ocorrência" e seu modal (`justModalOpen`) devem ser **removidos** (escrita). A listagem de justificativas existentes no rodapé do card de projeto (linhas 795–829) deve ser mantida como visualização.
- **FR-3 — Responsáveis da Obra a partir de `fases_acao` (AMBOS dashboards)**: No `/admin/dashboard` ✅ já e no `/visao-geral` (NOVO), para cada `nomeProjeto`: (a) carregar dados de `GET /api/fases` no `carregarDados`; (b) a lista de responsáveis por PROJETO e por FASE INDIVIDUAL deve ser `Array.from(new Set([...fases_acao_responsaveis_do_projeto, ...responsaveisPorEtapa[chave]]))`, dedupado, removendo "Não atribuído" e vazios, ordenado alfabeticamente pt-BR. A listagem de responsáveis no card de cada fase (linha 733–739 do `visao-geral/page.tsx`) também usa essa união. Quando nenhum: exibir "Equipe Técnica Geral" (mantendo o fallback existente).
- **FR-4 — Auto-refresh em telas principais (incluindo visao-geral)**: Polling 30s com Page Visibility e window focus em `execucao/page.tsx` ✅, `admin/dashboard/page.tsx` ✅, `lixeira/page.tsx` ✅, e **NOVO `visao-geral/page.tsx`**. Reaproveitar o padrão idêntico: `REFRESH_MS=30000`, `setInterval` gated por `!loading`, listener `visibilitychange` (pausa/resume), listener `focus` (dispara imediatamente), cleanup no return do useEffect.
- **FR-5 — Label mais clara na lixeira do execução**: Tooltip + modal + CTA explícitos sobre exclusão por projeto. ✅ Já implementado em `execucao/page.tsx` (linhas 772, 1022–1054).

## Non-Functional Requirements
- **NFR-1 — Sem quebras de build**: `tsc --noEmit` e `next build` passam com 0 erros após as alterações.
- **NFR-2 — Sem regressões visuais perceptíveis**: Cards, tabelas, KPIs e gráficos devem manter layout e aparência; só mudam os labels de ação e os dados dos responsáveis.
- **NFR-3 — Idempotência da exclusão**: Reenvio de múltiplos PUT `isDeleted=true` ou DELETE `hard=true` não devem causar erros.
- **NFR-4 — Privacidade de recursos**: Todas as requisições à API continuam exigindo sessão autenticada (já existente em todas as rotas).

## Constraints
- **Technical**: Next.js 14 App Router, TypeScript estrito, Tailwind, Lucide icons, Recharts (apenas no dashboard). Supabase via `getSupabase()`. Manter padrão de importações e nomenclatura já utilizada.
- **Business**: Unidade atômica de exclusão é o `projeto_cliente`. Uma fase com `projetoCliente` vazio pode ser tratada como entidade individual.
- **Dependencies**: Zod validators em `src/lib/validators.ts` (já existem e não serão alterados). `useToast`, `Skeleton`, `ThemeToggle`, `LogoutButton`, `BackButton` components existentes.

## Assumptions
- A fala do usuário "cronograma e execução" se refere à página `/irrigacao/execucao` (também chamada de Cronograma pelo link do dashboard).
- "possa iniciar a data de uma fase" se referia à possível (e equivocada) ideia de que o diretor faria isso no dashboard. Na análise não existem esses controles lá; mas se aparecerem em algum ponto não lido, serão removidos.
- `responsaveisPorEtapa` vem de configuração manual por etapa de campo; o `responsavel` de `fases_acao` é o contratual. A união dá a visão completa ao diretor.
- 30s é polling suficiente sem sobrecarregar o banco/API.

## Acceptance Criteria

### AC-1: Exclusão sempre por projeto quando há projeto_cliente
- **Type**: `rule`
- **Given**: Há 1+ fases ativas no `execucao/page.tsx` onde `projetoCliente` está preenchido e todas compartilham o mesmo nome.
- **When**: Clicar no botão de exclusão (lixeira) em QUALQUER linha daquele projeto.
- **Then**: (a) O modal de confirmação mostra TODAS as fases daquele projeto, (b) após confirmação todas elas têm `isDeleted=true`, (c) todas somem da tabela do execução, (d) aparecem agrupadas em 1 único card na lixeira.
- **Pass Condition**: Observar no banco via API `/api/fases` que `isDeleted` é true para todas as fases do projeto, e que a lixeira agrupa-as corretamente.
- **Evidence**: Console `GET /api/fases` com filtro `projetoCliente === X` mostrando `isDeleted=true` em massa; UI da lixeira mostrando 1 card com todas as fases expandíveis.

### AC-2: AMBOS dashboards de diretor estritamente somente leitura
- **Type**: `rule`
- **Given**: Painel `/admin/dashboard` ou `/visao-geral` carregado autenticado.
- **When**: Procurar por qualquer `method: 'POST'`, `method: 'PUT'`, `method: 'DELETE'` em chamadas `fetch`; procurar por `<input type="date">` fora de modal; procurar botões com label "Iniciar Fase", "Alterar início", "Salvar Prazo", "Salvar Justificativa", botões de progresso % clicáveis (0, 25, 50, 75, 100) que chamam handlers de escrita.
- **Then**: Nenhum elemento de mutação de dados existe nas duas páginas. No `/visao-geral` especificamente: (a) botão "Iniciar Fase" com `Play` icon REMOVIDO (substituído por texto "Fase não iniciada ainda" somente visualização), (b) botões de progresso % REMOVIDOS (substituídos por texto estático com o %), (c) link "Alterar início / prazo desta fase" REMOVIDO, (d) botão "Justificar Ocorrência" e todo seu modal REMOVIDOS, (e) modal `faseModalOpen` (Iniciar/Prazo Fase) REMOVIDO do JSX, (f) handlers `handleSaveFaseConfig`, `handleUpdateProgresso`, `handleSaveJustificativa`, `handleOpenFaseModal` deletados ou comentados, (g) Badge "Somente Leitura" adicionado no header.
- **Pass Condition**: Grep no `visao-geral/page.tsx` por `method:\s*['"](PUT|POST|DELETE)['"]` retorna 0 matches. Nenhum dos 4 modais de escrita permanece renderizado no JSX.
- **Evidence**: Resultado do grep e inspeção JSX do return statement da página.

### AC-3: Responsáveis da obra sincronizados com fases_acao (AMBOS dashboards)
- **Type**: `rule`
- **Given**: Um projeto com `projetoCliente = "Fazenda X"` tem pelo menos 3 fases em `fases_acao`: Fase 1 → responsável "Carlos", Fase 2 → responsável "Mariana", Fase 3 → responsável "Carlos"; e `responsaveisPorEtapa` vazio.
- **When**: Renderizar o card da obra "Fazenda X" tanto no `/admin/dashboard` (já feito) quanto no `/visao-geral` (novo).
- **Then**: No card de cada fase do projeto em `/visao-geral` mostrar ex. "Responsável: Carlos, Mariana" (ordem alfabética; dedup; união com `responsaveisPorEtapa[chave]` se existir). No dashboard admin, mesmo comportamento já existente.
- **Pass Condition**: (a) `carregarDados` no `visao-geral/page.tsx` faz `fetch('/api/fases')` e guarda `fases: FaseAcao[]` em state; (b) dentro de `projetosProcessados useMemo`, para cada `[nomeProjeto, fase]`, calcula `union(fases_acao_do_projeto.map(f=>f.responsavel), responsaveisPorEtapa[chaveEtapa])`, limpo, ordenado; (c) dependências do useMemo incluem o novo state de `fases`.
- **Evidence**: Source diff mostrando novo state `fases`, novo fetch, bloco de união Set, e include de `fases` na deps do useMemo.

### AC-4: Auto-refresh periódico e ao focar (incluindo visao-geral)
- **Type**: `rule`
- **Given**: Página `execução`, `admin/dashboard`, `lixeira` (já OK) OU `visao-geral` (novo) aberta.
- **When**: Esperar 31 segundos (sem interação), OU minimizar a aba e voltar (visibilitychange), OU clicar em outra janela e retornar a esta (focus).
- **Then**: A função de load de dados é re-executada e os estados atualizados sem F5.
- **Pass Condition**: No `visao-geral/page.tsx`, useEffect com padrão idêntico ao das outras 3 páginas: `REFRESH_MS=30000`, `setInterval` gated por `!loading && !refreshing`, `visibilitychange` listener start/stop polling, `focus` listener dispara `carregarDados()`, cleanup completo. Não dispara duplicado se `refreshing` já true.
- **Evidence**: Linhas de código do useEffect adicionado no visao-geral.

### AC-5: Build e typecheck sem erros
- **Type**: `rule`
- **Given**: Todas as alterações aplicadas.
- **When**: Executar `npx tsc --noEmit` e `npx next build`.
- **Then**: Ambos terminam com exit code 0.
- **Pass Condition**: Exit code 0.
- **Evidence**: Saída dos dois comandos colada nos registros.

### AC-6: UX clara para exclusão de projeto
- **Type**: `rubric`
- **Dimension**: Clareza da comunicação da ação de exclusão (tooltip, button label, modal título).
- **Scale**: 1-5
- **Anchors**: 1 = tooltip ainda diz "Mover fase para lixeira" (confuso); 3 = tooltip diz "Mover para lixeira" e modal mostra o projeto mas sem destaque visual; 5 = tooltip com texto "Mover **Projeto** para Lixeira" (quando há projeto), modal tem título "Mover **Projeto X** para a Lixeira", badge com contagem de fases a serem removidas.
- **Pass Threshold**: >= 4
- **Evidence**: Screenshots e descrição dos textos exibidos.

## Open Questions
- [x] Onde está a "aba Cronograma"? → Resolvido: o link no dashboard direciona para `/irrigacao/execucao`, que é o mesmo painel operacional (execução/cronograma). Não há página separada de cronograma.
- [x] Como fica fase sem `projetoCliente`? → Exceção: pode ser excluída individualmente (semântica já atual).
