import { writeFile } from 'node:fs/promises';
import { demoData, recordContact } from '../domain.js';
const quotes = demoData('2026-09-16');
quotes[0] = recordContact({ ...quotes[0], saved_draft: 'Fictional restored draft: thanks for reviewing the colors.' }, { date: '2026-09-16', nextDate: '2026-09-20', channel: 'Phone', note: 'Fictional backup round-trip test' }, '2026-09-16');
await writeFile(new URL('./backup-fixture.json', import.meta.url), JSON.stringify({ version: 1, quotes }, null, 2));
