import { useEffect, useMemo, useState } from 'react';

const QUESTION_PAGE_OPTIONS = [10, 20, 50, 100, 500];
import { db, rpc } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';


const QUESTION_EXPORT_HEADERS = ['#','Assessment','Question','Option A','Option B','Option C','Option D','Right Answer','Marks','Order'];
function questionExportRows(list) { return list.map((q,i)=>[i+1,q.assessment_type||'',q.question_text||'',q.option_a||'',q.option_b||'',q.option_c||'',q.option_d||'',q.correct_option||'',q.marks??'',q.sort_order??'']); }
function loadExportScript(src, name) { if (window[name]) return Promise.resolve(window[name]); return new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src=src; s.onload=()=>resolve(window[name]); s.onerror=reject; document.head.appendChild(s); }); }
function downloadQuestionBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportQuestions(type,list){
 const rows=questionExportRows(list);
 if(type==='copy'){await navigator.clipboard.writeText([QUESTION_EXPORT_HEADERS,...rows].map(r=>r.join('\\t')).join('\\n'));window.alert('MCQ questions copied to clipboard.');return;}
 if(type==='excel'){const XLSX=await loadExportScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','XLSX');const ws=XLSX.utils.aoa_to_sheet([QUESTION_EXPORT_HEADERS,...rows]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'MCQ Questions');XLSX.writeFile(wb,'mcq-questions.xlsx');return;}
 if(type==='pdf'){const j=await loadExportScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js','jspdf');await loadExportScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js','jspdf');const doc=new j.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});doc.setFontSize(14);doc.text('MCQ Question Bank',14,15);doc.autoTable({startY:20,head:[QUESTION_EXPORT_HEADERS],body:rows,styles:{fontSize:6},headStyles:{fontSize:6}});doc.save('mcq-questions.pdf');return;}
 if(type==='docx'){const d=await loadExportScript('https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js','docx');const {Document,Packer,Paragraph,Table,TableRow,TableCell,TextRun,WidthType}=d;const tr=[new TableRow({children:QUESTION_EXPORT_HEADERS.map(h=>new TableCell({children:[new Paragraph({children:[new TextRun({text:h,bold:true})]})]}))}),...rows.map(row=>new TableRow({children:row.map(v=>new TableCell({children:[new Paragraph(String(v))]}))}))];const doc=new Document({sections:[{children:[new Paragraph({children:[new TextRun({text:'MCQ Question Bank',bold:true,size:28})]}),new Table({rows:tr,width:{size:100,type:WidthType.PERCENTAGE}})]}]});downloadQuestionBlob(await Packer.toBlob(doc),'mcq-questions.docx');}
}

const emptyQuestion = {
  assessment_type: 'general',
  question_text: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: 'A',
  marks: 1,
  sort_order: 0,
};

export default function AdminContent({ section }) {
  if (section === 'questions') return <QuestionManager />;
  if (section === 'settings') return <AssessmentSettings />;
  return <CompanyManager section={section} />;
}

function AssessmentSettings() {
  const { profile } = useAuth();
  const [minutes, setMinutes] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    db('company_info').select('duration_minutes').eq('id', 1).single().then(({ data, error }) => {
      if (error) setMessage(error.message);
      else setMinutes(Number(data?.duration_minutes) || 30);
      setLoading(false);
    });
  }, []);

  async function save() {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 1 || value > 1440) {
      setMessage('Enter a whole number between 1 and 1440 minutes.');
      return;
    }
    setSaving(true); setMessage('');
    const { error } = await rpc('admin_update_assessment_settings', { p_admin_id: profile.id, p_duration_minutes: value });
    setSaving(false);
    setMessage(error ? error.message : 'Assessment time updated successfully. New attempts will use this duration.');
  }

  if (loading) return <div className="text-muted">Loading...</div>;
  return <div>
    <div className="mb-4"><h5 className="mb-1">Assessment Timer</h5><div className="text-muted small">Set the time limit for each new assessment attempt.</div></div>
    <div className="card shadow-sm"><div className="card-body">
      <label className="form-label fw-semibold">Time Limit (minutes)</label>
      <input type="number" min="1" max="1440" step="1" className="form-control" value={minutes} onChange={e => setMinutes(e.target.value)} />
      <div className="form-text">The timer starts when a user creates an attempt. Closing or refreshing the tab does not reset the remaining time.</div>
      <button className="btn btn-primary mt-3" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Timer'}</button>
      {message && <div className="alert alert-info mt-3 mb-0">{message}</div>}
    </div></div>
  </div>;
}

