import { useEffect, useMemo, useState } from 'react';
import { db } from '../../supabaseClient';

const PAGE_OPTIONS = [10, 20, 50, 100, 500];

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

function formatTimeTaken(startedAt, submittedAt) {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = submittedAt ? new Date(submittedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
    : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function ensureScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window[globalName]));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(window[globalName]);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function resultExportRows(rows) {
  return rows.map((r) => [
    r.users?.name || '',
    r.users?.stream || '',
    r.users?.location || '',
    r.assessment_type || '',
    r.status || '',
    `${r.correct_count || 0} / ${r.total_questions || 0}`,
    r.status === 'submitted' ? `${r.score ?? 0} / ${r.max_score ?? 0}` : '',
    r.status === 'submitted' ? `${r.percentage ?? 0}%` : '',
    formatDateTime(r.started_at),
    formatDateTime(r.submitted_at),
    formatTimeTaken(r.started_at, r.submitted_at),
  ]);
}

function copyResults(rows) {
  const headers = ['User','Stream','Location','Assessment','Status','Right Answers','Score','%','Start Time','End Time','Time Taken'];
  const text = [headers, ...resultExportRows(rows)].map((row) => row.join('\t')).join('\n');
  navigator.clipboard.writeText(text);
  window.alert('Results copied to clipboard.');
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportExcel(rows) {
  const XLSX = await ensureScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX');
  if (!XLSX) throw new Error('Excel export library could not be loaded.');
  const headers = ['User','Stream','Location','Assessment','Status','Right Answers','Score','%','Start Time','End Time','Time Taken'];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...resultExportRows(rows)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  XLSX.writeFile(wb, 'assessment-results.xlsx');
}

async function exportPdf(rows) {
  const jspdf = await ensureScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf');
  await ensureScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js', 'jspdf');
  const { jsPDF } = jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Assessment Results', 14, 15);
  doc.autoTable({
    startY: 20,
    head: [['User','Stream / Location','Assessment','Status','Right Answers','Score','%','Start Time','End Time','Time Taken']],
    body: rows.map((r) => [
      r.users?.name || '',
      [r.users?.stream, r.users?.location].filter(Boolean).join(' / '),
      r.assessment_type || '',
      r.status || '',
      `${r.correct_count || 0} / ${r.total_questions || 0}`,
      r.status === 'submitted' ? `${r.score ?? 0} / ${r.max_score ?? 0}` : '—',
      r.status === 'submitted' ? `${r.percentage ?? 0}%` : '—',
      formatDateTime(r.started_at), formatDateTime(r.submitted_at),
      formatTimeTaken(r.started_at, r.submitted_at),
    ]),
    styles: { fontSize: 6 },
    headStyles: { fontSize: 6 },
  });
  doc.save('assessment-results.pdf');
}

async function exportDocx(rows) {
  const docx = await ensureScript('https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js', 'docx');
  if (!docx) throw new Error('DOCX export library could not be loaded.');
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType } = docx;
  const headers = ['User','Stream / Location','Assessment','Status','Right Answers','Score','%','Start Time','End Time','Time Taken'];
  const body = rows.map((r) => [
    r.users?.name || '',
    [r.users?.stream, r.users?.location].filter(Boolean).join(' / '),
    r.assessment_type || '',
    r.status || '',
    `${r.correct_count || 0} / ${r.total_questions || 0}`,
    r.status === 'submitted' ? `${r.score ?? 0} / ${r.max_score ?? 0}` : '—',
    r.status === 'submitted' ? `${r.percentage ?? 0}%` : '—',
    formatDateTime(r.started_at), formatDateTime(r.submitted_at),
    formatTimeTaken(r.started_at, r.submitted_at),
  ]);
  const tableRows = [
    new TableRow({ children: headers.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) }),
    ...body.map((row) => new TableRow({ children: row.map((v) => new TableCell({ children: [new Paragraph(String(v))] })) })),
  ];
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Assessment Results', bold: true, size: 28 })] }),
        new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, 'assessment-results.docx');
}

