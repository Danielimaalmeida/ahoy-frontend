/**
 * The mock's `getStoryPlanFit`: the fixed rules of `packages/core/src/domain/harness-fit.ts` (`planFit`) of
 * `ahoy-hosted`, over the plan the simulated planner wrote. Only the rules the mock's plans can trigger are ported: CI
 * changes, waits across repositories and the size limits.
 */
import type { FitReason, PlanFit } from '@core/api/types';
import type { PlanContent } from './voyage';

const CI_CHANGE =
  /\.github\/|\bgithub actions\b|\bci\/cd\b|\bpipelines?\b|\bjenkins(?:file)?\b|\bworkflow (?:file|ya?ml)\b/iu;

const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const depsOf = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((d): d is string => typeof d === 'string')
    : [];

/** The plan's fit for the harness, or `null` before the planner wrote work packages. */
export function planFitOf(plan: PlanContent): PlanFit | null {
  if (plan.packages.length === 0) return null;
  const repoOf = new Map(
    plan.packages.map((p) => [textOf(p['id']), textOf(p['repo'])])
  );
  const repositories = new Set(repoOf.values()).size;
  const depth = (id: string, seen: ReadonlySet<string>): number => {
    if (seen.has(id)) return 0;
    const entry = plan.packages.find((p) => p['id'] === id);
    const deps = depsOf(entry?.['depends_on']).filter((d) => repoOf.has(d));
    return (
      1 + Math.max(0, ...deps.map((d) => depth(d, new Set([...seen, id]))))
    );
  };
  const longestChain = Math.max(
    ...plan.packages.map((p) => depth(textOf(p['id']), new Set()))
  );
  const poor: FitReason[] = [];
  const attention: FitReason[] = [];
  const ci = plan.criteria.filter((c) => CI_CHANGE.test(textOf(c['text'])));
  if (ci.length > 0)
    poor.push({
      code: 'ci_change',
      message: `Criteria ${ci.map((c) => textOf(c['id'])).join(', ')} need CI or pipeline changes, which the implementation workflow may not make; a person would have to make them in the pull request.`,
    });
  const waits = plan.packages.flatMap((p) => {
    const id = textOf(p['id']);
    const repo = textOf(p['repo']);
    return depsOf(p['depends_on'])
      .filter((d) => repoOf.has(d) && repoOf.get(d) !== repo)
      .map((d) => `${id} (${repo}) on ${d} (${repoOf.get(d) ?? ''})`);
  });
  if (waits.length > 0)
    attention.push({
      code: 'cross_repo_dependency',
      message: `Work waits across repositories: ${waits.join('; ')}. Packages run one at a time per story.`,
    });
  if (repositories > 2)
    attention.push({
      code: 'many_repositories',
      message: `The plan changes ${repositories} repositories (more than 2).`,
    });
  if (plan.packages.length > 6)
    attention.push({
      code: 'many_packages',
      message: `The plan has ${plan.packages.length} work packages (more than 6).`,
    });
  if (longestChain > 3)
    attention.push({
      code: 'long_chain',
      message: `${longestChain} work packages must run one after another (more than 3).`,
    });
  return {
    verdict:
      poor.length > 0 ? 'poor' : attention.length > 0 ? 'attention' : 'fits',
    reasons: [...poor, ...attention],
    repositories,
    packages: plan.packages.length,
    criteria: plan.criteria.length,
    longestChain,
  };
}
