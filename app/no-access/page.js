export default function NoAccess() {
  return (
    <div>
      <div className="empty" style={{ maxWidth: 560, margin: '48px auto' }}>
        <b>No tracker access</b>
        Your role does not use the Issue Escalation Tracker. Hub responses come from the hub response sheet. If you think this is wrong, contact the admin.
      </div>
    </div>
  );
}
