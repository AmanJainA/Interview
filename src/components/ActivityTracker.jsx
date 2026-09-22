import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { db, rpc, supabase } from '../supabaseClient';

function browser(ua) {
  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua)) return 'Google Chrome';
  if (/Firefox\//i.test(ua)) return 'Mozilla Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Unknown';
}
function os(ua) {
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}
function portalPath(pathname, search, hash) {
  const base=(import.meta.env.BASE_URL||'/').replace(/\/$/,'');
  let p=base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  if(!p.startsWith('/')) p='/'+p;
  return p+(search||'')+(hash||'');
}

// beforeunload can cancel an ordinary async Supabase request.
// keepalive lets the browser continue the small POST while the page is closing.
function markOfflineImmediately(userId) {
  const url=import.meta.env.VITE_SUPABASE_URL;
  const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
  if(!url || !key || !userId) return false;
  try {
    const body=JSON.stringify({p_user_id:userId});
    return fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/set_user_offline',{
      method:'POST',
      headers:{
        apikey:key,
        Authorization:'Bearer '+key,
        'Content-Type':'application/json'
      },
      body,
      keepalive:true,
      credentials:'omit'
    }).catch(()=>{});
  } catch { return false; }
}

export default function ActivityTracker({profile}) {
  const location=useLocation();

  useEffect(()=>{
    if(!profile?.id) return;
    let cancelled=false;
    (async()=>{
      let ip=sessionStorage.getItem('interview_public_ip')||null;
      if(!ip) {
        try {
          const res=await fetch('https://api.ipify.org?format=json');
          if(res.ok){ip=(await res.json()).ip||null;if(ip)sessionStorage.setItem('interview_public_ip',ip);}
        } catch {}
      }
      if(cancelled)return;
      await db('page_activity').insert({
        user_id:profile.id,
        username:profile.name||null,
        email:profile.email||null,
        mac_address:null,
        ip_address:ip,
        visited_page:portalPath(location.pathname,location.search,location.hash),
        browser:browser(navigator.userAgent),
        os:os(navigator.userAgent)
      });
      await rpc('set_user_online',{p_user_id:profile.id});
    })();
    return()=>{cancelled=true;};
  },[profile?.id,profile?.name,profile?.email,location.pathname,location.search,location.hash]);

  useEffect(()=>{
    if(!profile?.id)return;

    const heartbeat=()=>rpc('set_user_online',{p_user_id:profile.id});
    const goOffline=()=>markOfflineImmediately(profile.id);

    heartbeat();
    const timer=setInterval(heartbeat,30000);

    window.addEventListener('beforeunload',goOffline);
    window.addEventListener('pagehide',goOffline);

    return()=>{
      clearInterval(timer);
      window.removeEventListener('beforeunload',goOffline);
      window.removeEventListener('pagehide',goOffline);
    };
  },[profile?.id]);

  return null;
}
