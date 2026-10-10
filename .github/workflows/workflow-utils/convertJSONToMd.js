import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  fs.readFileSync(
    path.resolve(directory, '../../../coverage/coverage-summary.json'),
    'utf8'
  )
);

const pctToColor = (pct, metric) => (pct > metric ? 'success' : 'critical');

const run = async () => {
  const coverageConfig = await import(
    path.resolve(directory, '../../../vitest.config.ts')
  );
  const coverageThreshold =
    coverageConfig.default?.test?.coverage?.thresholds?.global || {};

  const keys = Object.keys(data);
  const valuesForKeys = keys.reduce(
    (acc, key) => [
      ...acc,
      `| ${key.split('/').pop()} | ${data[key].lines.pct}% | ${data[key].functions.pct}% | ${data[key].statements.pct}% | ${data[key].branches.pct}% |`,
    ],
    []
  );

  let mdResult = `# Coverage Overview

  <img src="https://img.shields.io/badge/Line%20Coverage-${data.total.lines.pct}%25-${pctToColor(data.total.lines.pct, coverageThreshold.lines)}?style=flat" alt="Code Coverage" style="max-width: 100%;">
  <img src="https://img.shields.io/badge/Function%20Coverage-${data.total.functions.pct}%25-${pctToColor(data.total.functions.pct, coverageThreshold.functions)}?style=flat" alt="Code Coverage" style="max-width: 100%;">
  <img src="https://img.shields.io/badge/Statement%20Coverage-${data.total.statements.pct}%25-${pctToColor(data.total.statements.pct, coverageThreshold.statements)}?style=flat" alt="Code Coverage" style="max-width: 100%;">
  <img src="https://img.shields.io/badge/Branch%20Coverage-${data.total.branches.pct}%25-${pctToColor(data.total.branches.pct, coverageThreshold.branches)}?style=flat" alt="Code Coverage" style="max-width: 100%;">

  | module | lines           | functions    | statements           | branches    |
  | ---- | ------------- | --------------- | -------- | -------- |
  `;

  mdResult = mdResult.concat(valuesForKeys.join('\n'));

  fs.writeFileSync(
    path.resolve(directory, '../../../coverage/coverage-summary.md'),
    mdResult
  );
};

run();
