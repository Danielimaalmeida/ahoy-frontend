# Fase 7 · Fases de entrega (esboço, bloqueada por wireframes)

**Não lançar antes de existirem wireframes.** O brief diz que, depois de `plan_review`, as fases "precisam só de aparecer no
indicador de fases, sem ecrãs dedicados"; a API, porém, já suporta tudo o que vem a seguir e **uma story simulada chega a
`done` pela API** (`docs/strategy.md` §2.1). Até haver desenho, o front-end mostra o stepper, o estado e as ações genéricas
(Stop, Budget, Models, Resume) e o painel de decisão genérico da 4B para `delivery_accepted`. Contexto geral em
[00-overview.md](00-overview.md).

## 7.0 Antes de qualquer código: pedir o desenho

Pedir ao Claude Design (mesmo design system "Ahoy", mesmo canvas) quadros para:

1. **Implementation:** work packages por repositório, estado de cada um, rondas de rework, ligações para os pull requests e o
   estado do CI; relatórios do implementer (`implementation.reported`).
2. **PR review:** as duas Lookouts (`design-fit`, `defect-failure`), veredictos, findings, o gate de consenso e a ronda de rework.
3. **Delivery gate:** resumo do que foi entregue (PRs, revisões, gates) e a decisão `delivery_accepted` (approve, send back,
   reject). "Nothing is ever merged by Ahoy."
4. **Intervenções** em halt: resolver o consenso (rework ou override), retry/accept de um work package, reabrir trabalho,
   desbloquear uma story `blocked`.

Dados de exemplo fictícios, como nos quadros atuais. Atualizar `ahoy-hosted/docs/ui-design-brief.md` se o desenho mudar o contrato.

## Dados e operações que já existem (sem wireframe)

| Necessidade                      | API                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Estado detalhado                 | `getStoryState`: `work_packages`, `child_repos`, `lookout_reviews`, `human_gates`, `gate_results`, `decision_log` |
| Relatórios dos agentes           | eventos `implementation.reported`, `review.reported` (o relatório completo está no evento)                        |
| Decidir a entrega                | `decideHumanGate` com `gate: "delivery_accepted"`                                                                 |
| Resolver um halt de consenso     | `resolveConsensus` (`rework` com `packages` opcionais, ou `override`; só em halt de consenso numa fase de review) |
| Retry ou aceitar um work package | `decideWorkPackage` (`retry`/`accept`; só em halt na implementação)                                               |
| Reabrir trabalho entregue        | `reopenWork` (`packages` ou `repos`, com `note`; sem ronda cobrada)                                               |
| Desbloquear uma story `blocked`  | `unblockStory` (`rounds` 1 a 10, `repos`; **não** serve para rejeição humana)                                     |

Eventos desta fase: `consensus.resolved`, `work_package.decided`, `work.reopened`, `story.unblocked`,
`implementation.reported`, `review.reported`, `story.routed`. As formas dos payloads **não foram verificadas** (ver 5B).

## Lanes propostas (a detalhar quando houver wireframes)

| Lane | Conteúdo                                                                                                           | Depende de     |
| ---- | ------------------------------------------------------------------------------------------------------------------ | -------------- |
| 7A   | Leitores e tipos de domínio para `state` (work packages, repos, reviews) + extensão do mock (2D)                   | wireframes, 2D |
| 7B   | Tab **Implementation**: packages, repos, PRs, CI, reworks                                                          | 7A, 4A         |
| 7C   | Tab **Review** e resolução de consenso (diálogo `resolveConsensus`)                                                | 7A, 4A         |
| 7D   | Painel de decisão de entrega (`delivery_accepted`) e diálogos de `decideWorkPackage`, `reopenWork`, `unblockStory` | 7A, 4A, 4B     |

Cada comando que pode gastar AIU (rework, retry, reopen, unblock, resume) leva a **caixa de custo** do DS ("up to X AIU",
quem paga, "anyone can stop it"), como Resume. Todos usam o `CommandRunner` e o tratamento de conflitos da 4A.

## Perguntas em aberto

- Quanto detalhe do `state` se mostra, e se os relatórios dos agentes aparecem inline ou numa vista própria.
- O que a UI mostra para uma story `blocked` por rejeição humana (não pode ser desbloqueada): o texto exato.
- Se o gate de entrega deve ter um diálogo de confirmação para **approve** (no plano não tem).
