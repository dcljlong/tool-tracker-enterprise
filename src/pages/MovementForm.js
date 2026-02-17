import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, supabaseConfigOk } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const EVENT_TYPES = [
  { key: 'CHECKOUT', label: 'Check-out' },
  { key: 'RETURN', label: 'Return' },
];

export default function MovementForm() {
  const { id } = useParams(); // equipment id (uuid)
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [eventType, setEventType] = useState('CHECKOUT');
  const [assignedTo, setAssignedTo] = useState('');
  const [siteRef, setSiteRef] = useState('');
  const [jobRef, setJobRef] = useState('');
  const [notes, setNotes] = useState('');
  const [eventAt, setEventAt] = useState(() => new Date().toISOString().slice(0, 16)); // yyyy-mm-ddThh:mm
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const title = useMemo(() => (eventType === 'CHECKOUT' ? 'Check-out Tool' : 'Return Tool'), [eventType]);

  async function submit(e) {
    e.preventDefault();
    setErr(null);

    if (!supabaseConfigOk) {
      setErr('Supabase config missing.');
      return;
    }
    if (!isAdmin) {
      setErr('Admin access required.');
      return;
    }
    if (!id) {
      setErr('Missing equipment id.');
      return;
    }

    const payload = {
      equipment_id: id,
      event_type: eventType,
      event_at: eventAt ? new Date(eventAt).toISOString() : new Date().toISOString(),
      assigned_to: assignedTo.trim() || null,
      site_ref: siteRef.trim() || null,
      job_ref: jobRef.trim() || null,
      notes: notes.trim() || null,
    };

    // Basic validation
    if (eventType === 'CHECKOUT') {
      if (!payload.assigned_to) return setErr('Assigned To is required for check-out.');
      if (!payload.site_ref) return setErr('Site is required for check-out.');
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('equipment_movements').insert(payload);
      if (error) throw error;

      // back to detail
      navigate(`/equipment/${id}`);
    } catch (e2) {
      setErr(String(e2?.message || e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 10 }}>
        <Link to={`/equipment/${id}`}>← Back to Equipment Detail</Link>
      </div>

      <h1 style={{ margin: 0 }}>{title}</h1>
      <div style={{ color: '#6b7280', marginTop: 6 }}>{isAdmin ? 'Admin access' : 'Read-only user'}</div>

      <form onSubmit={submit} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Action</div>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db' }}
          >
            {EVENT_TYPES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Event Time</div>
          <input
            type="datetime-local"
            value={eventAt}
            onChange={(e) => setEventAt(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Assigned To {eventType === 'CHECKOUT' ? '(required)' : ''}</div>
          <input
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Person / crew / subcontractor"
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Site {eventType === 'CHECKOUT' ? '(required)' : ''}</div>
          <input
            value={siteRef}
            onChange={(e) => setSiteRef(e.target.value)}
            placeholder="Site / location"
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Job Ref (optional)</div>
          <input
            value={jobRef}
            onChange={(e) => setJobRef(e.target.value)}
            placeholder="Job number / reference"
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Optional notes"
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        {err && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: 12, borderRadius: 10 }}>
            <b>Save failed</b>
            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{err}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={saving}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #111827', background: '#111827', color: 'white', cursor: 'pointer', fontWeight: 800, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>

          <button
            type="button"
            onClick={() => navigate(`/equipment/${id}`)}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700 }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
