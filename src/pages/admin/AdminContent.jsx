import { useEffect, useMemo, useState, useRef } from 'react';

const QUESTION_PAGE_OPTIONS = [10, 20, 50, 100, 500];
import { db, rpc } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';


const QUESTION_EXPORT_HEADERS = ['#','Assessment','Question','Option A','Option B','Option C','Option D','Right Answer','Marks','Order'];
function questionExportRows(list) { return list.map((q,i)=>[i+1,q.assessment_type||'',q.question_text||'',q.option_a||'',q.option_b||'',q.option_c||'',q.option_d||'',q.correct_option||'',q.marks??'',q.sort_order??'']); }
function loadExportScript(src, name) { if (window[name]) return Promise.resolve(window[name]); return new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src=src; s.onload=()=>resolve(window[name]); s.onerror=reject; document.head.appendChild(s); }); }
function downloadQuestionBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const QUESTION_IMPORT_HEADERS = ['Assessment','Question','Option A','Option B','Option C','Option D','Right Answer','Marks','Order'];
const QUESTION_IMPORT_SAMPLE = [
  ['general','What is 2 + 2?','3','4','5','6','B','1','1'],
  ['general','Which language is used for web page structure?','CSS','HTML','PHP','SQL','B','1','2'],
];
function csvEscape(value) { const s = String(value ?? ''); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function questionTemplateCsv() { return [QUESTION_IMPORT_HEADERS, ...QUESTION_IMPORT_SAMPLE].map(row => row.map(csvEscape).join(',')).join('\\r\\n'); }
function downloadTextFile(textContent, name, type='text/csv;charset=utf-8') { const blob = new Blob([textContent], {type}); downloadQuestionBlob(blob, name); }
async function downloadQuestionTemplate(type) {
  if (type === 'csv') { downloadTextFile(questionTemplateCsv(), 'mcq-question-template.csv'); return; }
  const XLSX = await loadExportScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','XLSX');
  const ws = XLSX.utils.aoa_to_sheet([QUESTION_IMPORT_HEADERS, ...QUESTION_IMPORT_SAMPLE]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'MCQ Questions');
  XLSX.writeFile(wb, 'mcq-question-template.xlsx');
}
function parseCsv(textContent) {
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<textContent.length;i++){ const ch=textContent[i], next=textContent[i+1];
    if(quoted){ if(ch==='"' && next==='"'){cell+='"';i++;} else if(ch==='"'){quoted=false;} else cell+=ch; }
    else if(ch==='"' && cell===''){quoted=true;} else if(ch===','){row.push(cell);cell='';} else if(ch==='\\n'){row.push(cell);rows.push(row);row=[];cell='';} else if(ch!=='\\r'){cell+=ch;}
  }
  if(cell!=='' || row.length){row.push(cell);rows.push(row);} return rows.filter(r=>r.some(v=>String(v).trim()!==''));
}
async function parseQuestionImportFile(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if(ext==='csv'){ return parseCsv(await file.text()); }
  const XLSX = await loadExportScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','XLSX');
  const data = await file.arrayBuffer(); const wb = XLSX.read(data,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
}
function normalizeImportHeader(value){return String(value??'').trim().toLowerCase().replace(/\\s+/g,' ');}
async function importQuestionsFile(file, adminId) {
  const rows=await parseQuestionImportFile(file); if(!rows.length) throw new Error('The selected file is empty.');
  const headers=rows[0].map(normalizeImportHeader); const expected=QUESTION_IMPORT_HEADERS.map(normalizeImportHeader);
  if(headers.length<expected.length || expected.some((h,i)=>headers[i]!==h)) throw new Error('Invalid format. Please use the MCQ import template so the columns stay in this order: '+QUESTION_IMPORT_HEADERS.join(', '));
  const dataRows=rows.slice(1).filter(r=>r.some(v=>String(v??'').trim()!=='')); if(!dataRows.length) throw new Error('No question rows found in the file.');
  const errors=[];
  for(let i=0;i<dataRows.length;i++){
    const r=dataRows[i], line=i+2; const [assessment,question,a,b,c,d,right,marks,order]=QUESTION_IMPORT_HEADERS.map((_,idx)=>String(r[idx]??'').trim());
    if(!question||!a||!b||!c||!d) { errors.push('Row '+line+': Question and all four options are required.'); continue; }
    const answer=right.toUpperCase(); if(!['A','B','C','D'].includes(answer)){errors.push('Row '+line+': Right Answer must be A, B, C or D.');continue;}
    const markValue=marks===''?1:Number(marks), orderValue=order===''?0:Number(order);
    if(!Number.isFinite(markValue)||markValue<0){errors.push('Row '+line+': Marks must be a valid number.');continue;}
    if(!Number.isInteger(orderValue)||orderValue<0){errors.push('Row '+line+': Order must be a whole number.');continue;}
    const result=await rpc('admin_create_question',{p_admin_id:adminId,p_assessment_type:assessment||'general',p_question_text:question,p_option_a:a,p_option_b:b,p_option_c:c,p_option_d:d,p_correct_option:answer,p_marks:markValue,p_sort_order:orderValue});
    if(result.error) errors.push('Row '+line+': '+result.error.message);
  }
  if(errors.length) throw new Error('Import completed with '+errors.length+' issue(s).\\n\\n'+errors.slice(0,8).join('\\n')+(errors.length>8?'\\n...':'') );
  return dataRows.length;
}

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

function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);
  const [sourceMode, setSourceMode] = useState(false);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value || '';
  }, [value]);

  function exec(command, commandValue = null) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || '');
  }

  function createLink() {
    const url = window.prompt('Enter URL (https://...):');
    if (url) exec('createLink', url);
  }

  function createCallLink() {
    const number = window.prompt('Enter phone number:', '');
    if (!number) return;
    const clean = number.replace(/[^0-9+]/g, '');
    if (!clean) return;
    editorRef.current?.focus();
    const selection = window.getSelection();
    const selected = selection && selection.toString().trim();
    if (selected) {
      exec('createLink', 'tel:' + clean);
    } else {
      const label = '📞 Call ' + number;
      document.execCommand('insertHTML', false, '<a href="tel:' + clean + '">' + label + '</a>');
      onChange(editorRef.current?.innerHTML || '');
    }
  }

  function handleInput() {
    onChange(editorRef.current?.innerHTML || '');
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault(); exec('bold');
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault(); exec('italic');
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault(); exec('underline');
    }
  }

  return (
    <div className="rich-editor border rounded">
      <div className="rich-editor-toolbar d-flex flex-wrap gap-1 p-2 border-bottom bg-light">
        <button type="button" className="btn btn-sm btn-outline-secondary fw-bold" title="Bold" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('bold')}>B</button>
        <button type="button" className="btn btn-sm btn-outline-secondary fst-italic" title="Italic" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('italic')}>I</button>
        <button type="button" className="btn btn-sm btn-outline-secondary text-decoration-underline" title="Underline" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('underline')}>U</button>
        <select className="form-select form-select-sm w-auto" title="Heading" defaultValue="" onChange={(e)=>{if(e.target.value) exec('formatBlock', e.target.value); e.target.value='';}}>
          <option value="">Paragraph / Heading</option>
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Bulleted list" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('insertUnorderedList')}>• List</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Numbered list" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('insertOrderedList')}>1. List</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Add link" onMouseDown={(e)=>e.preventDefault()} onClick={createLink}>🔗 Link</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Add clickable phone number" onMouseDown={(e)=>e.preventDefault()} onClick={createCallLink}>📞 Call</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Align left" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('justifyLeft')}>Left</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Center" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('justifyCenter')}>Center</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Align right" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('justifyRight')}>Right</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Undo" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('undo')}>↶</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Redo" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('redo')}>↷</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="Clear formatting" onMouseDown={(e)=>e.preventDefault()} onClick={()=>exec('removeFormat')}>Clear</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" title="View HTML source" onMouseDown={(e)=>e.preventDefault()} onClick={()=>setSourceMode(v=>!v)}>{sourceMode ? 'Visual' : 'HTML'}</button>
      </div>
      {sourceMode ? (
        <textarea className="form-control border-0 rounded-0" rows={14} value={value} onChange={(e)=>onChange(e.target.value)} />
      ) : (
        <div
          ref={editorRef}
          className="rich-editor-content p-3"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />
      )}
      <div className="small text-muted px-3 py-2 border-top">
        Supports headings, <b>bold</b>, <i>italic</i>, <u>underline</u>, bullet/numbered lists, links and clickable phone numbers.
      </div>
    </div>
  );
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
          <RichTextEditor
            value={value}
            onChange={setValue}
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
  const [importing, setImporting] = useState(false);
  const [showImportHelp, setShowImportHelp] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
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
          <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-nowrap" style={{ overflow: 'visible', position: 'relative', zIndex: 20 }}>
            <h6 className="mb-0 text-nowrap">Existing Questions ({questions.length})</h6>
            <div className="d-flex align-items-center gap-2 flex-nowrap ms-auto" style={{ overflow: 'visible' }}>
              <input
                className="form-control form-control-sm"
                style={{ width: 280, minWidth: 280 }}
                placeholder="Search questions, options, assessment…"
                value={questionSearch}
                onChange={(e) => setQuestionSearch(e.target.value)}
              />
              <div className="dropdown position-relative">
                <button type="button" className="btn btn-sm btn-outline-success dropdown-toggle text-nowrap" disabled={importing} onClick={() => setOpenMenu(openMenu === 'import' ? null : 'import')}>

                  {importing ? 'Importing...' : 'Import'}
                </button>
                <ul className={`dropdown-menu dropdown-menu-end ${openMenu === 'import' ? 'show' : ''}`} style={{ right: 0, left: 'auto', zIndex: 2000 }}>
                  <li><label className="dropdown-item mb-0" style={{cursor:'pointer'}}><input type="file" accept=".csv,.xlsx,.xls" className="d-none" onChange={async(e)=>{const file=e.target.files?.[0];e.target.value='';setOpenMenu(null);if(!file)return;setImporting(true);setMessage('');try{const count=await importQuestionsFile(file,profile.id);setMessage(count+' MCQ question(s) imported successfully.');await loadQuestions();}catch(err){setMessage(err.message||'Import failed.')}finally{setImporting(false)}}}/>Upload CSV / Excel</label></li>
                  <li><hr className="dropdown-divider"/></li>
                  <li><button className="dropdown-item" onClick={async()=>{setOpenMenu(null);try{await downloadQuestionTemplate('csv')}catch(e){window.alert(e.message||'Template download failed.')}}}>Download CSV Format</button></li>
                  <li><button className="dropdown-item" onClick={async()=>{setOpenMenu(null);try{await downloadQuestionTemplate('excel')}catch(e){window.alert(e.message||'Template download failed.')}}}>Download Excel Format</button></li>
                  <li><button className="dropdown-item" onClick={()=>{setOpenMenu(null);setShowImportHelp(true)}}>View Format / Instructions</button></li>
                </ul>
              </div>
              <div className="dropdown position-relative">
                <button type="button" className="btn btn-sm btn-outline-primary dropdown-toggle text-nowrap" onClick={() => setOpenMenu(openMenu === 'export' ? null : 'export')}>
                  Export
                </button>
                <ul className={`dropdown-menu dropdown-menu-end ${openMenu === 'export' ? 'show' : ''}`} style={{ right: 0, left: 'auto' }}>
                  <li><button className="dropdown-item" disabled={exporting} onClick={async()=>{setOpenMenu(null);setExporting(true);try{await exportQuestions('copy',filteredQuestions)}catch(e){window.alert(e.message||'Export failed.')}finally{setExporting(false)}}}>Export as Copy</button></li>
                  <li><button className="dropdown-item" disabled={exporting} onClick={async()=>{setOpenMenu(null);setExporting(true);try{await exportQuestions('excel',filteredQuestions)}catch(e){window.alert(e.message||'Export failed.')}finally{setExporting(false)}}}>Export as Excel</button></li>
                  <li><button className="dropdown-item" disabled={exporting} onClick={async()=>{setOpenMenu(null);setExporting(true);try{await exportQuestions('pdf',filteredQuestions)}catch(e){window.alert(e.message||'Export failed.')}finally{setExporting(false)}}}>Export as PDF</button></li>
                  <li><button className="dropdown-item" disabled={exporting} onClick={async()=>{setOpenMenu(null);setExporting(true);try{await exportQuestions('docx',filteredQuestions)}catch(e){window.alert(e.message||'Export failed.')}finally{setExporting(false)}}}>Export as DOCX</button></li>
                </ul>
              </div>
              <button className="btn btn-sm btn-outline-secondary text-nowrap" onClick={loadQuestions}>Refresh</button>
            </div>
          </div>
          {showImportHelp && <div className="alert alert-light border mb-3">
            <div className="d-flex justify-content-between align-items-center"><strong>MCQ Import Format</strong><button type="button" className="btn-close" onClick={()=>setShowImportHelp(false)} /></div>
            <div className="small text-muted mt-2">Upload a CSV, XLSX or XLS file. Keep the first row exactly in this order:</div>
            <code className="d-block small mt-2">Assessment | Question | Option A | Option B | Option C | Option D | Right Answer | Marks | Order</code>
            <ul className="small mb-0 mt-2"><li><strong>Right Answer:</strong> A, B, C or D.</li><li><strong>Marks:</strong> number; blank defaults to 1.</li><li><strong>Order:</strong> whole number; blank defaults to 0.</li><li>Each following row becomes one MCQ question in the question bank.</li></ul>
          </div>}
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
