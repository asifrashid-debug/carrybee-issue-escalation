// Shown to roles that do not use the tracker. Access rules are unchanged.
export default function NoAccess() {
  return (
    <div>
      <div className="ph">
        <div>
          <div className="kicker">Access</div>
          <h1>No tracker access</h1>
          <p className="sub">Your role does not use the Issue Escalation Tracker.</p>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <p style={{ margin: 0, color: '#34333A', lineHeight: 1.6 }}>Hub responses come from the hub response sheet. If you think this is wrong, contact the admin.</p>
      </div>
    </div>
  );
}
