# Fase 6 · Estados, qualidade, e2e e release

Quatro lanes na Onda 5. **6A, 6B e 6C** correm depois de as fases 3 a 5 estarem integradas (podem começar a escrever testes à
medida que os ecrãs chegam). **6D** só depende da fase 0 e pode começar já na Onda 2. Contexto geral em
[00-overview.md](00-overview.md).

Nesta fase, e só nesta, **as lanes podem editar ficheiros de qualquer feature** para aplicar padrões transversais (a posse por
diretório acabou: as lanes donas já integraram). Regras: um commit lógico por feature, **sem mudar comportamento além do
que a lane pede**, e `docs/progress.md` diz o que se tocou.

---

## Lane 6A · Estados e acabamento (M)

**Depende de:** fases 3 a 5. **Possui:** `src/app/ui/error-state/**`, `src/app/ui/skip-link/**`, e os retoques transversais.

Fonte: quadro `States` (empty, loading, error, conflict, "someone decided first", reconnecting, toast).

**Entregáveis**

1. **`ah-error-state`** (componente novo no kit): título "Lost contact with the harbour", explicação ("Ahoy couldn't load
   voyages. Nothing you did was lost, and no voyage stopped because of this."), botão **Try again**, e a linha
   `{status} · {code} · request {instance}` em `ah-hash`. Variantes de texto por origem (lista, viagem, run, artefacto).
   `invalid_response` diz "Ahoy sent something unexpected" e nunca parece um veredicto.
2. **Auditoria ecrã a ecrã** (tabela em `docs/progress.md`): cada ecrã e cada tab tem **loading** (skeleton com a altura real,
   `aria-busy`), **vazio** (texto próprio), **erro** (`ah-error-state`), **404**, e os conflitos de que se fala no
   [§5.5](00-overview.md#55-comandos-concorrência-e-erros--ux). Corrigir o que faltar.
3. **Indicador Live:** quando o stream cai, o pill "Reconnecting to live updates…" aparece na top bar e **o conteúdo continua
   visível**; ao recuperar, volta "Live" sem duplicar eventos.
4. **`401 unauthenticated`:** banner "Sign-in needed" (sem fluxo de login: a autorização é do utilizador; ver
   [§5.6](00-overview.md#56-aiu-tempo-e-identidade)).
5. **Acabamento:** `<title>` por rota (`PROJ-123 · Plan · Ahoy`); foco no `h1` depois de navegar; ligação **"Skip to content"**;
   `prefers-reduced-motion` (pulso `live`, transições); favicon a partir de `ahoy-app-icon.svg`; **sem scroll horizontal da
   página** em 390 px (tabelas rolam dentro de uma caixa); passagem completa em tema escuro.
6. **Cópia:** rever os textos de erro e de confirmação contra `README.md` do DS ("calm, specific, no blame, no exclamation
   marks"); botões no imperativo e em _sentence case_; AIU com 1 casa nas listas e 2 no run detail.

**Aceitação**

- A tabela de auditoria está completa, sem células vazias.
- No mock: `failNext=503` mostra `ah-error-state` em cada lista e em cada tab, e **Try again** recupera; `dropStream` mostra o
  pill e recupera sem eventos repetidos.
- 390 px, 768 px e 1440 px sem scroll horizontal da página, claro e escuro.
- Nenhuma cópia com "Oops", ponto de exclamação ou culpa.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-6-hardening-release.md`. Implementa **só a
lane 6A**. Podes editar qualquer feature para aplicar os padrões do quadro `States`, mas **não mudes comportamento** além disso
e regista o que tocaste. Começa pela tabela de auditoria. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 6B · Acessibilidade e performance (M)

**Depende de:** fases 3 a 5. **Possui:** `e2e/a11y/**`, `angular.json` (só `budgets`), `docs/quality.md`.

**Entregáveis**

- **Axe** (`@axe-core/playwright`) em **todas** as rotas do [§5.3](00-overview.md#53-rotas) no mock, em claro e escuro, com
  as 8 viagens semeadas; zero violações `serious` ou `critical`. As exceções conhecidas e documentadas no DS (`line-strong` sob
  3:1 nos controlos) ficam numa lista explícita em `docs/quality.md`, com a razão.
- **Teclado:** percurso sem rato para Set sail, responder a uma pergunta, decidir no plano (incluindo os diálogos: foco inicial,
  Esc, foco devolvido), filtrar a lista e abrir uma viagem. Estados de foco visíveis em tudo.
- **Leitores de ecrã:** `role="log"` dos passos, `role="status"` dos toasts, `role="meter"` dos medidores, `aria-current` das
  tabs, `aria-pressed` dos chips, `aria-live` educado para "Reconnecting…".
- **Performance:** medir primeiro, depois fixar. Registar em `docs/quality.md` o tamanho do bundle inicial e por rota (build de
  produção) e fixar `budgets` em `angular.json` com folga de cerca de 20 % sobre o medido. Garantir que `marked` e `diff` só
  carregam nas rotas que os usam (lazy). Verificar que o stream global não acumula memória (buffers com teto) numa sessão
  longa simulada.
- **Contraste:** confirmar os pares texto/fundo usados fora dos tokens do DS (se houver); preferir sempre os tokens.

**Aceitação**

- `npm run e2e:a11y` verde; `docs/quality.md` com as exceções, os tamanhos e os orçamentos.
- O build falha se um bundle passar o orçamento.
- Um relatório honesto do que **não** foi coberto (por exemplo, leitores de ecrã reais).

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-6-hardening-release.md`. Implementa **só a
lane 6B**. `@axe-core/playwright` e `@playwright/test` já estão aprovados (§10); o Chromium já está no sistema (usa o
`executablePath` do ambiente, não corras `playwright install`). Mede antes de fixar orçamentos. Sem commit nem push. Relatório
em `docs/progress.md`."

---

## Lane 6C · e2e: backend falso e `--simulate` (L)

**Depende de:** 2D e dos ecrãs das fases 3 a 5. **Possui:** `e2e/mock/**`, `e2e/sim/**`, `playwright.config.ts`.

**Duas suites, com regras diferentes:**

1. **`e2e/mock`** — contra `npm run start:mock`. Corre no CI e em sessões cloud. Percursos:
   1. **Set sail** com `PROJ-145`, orçamento 25, `planning` = `claude-sonnet-5`/`high` → vai para a viagem.
   2. **Responder** às perguntas de PROJ-131 (Use recommendation, enviar, toast, a viagem passa a Under way).
   3. **Plano:** send back com motivo (round 3 of 4) → run → plano novo → **approve**.
   4. **Halt:** PROJ-118 → Change planning model → Resume (caixa de custo "up to 10.2 AIU") → Under way.
   5. **Stop** de PROJ-140 com motivo; **Budget** a subir de 30 para 40.
   6. **Conflito:** `conflictNext` num send back → banner, texto mantido, reenvio com sucesso; e `decision_already_recorded`.
   7. **Em direto:** PROJ-140 recebe passos; "N steps not shown"; `[REDACTED]`; run termina e os passos ficam.
   8. **Artefactos:** comparar revisão 5 com 4 (hunks e estados dos ficheiros).
   9. **Filtros e URL:** chip Anchored → `?status=halted`; recarregar mantém.
   10. **Reconexão:** `dropStream` → pill "Reconnecting…" → recupera sem eventos repetidos (`Last-Event-ID`).
   11. **Docks:** "Set sail" a partir de uma linha abre o formulário com chave e título.
2. **`e2e/sim`** — contra o `ahoy-hosted` real a correr `npm run dev -- --simulate` (agentes simulados, **0 AIU**), através do
   proxy do dev server. **Precisa de Docker e Postgres: não corre em sessões cloud; é o utilizador que a lança** (`npm run e2e:sim`
   com `AHOY_API_TARGET`). Percurso: set sail com uma chave nova `DEMO-<aleatório>` e orçamento 30 → responder à pergunta
   (texto **"POC test answer, not a product decision"**) → aprovar o plano → acompanhar até `delivery_gate` → aprovar a entrega
   (com o painel de decisão genérico da 4B) → `done`. Opcional: `AHOY_STUB_SCENARIO` para ver CI vermelho, rework e halts.
   É o **primeiro teste do front-end real contra a API real** (risco R1).

**Regras**

- **Nunca** contra `--live` nem contra o TEST. Chaves sempre únicas por corrida. Nada de apagar nem repor bases de dados.
- Screenshots em `e2e/screenshots/` (ignorado pelo git) para comparar com os quadros do wireframe; não são ficheiros de teste.
- O relatório diz **qual suite correu**, com que backend e quantos testes passaram, falharam ou foram saltados. Se só correu o
  mock, diz que a integração real **não** foi provada.

**Aceitação**

- `npm run e2e:mock` verde (11 percursos). `npm run e2e:sim` escrito e **documentado**; só se diz "passou" se alguém o correu.
- A suite mock falha de verdade quando se quebra um comportamento (provar com uma mutação rápida, depois revertida).

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-6-hardening-release.md`. Implementa **só a
lane 6C**. Corre `e2e/mock` por inteiro. Escreve `e2e/sim`, mas **não o corras** (precisa de Docker e da API do `ahoy-hosted`);
diz isso no relatório. Nunca contra `--live` nem TEST. Respostas de teste levam 'POC test answer, not a product decision'. Sem
commit nem push. Relatório em `docs/progress.md`."

---

## Lane 6D · Release: imagem, configuração, CSP (S)

**Depende de:** P0 (pode começar na Onda 2). **Possui:** `Dockerfile`, `nginx.conf`, `.dockerignore`,
`docs/deploy.md`, `.github/workflows/ci.yml` (só acrescentar o job de imagem), `src/environments/environment.ts` de produção.

O TEST já tem o chart `fio-ahoy-frontend` e o Ingress que encaminha `/api/v1` para a API e `/` para o front-end (docs do
hosted, `deploy-plan.md`). **Esta lane entrega a imagem e a documentação; o chart e o deploy são do utilizador.**

**Entregáveis**

- **`Dockerfile`** multi-estágio: Node 24 compila (`npm ci`, `npm run build`), nginx não privilegiado serve `dist/`. Sem
  segredos na imagem.
- **`nginx.conf`:** _fallback_ de SPA (`try_files $uri /index.html`), `index.html` e `config.json` sem cache, ficheiros com hash
  imutáveis, gzip. **Não** faz proxy de `/api/v1` (é o Ingress); uma variante opcional só para `docker compose` local.
- **Configuração em runtime** (`/config.json`: `apiBase`, `actor`, `jiraBaseUrl`) montável por ConfigMap, para a mesma imagem
  servir vários ambientes. Documentar que `actor` é **só** para `AHOY_AUTH=dev` e que, com auth real, deixa de existir.
- **CSP** e cabeçalhos de segurança no nginx (`default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'`), **incluindo** `https://fonts.googleapis.com` em `style-src` e
  `https://fonts.gstatic.com` em `font-src`, porque o Google Fonts foi aceite (pergunta 4). O Angular pode inserir estilos inline
  no `index.html`: se o CSP os bloquear, resolver com `ngCspNonce`, não com `'unsafe-inline'` sem o registar. Testar com a app
  carregada: sem violações na consola.
- **Fontes:** **sem self-host** (decisão do utilizador). Se o TEST bloquear o Google, parar e reabrir a decisão em vez de
  acrescentar `@fontsource/*` por iniciativa própria (pediria nova aprovação).
- **Build de produção:** sem `_kit`, sem `mock-backend`, sem source maps públicos; verificado com um script que procura os
  nomes em `dist/`.
- **CI:** job que constrói a imagem (sem publicar).
- **`docs/deploy.md`:** variáveis, `config.json`, portas, healthcheck (`/` devolve 200), como o Ingress encaminha, o que muda
  quando entrar a autorização.

**Aceitação**

- `docker build` compila; o contentor serve a app e o fallback de SPA (`/voyages/PROJ-123/plan` direto devolve a app).
- `curl -I` mostra os cabeçalhos; consola sem violações de CSP com o mock ou contra uma API local.
- `dist/` sem rasto de `_kit` nem do mock. **Se não houver Docker na sessão, dizer que a imagem não foi construída.**

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-6-hardening-release.md`. Implementa **só a
lane 6D**. Não publiques imagens, não toques no chart nem no cluster. Se não houver Docker, escreve os ficheiros e diz que não
os construíste. Sem commit nem push. Relatório em `docs/progress.md`."
