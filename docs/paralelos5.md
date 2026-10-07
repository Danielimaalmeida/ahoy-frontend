# Paralelos 5 · Onda 5

**Três sessões ao mesmo tempo, depois de as ondas 3 e 4 estarem fundidas em `main`.** Vem depois de
[paralelos4.md](paralelos4.md). Aqui as lanes **podem editar qualquer feature** para aplicar padrões transversais.

| Secção | Lane | O que é                                   | Modelo sugerido | Precisa de em `main`                          |
| ------ | ---- | ----------------------------------------- | --------------- | --------------------------------------------- |
| A      | 6A   | Estados e acabamento                      | Sonnet 5.5      | 3A, 3B, 3C, 4A, 4B, 4C, 4D, 5A, 5B e 5C todas |
| B      | 6B   | Acessibilidade e performance              | Sonnet 5.5      | as mesmas                                     |
| C      | 6C   | e2e contra o backend falso e `--simulate` | Sonnet 5.5      | 2D + os ecrãs das ondas 3 e 4                 |

A lane **6D** (release) está em [paralelos1.md](paralelos1.md), secção D. A **fase 7** está bloqueada: faltam wireframes para
Implementation, PR review, Delivery gate e as intervenções (ver `docs/plan/phase-7-delivery-phases.md`).

## Como usar este ficheiro

Numa sessão nova no repositório `ahoy-frontend`, na branch `main`, escreve só isto (com a letra da secção):

> Implementa a partir de docs/paralelos5.md a secção A

A sessão que receber isto **faz só essa secção**. As outras secções são de outras sessões que correm ao mesmo tempo.

## Regras comuns (valem para todas as secções)

