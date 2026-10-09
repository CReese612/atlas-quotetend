// Guided walkthrough content for screen-shared sales conversations or self-guided visitors.
// Copy is computed from the live demo records so numbers always match what is on screen.
import { COMPANY, metrics, pipelineByState, resultsForRange, followupState, daysBetween } from './workspace.js';
import { money, esc, icon, ago, plural } from './components.js';

export const FOCUS_ID = 'FR-2318';

const tourTools = (minimized, dis) => `<div class="qt-tour__tools"><button class="qt-icon-btn" type="button" data-tour-act="minimize" aria-expanded="${!minimized}" aria-label="${minimized ? 'Expand' : 'Minimize'} guided tour" ${dis}>${icon(minimized ? 'chevronUp' : 'chevronDown')}</button><button class="qt-icon-btn" type="button" data-tour-act="exit" aria-label="Exit guided tour" ${dis}>${icon('x')}</button></div>`;
const tourProgress = (index, total) => `<div class="qt-tour__progress" role="progressbar" aria-label="Tour progress" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${index + 1}" aria-valuetext="Step ${index + 1} of ${total}"><span style="width:${Math.round((index + 1) / total * 100)}%"></span></div>`;
const tourNav = (index, total, dis) => `<div class="qt-tour__nav"><button class="qt-btn qt-btn--ghost" type="button" data-tour-act="back" ${index === 0 ? 'disabled' : ''} ${dis}>${icon('arrowLeft')}Back</button><ol class="qt-tour__dots" aria-label="Tour steps">${STEPS.map((s, i) => `<li><button type="button" class="${i === index ? 'is-current' : i < index ? 'is-done' : ''}" data-tour-go="${i}" aria-label="Step ${i + 1}: ${esc(s.title)}" ${i === index ? 'aria-current="step"' : ''} ${dis}></button></li>`).join('')}</ol><button class="qt-btn qt-btn--primary" type="button" data-tour-act="next" ${dis}>${index === total - 1 ? 'Finish' : 'Next'}${icon('arrowRight')}</button></div>`;

export function tourContext(state, today, flags = {}) {
  const m = metrics(state.quotes, today);
  const byState = pipelineByState(state.quotes, today);
  const range = flags.range || 30;
  const r = resultsForRange(state, range, today);
  const q = state.quotes.find(x => x.estimate_id === FOCUS_ID);
  const st = q ? followupState(q, today, state.quotes) : 'closed';
  const overdueBy = q && q.next_follow_up_date ? daysBetween(q.next_follow_up_date, today) : 0;
  // "Stale" when the featured estimate no longer matches the tour's story and the visitor
  // did not change it through the tour's own example action.
  const stale = !flags.loggedExample && (!q || !['overdue'].includes(st));
  return {
    ...flags, range, m, byState, r, stale,
    focus: q && {
      name: q.customer_name, first: q.customer_name.split(' ')[0], value: q.amount_usd, state: st,
      timing: st === 'overdue' ? `${plural(overdueBy, 'day')} past its follow-up date` : st === 'today' ? 'due for a follow-up today'
        : st === 'upcoming' ? 'scheduled for a follow-up' : st === 'closed' ? `marked ${q.status}` : 'waiting on a follow-up',
      lastContact: q.last_contact_date ? ago(q.last_contact_date, today).toLowerCase() : 'never logged'
    }
  };
}

export const STEPS = [
  {
    id: 'discover', title: 'Discover outstanding opportunities', view: 'overview', target: '[data-tour="kpis"]',
    body: c => `${esc(COMPANY.short)} has <strong>${money(c.m.openValue)}</strong> in open estimates across ${c.m.openCount} homeowners. <strong>${plural(c.byState.overdue.count, 'follow-up')} worth ${money(c.byState.overdue.value)}</strong> ${c.byState.overdue.count === 1 ? 'is' : 'are'} already past the date someone promised.`,
    why: 'Every dollar here is an estimate your team already measured, priced and sent. This is the work already on the table.'
  },
  {
    id: 'find', title: 'Find a customer who needs attention', view: 'followups', target: `[data-row="${FOCUS_ID}"]`,
    body: c => c.focus ? `The queue puts the oldest promises first. <strong>${esc(c.focus.name)}</strong>’s ${money(c.focus.value)} roof replacement is <strong>${esc(c.focus.timing)}</strong>. Last contact: ${esc(c.focus.lastContact)}.` : 'The queue puts the oldest follow-up promises first.',
    why: 'No digging through texts, inboxes or notebooks. The queue answers “who should we call today?”',
    action: { label: c => `Open ${c.focus ? esc(c.focus.first) : 'the'}’s estimate`, run: 'open-focus' }
  },
  {
    id: 'prepare', title: 'Prepare the next action', view: 'followups', drawer: FOCUS_ID, target: '[data-section="draft"]',
    body: () => 'Every follow-up starts from an editable draft built from the estimate’s details. Make it personal, save it, then <strong>copy it into your own email or texting app</strong>.',
    why: 'QuoteTend never sends anything on its own. Copying a draft does not send a message or record a contact.',
    action: { label: () => 'Copy the draft', run: 'copy-draft' }
  },
  {
    id: 'record', title: 'Record activity and the outcome', view: 'followups', drawer: FOCUS_ID, target: '[data-section="contact"]',
    body: c => c.loggedExample
      ? `Recorded. ${esc(c.focus?.first || 'The customer')}’s estimate is now ${esc(c.focus?.timing || 'updated')}, and the call is saved in the activity history. When the homeowner decides, use <strong>Mark won</strong> or <strong>Mark lost</strong> below.`
      : `After the conversation, log what happened and when to check back. The estimate moves out of the overdue queue and its history is kept. When ${esc(c.focus?.first || 'the homeowner')} decides, record won or lost.`,
    why: 'A complete record means anyone on your team can pick up the conversation where it left off.',
    action: { label: c => c.loggedExample ? 'Example call recorded' : 'Record an example phone call', run: 'log-example', done: c => !!c.loggedExample }
  },
  {
    id: 'report', title: 'Review reporting', view: 'results', target: '[data-tour="results"]',
    body: c => `Follow-up Results is built only from what your team records: <strong>${plural(c.r.counts.contacts, 'contact')}</strong> logged in the last ${c.range} days across <strong>${plural(c.r.counts.followed, 'estimate')}</strong>, with <strong>${money(c.r.values.won)}</strong> won after a recorded follow-up.${c.loggedExample ? ' Your example call is already counted.' : ''}`,
    why: 'Values are estimate amounts — not collected revenue, and not proof that QuoteTend caused a sale.'
  }
];

