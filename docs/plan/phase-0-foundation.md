# Fase 0 · Fundação

**Onda 0 · 1 agente · bloqueia todas as outras lanes.** Contexto geral em [00-overview.md](00-overview.md).

Resultado: um repositório Angular 22 que compila, testa e arranca; com as convenções do CLAUDE.md impostas por ferramentas,
o proxy para a API, todas as rotas como placeholders, as referências de design copiadas e os docs adaptados. Nenhum ecrã
real.

## Pré-requisitos

- Perguntas do [§12](00-overview.md#12-perguntas-antes-de-lançar-a-onda-0-respondidas-em-2026-10-06) **respondidas**: Vitest, imports
  `bundler`, dependências do §10 aprovadas, uma branch por lane.
- **Node `^22.22.3`, `^24.15.0` ou `>=26`.** O ambiente cloud de hoje tem 22.22.0, que o Angular 22 recusa. O Node 24 obtém-se
  com `npx node@24` (verificado: v24.21.0); se a sessão ainda não o tiver como `node`, usá-lo por esse caminho e dizer no
  relatório que o _setup script_ do ambiente precisa de o instalar. Se não for possível de nenhuma forma, parar e dizê-lo.

## Possui

Tudo o que não existe ainda: `package.json`, `angular.json`, `tsconfig*.json`, `proxy.conf.mjs`, `eslint.config.*`,
`.prettier*`, `.husky/`, `.github/workflows/ci.yml`, `scripts/`, `src/` (esqueleto), `docs/design/`, `docs/architecture.md`,
`docs/progress.md`, `README.md`. Preservar `CLAUDE.md`, `.claude/` e `.git/`.

## Tarefas

**0.1 Pré-voo.** `node -v`; criar `.nvmrc` com `24`; `engines.node` igual ao do Angular 22; confirmar `npm view @angular/core
version` (esperado 22.2.x).

**0.2 Scaffold.** Gerar com `npx @angular/cli@22 new` **numa pasta temporária** (o repo já tem `CLAUDE.md`, `README.md`,
`.claude/`) e mover para a raiz. Confirmar as flags com `ng new --help` (22.x): standalone, routing, `--style=scss`, sem SSR,
sem git, npm, **zoneless**, runner de testes **Vitest**. Prefixo de componentes `ah`. `package.json`: nome `ahoy-frontend`,
`private`; **dependências de runtime em versão exata**, devDependencies com `^`.

**0.3 TypeScript.** No `tsconfig.json` de base ligar `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, e em `angularCompilerOptions`
`strictTemplates`, `strictInjectionParameters`, `strictInputAccessModifiers`. **Se uma flag colidir com tipos do Angular,
parar e perguntar; não enfraquecer.** Aliases: `@domain/*`, `@core/*`, `@ui/*`, `@features/*`, `@testing/*`.

**0.4 Ferramentas.**

- Prettier com a config do hosted (`printWidth 120`, aspas duplas, `trailingComma: all`, `proseWrap: preserve`);
  `.prettierignore` com `docs/design/`, `src/app/core/api/schema.d.ts`, `src/styles/tokens.css`, `dist/`, `.angular/`.
- ESLint (`angular-eslint` + `typescript-eslint`): `no-explicit-any`, `ban-ts-comment`, `consistent-type-imports`,
  proibir `enum` e `namespace` (`no-restricted-syntax`), `no-default-export` (exceto ficheiros de configuração),
  `@angular-eslint/prefer-on-push-component-change-detection`, regras de template de a11y do `angular-eslint`.
- Husky + `lint-staged` (`prettier --write --ignore-unknown`), como no hosted.

**0.5 Scripts do `package.json`:** `start` (`ng serve` com o proxy), `start:mock` (configuração `mock`, vazia até à 2D),
`build`, `test`, `lint`, `typecheck` (`tsc --noEmit` para app e specs **e** `node scripts/check-boundaries.mjs`),
`check:boundaries`, `format`, `format:check`.

**0.6 Proxy do dev server** (`proxy.conf.mjs`):

- `/api/v1` → `AHOY_API_TARGET` (omissão `http://127.0.0.1:8080`), `secure: false`, `changeOrigin: true`.
- Acrescenta o header `X-Ahoy-Actor` com `AHOY_ACTOR` (omissão `dev@example.com`). **A app não envia `Authorization`.**
- Verificação (só se houver API local: `cd ../ahoy-hosted && npm run dev -- --simulate`):
  `curl -s localhost:4200/api/v1/health` e **`curl -N localhost:4200/api/v1/events/stream`** (tem de ficar aberto e entregar
  eventos sem buffering). Se não houver API, registar "não corri" em `docs/progress.md`.
- Documentar: `AHOY_AUTH=dev` é só local; o proxy nunca vai para produção.

**0.7 Esqueleto.**

- Pastas do [§5.1](00-overview.md#51-camadas-e-pastas) com um ficheiro `.gitkeep` ou o primeiro ficheiro útil.
- `scripts/check-boundaries.mjs` com as regras do [§5.2](00-overview.md#52-fronteiras-impostas-por-scriptscheck-boundariesmjs-parte-de-npm-run-typecheck)
  (mesmo estilo do `check-boundaries.mjs` do hosted: sem dependências, lê os imports, erra com mensagem por violação).
  Testar com um import proibido de propósito.
- Rotas do [§5.3](00-overview.md#53-rotas) **todas criadas**, lazy, cada uma com um componente placeholder
  (`Not built yet · lane 3A`) e `<title>` próprio. `app.routes.ts` com uma linha `loadChildren` por feature.
- `app.config.ts`: `provideRouter(withComponentInputBinding())`, `provideHttpClient(withFetch())`, tokens `API_BASE`
  (`/api/v1`) e `FETCH`, `provideAppInitializer` para o `AppConfig` (a 2A preenche).
- `index.html`: `<title>Ahoy</title>`, `lang="en"`, `<app-root class="ah">`. Fontes e ícone ficam para a 1A.

**0.8 CI.** `.github/workflows/ci.yml`: Node 24, `npm ci`, `format:check`, `lint`, `typecheck`, `build`, `test`. Só valida;
não publica. (Ver `ahoy-hosted/.github/workflows/tests.yml` para o estilo.)

**0.9 Referências de design em `docs/design/`** (excluídas de lint, format, tsc e build):

```
docs/design/SOURCES.md              URLs, versões, data do snapshot, como voltar a sincronizar
docs/design/wireframes/             Main, Voyages, Docks, SetSail, PlanReview, Questions, Running, Halted,
                                    Records, RunDetail, Dialogs, States (.dc.html) + canvas.json
docs/design/design-system/          README.md, vocabulary.md, tokens.json, design-system.json,
                                    components/<Nome>/{README.md,preview.html} (22), components/bundle.css,
                                    assets/Icons/*.svg (16), assets/Logos/*.svg (3)
```

Obter com `Artifact read` (`paths`) sobre os dois URLs do [§2](00-overview.md#2-fontes-de-verdade). Os SVG são _assets_:
os ids estão em `assetGroups` de `design-system.json` (`read` com o id em `path`). O `tokens.css` **não** existe nos
artefactos (é gerado pela página do DS): a 1A gera-o. Os dados dos wireframes são fictícios (PROJ-123, alex@example.com).

**0.10 Documentação.**

- Propor o texto adaptado do `CLAUDE.md` (diff), **mostrar ao utilizador e só aplicar com aprovação** ([§4](00-overview.md#4-claudemd-do-frontend)).
- `docs/architecture.md`: F1–F16 já decididas, com a resolução do que a 0.2 e a 0.3 confirmaram.
- `docs/progress.md`: cabeçalho (data, estado, o que correu e o que não), "Where we are", "Start here next", "Prompt for a new
  session", uma secção por lane com o relatório e "Needs from lane X". É o documento de passagem entre agentes.
- `README.md`: layout, comandos, como correr contra o hosted (`cd ../ahoy-hosted && npm run dev -- --simulate`, depois
  `npm start` aqui), secção Status.

## Aceitação

- `npm ci && npm run build && npm run typecheck && npm run lint && npm test && npm run format:check` verde em Node 24.
- `npm start` serve uma shell vazia; cada rota do §5.3 mostra o seu placeholder; `/_kit` só existe em dev.
- `check-boundaries` falha quando um ficheiro de `ui/` importa de `core/api/` (provado com um import de teste, depois removido).
- Provar que as flags de TypeScript estão ativas: um ficheiro de teste com `any` ou com propriedade opcional mal usada falha
  o `typecheck`/`lint`, e é removido.
- O proxy foi verificado contra a API local **ou** `docs/progress.md` diz que não correu.
- Nenhum token nem `.env` no repo.

## Fora de âmbito

Qualquer componente do design system, qualquer chamada real à API, qualquer ecrã.

## Prompt

> Lê `CLAUDE.md`, `docs/plan/00-overview.md` e `docs/plan/phase-0-foundation.md`. Executa a fase 0 por inteiro e só ela.
> Confirma o Node antes de tudo. Não faças commit nem push. O texto novo do `CLAUDE.md` mostra-o ao utilizador em vez de o
> aplicar. Termina com `docs/progress.md` preenchido: o que correu, o que não correu (por exemplo o proxy sem API local),
> versões instaladas e a lista de dependências com a aprovação que as cobre.
