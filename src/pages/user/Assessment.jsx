import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';

const ASSESSMENT_TYPE = 'general'; // change if you run more than one assessment

export default function Assessment() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({}); // question_id -> 'A'|'B'|'C'|'D'
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  // ---- bootstrap: block re-entry, resume or create the attempt ----
  useEffect(() => {
    async function bootstrap() {
      // 1) already submitted? never let them back into the assessment
      const { data: submitted } = await db('assessment_attempts')
        .select('id')
        .eq('user_id', profile.id)
        .eq('assessment_type', ASSESSMENT_TYPE)
        .eq('status', 'submitted')
        .maybeSingle();

      if (submitted) {
        navigate('/dashboard/thank-you', { replace: true });
        return;
      }

      // 2) load the question bank
      const { data: qs } = await db('questions')
        .select('*')
        .eq('assessment_type', ASSESSMENT_TYPE)
        .order('sort_order', { ascending: true });
      setQuestions(qs || []);

      // 3) load the current admin-configured duration
      const { data: settings } = await db('company_info').select('duration_minutes').eq('id', 1).maybeSingle();
      const configuredDuration = Math.max(1, Number(settings?.duration_minutes) || 30);

      // 4) resume an in-progress attempt, or create a new one
      let { data: existing } = await db('assessment_attempts')
        .select('*')
        .eq('user_id', profile.id)
        .eq('assessment_type', ASSESSMENT_TYPE)
        .eq('status', 'in_progress')
        .maybeSingle();

      if (!existing) {
        const { data: created, error } = await db('assessment_attempts')
          .insert({
            user_id: profile.id,
            assessment_type: ASSESSMENT_TYPE,
            total_questions: (qs || []).length,
            max_score: (qs || []).reduce((s, q) => s + Number(q.marks), 0),
            duration_minutes: configuredDuration,
          })
          .select()
          .single();
        if (error) {
          console.error(error);
          return;
        }
        existing = created;
      }
      const elapsedNow = Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000);
      const attemptTotalSec = Math.max(1, Number(existing.duration_minutes) || configuredDuration) * 60;
      if (elapsedNow >= attemptTotalSec) {
        const { data: expiredAnswers } = await db('user_answers')
          .select('is_correct, question_id')
          .eq('attempt_id', existing.id);
        const correctCount = (expiredAnswers || []).filter((a) => a.is_correct).length;
        const score = (expiredAnswers || [])
          .filter((a) => a.is_correct)
          .reduce((sum, a) => {
            const q = (qs || []).find((x) => x.id === a.question_id);
            return sum + (q ? Number(q.marks) : 0);
          }, 0);
        const maxScore = (qs || []).reduce((s, q) => s + Number(q.marks), 0) || 1;
        const percentage = Math.round((score / maxScore) * 10000) / 100;
        await db('assessment_attempts').update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          correct_count: correctCount,
          score,
          max_score: maxScore,
          percentage,
        }).eq('id', existing.id).eq('status', 'in_progress');
        navigate('/dashboard/thank-you', { replace: true, state: { auto: true } });
        return;
      }

      setAttempt(existing);

      // 4) load any answers already saved (crash recovery)
      const { data: savedAnswers } = await db('user_answers')
        .select('question_id, selected_option')
        .eq('attempt_id', existing.id);
      const map = {};
      (savedAnswers || []).forEach((a) => (map[a.question_id] = a.selected_option));
      setAnswers(map);

      // 6) work out remaining time from the attempt's stored duration, so refresh/close/reopen never resets it
      const attemptDuration = Math.max(1, Number(existing.duration_minutes) || configuredDuration);
      const elapsedSec = Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000);
      const totalSec = attemptDuration * 60;
      setSecondsLeft(Math.max(totalSec - elapsedSec, 0));

      setLoading(false);
    }
    if (profile) bootstrap();
  }, [profile, navigate]);

  // ---- timer ----
  useEffect(() => {
    if (loading) return;
    if (secondsLeft <= 0) {
      handleFinalSubmit(true);
      return;
    }
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, loading]);

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  // ---- save one question's answer immediately (crash-safe) ----
  async function saveAnswer(questionId, option) {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
    setSaving(true);
    const q = questions.find((x) => x.id === questionId);
    const isCorrect = q.correct_option === option;
    await db('user_answers').upsert(
      {
        attempt_id: attempt.id,
        question_id: questionId,
        selected_option: option,
        is_correct: isCorrect,
      },
      { onConflict: 'attempt_id,question_id' }
    );
    setSaving(false);
  }

  // ---- final submit: score everything and close the attempt ----
  const handleFinalSubmit = useCallback(
    async (auto = false) => {
      if (submittingRef.current || !attempt) return;
      submittingRef.current = true;

      const { data: savedAnswers } = await db('user_answers')
        .select('is_correct, question_id')
        .eq('attempt_id', attempt.id);

      const correctCount = (savedAnswers || []).filter((a) => a.is_correct).length;
      const score = (savedAnswers || [])
        .filter((a) => a.is_correct)
        .reduce((sum, a) => {
          const q = questions.find((x) => x.id === a.question_id);
          return sum + (q ? Number(q.marks) : 0);
        }, 0);
      const maxScore = questions.reduce((s, q) => s + Number(q.marks), 0) || 1;
      const percentage = Math.round((score / maxScore) * 10000) / 100;

      await db('assessment_attempts')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          correct_count: correctCount,
          score,
          max_score: maxScore,
          percentage,
        })
        .eq('id', attempt.id);

      navigate('/dashboard/thank-you', { replace: true, state: { auto } });
    },
    [attempt, questions, navigate]
  );

  if (loading) return <div>Loading assessment…</div>;
  if (questions.length === 0) return <div>No questions have been added for this assessment yet.</div>;

  const q = questions[current];
  const answeredCount = Object.keys(answers).length;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Assessment</h5>
        <span className={`badge fs-6 ${secondsLeft < 60 ? 'bg-danger' : 'bg-dark'}`}>
          ⏱ {minutes}:{seconds}
        </span>
      </div>

      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <div className="d-flex justify-content-between text-muted small mb-2">
            <span>Question {current + 1} of {questions.length}</span>
            {saving && <span>Saving…</span>}
          </div>
          <h6 className="mb-3">{q.question_text}</h6>

          {['A', 'B', 'C', 'D'].map((opt) => (
            <div className="form-check mb-2" key={opt}>
              <input
                className="form-check-input"
                type="radio"
                name={`q-${q.id}`}
                id={`q-${q.id}-${opt}`}
                checked={answers[q.id] === opt}
                onChange={() => saveAnswer(q.id, opt)}
              />
              <label className="form-check-label" htmlFor={`q-${q.id}-${opt}`}>
                {q[`option_${opt.toLowerCase()}`]}
              </label>
            </div>
          ))}

          <div className="d-flex justify-content-between mt-4">
            <button
              className="btn btn-outline-secondary"
              disabled={current === 0}
              onClick={() => setCurrent((c) => c - 1)}
            >
              Previous
            </button>
            <button
              className="btn btn-outline-primary"
              disabled={current === questions.length - 1}
              onClick={() => setCurrent((c) => c + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <div className="small text-muted mb-2">
            {answeredCount} of {questions.length} answered — click any number to jump to that question
          </div>
          {questions.map((qq, idx) => (
            <button
              key={qq.id}
              className={`btn qnav-btn ${
                idx === current
                  ? 'btn-primary'
                  : answers[qq.id]
                  ? 'btn-success text-white'
                  : 'btn-outline-secondary'
              }`}
              onClick={() => setCurrent(idx)}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-danger" onClick={() => handleFinalSubmit(false)}>
        Submit Assessment
      </button>
    </div>
  );
}
