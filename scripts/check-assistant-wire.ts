// The Assistant's wire contract exists twice (service and web app) and the copies must be identical (SIDE-14).
// Passes when the service copy doesn't exist yet.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const service = 'services/invite/src/assistant/wire.ts';
const web = 'apps/web/src/matrix/assistantWire.ts';

if (!existsSync(join(root, service))) {
  console.log(`assistant wire: ${service} not there yet, skipped`);
} else if (readFileSync(join(root, service), 'utf8') !== readFileSync(join(root, web), 'utf8')) {
  console.error(`assistant wire: ${service} and ${web} differ; keep the two copies identical`);
  process.exit(1);
} else {
  console.log('assistant wire: copies identical');
}
