import { useEffect, useState } from 'react';
import { db } from '../../supabaseClient';

export default function AdminResults() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    db('assessment_attempts')
      .select(
        'id, assessment_type, total_questions, correct_count, score, max_score, percentage, status, started_at, submitted_at, users:user_id(name, email, stream, location)'
      )
      .order('started_at', { ascending: false })
      .then(({ data }) => setRows(data || []));
  }, []);

  async function openDetail(attempt) {
    setSelected(attempt);
    const { data } = await db('user_answers')
      .select('selected_option, is_correct, questions:question_id(question_text, correct_option)')
      .eq('attempt_id', attempt.id);
    setAnswers(data || []);
  }

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.users?.name?.toLowerCase().includes(q) ||
      r.users?.email?.toLowerCase().includes(q) ||
      r.assessment_type?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Results</h5>
        <input
          className="form-control"
          style={{ maxWidth: 280 }}
          placeholder="Search by name, email, assessment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card stat-card">
        <div className="table-responsive">
          <table className="table mb-0 align-middle">
            <thead>
              <tr>
                <th>User</th>
                <th>Stream / Location</th>
                <th>Assessment</th>
                <th>Status</th>
                <th>Score</th>
                <th>%</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div>{r.users?.name}</div>
                    <div className="small text-muted">{r.users?.email}</div>
                  </td>
                  <td className="small">{r.users?.stream} · {r.users?.location}</td>
                  <td>{r.assessment_type}</td>
                  <td>
                    <span className={`badge ${r.status === 'submitted' ? 'bg-success' : 'bg-secondary'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.correct_count}/{r.total_questions}</td>
                  <td>{r.status === 'submitted' ? `${r.percentage}%` : '—'}</td>
                  <td>
                    <button className="btn btn-sm btn-outline-primary" onClick={() => openDetail(r)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    No results found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setSelected(null)}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">
                  {selected.users?.name} — {selected.assessment_type}
                </h6>
                <button className="btn-close" onClick={() => setSelected(null)}></button>
              </div>
              <div className="modal-body">
                <p className="mb-3">
                  Score: <strong>{selected.correct_count}/{selected.total_questions}</strong> ({selected.percentage}%)
                </p>
                <ol className="list-group list-group-numbered">
                  {answers.map((a, i) => (
                    <li key={i} className="list-group-item">
                      <div>{a.questions?.question_text}</div>
                      <div className="small">
                        Selected: <strong>{a.selected_option || '—'}</strong> · Correct: {a.questions?.correct_option} ·{' '}
                        <span className={a.is_correct ? 'text-success' : 'text-danger'}>
                          {a.is_correct ? 'Correct' : 'Incorrect'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