export function tourCard(index, ctx, { interactive = true, minimized = false, paused = null } = {}) {
  const total = STEPS.length;
  if (index >= total) {
    return `<section class="qt-tour qt-tour--done" aria-labelledby="tour-title"><div class="qt-tour__top"><span class="qt-tour__step">${icon('checkCircle')}Tour complete</span><button class="qt-icon-btn" type="button" data-tour-act="exit" aria-label="Close guided tour">${icon('x')}</button></div>
      <h2 class="qt-tour__title" id="tour-title" tabindex="-1">That’s the core workflow.</h2>
      <p class="qt-tour__body">You found the money waiting in open estimates, picked the customer who needed attention, prepared a follow-up, recorded what happened and saw it reflected in reporting.</p>
      <div class="qt-tour__finish"><button class="qt-btn qt-btn--primary" type="button" data-tour-act="exit">Explore on your own</button><button class="qt-btn" type="button" data-tour-act="restart">${icon('reset')}Restart tour</button><button class="qt-btn qt-btn--ghost" type="button" data-tour-act="reset-data">Reset demo data</button></div>
      <a class="qt-tour__cta" href="index.html#early-access">Interested in early access? ${icon('arrowRight')}</a></section>`;
  }
  const step = STEPS[index];
  const dis = interactive ? '' : 'tabindex="-1"';
  const actionDone = step.action?.done?.(ctx);
  if (paused) {
    return `<section class="qt-tour qt-tour--paused ${minimized ? 'is-min' : ''}" aria-labelledby="tour-title">
      <div class="qt-tour__top"><span class="qt-tour__step">${icon('pause')}Guided tour · Paused at step ${index + 1} of ${total}</span>${tourTools(minimized, dis)}</div>${tourProgress(index, total)}
      <h2 class="qt-tour__title" id="tour-title" tabindex="-1">Tour paused</h2>
      <div class="qt-tour__content"><p class="qt-tour__body">You’re viewing <strong>${esc(paused.here)}</strong>. Step ${index + 1}, “${esc(step.title)}”, happens on <strong>${esc(paused.there)}</strong>.</p>
      <p class="qt-tour__why">${icon('info')}<span>Explore freely. Resume when you’re ready and the tour returns to the right screen.</span></p>
      <button class="qt-btn qt-tour__action" type="button" data-tour-act="resume" ${dis}>${icon('tour')}Resume step ${index + 1}</button>${tourNav(index, total, dis)}</div></section>`;
  }
  return `<section class="qt-tour ${minimized ? 'is-min' : ''}" aria-labelledby="tour-title">
    <div class="qt-tour__top"><span class="qt-tour__step">${icon('tour')}Guided tour · Step ${index + 1} of ${total}</span>${tourTools(minimized, dis)}</div>${tourProgress(index, total)}
    <h2 class="qt-tour__title" id="tour-title" tabindex="-1">${esc(step.title)}</h2>
    <div class="qt-tour__content"><p class="qt-tour__body">${step.body(ctx)}</p>
    <p class="qt-tour__why">${icon('info')}<span>${esc(step.why)}</span></p>
    ${ctx.stale && index >= 1 && index <= 3 ? `<p class="qt-tour__stale">${icon('alert')}<span>This estimate was already changed earlier in the demo. <button type="button" class="qt-tour__inline" data-tour-act="reset-data" ${dis}>Reset demo data</button> to replay the tour exactly.</span></p>` : ''}
    ${step.action ? `<button class="qt-btn qt-tour__action ${actionDone ? 'is-done' : ''}" type="button" data-tour-act="${step.action.run}" ${actionDone ? 'disabled' : ''} ${dis}>${icon(actionDone ? 'checkCircle' : step.action.run === 'copy-draft' ? 'copy' : step.action.run === 'log-example' ? 'Phone' : 'arrowRight')}${step.action.label(ctx)}</button>` : ''}
    ${tourNav(index, total, dis)}</div></section>`;
}
