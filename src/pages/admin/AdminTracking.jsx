import { useEffect,useMemo,useState } from 'react';
import { db } from '../../supabaseClient';
const PAGE_OPTIONS=[10,20,50,100,500];
const onlineNow=u=>u.last_active_at && Date.now()-new Date(u.last_active_at).getTime()<=90000;
const fmt=v=>v?new Date(v).toLocaleString('en-IN'):'—';

export default function AdminTracking(){
 const [tab,setTab]=useState('online'),[users,setUsers]=useState([]),[activity,setActivity]=useState([]),[search,setSearch]=useState(''),[size,setSize]=useState(10),[page,setPage]=useState(1);
 async function load(){const [u,a]=await Promise.all([db('users').select('id,name,email,stream,location,registration_no,last_active_at').order('last_active_at',{ascending:false}),db('page_activity').select('*').order('visit_time',{ascending:false}).limit(5000)]);setUsers(u.data||[]);setActivity(a.data||[]);}
 useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t)},[]);
 useEffect(()=>setPage(1),[tab,search,size]);
 const records=useMemo(()=>{const q=search.toLowerCase().trim(); if(tab==='activity')return activity.filter(a=>!q||[a.username,a.email,a.ip_address,a.mac_address,a.visited_page,a.browser,a.os].some(v=>String(v||'').toLowerCase().includes(q))); const list=users.filter(u=>tab==='online'?onlineNow(u):!onlineNow(u));return list.filter(u=>!q||[u.name,u.email,u.stream,u.location,u.registration_no].some(v=>String(v||'').toLowerCase().includes(q)));},[tab,users,activity,search]);
 const total=Math.max(1,Math.ceil(records.length/size)), rows=records.slice((page-1)*size,page*size);
 return <div>
  <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap"><h5 className="mb-0">Manage Tracking</h5><div className="d-flex gap-2 flex-wrap">
   <button className={`btn btn-sm ${tab==='online'?'btn-success':'btn-outline-success'}`} onClick={()=>setTab('online')}>Online ({users.filter(onlineNow).length})</button>
   <button className={`btn btn-sm ${tab==='offline'?'btn-secondary':'btn-outline-secondary'}`} onClick={()=>setTab('offline')}>Offline ({users.filter(u=>!onlineNow(u)).length})</button>
   <button className={`btn btn-sm ${tab==='activity'?'btn-primary':'btn-outline-primary'}`} onClick={()=>setTab('activity')}>Page Activity</button>
   <button className="btn btn-sm btn-outline-secondary" onClick={load}>Refresh</button>
  </div></div>
  <div className="card stat-card"><div className="p-3 border-bottom d-flex justify-content-between gap-2"><input className="form-control form-control-sm" style={{maxWidth:380}} placeholder={tab==='activity'?'Search username, email, IP, page, browser…':'Search users…'} value={search} onChange={e=>setSearch(e.target.value)}/><span className="small text-muted text-nowrap">{records.length} record(s)</span></div>
  <div className="table-responsive">{tab==='activity'?<table className="table table-hover align-middle mb-0"><thead><tr><th>Username</th><th>Email</th><th>MAC Address</th><th>IP Address</th><th>Visit Time</th><th>Visited Page</th><th>Browser</th><th>OS</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td>{a.username||'—'}</td><td>{a.email||'—'}</td><td>{a.mac_address||'Not available'}</td><td>{a.ip_address||'—'}</td><td className="text-nowrap small">{fmt(a.visit_time)}</td><td className="small">{a.visited_page}</td><td>{a.browser||'—'}</td><td>{a.os||'—'}</td></tr>)}{!rows.length&&<tr><td colSpan="8" className="text-center text-muted py-4">No activity found.</td></tr>}</tbody></table>:<table className="table table-hover align-middle mb-0"><thead><tr><th>User</th><th>Registration No.</th><th>Stream</th><th>Location</th><th>Status</th><th>Last Active</th></tr></thead><tbody>{rows.map(u=><tr key={u.id}><td><strong>{u.name}</strong><div className="small text-muted">{u.email}</div></td><td>{u.registration_no||'—'}</td><td>{u.stream||'—'}</td><td>{u.location||'—'}</td><td><span className={`badge ${onlineNow(u)?'bg-success':'bg-secondary'}`}>{onlineNow(u)?'Online':'Offline'}</span></td><td className="small">{fmt(u.last_active_at)}</td></tr>)}{!rows.length&&<tr><td colSpan="6" className="text-center text-muted py-4">No users found.</td></tr>}</tbody></table>}</div>
  <div className="d-flex justify-content-between align-items-center p-3 border-top gap-2 flex-wrap"><span className="small text-muted">Showing {records.length?(page-1)*size+1:0}–{Math.min(page*size,records.length)} of {records.length}</span><div className="d-flex align-items-center gap-2"><label className="small text-muted">Rows:</label><select className="form-select form-select-sm" style={{width:90}} value={size} onChange={e=>setSize(Number(e.target.value))}>{PAGE_OPTIONS.map(n=><option key={n}>{n}</option>)}</select><button className="btn btn-sm btn-outline-secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span className="small">Page {page} / {total}</span><button className="btn btn-sm btn-outline-secondary" disabled={page>=total} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>
 </div></div>;
}
