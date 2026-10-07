# Paralelos 2 · Onda 2

**Quatro sessões ao mesmo tempo.** Cada secção tem os seus pré-requisitos: **só abres uma secção quando as lanes de que ela
depende estiverem fundidas em `main`.** Vem depois de [paralelos1.md](paralelos1.md).

| Secção | Lane | O que é                                        | Modelo sugerido | Precisa de em `main`  |
| ------ | ---- | ---------------------------------------------- | --------------- | --------------------- |
| A      | 1B   | Kit: estado, progresso e navegação             | Sonnet 5.5      | **1A + 2C**           |
| B      | 1C   | Kit: diálogo, cartões, passos, diff e markdown | **Opus 5.5**    | **1A + 2C**           |
| C      | 2B   | Tempo real e stores                            | **Opus 5.5**    | **2A + 2C**           |
| D      | 2D   | Backend falso e servidor `mock:api`            | Sonnet 5.5      | **2A terminada + 2C** |

Se só a 1A e a 2C estiverem fundidas, abre apenas A e B. Se só a 2A e a 2C estiverem, abre apenas C e D.

**"2A terminada" (secção D):** a lane 2A foi fundida sem as dependências de desenvolvimento (`openapi-typescript`, `ajv`,
`yaml`), por isso faltavam o `schema.d.ts`, o `api:types`, o `api:check` e o `contract.spec.ts`. A 2D reutiliza o helper de
Ajv desse `contract.spec.ts`, por isso **só abres a secção D depois de a 2A estar terminada e fundida**. A secção C (2B) não
precisa disso: os tipos da API em `src/app/core/api/types.ts` chegam.

## Como usar este ficheiro

Numa sessão nova no repositório `ahoy-frontend`, na branch `main`, escreve só isto (com a letra da secção):

> Implementa a partir de docs/paralelos2.md a secção A

A sessão que receber isto **faz só essa secção**. As outras secções são de outras sessões que correm ao mesmo tempo.

## Regras comuns (valem para todas as secções)

1. **Lê, por esta ordem:** `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e o ficheiro da fase que a tua secção
   indica.
2. **Faz só a lane da tua secção** e só edita os diretórios que ela possui (ver o ficheiro da fase). Não faças as outras
   secções deste ficheiro nem toques nos diretórios delas. Se precisares de algo de outra lane, escreve-o em "Needs from
   lane X" em `docs/progress.md` e continua com o que podes fazer.
3. **Node:** corre `node -v`. Se for inferior a 22.22.3, usa `npx -y node@24` e põe esse binário à frente do `PATH` em todos
   os comandos (ver "Node in cloud sessions" em `docs/progress.md`).
4. **Pré-voo, antes de escrever código:** confirma que os pré-requisitos da tua secção já estão em `main` (`git fetch origin`
   e vê os ficheiros indicados). **Se faltar algum, pára e diz-me qual. Não inventes, não copies nem refaças o trabalho de
   outra lane.**
5. **Dependências:** só as aprovadas no §10 de `docs/plan/00-overview.md`, com a versão exata que `npm view` devolver.
   Qualquer outra pede-me aprovação. Se o sistema de permissões bloquear o `npm install` de uma dependência aprovada, pára e
   diz-me o comando exato: aprovo-o aqui, nesta sessão (a aprovação do plano não chega para o sistema de permissões).
6. **Nunca** contra `--live` nem contra o TEST. Qualquer resposta de teste a uma pergunta de agente leva "POC test answer,
   not a product decision".
7. **Git:** trabalha na branch que a sessão designar. Antes de abrir PR, traz `main` para a tua branch e resolve os
   conflitos aí. **Não faças commit nem push até eu aprovar.**
8. **Fecho:** escreve a secção da tua lane em `docs/progress.md` (o que mudou, contagens de testes, o que não correu e
   porquê, "Needs from lane X", próximos passos) e deixa `npm run build && npm run typecheck && npm run lint && npm test &&
