# Fase 1 · Design system em Angular

Três lanes. **1A** (Onda 1) cria a base; **1B** e **1C** (Onda 2) correm em paralelo depois de a 1A estar integrada e de a
2C expor `@domain`. Contexto geral em [00-overview.md](00-overview.md).

Fonte: `docs/design/design-system/` (README, vocabulary, tokens, 22 previews, `bundle.css`). O DS é feito de **classes CSS
`ah-*` sem JavaScript**; esta fase embrulha-as em componentes e diretivas Angular finos, para o markup viver num só sítio.

## Regras comuns a todas as lanes da fase

1. Standalone, `ChangeDetectionStrategy.OnPush`, `input()`/`output()`/`model()`, selector `ah-*` (componentes) ou `ah*`
   (diretivas de atributo, p. ex. `ahButton`).
2. O markup é o **do README do componente**, com as mesmas classes. Sem estilos inline; CSS novo só em `src/styles/` e só
   se o `bundle.css` não cobrir, com comentário a dizer porquê. **Não editar `ahoy-bundle.css`** (é uma cópia a re-sincronizar).
3. A11y como o DS exige: `<button>`/`<a href>`/`<input>` reais, rótulos, `aria-*` do README, foco visível (já vem do
   `bundle.css`), botões só com ícone com `aria-label`. O estado nunca se diz só por cor.
4. `ui/` **não** importa `core/api`, `core/stores` nem `features/`. Recebe dados por inputs (view models simples) e emite
   eventos. Os mapeamentos de vocabulário vêm de `@domain` (lane 2C), nunca duplicados aqui.
5. Cada componente tem `*.spec.ts` (Vitest + TestBed) que prova: classes por input, atributos de a11y, teclado onde aplicável.
6. Cada componente tem uma entrada na galeria `/_kit`, com todas as variantes, em tema claro e escuro. Cada lane acrescenta
   o seu ficheiro em `src/app/ui/_kit/sections/<lane>-*.ts`, sem tocar nos das outras.
7. Comparar com `docs/design/design-system/components/<Nome>/preview.html` e com o quadro do wireframe onde o componente
   aparece. Tema escuro verificado: o DS diz "check both".
8. Nada de `any`, nada de `innerHTML` com texto de API. Textos de utilizador por projeção de conteúdo ou interpolação.

---

## Lane 1A · Fundação do kit (M, Onda 1)

**Depende de:** P0. **Possui:** `scripts/build-tokens.mjs`, `src/styles/**`, `src/styles.scss`, `src/app/ui/icon/**`,
`src/app/ui/logo/**`, `src/app/ui/button/**`, `src/app/ui/panel/**`, `src/app/ui/field/**`, `src/app/ui/banner/**`,
`src/app/ui/table/**`, `src/app/ui/tags/**`, `src/app/ui/_kit/**` (esqueleto da galeria).

**Entregáveis**

1. **`scripts/build-tokens.mjs`** → `src/styles/tokens.css` a partir de `docs/design/design-system/tokens.json`
   (`npm run tokens`; `npm run tokens:check` falha se o ficheiro estiver desatualizado). Regras, deduzidas do `bundle.css`:
   - cada token de cor, espaçamento, raio, sombra e tamanho vira `--<nome>` (`--bg`, `--surface`, `--status-running-bg`,
     `--radius-md`, `--control-md`, `--badge-height`, `--avatar`…);
   - o `.` nos nomes escapa-se (`--space-1\.5`, porque o `bundle.css` usa `var(--space-1\.5)`);
   - `type.families.sans` e `.mono` → `--font-sans` e `--font-mono`;
   - claro em `:root, [data-theme="light"]`; escuro em `[data-theme="dark"]`; token sem valor escuro herda o claro;
   - `tokens:check` verifica também que **toda** a `var(--x)` usada em `ahoy-bundle.css` está definida (o `bundle.css`
     usa `--avatar` e `--badge-height`, que têm de existir).
