function formatNumber(value) {
  if (value === null || value === undefined) return '--';
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

function formatPercent(value) {
  if (value === null || value === undefined) return '--';
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export default function StudentReportModal({ report, loading, error, onClose }) {
  if (!report && !loading && !error) return null;

  const overall = report?.overall || {};
  const previous = report?.previous_overall;
  const recentHistory = (report?.history || []).slice(0, 8);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-modal-header">
          <div>
            <h2 id="student-detail-title">{report?.student?.name || 'Student Details'}</h2>
            <p>
              {report?.student?.roll_number || '--'} · {report?.student?.class_name || '--'} {report?.student?.section || ''}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close student details">
            X
          </button>
        </div>

        {loading && <div className="empty-state"><h3>Loading student report</h3><p>Please wait.</p></div>}
        {error && <div className="inline-alert">{error}</div>}

        {report && (
          <>
            <div className="detail-metric-grid">
              <div className={overall.low_attendance ? 'danger' : 'success'}>
                <span>Current</span>
                <strong>{formatPercent(overall.percentage)}</strong>
                <small>{report.term?.name || 'Selected semester'}</small>
              </div>
              <div>
                <span>{overall.low_attendance ? 'Needed' : 'Can Miss'}</span>
                <strong>
                  {overall.low_attendance
                    ? formatNumber(overall.classes_needed_to_reach_threshold)
                    : formatNumber(overall.classes_can_miss_safely)}
                </strong>
                <small>{overall.prediction_message}</small>
              </div>
              <div>
                <span>Previous</span>
                <strong>{previous?.has_data ? formatPercent(previous.percentage) : '--'}</strong>
                <small>{previous?.has_data ? previous.term?.name : 'No previous semester data available'}</small>
              </div>
              <div>
                <span>Trend</span>
                <strong>{previous?.has_data ? previous.trend : '--'}</strong>
                <small>
                  {previous?.has_data
                    ? `${previous.difference_percentage > 0 ? '+' : ''}${formatPercent(previous.difference_percentage)}`
                    : 'Comparison unavailable'}
                </small>
              </div>
            </div>

            <div className="detail-columns">
              <section>
                <h3>Subject Breakdown</h3>
                <div className="detail-list">
                  {(report.subject_summary || []).map((subject) => (
                    <div className="detail-row" key={subject.subject_id}>
                      <div>
                        <strong>{subject.subject}</strong>
                        <span>{formatNumber(subject.present)} / {formatNumber(subject.total_classes)} present</span>
                        <span>{subject.prediction_message}</span>
                      </div>
                      <span className={`risk-badge${subject.low_attendance ? ' risk' : ''}`}>
                        {formatPercent(subject.percentage)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3>Recent Periods</h3>
                {recentHistory.length === 0 && (
                  <div className="empty-state compact-empty">
                    <h3>No history</h3>
                    <p>Marked periods will appear here.</p>
                  </div>
                )}
                {recentHistory.length > 0 && (
                  <div className="detail-list">
                    {recentHistory.map((item) => (
                      <div className="detail-row" key={item.id}>
                        <div>
                          <strong>{item.subject}</strong>
                          <span>{formatDate(item.date)} · Period {item.period_no}</span>
                        </div>
                        <span className={`attendance-status status-${item.status.toLowerCase()}`}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
