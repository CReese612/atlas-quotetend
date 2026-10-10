// Fictional data for the isolated QA staging database. Nothing here is real: names are invented, emails use the
// reserved .test domain (never deliverable), phones use the reserved 555-01xx range, addresses use ZIP 00000.
// All dates are offsets from the day the seed runs, so overdue / upcoming / today states are correct at seed time.
import { addDays } from '../domain.js';

export const QA_BUSINESS_NAME = 'QuoteTend QA Roofing & Exteriors';

const R = 'Roofing', S = 'Siding', G = 'Gutters', W = 'Windows & doors', X = 'Exterior repairs';
// [id, customer, job, amount, trade, ageDays, plan, followUpOffset|null, notes, flags]
//  plan: 'draft' | 'sent' | 'dnc' | 'won' | 'lost'
//  flags: contacts [[daysAgo, channel, nextOffset, result, note]], outcomeDaysAgo, noEmail, noPhone, noAddress, email (shared)
const ROWS = [
  ['QA-1001', 'Harlan Wexford', 'Full tear-off and 3-tab asphalt re-roof', 14200, R, 20, 'sent', -6, 'Never reached; left no voicemail yet.', {}],
  ['QA-1002', 'Odette Marsh', 'Architectural shingle tear-off, two layers', 22800, R, 15, 'sent', null, 'Wants a call after 5pm.', { contacts: [[9, 'Phone', -2, 'spoke', 'Discussed shingle color options.']] }],
  ['QA-1003', 'Linus Penhallow', 'Storm damage repair, north slope', 3400, R, 6, 'sent', 2, 'Insurance adjuster visit pending.', {}],
  ['QA-1004', 'Priya Okonkwo-Lane', 'Standing-seam metal roof', 31500, R, 12, 'sent', null, 'Comparing against one other bid.', { contacts: [[5, 'Email', 4, 'messaged', 'Sent revised material spec.']] }],
  ['QA-1005', 'Bram Tolliver', 'Chimney flashing replacement', 1250, R, 30, 'sent', null, 'Small job; no project address recorded yet.', { noAddress: true }],
  ['QA-1006', 'Wren Castellan', 'Skylight reseal and curb repair', 980, R, 3, 'draft', null, 'Confirm skylight model before sending.', {}],
  ['QA-1007', 'Dashiell Ormond', 'Full roof replacement, hip roof', 18750, R, 25, 'won', null, 'Accepted after the second call. Start date agreed separately.', { contacts: [[18, 'Phone', -12, 'spoke', 'Walked through warranty terms.']], outcomeDaysAgo: 8 }],
  ['QA-1008', 'Marguerite Voss', 'Detached garage re-roof', 6400, R, 28, 'won', null, 'Customer called us back on their own.', { outcomeDaysAgo: 10 }],
  ['QA-1009', 'Emeric Dunlow', 'Chimney crown and roof tie-in', 2100, R, 22, 'lost', null, 'Went with a neighbor’s recommendation.', { contacts: [[14, 'Email', -8, 'messaged', 'Sent follow-up with photos.']], outcomeDaysAgo: 4 }],
  ['QA-1010', 'Sunniva Rask', 'Ridge vent install', 1700, R, 9, 'sent', 0, 'Follow-up due today.', {}],
  ['QA-1011', 'Cormac Ellery', 'Fiber cement lap siding, full house', 24300, S, 18, 'sent', null, 'Two touches so far; leaning toward color B.', { contacts: [[11, 'Phone', -1, 'left_message', 'Left a message.'], [4, 'Text', 3, 'spoke', 'Confirmed they received the estimate.']] }],
  ['QA-1012', 'Thessaly Barrow', 'Vinyl siding, whole house', 16800, S, 21, 'sent', -9, 'Overdue and never contacted.', {}],
  ['QA-1013', 'Idris Calloway', 'Storm-damaged siding section repair', 2750, S, 8, 'sent', 5, '', {}],
  ['QA-1014', 'Rosalind Yarrow', 'Cedar shake re-side, gable ends', 12900, S, 35, 'sent', null, 'Long decision cycle.', { contacts: [[25, 'Email', -12, 'messaged', 'Sent cedar sample photos.']] }],
  ['QA-1015', 'Teodoro Winslow', 'Trim board and siding replacement', 4100, S, 2, 'draft', null, 'Waiting on measurements.', {}],
  ['QA-1016', 'Almira Quill', 'Accent wall siding refresh', 3900, S, 40, 'won', null, 'Accepted at the walkthrough.', { outcomeDaysAgo: 30 }],
  ['QA-1017', 'Jasper Linden', 'Insulated vinyl siding, ranch home', 19900, S, 33, 'won', null, 'Accepted after pricing discussion.', { contacts: [[26, 'Phone', -20, 'spoke', 'Reviewed insulation upgrade.']], outcomeDaysAgo: 20 }],
  ['QA-1018', 'Neve Hartigan', 'Board-and-batten siding, rear addition', 8800, S, 19, 'lost', null, 'Project postponed by the customer.', { outcomeDaysAgo: 7 }],
  ['QA-1019', 'Gideon Ashcombe', 'Seamless 5-inch gutters, whole house', 1850, G, 10, 'sent', 1, '', {}],
  ['QA-1020', 'Philippa Strand', 'Gutter guards, front and rear', 2900, G, 16, 'sent', null, 'Asked about leaf-guard warranty.', { contacts: [[7, 'Phone', 6, 'spoke', 'Explained the warranty.']] }],
  ['QA-1021', 'Lucan Merrow', 'Fascia and gutter replacement', 3300, G, 26, 'sent', null, 'No follow-up date set yet.', {}],
  ['QA-1022', 'Calla Fenwick', 'Downspout re-route to drain', 760, G, 5, 'sent', -1, '', {}],
  ['QA-1023', 'Osric Talbot', '6-inch commercial-grade gutters', 4400, G, 4, 'draft', null, 'Draft pending site photos.', {}],
  ['QA-1024', 'Ione Pellam', 'Seamless copper gutters', 7900, G, 29, 'lost', null, 'Chose aluminum from another contractor.', { contacts: [[20, 'Email', -14, 'messaged', 'Sent a copper-versus-aluminum comparison.']], outcomeDaysAgo: 12 }],
  ['QA-1025', 'Ansel Dorrance', 'Eight vinyl replacement windows', 9600, W, 13, 'sent', null, 'Wants to schedule around a family event.', { contacts: [[6, 'Phone', 7, 'spoke', 'Discussed install lead time.']] }],
  ['QA-1026', 'Mirabel Cray', 'Entry door replacement', 3100, W, 7, 'sent', 3, 'Customer prefers phone; no email on file.', { noEmail: true }],
  ['QA-1027', 'Tobias Fairweather', 'Patio slider replacement', 4800, W, 23, 'sent', null, 'Texted once; no answer.', { contacts: [[12, 'Text', -4, 'left_message', 'Texted a quick check-in.']] }],
  ['QA-1028', 'Seraphine Ludd', 'Bay window installation', 6200, W, 31, 'won', null, 'Accepted by email.', { contacts: [[24, 'Email', -18, 'messaged', 'Sent finish samples.']], outcomeDaysAgo: 15 }],
  ['QA-1029', 'Evander Pike', 'Garage door replacement', 5400, W, 17, 'sent', null, 'No phone recorded; no follow-up date set.', { noPhone: true }],
  ['QA-1030', 'Hollis Brandt', 'Storm door install', 890, W, 1, 'draft', null, '', {}],
  ['QA-1031', 'Zenobia Kettle', 'Deck board replacement', 3600, X, 11, 'sent', 8, '', {}],
  ['QA-1032', 'Rafferty Moon', 'Fascia rot repair and repaint', 2450, X, 14, 'sent', null, 'Possible larger rot behind the fascia; revisit on site.', { contacts: [[3, 'Phone', 5, 'spoke', 'Scheduled a second look.']] }],
  ['QA-1033', 'Aurelia Stanhope', 'Porch column replacement', 1800, X, 27, 'sent', -11, 'Overdue and never contacted.', {}],
  ['QA-1034', 'Casimir Rudd', 'Soffit and vent repair', 2200, X, 19, 'dnc', null, 'Customer asked not to be contacted again.', { email: 'casimir.rudd@example.test' }],
  ['QA-1035', 'Bettina Ashgrove', 'Pergola and fence repair', 7300, X, 37, 'won', null, 'Accepted in person.', { outcomeDaysAgo: 25 }],
  ['QA-1036', 'Leopold Finch', 'Foundation trim and flashing', 1350, X, 45, 'lost', null, 'Did the work themselves.', { outcomeDaysAgo: 33 }],
  ['QA-1037', 'Desdemona Rudd', 'Pressure wash and seal, exterior', 1150, X, 32, 'sent', null, 'Shares an email address with QA-1034, so follow-ups are paused.', { email: 'casimir.rudd@example.test' }],
  ['QA-1038', 'Quillon Hale', 'Carport roof panels', 5200, R, 6, 'sent', null, '', { contacts: [[2, 'Email', 10, 'messaged', 'Sent the signed-ready estimate.']] }],
  ['QA-1039', 'Winifred Cobb', 'Detached garage siding', 5600, S, 24, 'sent', null, 'Two contacts, still overdue.', { contacts: [[15, 'Phone', -8, 'spoke', 'Discussed paint-ready options.'], [9, 'Text', -3, 'left_message', 'Left a message.']] }],
  ['QA-1040', 'Fitzgerald Oake', 'Basement egress window', 4100, W, 9, 'sent', 0, 'Follow-up due today.', {}]
];