2. **`src/styles.scss`** importa `tokens.css` e `ahoy-bundle.css` (cópia de `docs/design/.../components/bundle.css`, com
   cabeçalho a dizer a origem). `body` e `.ah` já vêm do bundle. O `@import` do Google Fonts do bundle **mantém-se**
   (aceite pelo utilizador, pergunta 4 do [§12](00-overview.md#12-perguntas-antes-de-lançar-a-onda-0-respondidas-em-2026-10-06)).
3. **`ThemeService`**: lê/escreve `data-theme` no `<html>` (claro por omissão), `localStorage` com `try/catch`. Sem botão
   na app; só a galeria o usa.
4. **`ah-icon`** com os **16** ícones da tabela de `assets/Icons/README.md` (wheel, bell, compass, anchor, sail, aground,
   send-back, lock, check, close, reset, tool, message, info, refresh, offline): SVG inline, `stroke="currentColor"`,
   tamanhos 16 (omissão), 12 e 18, `aria-hidden` por omissão; `label` input para ícone sozinho. Tipo `IconName` fechado.
5. **`ah-logo`** (marca + palavra "Ahoy", 17px/700) e favicon a partir de `ahoy-app-icon.svg`.
6. **Primitivas**, com o markup dos READMEs:
   - `ahButton` (diretiva em `button` e `a`): `variant` `default|primary|soft|ghost|danger|danger-outline`, `size`
     `sm|md|lg`. Mantém a semântica nativa.
   - `ah-panel` com secções `head/body/foot` (projeção); sem sombra; não aninhar.
   - `ah-field`: `label`, `required` (asterisco `ah-req`), `optional`, `hint`, `unit` (`ah-suffix`), `errorText`; liga
     `aria-invalid` e `aria-describedby` ao controlo projetado e mostra o primeiro erro do `NgControl`; ids únicos.
   - `ah-banner` `notice|error|info|cost` com título, ícone e linha técnica `ah-tech` opcional.
   - Helpers de tabela como diretivas: `ahTable`, `ahNowrap`, `ah-key` (chave Jira/run id/Qn em mono), `ah-api` (palavra da
     API, mono, apagada), `ah-cell-sub`; e `ah-source` (tag de origem, variante `--chosen`).
7. **Galeria `/_kit`** (lazy, só em dev) com alternador claro/escuro e as secções 1A.

**Aceitação**

- `npm run tokens:check` passa; alterar um valor em `tokens.json` sem regenerar faz falhar.
- Em `/_kit`, Button, Panel, Field e Banner coincidem com os `preview.html` do DS em claro e escuro.
- Testes: tabela variante/tamanho → classes do Button; Field com erro tem `aria-invalid` e `aria-describedby` válido;
  os 16 ícones existem e o tipo `IconName` é exaustivo.
- A app inteira (placeholders incluídos) já usa a fonte, as cores e o fundo do DS.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-1-design-system.md`. Implementa **só
a lane 1A**. Gera o `tokens.css` a partir do `tokens.json` e confirma que todas as `var(--…)` do `ahoy-bundle.css` estão
definidas. Não editas ficheiros de outras lanes. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 1B · Estado, progresso e navegação (M, Onda 2)

**Depende de:** 1A, 2C. **Possui:** `src/app/ui/{status-badge,phase-stepper,budget-meter,outcome-pill,filter-chips,section-tabs,top-bar,empty-state,skeleton,toast,pipes}/**`, `src/app/ui/_kit/sections/1b-*`.

**Entregáveis**

- **`ah-status-badge`** `[status] [phase] [showApi]`: etiqueta e classe vêm de `statusPresentation` (2C). Queued, Under way,
  Crew asks, Your orders, Anchored, Docked, Aground. Com `showApi`, acrescenta `ah-api` ("Your orders · awaiting_decision").
- **`ah-phase-stepper`** `[phase] [status] [stoppedAt] [compact]`: completo (`done` com ✓, `current` numerado, `stopped` com
  "!", restantes) e **compacto** (7 barras `ah-dots`, `is-done|is-current|is-stopped`, `aria-label` "Phase 3 of 7"). Para
  `blocked`, a posição vem de `stoppedAt` (G12); sem ela, mostra o estado final sem posição.
- **`ah-budget-meter`** `[spentNanoAiu] [capNanoAiu] [decimals] [width]`: `role="meter"` com `aria-valuemin/max/now`,
  números em `tabular-nums` ("12.4 / 30 AIU"), sem mudar de cor ao encher.
- **`ah-outcome-pill`** `[value]`: `pass`, `approve`, `branch`, `send_back`, `fail`, `error`, `reject`, `halt`, `waiting` e
  estados de run (`queued`, `running`, `succeeded`, `failed`, `lost`, …). Mostra **a palavra da API**, sem ponto; a classe
  vem de `outcomePresentation` (2C).
- **`ah-filter-chips`**: seleção única, `aria-pressed`, cada chip com badge, palavra da API e contagem; chip "All"; "In port"
  agrupa os terminais.
- **`ah-section-tabs`**: tabs por rota (`routerLink`, `aria-current="page"`), contagens, quebram linha em vez de rolar; variante
  `pill` (controlo segmentado, p. ex. All / Not started / In Ahoy; View / Compare).
- **`ah-top-bar`** `[needsYou] [live] [user]`: logo, navegação (All hands com `ah-count`, Voyages, The Docks com `ah-soon`),
  pesquisa (emite `query`), indicador Live (`live | reconnecting | offline`; quando cai mostra "Reconnecting to live
  updates…"), **Set sail** como único botão primário, avatar com iniciais e o e-mail no `title`. Quebra linha em ecrãs
  estreitos; nunca fixa.
- **`ah-empty-state`**, **`ah-skeleton`** (mantém a altura das linhas; `aria-busy="true"` no contentor), **Toast**:
  `ToastService.show(text)` + `ah-toast-host` (`role="status"`, ~5 s, nunca com ação).
- **Pipes** `ahAiu` (casas decimais), `ahRelative`, `ahDateTime`, `ahActor` (`ahoy-reconciler` → "Ahoy"), todos finos sobre
  `@domain`, com um token `CLOCK` para o "agora".

**Aceitação**

- Teste exaustivo: cada combinação estado/fase → etiqueta e classe do `vocabulary.md`; stepper com 1 só `current`; compacto
  com 7 barras.
- Meter com 0, 41 e 100 %; `aria-valuenow` em AIU.
- Top bar: tab atual com `aria-current`; `live` alterna entre o ponto verde com a palavra "Live" e o pill "Reconnecting…".
- Galeria: todas as variantes em claro e escuro; coincide com `preview.html` de StatusBadge, PhaseStepper, BudgetMeter,
  OutcomePill, FilterChips, SectionTabs, TopBar, EmptyState, Skeleton e Toast.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-1-design-system.md`. Implementa **só
a lane 1B**, usando `@domain` para todos os mapeamentos (não dupliques o vocabulário). Só editas os teus diretórios. Sem
commit nem push. Relatório em `docs/progress.md`."

---

## Lane 1C · Interação e conteúdo (L, Onda 2)

**Depende de:** 1A, 2C. **Possui:** `src/app/ui/{dialog,choice-card,question-card,model-choice,live-steps,ships-log,artifact-diff,markdown}/**`, `src/app/ui/_kit/sections/1c-*`.

**Entregáveis**

- **`ah-dialog`** sobre o `Dialog` do CDK: casca com ícone por tipo (`default | danger | sendback`), título, corpo, caixa de
  custo `ah-cost` (slot), rodapé com **Cancelar + um botão de confirmação** (variante `danger` para destrutivos),
  `busy` (desativa e mostra progresso), região de erro (Banner). Esc e Cancelar fecham sem alterar; o foco começa no primeiro
  campo; devolve o resultado. Sem lógica de negócio: cada diálogo concreto é de outra lane.
- **`ah-choice-card-group`**: cartões de rádio como `ControlValueAccessor`; cada opção tem título e consequência
  (`ah-choice__desc`); o selecionado leva o anel de acento; navegação por setas.
- **`ah-question-card`**: estados **open** (anel `status-input`), **answered** (resposta, quem e quando, cadeado "Final") e
  **disabled**; recomendação do agente com **"Use recommendation"** (emite `useRecommendation`; nunca envia); textarea e botão
  "Send answer" com a dica "Answers are final once sent". Presentacional: o pai dá o `FormControl`.
- **`ah-model-choice-table`** / **`ah-model-choice-row`**: por slot, modelo (input mono com placeholder do default) e esforço
  (`select`: Default, low, medium, high, xhigh, max), tag de origem (`ah-source`), botão **reset** com `aria-label`; erro por
  linha, e o erro "The two Lookouts must use different models" mostra-se **nas duas** linhas dos revisores.
- **`ah-live-steps`** (`role="log"`): linhas `tool` e `message` (hora, ícone, nome da tool em `ah-steps__tool`, resumo),
  **linhas de intervalo** "38 steps not shown", `[REDACTED]` envolvido em `ah-redacted` **por interpolação** (sem
  `innerHTML`). Só faz scroll automático se o utilizador já estiver no fim. Rodapé: "Newest at the bottom… This is a view, not
  a control".
- **`ah-ships-log`**: entradas `{at, title, details, actor, kind}` com ponto `human | pass | wait | system`, ligação ao run.
- **`ah-artifact-diff`**: hunks com `@@ Secção @@`, linhas com **+/−** (a mudança nunca depende só da cor); diretiva/classe
  `ah-mark` para realçar texto alterado.
- **`ah-markdown`** + função pura **`renderMarkdown(src, { changedBlocks })`**: `marked` → HTML → `[innerHTML]` (sanitizado
  pelo Angular). Tipografia `reading` (13.5/22, ~75 caracteres por linha), tabelas, código, listas; HTML cru escapado;
  imagens desligadas; ligações com `target="_blank" rel="noopener noreferrer"` e só `http(s)`/`mailto`. `changedBlocks` marca
  blocos de topo com `ah-mark` (usado pela 4B).

**Aceitação**

- **Segurança do markdown:** testes com `<script>`, `<img onerror>`, `[x](javascript:alert(1))`, HTML embutido, imagem remota:
  nada executa nem carrega.
- Dialog: Esc fecha sem efeito; o foco volta ao elemento que abriu; o foco inicial é o primeiro campo; `busy` impede duplo clique.
- QuestionCard: "Use recommendation" preenche mas não emite `submit`; resposta final não é editável.
- ModelChoice: erro de revisores iguais aparece nas duas linhas; reset emite `null`.
- LiveSteps: `[REDACTED]` realçado sem `innerHTML`; linha de intervalo; scroll não é sequestrado quando o utilizador subiu.
- Galeria em claro e escuro, comparada com `preview.html` de Dialog, ChoiceCard, QuestionCard, ModelChoice, LiveSteps,
  ShipsLog e ArtifactDiff.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-1-design-system.md`. Implementa **só
a lane 1C**. `@angular/cdk` e `marked` já estão aprovados (§10): fixa a versão exata de `npm view`. O markdown vem de agentes: é
não fiável, e os testes de XSS são parte da lane. Só editas os teus diretórios. Sem commit nem push. Relatório em
`docs/progress.md`."
