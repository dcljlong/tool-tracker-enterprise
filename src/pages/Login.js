import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Loader2 } from 'lucide-react';

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Add Supabase auth here
    setError('Supabase not configured. Add credentials to .env file.');
    setLoading(false);
  };

  return (
    <div style={{minHeight:'100vh',background:'#f9fafb',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',fontFamily:'system-ui,-apple-system,sans-serif'}}>
      <div style={{maxWidth:'400px',width:'100%'}}>
        <div style={{textAlign:'center',marginBottom:'32px'}}>
          <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'64px',height:'64px',background:'#2563eb',borderRadius:'12px',marginBottom:'16px'}}>
            <Wrench size={32} color="white" />
          </div>
          <h1 style={{fontSize:'24px',fontWeight:'bold',color:'#111827',margin:0}}>Tool Tracker Enterprise</h1>
          <p style={{color:'#6b7280',marginTop:'4px'}}>Equipment Management System</p>
        </div>

        <div style={{background:'white',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',padding:'24px'}}>
          <h2 style={{fontSize:'20px',fontWeight:'600',color:'#111827',marginBottom:'16px'}}>Sign In</h2>

          {error && <div style={{marginBottom:'16px',padding:'12px',background:'#fef2f2',color:'#b91c1c',borderRadius:'6px',fontSize:'14px'}}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{marginBottom:'16px'}}>
              <label style={{display:'block',fontSize:'14px',fontWeight:'500',color:'#374151',marginBottom:'4px'}}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'14px'}} />
            </div>
            <div style={{marginBottom:'16px'}}>
              <label style={{display:'block',fontSize:'14px',fontWeight:'500',color:'#374151',marginBottom:'4px'}}>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'14px'}} />
            </div>
            <button type="submit" disabled={loading} style={{width:'100%',padding:'10px',background:'#2563eb',color:'white',border:'none',borderRadius:'6px',fontSize:'14px',fontWeight:'500',cursor:'pointer'}}>
              {loading ? <Loader2 size={16} style={{animation:'spin 1s linear infinite'}} /> : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
