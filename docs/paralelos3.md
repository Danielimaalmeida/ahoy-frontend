# Paralelos 3 · Onda 3

**Quatro sessões ao mesmo tempo.** Cada secção tem os seus pré-requisitos: **só abres uma secção quando as lanes de que ela
depende estiverem fundidas em `main`.** Vem depois de [paralelos2.md](paralelos2.md).

| Secção | Lane | O que é                                                     | Modelo sugerido                  | Precisa de em `main`  |
| ------ | ---- | ----------------------------------------------------------- | -------------------------------- | --------------------- |
| A      | 3A   | Shell, All hands e Voyages                                  | Sonnet 5.5                       | 1B + 2B + 2D          |
| B      | 3B   | Set sail                                                    | Sonnet 5.5                       | 1A + 1C + 2D          |
| C      | 3C   | The Docks (planeado)                                        | DeepSeek Flash 4.1 ou Sonnet 5.5 | 1B + 2B               |
| D      | 4A   | Base da viagem: contexto, comandos, header, tabs e diálogos | **Opus 5.5**                     | **1B + 1C + 2B + 2D** |

**A secção D (4A) é a base de toda a Onda 4.** Até estar fundida em `main`, não abras o `paralelos4.md`.

## Como usar este ficheiro

Numa sessão nova no repositório `ahoy-frontend`, na branch `main`, escreve só isto (com a letra da secção):

> Implementa a partir de docs/paralelos3.md a secção A

A sessão que receber isto **faz só essa secção**. As outras secções são de outras sessões que correm ao mesmo tempo.

## Regras comuns (valem para todas as secções)

1. **Lê, por esta ordem:** `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e o ficheiro da fase que a tua secção
   indica.
2. **Faz só a lane da tua secção** e só edita os diretórios que ela possui (ver o ficheiro da fase). Não faças as outras
   secções deste ficheiro nem toques nos diretórios delas. **Nunca importes outra feature.** Se precisares de algo de outra
   lane, escreve-o em "Needs from lane X" em `docs/progress.md` e continua com o que podes fazer.
3. **Node:** corre `node -v`. Se for inferior a 22.22.3, usa `npx -y node@24` e põe esse binário à frente do `PATH` em todos
   os comandos (ver "Node in cloud sessions" em `docs/progress.md`).
4. **Pré-voo, antes de escrever código:** confirma que os pré-requisitos da tua secção já estão em `main` (`git fetch origin`
   e vê os ficheiros indicados). **Se faltar algum, pára e diz-me qual. Não inventes, não copies nem refaças o trabalho de
   outra lane.**
5. **Dependências:** só as aprovadas no §10 de `docs/plan/00-overview.md`. Nenhuma lane desta onda precisa de instalar novas.
6. **Nunca** contra `--live` nem contra o TEST. Qualquer resposta de teste a uma pergunta de agente leva "POC test answer,
   not a product decision".
7. **Verifica no backend falso** (`npm run start:mock`) e compara cada ecrã com o quadro do wireframe em
   `docs/design/wireframes/`, em tema claro, escuro e a 390 px de largura.
8. **Git:** trabalha na branch que a sessão designar. Antes de abrir PR, traz `main` para a tua branch e resolve os
   conflitos aí. **Não faças commit nem push até eu aprovar.**
9. **Fecho:** escreve a secção da tua lane em `docs/progress.md` (o que mudou, contagens de testes, o que não correu e
   porquê, "Needs from lane X", próximos passos) e deixa `npm run build && npm run typecheck && npm run lint && npm test &&
