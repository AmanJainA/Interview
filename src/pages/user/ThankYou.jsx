import { useLocation } from 'react-router-dom';

export default function ThankYou() {
  const { state } = useLocation();

  return (
    <div className="d-flex flex-column align-items-center justify-content-center text-center" style={{ minHeight: '70vh' }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <h3 className="mt-3">Thank you!</h3>
      <p className="text-muted" style={{ maxWidth: 420 }}>
        {state?.auto
          ? 'Time was up, so your assessment was submitted automatically.'
          : 'Your assessment has been submitted successfully.'}
        <br />
        You can close this window now — you won't be able to retake this assessment.
      </p>
    </div>
  );
}
