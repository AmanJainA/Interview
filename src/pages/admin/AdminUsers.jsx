import { useEffect, useMemo, useState } from 'react';
import { db, rpc } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { name:'', email:'', password:'', registration_no:'', contact_number:'', gender:'', father_name:'', stream:'', location:'', usertype:'user' };

export default function AdminUsers() {
  const { profile } = useAuth();
  const [users,setUsers]=useState([]), [form,setForm]=useState(EMPTY), [editing,setEditing]=useState(null);
  const [search,setSearch]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState(''), [message,setMessage]=useState('');

  async function load(){
    const {data,error}=await db('users').select('id,name,email,registration_no,contact_number,gender,father_name,stream,location,usertype,created_date,is_online,last_active_at').order('created_date',{ascending:false});
    if(error)setError(error.message); else setUsers(data||[]);
  }
  useEffect(()=>{load()},[]);
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return q?users.filter(u=>Object.values(u).some(v=>String(v??'').toLowerCase().includes(q))):users},[users,search]);
  const change=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  function reset(){setEditing(null);setForm(EMPTY);setError('')}
  function edit(u){setEditing(u.id);setForm({...EMPTY,...u,password:''});setError('');setMessage('');window.scrollTo({top:0,behavior:'smooth'})}

  async function save(e){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      if(!form.name.trim()||!form.email.trim())throw new Error('Name and email are required.');
      if(!editing){
        if(form.password.length<6)throw new Error('Password must be at least 6 characters.');
        const {error}=await rpc('register_user',{p_name:form.name.trim(),p_email:form.email.trim().toLowerCase(),p_password:form.password,p_stream:form.stream||null,p_location:form.location||null,p_registration_no:form.registration_no||null,p_contact_number:form.contact_number||null,p_gender:form.gender||null,p_father_name:form.father_name||null});
        if(error)throw error;
        if(form.usertype==='admin'){
          const {data:created}=await db('users').select('id').eq('email',form.email.trim().toLowerCase()).single();
          if(created){const {error:e2}=await db('users').update({usertype:'admin'}).eq('id',created.id);if(e2)throw e2}
        }
        setMessage('User added successfully.');
      }else{
        const {error}=await db('users').update({name:form.name.trim(),email:form.email.trim().toLowerCase(),registration_no:form.registration_no||null,contact_number:form.contact_number||null,gender:form.gender||null,father_name:form.father_name||null,stream:form.stream||null,location:form.location||null,usertype:form.usertype}).eq('id',editing);
        if(error)throw error;
        if(form.password.trim()){const {error:e2}=await rpc('admin_update_user_password',{p_user_id:editing,p_password:form.password});if(e2)throw e2}
        setMessage('User updated successfully.');
      }
      reset();await load();
    }catch(e){setError(e.message||'Could not save user.')}finally{setBusy(false)}
  }
  async function remove(u){
    if(u.id===profile?.id){setError('You cannot delete the account you are currently using.');return}
    if(!confirm(`Delete user “${u.name}” (${u.email})? Their assessment attempts will also be deleted.`))return;
    const {error}=await db('users').delete().eq('id',u.id);
    if(error)setError(error.message);else{setMessage('User deleted successfully.');if(editing===u.id)reset();await load()}
  }

  const fields=[['name','Full Name','text',true],['email','Email','email',true],['registration_no','Registration No.','text',false],['contact_number','Contact Number','tel',false],['father_name',"Father's Name",'text',false],['stream','Stream','text',false],['location','Current Location','text',false],['password',editing?'New Password (leave blank to keep current)':'Password','password',!editing]];
  return <div>
    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><h5 className="mb-0">Manage Users</h5><span className="text-muted small">{users.length} user(s)</span></div>
    {error&&<div className="alert alert-danger py-2">{error}</div>}{message&&<div className="alert alert-success py-2">{message}</div>}
    <div className="card shadow-sm p-3 mb-4">
      <h6>{editing?'Update User':'Add User'}</h6>
      <form onSubmit={save}><div className="row">
        {fields.map(([name,label,type,required])=><div className="col-md-3 mb-3" key={name}><label className="form-label">{label}</label><input name={name} type={type} className="form-control" value={form[name]||''} onChange={change} required={required}/></div>)}
        <div className="col-md-3 mb-3"><label className="form-label">Gender</label><select name="gender" className="form-select" value={form.gender||''} onChange={change}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
        <div className="col-md-3 mb-3"><label className="form-label">User Type</label><select name="usertype" className="form-select" value={form.usertype} onChange={change}><option value="user">User / Student</option><option value="admin">Admin</option></select></div>
      </div><div className="d-flex gap-2"><button className="btn btn-primary" disabled={busy}>{busy?'Saving…':editing?'Update User':'Add User'}</button>{editing&&<button type="button" className="btn btn-outline-secondary" onClick={reset}>Cancel</button>}</div></form>
    </div>
    <div className="card shadow-sm"><div className="p-3 border-bottom"><input className="form-control" placeholder="Search name, email, registration no., contact, stream, location..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead><tr><th>#</th><th>User</th><th>Registration No.</th><th>Contact</th><th>Stream</th><th>Type</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>
        {filtered.map((u,i)=><tr key={u.id}><td>{i+1}</td><td><div className="fw-semibold">{u.name}</div><div className="small text-muted">{u.email}</div></td><td>{u.registration_no||'—'}</td><td>{u.contact_number||'—'}</td><td>{u.stream||'—'}</td><td><span className={`badge ${u.usertype==='admin'?'bg-dark':'bg-secondary'}`}>{u.usertype}</span></td><td><span className={`badge ${u.is_online?'bg-success':'bg-secondary'}`}>{u.is_online?'Online':'Offline'}</span></td><td className="small">{u.created_date?new Date(u.created_date).toLocaleString():'—'}</td><td><div className="d-flex gap-1"><button className="btn btn-sm btn-outline-primary" onClick={()=>edit(u)}>Edit</button><button className="btn btn-sm btn-outline-danger" onClick={()=>remove(u)}>Delete</button></div></td></tr>)}
        {!filtered.length&&<tr><td colSpan="9" className="text-center text-muted py-4">No users found.</td></tr>}
      </tbody></table></div>
    </div>
  </div>
}