npm run format:check` verde.

---

## Secção A · Lane 1B · Kit: estado, progresso e navegação

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-1-design-system.md](plan/phase-1-design-system.md), lane 1B.

**Pré-requisitos em `main` (verifica):**

- **1A:** existem `src/styles/tokens.css`, `src/styles/ahoy-bundle.css` e `src/app/ui/icon/`.
- **2C:** `src/app/domain/` tem mais do que `.gitkeep`, com o vocabulário (`statusPresentation`, `outcomePresentation`,
  `explainHalt`) e `text-diff.ts`.

**Possui (só edita):** em `src/app/ui/`: `status-badge/`, `phase-stepper/`, `budget-meter/`, `outcome-pill/`,
`filter-chips/`, `section-tabs/`, `top-bar/`, `empty-state/`, `skeleton/`, `toast/`, `pipes/`, e `_kit/sections/1b-*`.

**O que fazer**

1. Implementa `ah-status-badge`, `ah-phase-stepper` (completo e compacto), `ah-budget-meter`, `ah-outcome-pill`,
   `ah-filter-chips`, `ah-section-tabs`, `ah-top-bar` (com o indicador Live), `ah-empty-state`, `ah-skeleton`, o toast e os
   pipes `ahAiu`, `ahRelative`, `ahDateTime` e `ahActor`.
2. **Usa `@domain` para todos os mapeamentos** (`statusPresentation`, `outcomePresentation`…). Não dupliques o vocabulário.
3. Cada componente tem entrada na galeria `/_kit`, em tema claro e escuro, e compara-se com o `preview.html` do design
   system em `docs/design/design-system/components/<Nome>/`.
4. **Não instalas dependências novas.**

**Pronto quando:** teste exaustivo de cada combinação estado/fase contra o `vocabulary.md`; stepper com um só `current`;
medidor com 0, 41 e 100 %; top bar com `aria-current` e alternância Live/Reconnecting. Critérios completos na lane 1B do
ficheiro da fase.

---

## Secção B · Lane 1C · Kit: interação e conteúdo

**Modelo sugerido:** Opus 5.5. **Fase:** [docs/plan/phase-1-design-system.md](plan/phase-1-design-system.md), lane 1C.

**Pré-requisitos em `main` (verifica):** os mesmos da secção A (**1A** e **2C**).

**Possui (só edita):** em `src/app/ui/`: `dialog/`, `choice-card/`, `question-card/`, `model-choice/`, `live-steps/`,
`ships-log/`, `artifact-diff/`, `markdown/`, e `_kit/sections/1c-*`.

**O que fazer**

1. Implementa `ah-dialog` (sobre o CDK Dialog), `ah-choice-card-group`, `ah-question-card`, `ah-model-choice-table`,
   `ah-live-steps`, `ah-ships-log`, `ah-artifact-diff` e `ah-markdown` com `renderMarkdown`.
2. **Dependências aprovadas para esta lane:** `@angular/cdk` e `marked`. Mais nenhuma.
3. **O markdown vem de agentes: é não fiável.** Os testes de XSS (`<script>`, `<img onerror>`, `javascript:`, HTML embutido,
   imagem remota) **fazem parte da lane**. Nunca uses `bypassSecurityTrust*`.
4. Compara com os `preview.html` do design system na galeria `/_kit`, em claro e escuro.

**Pronto quando:** nada executa nem carrega nos testes de XSS; o diálogo fecha com Esc, devolve o foco e o `busy` impede duplo
clique; "Use recommendation" preenche mas não envia; o erro de revisores iguais aparece nas duas linhas. Critérios completos
na lane 1C do ficheiro da fase.

---

## Secção C · Lane 2B · Tempo real e stores

**Modelo sugerido:** Opus 5.5. **Fase:** [docs/plan/phase-2-data-layer.md](plan/phase-2-data-layer.md), lane 2B.

**Pré-requisitos em `main` (verifica):**

- **2A:** existem `openapi/ahoy-v1.yaml` e um `ApiClient` em `src/app/core/api/`. Os tipos da API estão em
  `src/app/core/api/types.ts` (escritos à mão enquanto o `schema.d.ts` não existir; quando o gerador chegar, só esse
  ficheiro muda). **O `schema.d.ts` não é pré-requisito da 2B.**
- **2C:** `src/app/domain/` tem o vocabulário e os tipos.

**Possui (só edita):** `src/app/core/realtime/**` e `src/app/core/stores/**`.

**O que fazer**

1. Constrói sobre o `ApiClient` da 2A e o `@domain` da 2C: o `FETCH` token, `parseSseStream`, `EventStreamClient`, `EventBus`
   (uma ligação global), o polling de reserva, `StoriesStore`, `StoryStore`, `RunProgressBuffer` e `StoryEventsFeed`.
2. **Não uses `EventSource`:** `fetch` com parser SSE próprio, `Last-Event-ID` ao reconectar e fallback para polling.
3. Testa com `fetch` falso e relógio falso; **nada de rede nem de esperas reais.**
4. **Não instalas dependências novas.**

**Pronto quando:** `parseSseStream` aguenta cortes em qualquer posição (incluindo UTF-8 multibyte); `401/403/4xx` terminam em
`offline` sem repetir; reconecta com `Last-Event-ID`; `omitted` e os intervalos estão certos; nada fica subscrito depois de
destruir. Critérios completos na lane 2B do ficheiro da fase.

---

## Secção D · Lane 2D · Backend falso

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-2-data-layer.md](plan/phase-2-data-layer.md), lane 2D.

**Pré-requisitos em `main` (verifica):** os mesmos da secção C (**2A** e **2C**) **e a 2A terminada**: `schema.d.ts` gerado,
`npm run api:types` e `npm run api:check` no `package.json`, e `src/app/core/api/contract.spec.ts` (ou onde a 2A o pôs; a 2D
reutiliza o helper de Ajv que vem com ele). A secção da lane 2A em `docs/progress.md` já não pode dizer "Not done". **Se
faltar, pára e diz-me.**

**Possui (só edita):** `src/testing/mock-backend/**`, `src/app/core/mock/**`, `src/environments/environment.mock.ts`, a
configuração `mock` do `angular.json` (só acrescentar) e o servidor `mock:api` (`scripts/mock-api.*` e a linha `mock:api`
do `package.json`).

**O que fazer**

1. `MockAhoyServer` em memória, determinístico, com todas as operações da 2A, versões e erros do contrato, o ciclo de vida
   simulado, `GET /events/stream` com `Last-Event-ID`, interruptores (`latencyMs`, `failNext`, `conflictNext`, `dropStream`) e as 8
   viagens semeadas dos wireframes.
2. **O mock não é a API:** valida sempre as respostas contra `openapi/ahoy-v1.yaml` com Ajv.
3. Inclui o servidor HTTP **`npm run mock:api`** (entregável 9 de `docs/plan/phase-2-data-layer.md`), **sem dependências novas**.
4. Cria `src/environments/environment.mock.ts` e aponta para ele os `fileReplacements` da configuração `mock`.
5. **O mock não entra no build de produção.**

**Pronto quando:** `npm run start:mock` arranca; a história completa corre no mock por chamadas ao `ApiClient` (set sail →
pergunta → plano → send-back → aprovação → done); a conformidade com o OpenAPI está verde; `dist/` de produção sem rasto do
mock. Critérios completos na lane 2D do ficheiro da fase.

---

## Depois desta onda

Funde cada lane em `main` quando a tiveres revisto e aprovado. O que desbloqueias em [paralelos3.md](paralelos3.md):

| Já está em `main`               | Podes abrir em paralelos3            |
| ------------------------------- | ------------------------------------ |
| 1B, 2B e 2D                     | secção A (3A)                        |
| 1A, 1C e 2D                     | secção B (3B)                        |
| 1B e 2B                         | secção C (3C)                        |
| 1B, 1C, 2B e 2D (a Onda 2 toda) | secção D (4A), e todas as anteriores |
