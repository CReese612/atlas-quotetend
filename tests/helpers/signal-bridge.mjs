// Test-only preload for tests/server-shutdown.test.mjs on Windows, which has no POSIX signals: child.kill('SIGTERM')
// ends a Windows child process immediately without running any handler. The test writes a signal name on stdin instead
// and this preload re-emits it on `process`, so the server's real SIGTERM/SIGINT listeners and its real process.exit()
// run. The application never loads this file; on Linux and macOS the tests send genuine OS signals.
import { createInterface } from 'node:readline';

createInterface({ input: process.stdin }).on('line', name => { if (name === 'SIGTERM' || name === 'SIGINT') process.emit(name, name); });