function CompanyManager({ section }) {
  const field = section === 'about' ? 'about' : 'instructions';
  const title = section === 'about' ? 'About the Company' : 'Instructions';
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const { profile } = useAuth();

  useEffect(() => {
    db('company_info').select('about,instructions').eq('id', 1).single().then(({ data, error }) => {
      if (!error && data) setValue(data[field] || '');
      else if (error) setMessage(error.message);
      setLoading(false);
    });
  }, [field]);

  async function save() {
    setSaving(true);
    setMessage('');
    const { error } = await rpc('admin_update_company', { p_admin_id: profile.id, p_about: field === 'about' ? value : null, p_instructions: field === 'instructions' ? value : null });
    setSaving(false);
    setMessage(error ? error.message : title + ' updated successfully.');
  }

  if (loading) return <div className="text-muted">Loading...</div>;

  return (
    <div>
      <div className="mb-4">
        <h5 className="mb-1">{title}</h5>
        <div className="text-muted small">Manage the content displayed to assessment users.</div>
      </div>
      <div className="card shadow-sm">
        <div className="card-body">
          <label className="form-label fw-semibold">{title}</label>
          <textarea
            className="form-control"
            rows={12}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={section === 'about' ? 'Enter information about your company...' : 'Enter assessment instructions...'}
          />
          <div className="d-flex justify-content-between align-items-center mt-3">
            <small className="text-muted">{value.length} characters</small>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          {message && <div className="alert alert-info mt-3 mb-0">{message}</div>}
        </div>
      </div>
    </div>
  );
}

