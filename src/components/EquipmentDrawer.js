import React from 'react';
import { X } from 'lucide-react';

export default function EquipmentDrawer({ open, item, onClose, isAdmin }) {
  if (!open || !item) return null;

  const sectionStyle = {
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: 12,
    marginBottom: 12
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: 420,
      height: '100vh',
      background: 'white',
      borderLeft: '1px solid #e5e7eb',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.05)',
      padding: 20,
      overflowY: 'auto',
      zIndex: 50
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Tool Details</div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontWeight: 700 }}>{item.name}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Asset ID: {item.asset_id}
        </div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Category: {item.category || '—'}
        </div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Condition: {item.condition || '—'}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Status</div>
        <div>Status: <b>{item.computed_status}</b></div>
        <div>Test Tag Done: <b>{item.test_tag_done_date || '—'}</b></div>
        <div>Next Due: <b>{item.test_tag_next_due_date || '—'}</b></div>
      </div>

      {item.computed_status !== 'available' && (
        <div style={sectionStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Current Checkout</div>
          <div>Checked Out To: <b>{item.checked_out_to || '—'}</b></div>
          <div>Site: <b>{item.site || '—'}</b></div>
          <div>Expected Return: <b>{item.expected_return_at ? new Date(item.expected_return_at).toLocaleString() : '—'}</b></div>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Photos</div>

        {item.primary_photo_url && (
          <img src={item.primary_photo_url} alt="Primary" style={{ width: '100%', borderRadius: 8, marginBottom: 8 }} />
        )}

        {item.pickup_photo_url && (
          <img src={item.pickup_photo_url} alt="Pickup" style={{ width: '100%', borderRadius: 8, marginBottom: 8 }} />
        )}

        {item.return_photo_url && (
          <img src={item.return_photo_url} alt="Return" style={{ width: '100%', borderRadius: 8 }} />
        )}

        {!item.primary_photo_url && !item.pickup_photo_url && !item.return_photo_url && (
          <div style={{ fontSize: 13, color: '#6b7280' }}>No photos available.</div>
        )}
      </div>

      {isAdmin && (
        <button
          style={{
            width: '100%',
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #d1d5db',
            background: '#111827',
            color: 'white',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Edit Tool
        </button>
      )}
    </div>
  );
}
