# Paralelos 1 · Onda 1

**Quatro sessões ao mesmo tempo:** A, B e C são obrigatórias; D é opcional. **Pré-requisito geral:** só a fase 0, que já está
em `main`. Quando A, B e C estiverem fundidas em `main`, passa a [paralelos2.md](paralelos2.md).

| Secção | Lane | O que é                                       | Modelo sugerido                  |
| ------ | ---- | --------------------------------------------- | -------------------------------- |
| A      | 1A   | Base do kit de design                         | Sonnet 5.5                       |
| B      | 2A   | Cliente da API                                | Sonnet 5.5                       |
| C      | 2C   | Domínio puro                                  | DeepSeek Flash 4.1 ou Sonnet 5.5 |
| D      | 6D   | Release: imagem, configuração, CSP (opcional) | Sonnet 5.5                       |

## Como usar este ficheiro

Numa sessão nova no repositório `ahoy-frontend`, na branch `main`, escreve só isto (com a letra da secção):

> Implementa a partir de docs/paralelos1.md a secção A

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

## Secção A · Lane 1A · Base do kit de design

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-1-design-system.md](plan/phase-1-design-system.md), lane 1A.

**Pré-requisitos em `main`:** só a fase 0.

**Possui (só edita):** `scripts/build-tokens.mjs`, `src/styles/**`, `src/styles.scss`, e em `src/app/ui/`: `icon/`, `logo/`,
`button/`, `panel/`, `field/`, `banner/`, `table/`, `tags/`, `_kit/`.

**O que fazer**

1. Gera `src/styles/tokens.css` a partir de `docs/design/design-system/tokens.json` com `scripts/build-tokens.mjs`
   (`npm run tokens` e `npm run tokens:check`). Confirma que **todas** as `var(--…)` do `bundle.css` estão definidas
   (o bundle usa `--avatar` e `--badge-height`, e `--space-1\.5` com o ponto escapado).
2. Copia `docs/design/design-system/components/bundle.css` para `src/styles/ahoy-bundle.css` (não o edites) e liga os dois em
   `src/styles.scss`. O Google Fonts do bundle mantém-se.
3. `ThemeService` (claro por omissão, `data-theme` no `<html>`), `ah-icon` com os 16 ícones, `ah-logo`, e as primitivas:
   `ahButton`, `ah-panel`, `ah-field`, `ah-banner`, helpers de tabela e `ah-source`.
4. Substitui o placeholder de `src/app/ui/_kit/kit.routes.ts` pela galeria `/_kit` (só em dev), com alternador claro/escuro.
5. **Não instalas dependências novas.**

**Pronto quando:** `npm run tokens:check` passa e falha se alterares o `tokens.json` sem regenerar; Button, Panel, Field e
Banner coincidem com os `preview.html` do design system em claro e escuro; os 16 ícones existem. Critérios completos na lane
1A do ficheiro da fase.

---

## Secção B · Lane 2A · Cliente da API

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-2-data-layer.md](plan/phase-2-data-layer.md), lane 2A.

**Pré-requisitos em `main`:** só a fase 0.

**Possui (só edita):** `openapi/**`, `scripts/sync-openapi.mjs`, `scripts/smoke-api.mjs`, `scripts/capture-fixtures.mjs`,
`src/app/core/api/**`, `src/app/core/auth/**`, `src/app/core/config/**`, `src/testing/fixtures/**`.

**O que fazer**

1. Copia o contrato para `openapi/ahoy-v1.yaml` (de `../ahoy-hosted/openapi/ahoy-v1.yaml` ou do repositório
   `Danielimaalmeida/ahoy-hosted`) e gera `src/app/core/api/schema.d.ts` com `openapi-typescript` (`npm run api:types`,
   `npm run api:check`).
2. `ApiClient` com um método por operação das fases 3 a 6, devolvendo `ApiResult` (nunca exceções), `ApiError`, e os
   guards manuais de `core/api`.
3. **Não escrevas `Authorization` em lado nenhum:** o `AuthStrategy` devolve `{}`. `CurrentUser` a partir do `AppConfig`.
4. Preenche o `initAppConfig` em `src/app/core/config/app-config.ts` e decide se `API_BASE` passa a vir de
   `AppConfig.apiBase`; regista a decisão no relatório.
5. Fixtures em `src/testing/fixtures/` e `contract.spec.ts` que as valida contra o YAML com Ajv.
6. Escreve `scripts/smoke-api.mjs` e `scripts/capture-fixtures.mjs`, mas **não os corras** (precisam de uma API local). Diz no
   relatório que não correram.
