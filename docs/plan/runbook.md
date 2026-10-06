# Runbook · o que lançar, quando, com que modelo

**Para executar, usa os ficheiros `docs/paralelos1.md` a `docs/paralelos5.md`.** Cada um é um grupo de lanes que correm ao
mesmo tempo, com uma secção por lane. Numa sessão nova, no repositório `ahoy-frontend` e na branch `main`, escreves só:

> Implementa a partir de docs/paralelos1.md a secção A

Este ficheiro é só o mapa. Detalhe de cada lane: o ficheiro da fase, a partir de [00-overview.md](00-overview.md).

**Estado em 2026-10-06:** a fase 0 está em `main` (PR #1). Falta tudo o resto.

## O mapa

| Ficheiro                       | Secção | Lane | O que é                                       | Modelo sugerido                  | Só abres quando está em `main`   |
| ------------------------------ | ------ | ---- | --------------------------------------------- | -------------------------------- | -------------------------------- |
| [paralelos1](../paralelos1.md) | A      | 1A   | Base do kit de design                         | Sonnet 5.5                       | fase 0 (feita)                   |
| [paralelos1](../paralelos1.md) | B      | 2A   | Cliente da API                                | Sonnet 5.5                       | fase 0 (feita)                   |
| [paralelos1](../paralelos1.md) | C      | 2C   | Domínio puro                                  | DeepSeek Flash 4.1 ou Sonnet 5.5 | fase 0 (feita)                   |
| [paralelos1](../paralelos1.md) | D      | 6D   | Release: imagem, config, CSP (opcional)       | Sonnet 5.5                       | fase 0 (feita)                   |
| [paralelos2](../paralelos2.md) | A      | 1B   | Kit: estado, progresso, navegação             | Sonnet 5.5                       | 1A + 2C                          |
| [paralelos2](../paralelos2.md) | B      | 1C   | Kit: diálogo, cartões, passos, diff, markdown | **Opus 5.5**                     | 1A + 2C                          |
| [paralelos2](../paralelos2.md) | C      | 2B   | Tempo real e stores                           | **Opus 5.5**                     | 2A + 2C                          |
| [paralelos2](../paralelos2.md) | D      | 2D   | Backend falso e `mock:api`                    | Sonnet 5.5                       | 2A + 2C                          |
| [paralelos3](../paralelos3.md) | A      | 3A   | Shell, All hands, Voyages                     | Sonnet 5.5                       | 1B + 2B + 2D                     |
| [paralelos3](../paralelos3.md) | B      | 3B   | Set sail                                      | Sonnet 5.5                       | 1A + 1C + 2D                     |
| [paralelos3](../paralelos3.md) | C      | 3C   | The Docks (planeado)                          | DeepSeek Flash 4.1 ou Sonnet 5.5 | 1B + 2B                          |
| [paralelos3](../paralelos3.md) | D      | 4A   | Base da viagem                                | **Opus 5.5**                     | 1B + 1C + 2B + 2D                |
| [paralelos4](../paralelos4.md) | A      | 4B   | Plan review e decisão                         | Sonnet 5.5                       | 4A (+ 1C, 2C)                    |
| [paralelos4](../paralelos4.md) | B      | 4C   | Questions                                     | Sonnet 5.5                       | 4A                               |
| [paralelos4](../paralelos4.md) | C      | 4D   | Models                                        | Sonnet 5.5                       | 4A                               |
| [paralelos4](../paralelos4.md) | D      | 5A   | Runs, run detail, passos em direto            | Sonnet 5.5                       | 4A (+ 2B)                        |
| [paralelos4](../paralelos4.md) | E      | 5B   | Gates e ship's log                            | DeepSeek Flash 4.1 ou Sonnet 5.5 | 4A (+ 2B)                        |
| [paralelos4](../paralelos4.md) | F      | 5C   | Artifacts                                     | Sonnet 5.5                       | 4A (+ 1C, 2C)                    |
| [paralelos5](../paralelos5.md) | A      | 6A   | Estados e acabamento                          | Sonnet 5.5                       | todas as das ondas 3 e 4         |
| [paralelos5](../paralelos5.md) | B      | 6B   | Acessibilidade e performance                  | Sonnet 5.5                       | todas as das ondas 3 e 4         |
| [paralelos5](../paralelos5.md) | C      | 6C   | e2e (mock; `--simulate` só o utilizador)      | Sonnet 5.5                       | 2D + ecrãs das ondas 3 e 4       |
| —                              | —      | 7    | Fases de entrega                              | —                                | **bloqueada: faltam wireframes** |

Dentro de um mesmo ficheiro, as secções correm todas ao mesmo tempo. **Cada secção abre-se quando as lanes da última coluna
estiverem fundidas em `main`**; cada secção começa por verificar isso e pára se faltar alguma coisa.

## Os modelos

O critério é o custo de um erro: onde um erro se propaga a todas as lanes seguintes, ou é de segurança ou de concorrência,
Opus 5.5; onde a tarefa é mecânica, está inteiramente especificada e tem testes que a provam, o mais barato. **Não conheço o
DeepSeek Flash 4.1:** é uma atribuição pela forma da tarefa. As lanes que lhe atribuí (2C, 3C, 5B) levam sempre a revisão
abaixo antes de integrar, e podes usar Sonnet 5.5 nelas. A 2C alimenta quatro lanes da Onda 2: revê-a com especial cuidado.

## Quando duas lanes mexem no mesmo ficheiro

- `package.json` e `package-lock.json`: duas lanes que instalam dependências (2A e 2C; 1C). Funde uma e, na outra, traz
  `main` e corre `npm install` para regenerar o lock.
- `docs/progress.md`: todas acrescentam a sua secção no mesmo sítio. Mantém as duas.
- Cada sessão traz `main` para a sua branch **antes** de abrir o PR (já está nas regras comuns de cada ficheiro).

## Prompt de revisão

Para as lanes feitas pelo DeepSeek (2C, 3C, 5B) antes de integrar, e para qualquer outra se quiseres um segundo par de
olhos. Numa sessão nova (Sonnet 5.5 ou Opus 5.5), na branch da lane:

```
Revê a branch <nome-da-branch> contra main com a skill code-review. Critérios: o CLAUDE.md e os critérios de aceitação da lane <ID> em docs/plan/<ficheiro-da-fase>.md. Corre `npm run build && npm run typecheck && npm run lint && npm test && npm run format:check` e confirma que o resultado bate com o que o relatório da lane em docs/progress.md afirma. Não alteres código: lista os problemas por gravidade, com ficheiro e linha, e diz se a lane está pronta para integrar.
```
