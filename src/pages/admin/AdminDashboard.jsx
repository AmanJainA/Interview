import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { db } from '../../supabaseClient';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const BUCKETS = [
  { label: '0–69%', test: (p) => p < 70 },
  { label: '70–79%', test: (p) => p >= 70 && p < 80 },
  { label: '80–89%', test: (p) => p >= 80 && p < 90 },
  { label: '90–99%', test: (p) => p >= 90 && p < 100 },
  { label: '100%', test: (p) => p >= 100 },
];

export default function AdminDashboard() {
  const [totalUsers, setTotalUsers] = useState(0);
  const [attemptedUsers, setAttemptedUsers] = useState(0);
  const [todayRegistered, setTodayRegistered] = useState(0);
  const [attempts, setAttempts] = useState([]); // submitted attempts, joined with user
  const [activeBucket, setActiveBucket] = useState(null);

  useEffect(() => {
    async function load() {
      const { count: usersCount } = await db('users').select('*', { count: 'exact', head: true });
      setTotalUsers(usersCount || 0);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { count: todayCount } = await db('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_date', startOfDay.toISOString());
      setTodayRegistered(todayCount || 0);

      const { data: attemptRows } = await db('assessment_attempts')
        .select('id, user_id, assessment_type, total_questions, correct_count, percentage, status, submitted_at, users:user_id(name, email)')
        .order('submitted_at', { ascending: false });

      const allAttempts = attemptRows || [];
      const distinctAttemptedUsers = new Set(allAttempts.map((a) => a.user_id));
      setAttemptedUsers(distinctAttemptedUsers.size);
      setAttempts(allAttempts.filter((a) => a.status === 'submitted'));
    }
    load();
  }, []);

  const bucketCounts = useMemo(
    () => BUCKETS.map((b) => attempts.filter((a) => b.test(a.percentage)).length),
    [attempts]
  );

  const chartData = {
    labels: BUCKETS.map((b) => b.label),
    datasets: [
      {
        label: 'Users',
        data: bucketCounts,
        backgroundColor: ['#dc3545', '#fd7e14', '#ffc107', '#20c997', '#198754'],
        borderRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    onClick: (_evt, elements) => {
      if (elements.length > 0) setActiveBucket(elements[0].index);
    },
  };

  const bucketUsers = activeBucket === null ? [] : attempts.filter((a) => BUCKETS[activeBucket].test(a.percentage));
  const recent = attempts.slice(0, 10);

  return (
    <div>
      <h5 className="mb-4">Admin Dashboard</h5>

      <div className="row mb-4">
        <div className="col-md-4 mb-3">
          <div className="card stat-card p-3">
            <div className="text-muted small">Total users</div>
            <div className="fs-3 fw-bold">{totalUsers}</div>
          </div>
        </div>
        <div className="col-md-4 mb-3">
          <div className="card stat-card p-3">
            <div className="text-muted small">Attempted the assessment</div>
            <div className="fs-3 fw-bold">{attemptedUsers}</div>
          </div>
        </div>
        <div className="col-md-4 mb-3">
          <div className="card stat-card p-3">
            <div className="text-muted small">Registered today</div>
            <div className="fs-3 fw-bold">{todayRegistered}</div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-7 mb-4">
          <div className="card stat-card p-3">
            <h6>Score distribution</h6>
            <p className="text-muted small mb-2">Click a bar to see who's in that range.</p>
            <div style={{ height: 260 }}>
              <Bar data={chartData} options={chartOptions} />
            </div>
            {activeBucket !== null && (
              <div className="mt-3">
                <div className="d-flex justify-content-between align-items-center">
                  <strong>{BUCKETS[activeBucket].label} — {bucketUsers.length} user(s)</strong>
                  <button className="btn btn-sm btn-link" onClick={() => setActiveBucket(null)}>
                    close
                  </button>
                </div>
                <ul className="list-group mt-2">
                  {bucketUsers.map((a) => (
                    <li key={a.id} className="list-group-item d-flex justify-content-between">
                      <span>{a.users?.name} <span className="text-muted">({a.users?.email})</span></span>
                      <span>{a.percentage}%</span>
                    </li>
                  ))}
                  {bucketUsers.length === 0 && <li className="list-group-item text-muted">No one in this range yet.</li>}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="col-md-5 mb-4">
          <div className="card stat-card p-3">
            <h6>Recently completed</h6>
            <ul className="list-group">
              {recent.map((a) => (
                <li key={a.id} className="list-group-item">
                  <div className="d-flex justify-content-between">
                    <span>{a.users?.name}</span>
                    <span className="fw-bold">
                      {a.correct_count}/{a.total_questions}
                    </span>
                  </div>
                  <div className="small text-muted">
                    {a.assessment_type} · {a.percentage}% · {a.submitted_at && new Date(a.submitted_at).toLocaleString()}
                  </div>
                </li>
              ))}
              {recent.length === 0 && <li className="list-group-item text-muted">No submissions yet.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
