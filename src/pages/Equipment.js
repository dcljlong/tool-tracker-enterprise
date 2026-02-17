import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseConfigOk } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'in_use', label: 'In Use' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'expired', label: 'Expired Tags' },
  { key: 'due_soon', label: 'Due Soon' },
];

function fmtLocal(dt) {
  if (!dt) return '-';
  try { return new Date(dt).toLocaleString(); } catch { return String(dt); }
}

function toDateOnlyUTC(v) {
  if (!v) return null;
  const s = String(v);
  const d = new Date(s);
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
  // prefer server computed if present, otherwise compute from next_due
  return row.test_tag_state || tagStateFromNextDue(row.test_tag_next_due_date) || null;
}

function tagBadgeStyle(state) {
  if (state === 'expired') return { border: '1px solid #b91c1c', background: '#fef2f2', color: '#b91c1c' };
  if (state === 'due_soon') return { border: '1px solid #92400e', background: '#fffbeb', color: '#92400e' };
  if (state === 'ok') return { border: '1px solid #065f46', background: '#ecfdf5', color: '#065f46' };
  return { border: '1px solid #d1d5db', background: 'white', color: '#111827' };
}

export default function Equipment() {
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();

  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
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
      'id,asset_id,qr_code_value,name,category,condition,notes,' +
      'test_tag_done_date,test_tag_next_due_date,primary_photo_url,' +
      'computed_status,test_tag_state,checked_out_to,site,' +
      'expected_return_at,checked_out_at,created_at';

    const endpoint =
      `${url}/rest/v1/equipment_current_status` +
      `?select=${encodeURIComponent(select)}` +
      `&order=${encodeURIComponent('created_at.desc')}`;

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
        // add client-computed effective tag state (never breaks server values)
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

  const counts = useMemo(() => {
    const total = rows.length;
    const inUse = rows.filter(r => r.computed_status === 'in_use').length;
    const overdue = rows.filter(r => r.computed_status === 'overdue').length;
    const expired = rows.filter(r => r._tag_state === 'expired').length;
    const dueSoon = rows.filter(r => r._tag_state === 'due_soon').length;
    return { total, inUse, overdue, expired, dueSoon };
  }, [rows]);

  const filtered = useMemo(() => {
    const query = (q || '').trim().toLowerCase();
    let r = rows;

    if (tab === 'available') r = r.filter(x => x.computed_status === 'available');
    if (tab === 'in_use') r = r.filter(x => x.computed_status === 'in_use');
    if (tab === 'overdue') r = r.filter(x => x.computed_status === 'overdue');
    if (tab === 'expired') r = r.filter(x => x._tag_state === 'expired');
    if (tab === 'due_soon') r = r.filter(x => x._tag_state === 'due_soon');

    if (!query) return r;

    return r.filter(x => {
      const hay = [
        x.asset_id,
        x.name,
        x.category,
        x.qr_code_value,
        x.site,
        x.checked_out_to,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(query);
    });
  }, [rows, tab, q]);

  const debug = useMemo(() => {
    return "loading=" + String(loading) +
      " busy=" + String(busy) +
      " user=" + (user ? user.email : "null") +
      " rows=" + rows.length;
  }, [loading, busy, user, rows.length]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Equipment</h1>
          <div style={{ color: '#6b7280', marginTop: 4 }}>
            {isAdmin ? 'Admin access' : 'Read-only user'}
          </div>
          <div style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>
            debug: {debug}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tools..."
            style={{ width: 320, maxWidth: '90vw', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
          />

          {isAdmin && (
            <button
              onClick={() => navigate('/equipment/new')}
              style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #111827', background: '#111827', color: 'white', cursor: 'pointer', fontWeight: 700 }}
              title="Admin: create new equipment"
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

      {/* Alert band */}
      {counts.expired > 0 && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b' }}>
          <b>{counts.expired}</b> tool(s) have <b>expired</b> test tags. Review: <button
            onClick={() => setTab('expired')}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 10, border: '1px solid #b91c1c', background: 'white', cursor: 'pointer', fontWeight: 700, color: '#b91c1c' }}
          >
            Open Expired
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(160px, 1fr))', gap: 12, marginTop: 16 }}>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>Total Tools</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{counts.total}</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>In Use</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{counts.inUse}</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>Overdue</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{counts.overdue}</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>Expired Tags</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{counts.expired}</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#6b7280', fontSize: 12 }}>Due Soon</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{counts.dueSoon}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: '1px solid #d1d5db',
              background: tab === t.key ? '#111827' : 'white',
              color: tab === t.key ? 'white' : '#111827',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {busy && <div style={{ marginTop: 16 }}>Loading…</div>}

      {err && (
        <div style={{ marginTop: 16, background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: 12, borderRadius: 10 }}>
          <div style={{ fontWeight: 800 }}>Data load failed</div>
          <div style={{ marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap' }}>{err}</div>
        </div>
      )}

      {!busy && !err && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {filtered.map(item => (
            <div
              key={item.id}
              onClick={() => navigate(`/equipment/${item.id}`)}
              style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, cursor: 'pointer' }}
              title="Open details"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{item.name}</div>
                  <div style={{ color: '#6b7280', marginTop: 2 }}>
                    Asset: {item.asset_id} · Category: {item.category || '-'} · Status: {item.computed_status}
                  </div>
                  <div style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>
                    Next test due: {fmtLocal(item.test_tag_next_due_date)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {item._tag_state && (
                    <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, ...tagBadgeStyle(item._tag_state) }}>
                      Tag: {item._tag_state}
                    </span>
                  )}

                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/equipment/${item.id}/edit`);
                      }}
                      style={{
                        fontSize: 12,
                        padding: '6px 10px',
                        borderRadius: 10,
                        border: '1px solid #d1d5db',
                        background: 'white',
                        cursor: 'pointer',
                        fontWeight: 700
                      }}
                      title="Admin: edit this equipment"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {(item.computed_status !== 'available') && (
                <div style={{ marginTop: 10, color: '#374151', fontSize: 14 }}>
                  Checked out to <b>{item.checked_out_to || '-'}</b> at <b>{item.site || '-'}</b>. Expected return: <b>{fmtLocal(item.expected_return_at)}</b>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ color: '#6b7280' }}>No tools found.</div>
          )}
        </div>
      )}
    </div>
  );
}
