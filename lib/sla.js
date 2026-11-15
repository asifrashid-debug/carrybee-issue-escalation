// CarryBee SLA and follow-up rules (spec, confirmed by user).
//
// - Comment SLA: an open issue must get a first comment (issue_response_datetime) within 2h of being raised.
//   Past 2h with no comment = SLA breach.
// - KAM Followup: available from raise until 2.5h after raise, only while the issue is not picked.
//   Hidden once CM has picked (a CM action applies).
// - CM followups (1st, 2nd, 3rd): unlock when the issue is picked. Due times are chained:
//   1st due Picked + 2.5h, 2nd due 2h after the 1st, 3rd due 2h after the 2nd.
//   Levels are completed in order; a level needs the previous one done.
// - Pick is one-time (enforced in the API and the DB, see pick route).

export const FOLLOWUP_RULES = {
  commentHours: 2,
  kamFollowupHours: 2.5,
  cmFirstDueHours: 2.5,
  cmGapHours: [2, 2], // gap before 2nd and 3rd follow-up
};

const H = 3600e3;
const ms = (t) => (t == null ? null : new Date(t).getTime());

export function issueClock(issue, now = new Date(), rules = FOLLOWUP_RULES) {
  const nowMs = ms(now);
  const raised = ms(issue.submitted_at);
  const ageH = (nowMs - raised) / H;
  const open = issue.issue_status !== 'Closed';
  const picked = !!issue.issue_pick_time;
  const commented = !!issue.issue_response_datetime;
  return {
    ageHours: Math.max(0, ageH),
    open,
    picked,
    commented,
    commentBreach: open && !commented && ageH > rules.commentHours,
    commentDueAt: new Date(raised + rules.commentHours * H).toISOString(),
  };
}

// followups: [{ level: 0 | 1 | 2 | 3, done_at }]. Level 0 = KAM followup.
export function followupPlan(issue, followups = [], now = new Date(), rules = FOLLOWUP_RULES) {
  const c = issueClock(issue, now, rules);
  const done = new Map(followups.map((f) => [f.level, f]));
  const raised = ms(issue.submitted_at);
  const nowMs = ms(now);

  const kamDueMs = raised + rules.kamFollowupHours * H;
  const kam = {
    level: 0,
    label: 'KAM followup',
    available: c.open && !c.picked && nowMs <= kamDueMs,
    done: done.has(0),
    dueAt: new Date(kamDueMs).toISOString(),
    hiddenReason: !c.open ? 'Issue closed' : c.picked ? 'CM action applies (picked)' : nowMs > kamDueMs ? 'Window closed (2.5h)' : null,
  };

  const cm = [];
  let dueMs = c.picked ? ms(issue.issue_pick_time) + rules.cmFirstDueHours * H : null;
  for (let level = 1; level <= 3; level++) {
    if (level > 1) dueMs += rules.cmGapHours[level - 2] * H;
    const prevDone = level === 1 || done.has(level - 1);
    const isDone = done.has(level);
    const unlocked = c.picked && c.open && prevDone;
    let status;
    if (isDone) status = 'done';
    else if (!c.picked) status = 'locked';
    else if (!prevDone) status = 'waiting';
    else if (nowMs > dueMs) status = 'overdue';
    else status = 'due';
    cm.push({ level, label: `CM ${level}${level === 1 ? 'st' : level === 2 ? 'nd' : 'rd'} followup`, unlocked, done: isDone, status, dueAt: c.picked ? new Date(dueMs).toISOString() : null });
  }
  return { clock: c, kam, cm };
}
