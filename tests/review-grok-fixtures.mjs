import { readFile } from 'node:fs/promises';
import { previewImport, due, eligible } from '../domain.js';
const base = new URL('../Grok Bot Research & Product Testing/', import.meta.url);
const read = name => readFile(new URL(name, base), 'utf8');
const accepted = rows => rows.filter(r => !r.errors.length).map(r => r.quote);
const summary = rows => ({ ready: accepted(rows).length, skipped: rows.filter(r => r.errors.length).length, details: rows.filter(r => r.errors.length).map(r => ({ id: r.quote.estimate_id, errors: r.errors })) });
const valid = previewImport(await read('estimates-valid_GrokBot_2.csv'));
const seed = accepted(previewImport(await read('seed-existing_GrokBot_2.csv')));
const conflicts = previewImport(await read('estimates-conflicts_GrokBot_2.csv'), seed);
const after = [...seed, ...accepted(conflicts)];
console.log(JSON.stringify({ frozenDate: '2026-09-16', valid: summary(valid), dueIds: accepted(valid).filter(q => due(q, '2026-09-16')).map(q => q.estimate_id), invalid: summary(previewImport(await read('estimates-invalid_GrokBot_2.csv'))), seedCount: seed.length, conflicts: summary(conflicts), conflictAcceptedIds: accepted(conflicts).map(q => q.estimate_id), reimport: summary(previewImport(await read('estimates-valid_GrokBot_2.csv'), accepted(valid))), sharedEmailStillEligible: eligible(after.find(q => q.estimate_id === 'EST-S005'), after), firstPass: summary(previewImport(await read('estimates-test_GrokBot'))) }, null, 2));