function QuestionManager() {
  const [questions, setQuestions] = useState([]);
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionPageSize, setQuestionPageSize] = useState(10);
  const [questionPage, setQuestionPage] = useState(1);
  const [form, setForm] = useState(emptyQuestion);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const { profile } = useAuth();

  async function loadQuestions() {
    setLoading(true);
    const { data, error } = await db('questions').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (!error) setQuestions(data || []);
    else setMessage(error.message);
    setLoading(false);
  }

  useEffect(() => { loadQuestions(); }, []);

  const filteredQuestions = useMemo(() => {
    const q = questionSearch.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter((item) => [
      item.question_text, item.assessment_type, item.option_a, item.option_b,
      item.option_c, item.option_d, item.correct_option,
    ].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [questions, questionSearch]);

  useEffect(() => setQuestionPage(1), [questionSearch, questionPageSize]);

  const questionTotalPages = Math.max(1, Math.ceil(filteredQuestions.length / questionPageSize));
  const visibleQuestions = filteredQuestions.slice((questionPage - 1) * questionPageSize, questionPage * questionPageSize);

  const nextOrder = useMemo(
    () => questions.reduce((max, q) => Math.max(max, Number(q.sort_order) || 0), 0) + 1,
    [questions]
  );

  function change(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetForm() {
    setForm({ ...emptyQuestion, sort_order: nextOrder });
    setEditingId(null);
  }

  function editQuestion(q) {
    setEditingId(q.id);
    setForm({
      assessment_type: q.assessment_type || 'general',
      question_text: q.question_text || '',
      option_a: q.option_a || '',
      option_b: q.option_b || '',
      option_c: q.option_c || '',
      option_d: q.option_d || '',
      correct_option: q.correct_option || 'A',
      marks: q.marks ?? 1,
      sort_order: q.sort_order ?? 0,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveQuestion(e) {
    e.preventDefault();
    if (!form.question_text.trim() || !form.option_a.trim() || !form.option_b.trim() || !form.option_c.trim() || !form.option_d.trim()) {
      setMessage('Please fill the question and all four options.');
      return;
    }

    setSaving(true);
    setMessage('');
    const payload = {
      assessment_type: form.assessment_type.trim() || 'general',
      question_text: form.question_text.trim(),
      option_a: form.option_a.trim(),
      option_b: form.option_b.trim(),
      option_c: form.option_c.trim(),
      option_d: form.option_d.trim(),
      correct_option: form.correct_option,
      marks: Number(form.marks) || 1,
      sort_order: Number(form.sort_order) || 0,
    };

    const result = editingId
      ? await rpc('admin_update_question', { p_admin_id: profile.id, p_id: editingId, ...{ p_assessment_type: payload.assessment_type, p_question_text: payload.question_text, p_option_a: payload.option_a, p_option_b: payload.option_b, p_option_c: payload.option_c, p_option_d: payload.option_d, p_correct_option: payload.correct_option, p_marks: payload.marks, p_sort_order: payload.sort_order } })
      : await rpc('admin_create_question', { p_admin_id: profile.id, p_assessment_type: payload.assessment_type, p_question_text: payload.question_text, p_option_a: payload.option_a, p_option_b: payload.option_b, p_option_c: payload.option_c, p_option_d: payload.option_d, p_correct_option: payload.correct_option, p_marks: payload.marks, p_sort_order: payload.sort_order });

    setSaving(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMessage(editingId ? 'Question updated successfully.' : 'Question added successfully.');
    resetForm();
    await loadQuestions();
  }

  async function deleteQuestion(id) {
    if (!window.confirm('Delete this question? Existing answers linked to it will also be removed.')) return;
    const { error } = await rpc('admin_delete_question', { p_admin_id: profile.id, p_id: id });
    if (error) setMessage(error.message);
    else {
      setMessage('Question deleted successfully.');
      if (editingId === id) resetForm();
      await loadQuestions();
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h5 className="mb-1">MCQ Question Bank</h5>
        <div className="text-muted small">Create, edit and delete questions used in the assessment.</div>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h6 className="mb-3">{editingId ? 'Edit Question' : 'Add New Question'}</h6>
          <form onSubmit={saveQuestion}>
            <div className="mb-3">
              <label className="form-label">Question</label>
              <textarea className="form-control" rows={3} value={form.question_text} onChange={(e) => change('question_text', e.target.value)} placeholder="Enter the MCQ question" />
            </div>

            <div className="row">
              {['a', 'b', 'c', 'd'].map((letter) => (
                <div className="col-md-6 mb-3" key={letter}>
                  <label className="form-label">Option {letter.toUpperCase()}</label>
                  <input
                    className="form-control"
                    value={form['option_' + letter]}
                    onChange={(e) => change('option_' + letter, e.target.value)}
                    placeholder={'Enter option ' + letter.toUpperCase()}
                  />
                </div>
              ))}
            </div>

            <div className="row align-items-end">
              <div className="col-md-4 mb-3">
                <label className="form-label">Right Answer</label>
                <select className="form-select" value={form.correct_option} onChange={(e) => change('correct_option', e.target.value)}>
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              </div>
              <div className="col-md-4 mb-3">
                <label className="form-label">Marks</label>
                <input type="number" min="0" step="0.5" className="form-control" value={form.marks} onChange={(e) => change('marks', e.target.value)} />
              </div>
              <div className="col-md-4 mb-3">
                <label className="form-label">Order</label>
                <input type="number" min="0" className="form-control" value={form.sort_order} onChange={(e) => change('sort_order', e.target.value)} />
              </div>
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update Question' : 'Add Question'}</button>
              {editingId && <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
          {message && <div className="alert alert-info mt-3 mb-0">{message}</div>}
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-nowrap" style={{ overflowX: 'auto' }}>
            <h6 className="mb-0 text-nowrap">Existing Questions ({questions.length})</h6>
            <div className="d-flex align-items-center gap-2 flex-nowrap ms-auto">
              <input
                className="form-control form-control-sm"
                style={{ width: 280, minWidth: 280 }}
                placeholder="Search questions, options, assessment…"
                value={questionSearch}
                onChange={(e) => setQuestionSearch(e.target.value)}
              />
              <div className="dropdown">
                <button className="btn btn-sm btn-outline-primary dropdown-toggle text-nowrap" data-bs-toggle="dropdown">
                  Export
                </button>
                <ul className="dropdown-menu dropdown-menu-end">
                  <li><button className="dropdown-item" disabled={exporting} onClick={async()=>{setExporting(true);try{await exportQuestions('copy',filteredQuestions)}finally{setExporting(false)}}}>Export as Copy</button></li>
                  <li><button className="dropdown-item" disabled={exporting} onClick={async()=>{setExporting(true);try{await exportQuestions('excel',filteredQuestions)}catch(e){window.alert(e.message||'Export failed.')}finally{setExporting(false)}}}>Export as Excel</button></li>
                  <li><button className="dropdown-item" disabled={exporting} onClick={async()=>{setExporting(true);try{await exportQuestions('pdf',filteredQuestions)}catch(e){window.alert(e.message||'Export failed.')}finally{setExporting(false)}}}>Export as PDF</button></li>
                  <li><button className="dropdown-item" disabled={exporting} onClick={async()=>{setExporting(true);try{await exportQuestions('docx',filteredQuestions)}catch(e){window.alert(e.message||'Export failed.')}finally{setExporting(false)}}}>Export as DOCX</button></li>
                </ul>
              </div>
              <button className="btn btn-sm btn-outline-secondary text-nowrap" onClick={loadQuestions}>Refresh</button>
            </div>
          </div>
          {loading ? <div className="text-muted">Loading questions...</div> : questions.length === 0 ? (
            <div className="text-muted">No questions added yet.</div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>#</th><th>Assessment</th><th>Question</th><th>Options</th><th>Right Answer</th><th>Marks</th><th>Order</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleQuestions.map((q, index) => (
                      <tr key={q.id}>
                        <td>{(questionPage - 1) * questionPageSize + index + 1}</td>
                        <td className="text-nowrap">{q.assessment_type}</td>
                        <td style={{ minWidth: 280 }}>{q.question_text}</td>
                        <td className="small" style={{ minWidth: 260 }}>
                          <div>A. {q.option_a}</div><div>B. {q.option_b}</div><div>C. {q.option_c}</div><div>D. {q.option_d}</div>
                        </td>
                        <td><strong>{q.correct_option}</strong></td>
                        <td>{q.marks}</td>
                        <td>{q.sort_order}</td>
                        <td className="text-nowrap">
                          <button className="btn btn-sm btn-outline-primary me-1" onClick={() => editQuestion(q)}>Edit</button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => deleteQuestion(q.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                    {visibleQuestions.length === 0 && <tr><td colSpan={8} className="text-center text-muted py-4">No questions found.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="d-flex justify-content-between align-items-center pt-3 mt-3 border-top gap-2 flex-wrap">
                <div className="small text-muted">Showing {filteredQuestions.length ? (questionPage - 1) * questionPageSize + 1 : 0}–{Math.min(questionPage * questionPageSize, filteredQuestions.length)} of {filteredQuestions.length}</div>
                <div className="d-flex align-items-center gap-2">
                  <label className="small text-muted">Rows:</label>
                  <select className="form-select form-select-sm" style={{ width: 90 }} value={questionPageSize} onChange={(e) => setQuestionPageSize(Number(e.target.value))}>
                    {QUESTION_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button className="btn btn-sm btn-outline-secondary" disabled={questionPage <= 1} onClick={() => setQuestionPage((p) => p - 1)}>Previous</button>
                  <span className="small">Page {questionPage} / {questionTotalPages}</span>
                  <button className="btn btn-sm btn-outline-secondary" disabled={questionPage >= questionTotalPages} onClick={() => setQuestionPage((p) => p + 1)}>Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