export default function AdminResults() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    db('assessment_attempts')
      .select('id, assessment_type, total_questions, correct_count, score, max_score, percentage, status, started_at, submitted_at, users:user_id(name, email, stream, location)')
      .order('started_at', { ascending: false })
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  useEffect(() => setPage(1), [search, pageSize]);

  async function openDetail(attempt) {
    setSelected(attempt);
    const { data } = await db('user_answers')
      .select('selected_option, is_correct, questions:question_id(question_text, correct_option)')
      .eq('attempt_id', attempt.id);
    setAnswers(data || []);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [
      r.users?.name, r.users?.email, r.users?.stream, r.users?.location, r.assessment_type, r.status,
    ].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function runExport(type) {
    setExporting(type);
    try {
      if (type === 'copy') copyResults(filtered);
      if (type === 'excel') await exportExcel(filtered);
      if (type === 'pdf') await exportPdf(filtered);
      if (type === 'docx') await exportDocx(filtered);
    } catch (error) {
      window.alert(error?.message || 'Export failed.');
    } finally {
      setExporting('');
    }
  }

  if (loading) return <div className="text-muted">Loading results...</div>;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-nowrap">
        <h5 className="mb-0">Results</h5>
        <div className="d-flex gap-2 flex-wrap">
          <input className="form-control" style={{ width: 280, minWidth: 280 }} placeholder="Search by name, email, stream, assessment…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="dropdown">
            <button className="btn btn-outline-primary dropdown-toggle" data-bs-toggle="dropdown" disabled={!!exporting}>
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li><button className="dropdown-item" onClick={() => runExport('copy')}>Export as Copy</button></li>
              <li><button className="dropdown-item" onClick={() => runExport('excel')}>Export as Excel</button></li>
              <li><button className="dropdown-item" onClick={() => runExport('pdf')}>Export as PDF</button></li>
              <li><button className="dropdown-item" onClick={() => runExport('docx')}>Export as DOCX</button></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="card stat-card">
        <div className="table-responsive">
          <table className="table mb-0 align-middle">
            <thead><tr>
              <th>User</th><th>Stream / Location</th><th>Assessment</th><th>Status</th><th>Right Answers</th><th>Score</th><th>%</th><th>Start Time</th><th>End Time</th><th>Time Taken</th><th></th>
            </tr></thead>
            <tbody>
              {visibleRows.map((r) => <tr key={r.id}>
                <td><div>{r.users?.name}</div><div className="small text-muted">{r.users?.email}</div></td>
                <td className="small">{r.users?.stream} · {r.users?.location}</td>
                <td>{r.assessment_type}</td>
                <td><span className={`badge ${r.status === 'submitted' ? 'bg-success' : 'bg-secondary'}`}>{r.status}</span></td>
                <td><strong>{r.correct_count || 0}</strong> / {r.total_questions || 0}</td>
                <td>{r.status === 'submitted' ? `${r.score ?? 0} / ${r.max_score ?? 0}` : '—'}</td>
                <td>{r.status === 'submitted' ? `${r.percentage ?? 0}%` : '—'}</td>
                <td className="small text-nowrap">{formatDateTime(r.started_at)}</td>
                <td className="small text-nowrap">{formatDateTime(r.submitted_at)}</td>
                <td className="small text-nowrap">{formatTimeTaken(r.started_at, r.submitted_at)}</td>
                <td><button className="btn btn-sm btn-outline-primary" onClick={() => openDetail(r)}>View</button></td>
              </tr>)}
              {visibleRows.length === 0 && <tr><td colSpan={11} className="text-center text-muted py-4">No results found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="d-flex justify-content-between align-items-center p-3 border-top gap-2 flex-wrap">
          <div className="small text-muted">Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</div>
          <div className="d-flex align-items-center gap-2">
            <label className="small text-muted">Rows:</label>
            <select className="form-select form-select-sm" style={{ width: 90 }} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="small">Page {page} / {totalPages}</span>
            <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>

      {selected && <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setSelected(null)}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header"><h6 className="modal-title">{selected.users?.name} — {selected.assessment_type}</h6><button className="btn-close" onClick={() => setSelected(null)}></button></div>
            <div className="modal-body">
              <div className="row g-3 mb-3">
                <div className="col-md-4"><div className="small text-muted">Start Time</div><strong>{formatDateTime(selected.started_at)}</strong></div>
                <div className="col-md-4"><div className="small text-muted">End Time</div><strong>{formatDateTime(selected.submitted_at)}</strong></div>
                <div className="col-md-4"><div className="small text-muted">Time Taken</div><strong>{formatTimeTaken(selected.started_at, selected.submitted_at)}</strong></div>
              </div>
              <p className="mb-3">Right Answers: <strong>{selected.correct_count || 0} / {selected.total_questions || 0}</strong><br />Score: <strong>{selected.score ?? 0} / {selected.max_score ?? 0}</strong> ({selected.percentage ?? 0}%)</p>
              <ol className="list-group list-group-numbered">
                {answers.map((a, i) => <li key={i} className="list-group-item"><div>{a.questions?.question_text}</div><div className="small">Selected: <strong>{a.selected_option || '—'}</strong> · Correct: {a.questions?.correct_option} · <span className={a.is_correct ? 'text-success' : 'text-danger'}>{a.is_correct ? 'Correct' : 'Incorrect'}</span></div></li>)}
              </ol>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