const slug = s => s.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');

export function qaEstimates(today) {
  return ROWS.map(([estimate_id, customer_name, job_description, amount_usd, trade, age, plan, follow, notes, f], i) => {
    const sent = plan !== 'draft', dnc = plan === 'dnc', contacts = f.contacts || [];
    return {
      fields: {
        estimate_id, customer_name, job_description, amount_usd, trade, notes,
        customer_email: f.noEmail ? '' : f.email || `${slug(customer_name)}@example.test`,
        customer_phone: f.noPhone ? '' : `(541) 555-01${String(i + 10).padStart(2, '0')}`,
        address: f.noAddress ? '' : `${100 + i * 7} Sample Ridge Rd, Exampleville, OR 00000`,
        estimate_date: addDays(today, -age),
        // Won/lost/opt-out records are created as sent and closed afterwards, so the ledger holds real transitions.
        status: sent ? 'sent' : 'draft', do_not_contact: dnc,
        next_follow_up_date: dnc || !sent || follow === null ? '' : addDays(today, follow)
      },
      contacts: contacts.map(([ago, channel, next, result, note]) => ({ date: addDays(today, -ago), nextDate: addDays(today, next), channel, result, note })),
      close: ['won', 'lost'].includes(plan) ? { status: plan, effectiveDate: addDays(today, -f.outcomeDaysAgo) } : null
    };
  });
}
