import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'in_use', label: 'In Use' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'expired', label: 'Expired Tags' },
  { key: 'due_soon', label: 'Due Soon' },
];

export default function Equipment() {
  const { user, loading, isAdmin } = useAuth();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return;

    let mounted = true;

    const load = async () => {
      setBusy(true);
      setErr(null);

      const { data, error } = await supabase
        .from('equipment_current_status')
        .select('id,asset_id,qr_code_value,name,category,condition,notes,test_tag_done_date,test_tag_next_due_date,primary_photo_url,computed_status,test_tag_state,checked_out_to,site,expected_return_at,checked_out_at')
        .order('created_at', { ascending: false });

      if (!mounted) return;
      if (error) setErr(error.message);
      else setRows(data || []);
      setBusy(false);
    };

    load();

    return () => { mounted = false; };
  }, [loading, user]);

  const filtered = useMemo(() => {
    const query = (q || '').trim().toLowerCase();
    let r = rows;

    if (tab === 'available') r = r.filter(x => x.computed_status === 'available');
    if (tab === 'in_use') r = r.filter(x => x.computed_status === 'in_use');
    if (tab === 'overdue') r = r.filter(x => x.computed_status === 'overdue');
    if (tab === 'expired') r = r.filter(x => x.test_tag_state === 'expired');
    if (tab === 'due_soon') r = r.filter(x => x.test_tag_state === 'due_soon');

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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Equipment</h1>
          <div style={{ color: '#6b7280', marginTop: 4 }}>
            {isAdmin ? 'Admin access' : 'Read-only user'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search (asset id, name, category, site...)"
            style={{ width: 360, maxWidth: '90vw', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
          />
          {isAdmin && (
            <button style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer' }}>
              Add Tool
            </button>
          )}
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
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {busy && <div style={{ marginTop: 16 }}>Loading…</div>}
      {err && <div style={{ marginTop: 16, color: '#b91c1c' }}>{err}</div>}

      {!busy && !err && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {filtered.map(item => (
            <div key={item.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  <div style={{ color: '#6b7280', marginTop: 2 }}>
                    Asset: {item.asset_id} · Category: {item.category || '-'} · Status: {item.computed_status}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {item.test_tag_state && (
                    <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid #d1d5db' }}>
                      Tag: {item.test_tag_state}
                    </span>
                  )}
                  {isAdmin && (
                    <button style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer' }}>
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {(item.computed_status !== 'available') && (
                <div style={{ marginTop: 10, color: '#374151', fontSize: 14 }}>
                  Checked out to <b>{item.checked_out_to || '-'}</b> at <b>{item.site || '-'}</b>. Expected return: <b>{item.expected_return_at ? new Date(item.expected_return_at).toLocaleString() : '-'}</b>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ color: '#6b7280' }}>No results.</div>
          )}
        </div>
      )}
    </div>
  );
}