1. **Lê, por esta ordem:** `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e o ficheiro da fase que a tua secção
   indica.
2. **Faz só a lane da tua secção.** Nesta onda podes editar qualquer feature para aplicar o padrão da tua lane, mas **não
   mudes comportamento além disso** e regista no relatório tudo o que tocaste.
3. **Node:** corre `node -v`. Se for inferior a 22.22.3, usa `npx -y node@24` e põe esse binário à frente do `PATH` em todos
   os comandos (ver "Node in cloud sessions" em `docs/progress.md`).
4. **Pré-voo, antes de escrever código:** confirma que os pré-requisitos da tua secção já estão em `main` (`git fetch origin`
   e vê os ficheiros indicados). **Se faltar algum, pára e diz-me qual.**
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

## Secção A · Lane 6A · Estados e acabamento

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-6-hardening-release.md](plan/phase-6-hardening-release.md), lane 6A.
**Quadro:** `States`.

**Pré-requisitos em `main` (verifica):** todas as lanes das fases 3, 4 e 5 (as rotas já não mostram placeholders, exceto
as de fases por construir).

**Possui:** `src/app/ui/error-state/**`, `src/app/ui/skip-link/**` e os retoques transversais em qualquer feature.

**O que fazer**

1. Começa pela **tabela de auditoria ecrã a ecrã** em `docs/progress.md`: cada ecrã e cada tab tem loading (skeleton com a
   altura real), vazio, erro, 404 e os conflitos. Corrige o que faltar.
2. Cria `ah-error-state` ("Lost contact with the harbour", explicação, **Try again**, e a linha `status · code · request id`);
   `invalid_response` diz "Ahoy sent something unexpected" e **nunca** parece um veredicto.
3. Indicador Live: quando o stream cai, o pill "Reconnecting…" aparece e o conteúdo continua visível. `401`: banner
   "Sign-in needed" (sem fluxo de login).
4. Acabamento: `<title>` por rota, foco no `h1` ao navegar, "Skip to content", `prefers-reduced-motion`, favicon, sem scroll
   horizontal da página a 390 px, passagem completa em tema escuro, e revisão da cópia (sem "Oops", sem pontos de exclamação).
5. **Não instalas dependências novas.**

**Pronto quando:** a tabela de auditoria está completa; no mock, `failNext=503` mostra o estado de erro em cada lista e tab e
**Try again** recupera; `dropStream` mostra o pill e recupera sem eventos repetidos; 390, 768 e 1440 px sem scroll horizontal,
claro e escuro. Critérios completos na lane 6A do ficheiro da fase.

---

## Secção B · Lane 6B · Acessibilidade e performance

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-6-hardening-release.md](plan/phase-6-hardening-release.md), lane 6B.

**Pré-requisitos em `main` (verifica):** os mesmos da secção A.

**Possui:** `e2e/a11y/**`, os `budgets` do `angular.json` e `docs/quality.md`.

**O que fazer**

1. **Dependências aprovadas para esta lane:** `@playwright/test` e `@axe-core/playwright`. **O Chromium já está no sistema:**
   usa o `executablePath` do ambiente e **não corras `playwright install`**.
2. Axe em **todas** as rotas, no mock, em claro e escuro, com as 8 viagens semeadas; zero violações `serious` ou `critical`.
   As exceções conhecidas (`line-strong` abaixo de 3:1) ficam numa lista explícita em `docs/quality.md`.
3. Percurso só com teclado (Set sail, responder a uma pergunta, decidir no plano com os diálogos, filtrar a lista).
4. **Mede antes de fixar:** regista os tamanhos do bundle inicial e por rota e fixa `budgets` com cerca de 20 % de folga;
   garante que `marked` e `diff` só carregam nas rotas que os usam.

**Pronto quando:** `npm run e2e:a11y` verde; `docs/quality.md` tem exceções, tamanhos e orçamentos; o build falha se um bundle
passar o orçamento; o relatório diz honestamente o que não foi coberto (por exemplo, leitores de ecrã reais). Critérios
completos na lane 6B do ficheiro da fase.

---

## Secção C · Lane 6C · e2e

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-6-hardening-release.md](plan/phase-6-hardening-release.md), lane 6C.

**Pré-requisitos em `main` (verifica):** **2D** (backend falso) e os ecrãs das ondas 3 e 4 (todos os de A a D de
`paralelos3.md` e A a F de `paralelos4.md` que o percurso use).

**Possui:** `e2e/mock/**`, `e2e/sim/**` e `playwright.config.ts`.

**O que fazer**

1. **Dependência aprovada para esta lane:** `@playwright/test`. **O Chromium já está no sistema:** usa o `executablePath` do
   ambiente e **não corras `playwright install`**.
2. **`e2e/mock`** contra `npm run start:mock`, com os 11 percursos da lane 6C: set sail, responder, send back e approve,
   halt e resume, stop e budget, conflitos, em direto, artefactos, filtros e URL, reconexão, e Docks. **Corre-a por inteiro.**
3. **`e2e/sim`** contra o `ahoy-hosted` real a correr `npm run dev -- --simulate` (0 AIU). **Escreve-a mas NÃO a corras:**
   precisa de Docker e da API do `ahoy-hosted`. Diz isso no relatório. Quem a corre sou eu, na minha máquina.
4. **Nunca** contra `--live` nem contra o TEST. Chaves sempre únicas por corrida. Respostas de teste levam "POC test answer,
   not a product decision".
5. O relatório diz **qual suite correu**, com que backend e quantos testes passaram, falharam ou foram saltados. Se só correu
   o mock, diz que a integração real **não** foi provada.

**Pronto quando:** `npm run e2e:mock` verde (11 percursos); `e2e/sim` escrito e documentado, sem afirmar que passou; a suite
mock falha de verdade quando se quebra um comportamento (provado com uma mutação rápida, depois revertida). Critérios
completos na lane 6C do ficheiro da fase.

---

## Depois desta onda

Funde cada lane em `main` quando a tiveres revisto e aprovado. O que fica:

- **Correr tu `e2e/sim`** na tua máquina (Docker + `ahoy-hosted` com `npm run dev -- --simulate`). É o primeiro teste do
  front-end real contra a API real.
- **Fase 7 (fases de entrega):** bloqueada até haver wireframes.