7. **Dependências aprovadas para esta lane:** `openapi-typescript`, `ajv` e `yaml`. Mais nenhuma.

**Pronto quando:** cada método coberto com `HttpTestingController` (sucesso, `problem+json`, rede, forma errada);
`api:check` limpo; nenhum `any`; os guards rejeitam valores AIU fracionários ou negativos; nenhum pedido leva
`Authorization`. Critérios completos na lane 2A do ficheiro da fase.

---

## Secção C · Lane 2C · Domínio puro

**Modelo sugerido:** DeepSeek Flash 4.1, ou Sonnet 5.5 se não confiares. **Esta lane alimenta quatro da Onda 2: revê-a antes
de integrar.** **Fase:** [docs/plan/phase-2-data-layer.md](plan/phase-2-data-layer.md), lane 2C.

**Pré-requisitos em `main`:** só a fase 0.

**Possui (só edita):** `src/app/domain/**`.

**O que fazer**

1. **TypeScript puro:** sem Angular, sem I/O, sem relógio (o tempo entra por parâmetro).
2. Implementa `PHASES`, `statusPresentation`, `HALT_REASONS` e `explainHalt`, `MODEL_SOURCE_LABELS`, `outcomePresentation`,
   `CREW`, as funções de AIU (`formatAiu`, `parseAiu` **sem floats**, `remainingNano`, `budgetPercent`), as de tempo,
   `actorLabel`, `reviewersConflict`, `shortSha` e `formatTokens`.
3. **Copia os textos de `docs/design/design-system/vocabulary.md` sem os reescrever.**
4. Instala `diff` (aprovado) e escreve `src/app/domain/text-diff.ts` (`diffLines`, `hunks`, `changedBlocks`). É a única
   implementação de diff do projeto.
5. Até a lane 2A estar em `main`, define localmente o mínimo dos tipos da API e regista-o em "Needs from lane 2A" no
   `docs/progress.md`.
6. **Dependência aprovada para esta lane:** `diff`. Mais nenhuma.

**Pronto quando:** testes de tabela para cada função; `parseAiu`/`formatAiu` fazem ida e volta sem erro de float
(0.1, 12.4, 24.06, 30, 0.000000001); `check-boundaries` confirma que `domain/` não importa Angular. Critérios completos na
lane 2C do ficheiro da fase.

---

## Secção D · Lane 6D · Release: imagem, configuração e CSP (opcional)

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-6-hardening-release.md](plan/phase-6-hardening-release.md), lane 6D.
Só precisa da fase 0, por isso podes lançá-la agora ou mais tarde.

**Pré-requisitos em `main`:** só a fase 0.

**Possui (só edita):** `Dockerfile`, `nginx.conf`, `.dockerignore`, `docs/deploy.md`, o job de imagem em
`.github/workflows/ci.yml` (só acrescentar) e o `src/environments/environment.ts` de produção.

**O que fazer**

1. `Dockerfile` multi-estágio (Node 24 compila, nginx não privilegiado serve), `nginx.conf` com _fallback_ de SPA e cache
   correta, configuração em runtime por `/config.json`, e `docs/deploy.md`.
2. **O Google Fonts foi aceite:** o CSP tem de o permitir (`fonts.googleapis.com` em `style-src` e `fonts.gstatic.com` em
   `font-src`). Não há self-host.
3. Build de produção sem `_kit` nem `mock-backend`, verificado por um script que procura os nomes em `dist/`.
4. **Não publiques imagens, não toques no chart nem no cluster.** Se a sessão não tiver Docker, escreve os ficheiros e diz no
   relatório que **não** construíste a imagem.
5. **Não instalas dependências novas.**

**Pronto quando:** os ficheiros estão escritos e documentados; se houver Docker, `docker build` compila e o contentor serve o
fallback de SPA. Critérios completos na lane 6D do ficheiro da fase.

---

## Depois desta onda

Funde cada lane em `main` quando a tiveres revisto e aprovado. O que desbloqueias:

| Já está em `main` | Podes abrir em [paralelos2.md](paralelos2.md)                                       |
| ----------------- | ----------------------------------------------------------------------------------- |
| A (1A) e C (2C)   | secções A e B (lanes 1B e 1C)                                                       |
| B (2A) e C (2C)   | secção C (lane 2B); a secção D (lane 2D) só com a 2A **terminada** (ver paralelos2) |
| A, B e C          | as quatro                                                                           |
