"use client";

import { useEffect, useCallback } from 'react';

const GROUP_COLORS = {
  'Tri-Valley': '#4f46e5',
  'Central Valley': '#10b981',
  'Fremont': '#06b6d4',
  'South Bay': '#8b5cf6',
  'San Francisco': '#f43f5e',
  'Sacramento': '#ec4899',
  'Unassigned': '#64748b'
};

const RELATIONSHIP_ICONS = {
  'Husband': '👨',
  'Wife': '👩',
  'Son': '👦',
  'Daughter': '👧',
  'default': '👤'
};

function InfoRow({ label, value, highlight }) {
  if (!value && value !== 0) return null;
  return (
    <div className="modal-info-row">
      <span className="modal-info-label">{label}</span>
      <span className={`modal-info-value ${highlight ? 'modal-info-highlight' : ''}`}>{value}</span>
    </div>
  );
}

export default function MemberModal({ member, onClose }) {
  // Close on Escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  if (!member) return null;

  const groupColor = GROUP_COLORS[member.prayer_group] || GROUP_COLORS['Unassigned'];
  const relIcon = RELATIONSHIP_ICONS[member.relationship] || RELATIONSHIP_ICONS['default'];
  const fullAddress = [member.address_1, member.address_2, member.city, member.state, member.zip]
    .filter(Boolean).join(', ');
  const mapLink = fullAddress
    ? `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`
    : null;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      if (isNaN(d)) return dateStr;
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      id="member-detail-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-member-name"
    >
      <div className="modal-panel" id="member-detail-modal-panel">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-avatar">
            <span className="modal-avatar-icon">{relIcon}</span>
          </div>
          <div className="modal-header-info">
            <h2 id="modal-member-name" className="modal-name">
              {member.first_name} {member.last_name}
            </h2>
            <div className="modal-badges">
              {member.relationship && (
                <span className="modal-badge modal-badge-rel">{member.relationship}</span>
              )}
              {member.gender && (
                <span className={`modal-badge modal-badge-gender modal-badge-gender-${String(member.gender).toLowerCase()}`}>
                  {member.gender}
                </span>
              )}
              {member.prayer_group && (
                <span
                  className="modal-badge modal-badge-group"
                  style={{ backgroundColor: `${groupColor}18`, color: groupColor, borderColor: `${groupColor}40` }}
                >
                  ✦ {member.prayer_group}
                </span>
              )}
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close member details" id="modal-close-button">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Personal Info */}
          <div className="modal-section">
            <h3 className="modal-section-title">
              <span className="modal-section-icon">👤</span>
              Personal Information
            </h3>
            <div className="modal-info-grid">
              <InfoRow label="Age" value={member.age ? `${member.age} years` : null} highlight />
              <InfoRow label="Birth Date" value={formatDate(member.birth_date)} />
              <InfoRow label="Marriage Date" value={formatDate(member.marriage_date)} />
              <InfoRow label="Status" value={member.status} />
              {member.member_id && (
                <InfoRow label="Member ID" value={`#${member.member_id}`} />
              )}
            </div>
          </div>

          {/* Contact */}
          <div className="modal-section">
            <h3 className="modal-section-title">
              <span className="modal-section-icon">📞</span>
              Contact Details
            </h3>
            <div className="modal-info-grid">
              {member.personal_email && (
                <div className="modal-info-row">
                  <span className="modal-info-label">Email</span>
                  <a href={`mailto:${member.personal_email}`} className="modal-link">{member.personal_email}</a>
                </div>
              )}
              {member.mobile_phone && (
                <div className="modal-info-row">
                  <span className="modal-info-label">Mobile</span>
                  <a href={`tel:${member.mobile_phone}`} className="modal-link">{member.mobile_phone}</a>
                </div>
              )}
              {member.home_phone && (
                <div className="modal-info-row">
                  <span className="modal-info-label">Home</span>
                  <a href={`tel:${member.home_phone}`} className="modal-link">{member.home_phone}</a>
                </div>
              )}
              {member.hh_phone && member.hh_phone !== member.home_phone && (
                <div className="modal-info-row">
                  <span className="modal-info-label">HH Phone</span>
                  <a href={`tel:${member.hh_phone}`} className="modal-link">{member.hh_phone}</a>
                </div>
              )}
              {!member.personal_email && !member.mobile_phone && !member.home_phone && (
                <p className="modal-empty-note">No contact information available</p>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="modal-section">
            <h3 className="modal-section-title">
              <span className="modal-section-icon">📍</span>
              Address & Location
            </h3>
            <div className="modal-info-grid">
              {fullAddress && (
                <div className="modal-info-row modal-info-row-block">
                  <span className="modal-info-label">Address</span>
                  <div className="modal-address-value">
                    <span>{member.address_1}{member.address_2 ? `, ${member.address_2}` : ''}</span>
                    <span>{member.city}, {member.state} {member.zip}</span>
                    {mapLink && (
                      <a href={mapLink} target="_blank" rel="noopener noreferrer" className="modal-map-link">
                        📌 View on Google Maps
                      </a>
                    )}
                  </div>
                </div>
              )}
              <InfoRow
                label="Distance to Church"
                value={member.distance_miles ? `${member.distance_miles.toFixed(1)} miles` : null}
                highlight
              />
            </div>
          </div>

          {/* Household */}
          <div className="modal-section">
            <h3 className="modal-section-title">
              <span className="modal-section-icon">🏠</span>
              Household Information
            </h3>
            <div className="modal-info-grid">
              <InfoRow label="Household Head" value={member.mail_to || `${member.hh_first_name || ''} ${member.hh_last_name || ''}`.trim() || null} />
              <InfoRow label="Envelope Number" value={member.envelope_number} highlight />
              <InfoRow label="Prayer Group" value={member.prayer_group || 'Unassigned'} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="modal-footer-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
