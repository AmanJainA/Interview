import { useEffect, useState } from 'react';
import { db } from '../../supabaseClient';

export default function Home() {
  const [info, setInfo] = useState({ about: '', instructions: '' });

  useEffect(() => {
    db('company_info')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data }) => data && setInfo(data));
  }, []);

  return (
    <div className="row">
      <div className="col-md-6 mb-4">
        <div className="card h-100 shadow-sm">
          <div className="card-body">
            <h5 className="card-title">About the company</h5>
            <p className="card-text" style={{ whiteSpace: 'pre-wrap' }}>
              {info.about}
            </p>
          </div>
        </div>
      </div>
      <div className="col-md-6 mb-4">
        <div className="card h-100 shadow-sm">
          <div className="card-body">
            <h5 className="card-title">Instructions</h5>
            <p className="card-text" style={{ whiteSpace: 'pre-wrap' }}>
              {info.instructions}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
