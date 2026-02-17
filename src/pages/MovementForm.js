import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, supabaseConfigOk } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const EVENT_TYPES = [
  { key: 'CHECKOUT', label: 'Check-out' },
  { key: 'STATUS_CHANGE', label: 'Return' },
];

function normalizeStatus(s) {
  return String(s || '').trim().toLowerCase();
}

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

  async function getCurrentEquipmentStatus(equipmentId) {
    const { data, error } = await supabase
      .from('equipment')
      .select('id,status')
      .eq('id', equipmentId)
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error('Equipment not found.');
    return normalizeStatus(data.status);
  }

  function validateTransition(currentStatus, action) {
    // Tight, explicit rules to prevent impossible transitions.
    // Adjust here if you later add additional statuses.
    if (currentStatus === 'available') {
      if (action !== 'CHECKOUT') return 'Tool is already available. Only Check-out is allowed.';
      return null;
    }
    if (currentStatus === 'in_use') {
      if (action !== 'STATUS_CHANGE') return 'Tool is currently in use. Only Return is allowed.';
      return null;
    }
    return `Tool status "${currentStatus || 'unknown'}" cannot be transitioned from this screen.`;
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null);

    if (!supabaseConfigOk) return setErr('Supabase config missing.');
    if (!isAdmin) return setErr('Admin access required.');
    if (!id) return setErr('Missing equipment id.');

    // Basic field validation
    const trimmedAssignedTo = assignedTo.trim();
    const trimmedSiteRef = siteRef.trim();
    const trimmedJobRef = jobRef.trim();
    const trimmedNotes = notes.trim();

    if (eventType === 'CHECKOUT') {
      if (!trimmedAssignedTo) return setErr('Assigned To is required for check-out.');
      if (!trimmedSiteRef) return setErr('Site is required for check-out.');
    }

    setSaving(true);
    try {
      // Pre-check current status to prevent invalid transitions
      const currentStatus = await getCurrentEquipmentStatus(id);
      const transitionErr = validateTransition(currentStatus, eventType);
      if (transitionErr) throw new Error(transitionErr);

      // Map action -> status
      const newStatus = eventType === 'CHECKOUT' ? 'in_use' : 'available';

      const payload = {
        equipment_id: id,
        event_type: eventType, // DB constraint expects STATUS_CHANGE for return
        event_at: eventAt ? new Date(eventAt).toISOString() : new Date().toISOString(),
        assigned_to: eventType === 'CHECKOUT' ? trimmedAssignedTo : (trimmedAssignedTo || null),
        site_ref: eventType === 'CHECKOUT' ? trimmedSiteRef : (trimmedSiteRef || null),
        job_ref: trimmedJobRef || null,
        notes: trimmedNotes || null,
      };

      // 1) Insert movement
      const { error: moveErr } = await supabase.from('equipment_movements').insert(payload);
      if (moveErr) throw moveErr;

      // 2) Update equipment status and assert 1 row updated
      const { data: upd, error: statusErr } = await supabase
        .from('equipment')
        .update({ status: newStatus })
        .eq('id', id)
        .select('id');

      if (statusErr) throw statusErr;
      if (!Array.isArray(upd) || upd.length !== 1) throw new Error('Status update failed (no rows updated).');

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
