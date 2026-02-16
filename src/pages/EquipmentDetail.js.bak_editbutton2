import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function fmtLocal(dt) {
  if (!dt) return '-';
  try { return new Date(dt).toLocaleString(); } catch { return String(dt); }
}

async function fetchJsonWithTimeout(url, { headers }, ms, label) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: ac.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${label} HTTP ${res.status} ${res.statusText}\n${text}`);
    return text ? JSON.parse(text) : null;
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`${label} timed out (${ms}ms)`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export default function EquipmentDetail() {
  const { id } = useParams();
  const { user, loading, isAdmin, accessToken, profile, profileError, profileLoadedAt } = useAuth();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const [asset, setAsset] = useState(null);
  const [movements, setMovements] = useState([]);

  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setErr(null);

    if (loading) { setBusy(false); return; }
    if (!user) { setBusy(false); setAsset(null); setMovements([]); return; }

    const urlBase = String(process.env.REACT_APP_SUPABASE_URL || '').replace(/\/+$/, '');
    const anon = String(process.env.REACT_APP_SUPABASE_ANON_KEY || '').trim();
    const token = String(accessToken || '').trim();

    if (!urlBase || !anon) {
      setBusy(false);
      setErr('Missing Supabase env (REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY). Restart dev server after .env changes.');
      return;
    }

    if (!token) {
      setBusy(false);
      setErr('No Supabase access token in AuthContext. Sign out and sign back in.');
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);

    try {
      const headers = {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };

      // PROBE
      const probeUrl =
        `${urlBase}/rest/v1/equipment_movements` +
        `?select=${encodeURIComponent('id')}` +
        `&limit=1`;
      await fetchJsonWithTimeout(probeUrl, { headers }, 8000, 'Probe');

      // Asset
      const assetSelect = 'id,asset_id,qr_code_value,name,category,condition,notes,test_tag_done_date,test_tag_next_due_date,primary_photo_url,created_at';
      const assetUrl =
        `${urlBase}/rest/v1/equipment` +
        `?select=${encodeURIComponent(assetSelect)}` +
        `&id=eq.${encodeURIComponent(id)}` +
        `&limit=1`;
      const a = await fetchJsonWithTimeout(assetUrl, { headers }, 12000, 'Asset load');
      const aRow = Array.isArray(a) && a.length ? a[0] : null;
      setAsset(aRow);

      // Movements
      const moveSelect =
        'id,equipment_id,event_at,event_type,from_status,to_status,' +
        'from_location,to_location,assigned_to,job_ref,site_ref,' +
        'pickup_photo_path,return_photo_path,notes,created_by,created_at';
      const moveUrl =
        `${urlBase}/rest/v1/equipment_movements` +
        `?select=${encodeURIComponent(moveSelect)}` +
        `&equipment_id=eq.${encodeURIComponent(id)}` +
        `&order=${encodeURIComponent('event_at.desc')}` +
        `&limit=100`;
      const m = await fetchJsonWithTimeout(moveUrl, { headers }, 12000, 'Movements load');
      setMovements(Array.isArray(m) ? m : []);
    } catch (e) {
      setErr(String(e?.message || e));
      setAsset(null);
      setMovements([]);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [loading, user, id, accessToken]);

  useEffect(() => {
    if (!loading && user) load();
    if (!loading && !user) { setBusy(false); setAsset(null); setMovements([]); setErr(null); }
  }, [loading, user, load]);

  const headline = useMemo(() => {
    if (!asset) return 'Equipment Detail';
    return asset.name || asset.asset_id || 'Equipment Detail';
  }, [asset]);

  const debug = useMemo(() => {
    return `loading=${String(loading)} busy=${String(busy)} user=${user ? user.email : 'null'}`;
  }, [loading, busy, user]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ marginBottom: 8 }}>
            <Link to="/equipment">← Back to Equipment</Link>
          </div>

          <h1 style={{ margin: 0 }}>{headline}</h1>
          <div style={{ color: '#6b7280', marginTop: 4 }}>
            {isAdmin ? 'Admin access' : 'Read-only user'}
          </div>
          <div style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>
            id: {id}
          </div>
          <div style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>
            debug: {debug}
          </div>
          <div style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>
            profileError: {profileError ? String(profileError) : 'null'} · profileId: {profile ? String(profile.id) : 'null'} · profileIsAdmin: {profile ? String(profile.is_admin) : 'null'} · userId: {user ? String(user.id) : 'null'} · profileLoadedAt: {profileLoadedAt ? String(profileLoadedAt) : 'null'}
          </div>
          <div style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>
            supabaseUrl: {String(process.env.REACT_APP_SUPABASE_URL || '')}
          </div>
          <div style={{ color: '#9ca3af', marginTop: 6, fontSize: 12 }}>
            anonKeyLen: {String((process.env.REACT_APP_SUPABASE_ANON_KEY || '').length)} · accessTokenLen: {String((accessToken || '').length)}
          </div>
        </div>

        <button
          onClick={load}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 600 }}
        >
          Refresh
        </button>
      </div>

      {busy && <div style={{ marginTop: 16 }}>Loading…</div>}

      {err && (
        <div style={{ marginTop: 16, background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: 12, borderRadius: 10 }}>
          <div style={{ fontWeight: 800 }}>Load failed</div>
          <div style={{ marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap' }}>{err}</div>
        </div>
      )}

      {!busy && !err && !asset && (
        <div style={{ marginTop: 16, color: '#6b7280' }}>
          No equipment record found for this id.
        </div>
      )}

      {!busy && !err && asset && (
        <>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Asset</div>
              <div style={{ fontSize: 14, marginTop: 6 }}>
                <div><b>Name:</b> {asset.name || '-'}</div>
                <div><b>Asset ID:</b> {asset.asset_id || '-'}</div>
                <div><b>QR:</b> {asset.qr_code_value || '-'}</div>
              </div>
            </div>

            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Compliance</div>
              <div style={{ fontSize: 14, marginTop: 6 }}>
                <div><b>Test done:</b> {fmtLocal(asset.test_tag_done_date)}</div>
                <div><b>Next due:</b> {fmtLocal(asset.test_tag_next_due_date)}</div>
              </div>
            </div>

            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ color: '#6b7280', fontSize: 12 }}>Meta</div>
              <div style={{ fontSize: 14, marginTop: 6 }}>
                <div><b>Category:</b> {asset.category || '-'}</div>
                <div><b>Condition:</b> {asset.condition || '-'}</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Movement Timeline</h2>

            {movements.length === 0 && (
              <div style={{ color: '#6b7280' }}>No movement history yet.</div>
            )}

            <div style={{ display: 'grid', gap: 10 }}>
              {movements.map(m => (
                <div key={m.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 800 }}>
                      {m.event_type}{m.to_status ? ` → ${m.to_status}` : ''}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 13 }}>
                      {fmtLocal(m.event_at)}
                    </div>
                  </div>

                  {m.notes && (
                    <div style={{ marginTop: 6, fontSize: 14 }}>
                      <b>Notes:</b> {m.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