npm run format:check` verde.

---

## Secção A · Lane 3A · Shell, All hands e Voyages

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-3-harbour.md](plan/phase-3-harbour.md), lane 3A.

**Pré-requisitos em `main` (verifica):**

- **1B:** existem `ah-top-bar`, `ah-status-badge`, `ah-filter-chips`, `ah-phase-stepper`, `ah-budget-meter` em
  `src/app/ui/`.
- **2B:** `src/app/core/realtime/` e `src/app/core/stores/` têm o `EventBus` e o `StoriesStore`.
- **2D:** existe `src/testing/mock-backend/` e `npm run start:mock` arranca.

**Possui (só edita):** `src/app/app.ts` (e o template), `src/app/features/harbour/**`, `src/app/features/voyages/**`.

**O que fazer**

1. **Shell:** `ah-top-bar` com a contagem de "needs you" do `StoriesStore`, o estado Live do `EventBus` e o utilizador do
   `CurrentUser`; pesquisa que leva a `/voyages?q=`; `<router-outlet>`; host dos toasts; `<title>` por rota.
2. **All hands (`/`):** tiles Crew asks / Your orders / Anchored, painel "Needs you" (a mais antiga primeiro, com a coluna
   "What's needed" por estado e a ação por estado), painel "At sea", estado vazio "Calm seas".
3. **Voyages (`/voyages`):** chips de estado com contagens e `?status=`, tabela com stepper compacto, coluna Note, "Updated ↓",
   Load more, `?q=`, e os estados skeleton, vazio e erro.
4. Usa `@ui`, `@core` e `@domain` já integrados. **Não instalas dependências novas.**

**Pronto quando:** no mock, as 8 viagens semeadas aparecem nos sítios dos wireframes `Main` e `Voyages` e os contadores batem
(1 / 1 / 2 nos tiles; All hands 4); um evento do stream move uma linha entre painéis sem recarregar; a 390 px a página não
tem scroll horizontal. Critérios completos na lane 3A do ficheiro da fase.

---

## Secção B · Lane 3B · Set sail

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-3-harbour.md](plan/phase-3-harbour.md), lane 3B.

**Pré-requisitos em `main` (verifica):**

- **1A:** `ah-field`, `ah-banner`, `ahButton` em `src/app/ui/`.
- **1C:** `ah-model-choice-table` em `src/app/ui/model-choice/`.
- **2D:** o backend falso (`npm run start:mock`).

**Possui (só edita):** `src/app/features/set-sail/**`.

**O que fazer**

1. Formulário tipado (Reactive Forms) em `/voyages/new?key=&title=`: Jira key (`^[A-Z][A-Z0-9]+-[0-9]+$`, maiúsculas
   automáticas), Title (opcional), Total budget (AIU), e a tabela "Crew and models" com os 5 slots.
2. **O orçamento nunca passa por float:** usa `parseAiu` de `@domain`.
3. **Só envias no pedido os modelos que o utilizador preencheu** (`models` omitido se vazio).
4. Coluna direita "Before you sail" e botão "Set sail · up to {X} AIU". `startStory`: `201` leva à viagem; `409 story_exists`
   mostra erro no campo com ligação à viagem existente; `400 validation_failed` mostra erros por campo. O botão fica
   desativado durante o pedido.
5. **Não instalas dependências novas.**

**Pronto quando:** a validação cobre chave inválida, orçamento vazio, `0`, `1e3`, `-5`, `25.5` (válido) e mais de 9 casas;
revisores com o mesmo modelo dão erro nas duas linhas; no mock, criar `PROJ-145` com orçamento 25 e `planning` =
`claude-sonnet-5` / `high` envia exatamente `{key, budgetNanoAiu: 25000000000, models:{planning:{...}}}`; duplo clique envia
um pedido. Critérios completos na lane 3B do ficheiro da fase.

---

## Secção C · Lane 3C · The Docks (planeado)

**Modelo sugerido:** DeepSeek Flash 4.1, ou Sonnet 5.5 se não confiares. **Revê antes de integrar.**
**Fase:** [docs/plan/phase-3-harbour.md](plan/phase-3-harbour.md), lane 3C.

**Pré-requisitos em `main` (verifica):** **1B** (`ah-section-tabs`, `ah-status-badge`, `ah-empty-state`) e **2B**
(`StoriesStore`).

**Possui (só edita):** `src/app/features/docks/**`.

**O que fazer**

1. **O backlog não existe na API.** Tudo passa por uma interface `BacklogPort`, com um `StubBacklogAdapter` de dados de
   exemplo (os 9 itens do wireframe), **claramente marcado como planeado**.
2. Banner "Planned screen. The backlog is not in the API yet…", pesquisa, selects de Jira status e Assignee, controlo
   All / Not started / In Ahoy, e a tabela com a coluna **Ahoy real** (join com o `StoriesStore`).
3. Ações: "Set sail" leva a `/voyages/new?key=&title=`; "Open voyage" para os que já existem. **Sem `jiraBaseUrl`
   configurado, o botão "Jira ↗" não aparece.** Sem arranque em massa.
4. **Não instalas dependências novas.**

**Pronto quando:** com o stub, os filtros e os três estados da coluna Ahoy funcionam; trocar o adaptador por um falso nos
testes não altera nenhum componente; o ecrã diz "planned" de forma visível. Critérios completos na lane 3C do ficheiro da
fase.

---

## Secção D · Lane 4A · Base da viagem

**Modelo sugerido:** Opus 5.5. **Fase:** [docs/plan/phase-4-voyage-core.md](plan/phase-4-voyage-core.md), lane 4A.

**Pré-requisitos em `main` (verifica):** **1B**, **1C**, **2B** e **2D** (a Onda 2 toda).

**Possui (só edita):** `src/app/features/voyage/{shell,header,context,dialogs}/**`,
`src/app/features/voyage/voyage.routes.ts` e `src/app/core/commands/**`.

**O que fazer**

1. **`VoyageContext`** (serviço por rota `/voyages/:key`) e **`CommandRunner`** em `src/app/core/commands/` (conflitos
   `stale_version`, `decided`, `answered`, duplo envio).
2. Shell da viagem: breadcrumb, **header** (chave, badge com a palavra da API, título, stepper, owner, medidor, run atual,
   ronda de revisão, sha curto), **ação primária por estado**, **banner "Anchored"** com texto por motivo e linha técnica,
   tabs por rota com contagens.
3. Diálogos **Stop**, **Resume** (com a caixa de custo "up to {restante} AIU") e **Budget**.
4. **Deixa as tabs como placeholders:** são das lanes seguintes (Onda 4).
5. **O texto escrito pelo utilizador nunca se perde num conflito.** Um duplo clique envia um só pedido.
6. **Não instalas dependências novas.**

**Pronto quando:** no mock, as 8 viagens mostram o header, a ação primária e o banner certos; Stop, Resume e Budget enviam o
corpo exato com `expectedVersion`; com `conflictNext`, o diálogo fica aberto, mostra o banner, refresca e mantém o texto;
Budget abaixo do gasto dá erro sem pedido; `halt-guidance` testado para os 9 motivos e um desconhecido. Critérios completos na
lane 4A do ficheiro da fase.

---

## Depois desta onda

Funde cada lane em `main` quando a tiveres revisto e aprovado. **Quando a 4A (secção D) estiver em `main`, abre
[paralelos4.md](paralelos4.md)**, com as seis secções ao mesmo tempo.
