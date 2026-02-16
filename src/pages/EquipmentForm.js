import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, supabaseConfigOk } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const FIELD = {
  asset_id: { label: 'Asset ID', required: true, placeholder: 'TT-0001' },
  qr_code_value: { label: 'QR Code Value', required: true, placeholder: 'QR-TT-0001' },
  name: { label: 'Name', required: true, placeholder: 'Makita Drill' },
  category: { label: 'Category', required: false, placeholder: 'Power Tool' },
  condition: { label: 'Condition', required: false, placeholder: 'Good' },
  notes: { label: 'Notes', required: false, placeholder: 'Optional notes' },
  test_tag_done_date: { label: 'Test Tag Done Date', required: false },
  test_tag_next_due_date: { label: 'Test Tag Next Due Date', required: false },
};

function toInputDate(v) {
  if (!v) return '';
  if (String(v).length >= 10) return String(v).slice(0, 10);
  return '';
}

function defaultQrFromAsset(assetId) {
  const a = (assetId || '').trim();
  if (!a) return '';
  // keep consistent with your earlier QR-TT-0001 style
  return a.startsWith('QR-') ? a : `QR-${a}`;
}

function normalizePayload(form) {
  const asset_id = (form.asset_id || '').trim();
  const qr_code_value = (form.qr_code_value || '').trim() || defaultQrFromAsset(asset_id);

  const payload = {
    asset_id,
    qr_code_value,
    name: (form.name || '').trim(),
    category: (form.category || '').trim() || null,
    condition: (form.condition || '').trim() || null,
    notes: (form.notes || '').trim() || null,
    test_tag_done_date: form.test_tag_done_date ? form.test_tag_done_date : null,
    test_tag_next_due_date: form.test_tag_next_due_date ? form.test_tag_next_due_date : null,
  };
  return payload;
}

