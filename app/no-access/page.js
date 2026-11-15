import { PageHead } from '../../components/demo';

// Shown to roles that do not use the tracker. Access rules are unchanged.
export default function NoAccess() {
  return (
    <div className="dm">
      <PageHead kicker="Access" title="No tracker access" sub="Your role does not use the Issue Escalation Tracker." />
      <div className="card" style={{ maxWidth: 560 }}>
        <p style={{ margin: 0, color: 'var(--ink2)', lineHeight: 1.6 }}>Hub responses come from the hub response sheet. If you think this is wrong, contact the admin.</p>
      </div>
    </div>
  );
}
