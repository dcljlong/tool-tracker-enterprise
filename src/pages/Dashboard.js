import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseConfigOk } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function toDateOnlyUTC(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function tagStateFromNextDue(nextDue, dueSoonDays = 30) {
  const nd = toDateOnlyUTC(nextDue);
  if (!nd) return null;

  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueSoonCutoff = today + (dueSoonDays * 24 * 60 * 60 * 1000);

  if (nd < today) return 'expired';
  if (nd <= dueSoonCutoff) return 'due_soon';
  return 'ok';
}

function effectiveTagState(row) {
  return row.test_tag_state || tagStateFromNextDue(row.test_tag_next_due_date) || null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);

    if (loading) { setBusy(false); return; }
    if (!user) { setBusy(false); setRows([]); return; }

    if (!supabaseConfigOk) {
      setBusy(false);
      setErr('Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY');
      setRows([]);
      return;
    }

    const url = (process.env.REACT_APP_SUPABASE_URL || '').replace(/\/+$/, '');
    const key = (process.env.REACT_APP_SUPABASE_ANON_KEY || '').trim();

    if (!url || !key) {
      setBusy(false);
      setErr('Missing Supabase env at runtime (restart dev server after .env changes).');
      setRows([]);
      return;
    }

    setBusy(true);

    const select =
      'id,asset_id,name,category,' +
      'computed_status,test_tag_next_due_date,test_tag_state,' +
      'checked_out_to,site,expected_return_at,checked_out_at';

    const endpoint =
      `${url}/rest/v1/equipment_current_status` +
      `?select=${encodeURIComponent(select)}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
        signal: ac.signal,
      });

      const text = await res.text();

      if (!res.ok) {
        setErr(`HTTP ${res.status} ${res.statusText}\n${text}`);
        setRows([]);
      } else {
        const data = text ? JSON.parse(text) : [];
        const arr = Array.isArray(data) ? data : [];
        const hydrated = arr.map(r => ({ ...r, _tag_state: effectiveTagState(r) }));
        setRows(hydrated);
      }
    } catch (e) {
      const msg =
        e?.name === 'AbortError'
          ? 'Request timed out (12s) talking to Supabase.'
          : String(e?.message || e);
      setErr(msg);
      setRows([]);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }, [loading, user]);

  useEffect(() => {
    if (!loading && user) load();
    if (!loading && !user) { setBusy(false); setRows([]); setErr(null); }
  }, [loading, user, load]);

  const kpi = useMemo(() => {
    const total = rows.length;
    const available = rows.filter(r => r.computed_status === 'available').length;
    const inUse = rows.filter(r => r.computed_status === 'in_use').length;
    const overdue = rows.filter(r => r.computed_status === 'overdue').length;
    const expired = rows.filter(r => r._tag_state === 'expired').length;
    const dueSoon = rows.filter(r => r._tag_state === 'due_soon').length;
    return { total, available, inUse, overdue, expired, dueSoon };
  }, [rows]);

  const attention = useMemo(() => {
    const overdue = rows
      .filter(r => r.computed_status === 'overdue')
      .slice(0, 5);

    const expired = rows
      .filter(r => r._tag_state === 'expired')
      .slice(0, 5);

    return { overdue, expired };
  }, [rows]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <div style={{ color: '#6b7280', marginTop: 4 }}>
            {isAdmin ? 'Admin access' : 'Read-only user'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/equipment')}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #111827', background: '#111827', color: 'white', cursor: 'pointer', fontWeight: 700 }}
          >
            Open Equipment
          </button>

          {isAdmin && (
            <button
              onClick={() => navigate('/equipment/new')}
              style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700 }}
            >
              New Equipment
            </button>
          )}

          <button
            onClick={load}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 600 }}
          >
            Refresh
          </button>
        </div>
      </div>

      {busy && <div style={{ marginTop: 16 }}>Loading…</div>}

      {err && (
        <div style={{ marginTop: 16, background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: 12, borderRadius: 10 }}>
          <div style={{ fontWeight: 800 }}>Dashboard load failed</div>
          <div style={{ marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap' }}>{err}</div>
        </div>
      )}

      {!busy && !err && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Total</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{kpi.total}</div>
            </div>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Available</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{kpi.available}</div>
            </div>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#6b7280', fontSize: 12 }}>In Use</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{kpi.inUse}</div>
            </div>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Overdue</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{kpi.overdue}</div>
            </div>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Expired Tags</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{kpi.expired}</div>
            </div>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Due Soon</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{kpi.dueSoon}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(280px, 1fr))', gap: 12, marginTop: 16 }}>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Overdue (top 5)</div>
              {attention.overdue.length === 0 && <div style={{ color: '#6b7280' }}>None</div>}
              {attention.overdue.map(x => (
                <div key={x.id} style={{ padding: '10px 0', borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontWeight: 800 }}>{x.name}</div>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>{x.asset_id} · {x.checked_out_to || '-'} @ {x.site || '-'}</div>
                  <button
                    onClick={() => navigate(`/equipment/${x.id}`)}
                    style={{ marginTop: 6, padding: '6px 10px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>

            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Expired Tags (top 5)</div>
              {attention.expired.length === 0 && <div style={{ color: '#6b7280' }}>None</div>}
              {attention.expired.map(x => (
                <div key={x.id} style={{ padding: '10px 0', borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontWeight: 800 }}>{x.name}</div>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>
                    {x.asset_id} · Next due: {x.test_tag_next_due_date ? new Date(x.test_tag_next_due_date).toLocaleDateString() : '-'}
                  </div>
                  <button
                    onClick={() => navigate(`/equipment/${x.id}`)}
                    style={{ marginTop: 6, padding: '6px 10px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
