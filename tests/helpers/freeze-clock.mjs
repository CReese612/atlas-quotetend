// Test-only preload: freezes the process clock at QUOTETEND_FROZEN_NOW (an ISO instant). It lets a real server process
// run at an exact moment, e.g. 22:30 in Oregon while Chicago and UTC are already tomorrow:
//   QUOTETEND_FROZEN_NOW=2026-10-14T05:30:00Z node --import ./tests/helpers/freeze-clock.mjs server.mjs
// Never loaded by the application.
const frozen = Date.parse(process.env.QUOTETEND_FROZEN_NOW || '');
if (!Number.isFinite(frozen)) throw new Error('QUOTETEND_FROZEN_NOW must be an ISO instant.');
const RealDate = Date;
class FrozenDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(frozen); else super(...args); }
  static now() { return frozen; }
}
globalThis.Date = FrozenDate;