export default function EquipmentForm({ mode }) {
  const navigate = useNavigate();
  const params = useParams();
  const { isAdmin } = useAuth();

  const id = params.id || null;
  const isEdit = mode === 'edit';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const [form, setForm] = useState({
    asset_id: '',
    qr_code_value: '',
    name: '',
    category: '',
    condition: '',
    notes: '',
    test_tag_done_date: '',
    test_tag_next_due_date: '',
  });

  const title = useMemo(() => (isEdit ? 'Edit Equipment' : 'New Equipment'), [isEdit]);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoadError(null);

      if (!supabaseConfigOk) {
        setLoadError('Supabase config missing. Check REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
        setLoading(false);
        return;
      }

      if (!isAdmin) {
        setLoadError('Admin access required.');
        setLoading(false);
        return;
      }

      if (!isEdit) {
        setLoading(false);
        return;
      }

      if (!id) {
        setLoadError('Missing equipment id for edit.');
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('equipment')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setLoadError('Equipment not found.');
          setLoading(false);
          return;
        }

        if (!alive) return;

        setForm({
          asset_id: data.asset_id || '',
          qr_code_value: data.qr_code_value || defaultQrFromAsset(data.asset_id || ''),
          name: data.name || '',
          category: data.category || '',
          condition: data.condition || '',
          notes: data.notes || '',
          test_tag_done_date: toInputDate(data.test_tag_done_date),
          test_tag_next_due_date: toInputDate(data.test_tag_next_due_date),
        });

        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setLoadError(String(e?.message || e));
        setLoading(false);
      }
    }

    run();
    return () => { alive = false; };
  }, [isAdmin, isEdit, id]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // auto-fill QR when asset_id changes (only if user hasn’t manually overridden)
  useEffect(() => {
    if (isEdit) return;
    const desired = defaultQrFromAsset(form.asset_id);
    if (!desired) return;

    // if qr is empty OR it matches the previous auto pattern, keep auto-sync
    setForm((prev) => {
      const current = (prev.qr_code_value || '').trim();
      const autoFromPrev = defaultQrFromAsset(prev.asset_id);
      const isAuto = !current || current === autoFromPrev;
      return isAuto ? { ...prev, qr_code_value: desired } : prev;
    });
  }, [form.asset_id]);

  const requiredOk =
    (form.asset_id || '').trim() &&
    (form.name || '').trim() &&
    ((form.qr_code_value || '').trim() || defaultQrFromAsset(form.asset_id));

  async function onSave(e) {
    e.preventDefault();
    setSaveError(null);

    if (!requiredOk) {
      setSaveError('Asset ID, QR Code Value, and Name are required.');
      return;
    }

    const payload = normalizePayload(form);

    try {
      setSaving(true);

      if (isEdit) {
        const { error } = await supabase
          .from('equipment')
          .update(payload)
          .eq('id', id);

        if (error) throw error;
        navigate(`/equipment/${id}`);
      } else {
        const { data, error } = await supabase
          .from('equipment')
          .insert(payload)
          .select('id')
          .single();

        if (error) throw error;
        navigate(`/equipment/${data.id}`);
      }
    } catch (e2) {
      setSaveError(String(e2?.message || e2));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
        <p style={{ marginTop: 12 }}>Loading…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
        <p style={{ marginTop: 12, color: '#b91c1c' }}>{loadError}</p>
        <div style={{ marginTop: 16 }}>
          <Link to="/equipment">Back to equipment</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 820, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/equipment">Cancel</Link>
          {isEdit && id ? <Link to={`/equipment/${id}`}>View</Link> : null}
        </div>
      </div>

      <form onSubmit={onSave} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>{FIELD.asset_id.label} *</label>
          <input
            value={form.asset_id}
            onChange={(e) => setField('asset_id', e.target.value)}
            placeholder={FIELD.asset_id.placeholder}
            autoComplete="off"
            style={{ padding: 10, borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>{FIELD.qr_code_value.label} *</label>
          <input
            value={form.qr_code_value}
            onChange={(e) => setField('qr_code_value', e.target.value)}
            placeholder={FIELD.qr_code_value.placeholder}
            autoComplete="off"
            style={{ padding: 10, borderRadius: 10, border: '1px solid #d1d5db' }}
          />
          {!isEdit && (
            <div style={{ color: '#6b7280', fontSize: 12 }}>
              Auto-fills as {`QR-<Asset ID>`}. You can override.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>{FIELD.name.label} *</label>
          <input
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder={FIELD.name.placeholder}
            autoComplete="off"
            style={{ padding: 10, borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>{FIELD.category.label}</label>
          <input
            value={form.category}
            onChange={(e) => setField('category', e.target.value)}
            placeholder={FIELD.category.placeholder}
            autoComplete="off"
            style={{ padding: 10, borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>{FIELD.condition.label}</label>
          <input
            value={form.condition}
            onChange={(e) => setField('condition', e.target.value)}
            placeholder={FIELD.condition.placeholder}
            autoComplete="off"
            style={{ padding: 10, borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>{FIELD.test_tag_done_date.label}</label>
          <input
            type="date"
            value={form.test_tag_done_date}
            onChange={(e) => setField('test_tag_done_date', e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>{FIELD.test_tag_next_due_date.label}</label>
          <input
            type="date"
            value={form.test_tag_next_due_date}
            onChange={(e) => setField('test_tag_next_due_date', e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>{FIELD.notes.label}</label>
          <textarea
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder={FIELD.notes.placeholder}
            rows={5}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #d1d5db' }}
          />
        </div>

        {saveError ? (
          <div style={{ padding: 10, borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c' }}>
            {saveError}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={saving || !requiredOk}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #111827',
              background: saving || !requiredOk ? '#e5e7eb' : '#111827',
              color: saving || !requiredOk ? '#111827' : '#ffffff',
              cursor: saving || !requiredOk ? 'not-allowed' : 'pointer',
              fontWeight: 700
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>

          <span style={{ color: '#6b7280', fontSize: 13 }}>
            Admin-only. Non-admins are redirected.
          </span>
        </div>
      </form>
    </main>
  );
}

