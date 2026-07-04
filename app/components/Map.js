"use client";

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

const CHURCH_LAT = 37.68968;
const CHURCH_LON = -121.75836;

const GROUP_COLORS = {
  'Tri-Valley': '#4f46e5',      // Indigo
  'Central Valley': '#10b981',  // Emerald
  'Fremont': '#06b6d4',         // Cyan
  'South Bay': '#8b5cf6',        // Purple
  'San Francisco': '#f43f5e',    // Rose
  'Sacramento': '#ec4899',       // Pink
  'Unassigned': '#64748b'
};

const createMarkerIcon = (groupName) => {
  const color = GROUP_COLORS[groupName] || GROUP_COLORS['Unassigned'];
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `<div style="
      background-color: ${color};
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2.5px solid #ffffff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

const createChurchIcon = () => {
  return L.divIcon({
    className: 'church-leaflet-icon',
    html: `<div style="
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 3px solid #ffffff;
      box-shadow: 0 3px 8px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    ">⛪</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
};

// Component to dynamically fit map bounds when markers change
function MapController({ markers }) {
  const map = useMap();

  useEffect(() => {
    if (!markers || markers.length === 0) {
      map.setView([CHURCH_LAT, CHURCH_LON], 10);
      return;
    }

    const bounds = L.latLngBounds([[CHURCH_LAT, CHURCH_LON]]);
    markers.forEach(m => {
      if (m.latitude && m.longitude) {
        bounds.extend([m.latitude, m.longitude]);
      }
    });

    // Fit bounds with padding so markers aren't on the edge
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [markers, map]);

  return null;
}

export default function LeafletMap({ markers = [], selectedGroup = '' }) {
  // Filter markers based on selected group if any
  const displayMarkers = selectedGroup
    ? markers.filter(m => (m.prayer_group || 'Unassigned') === selectedGroup)
    : markers;

  return (
    <div className="map-wrapper" id="leaflet-map-wrapper">
      <MapContainer 
        center={[CHURCH_LAT, CHURCH_LON]} 
        zoom={10} 
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Church Location */}
        <Marker position={[CHURCH_LAT, CHURCH_LON]} icon={createChurchIcon()}>
          <Popup>
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-heading)' }}>
              <strong style={{ color: 'var(--color-primary-dark)', fontSize: '14px' }}>
                Mar Thoma Church of San Francisco
              </strong>
              <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                418 Junction Ave, Livermore, CA 94551
              </p>
            </div>
          </Popup>
        </Marker>

        {/* Member Households */}
        {displayMarkers.map((m, idx) => {
          if (!m.latitude || !m.longitude) return null;
          return (
            <Marker 
              key={`${m.household_id}-${idx}`} 
              position={[m.latitude, m.longitude]} 
              icon={createMarkerIcon(m.prayer_group)}
            >
              <Popup>
                <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
                  <strong style={{ color: 'var(--color-text-main)', fontSize: '14px' }}>
                    {m.mail_to || `${m.first_name} ${m.last_name}`}
                  </strong>
                  <div style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    {m.address_1} {m.address_2 ? `, ${m.address_2}` : ''}<br />
                    {m.city}, {m.state}
                  </div>
                  <div style={{ marginTop: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '6px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span>Group: <strong style={{ color: GROUP_COLORS[m.prayer_group] || '#64748b' }}>{m.prayer_group || 'Unassigned'}</strong></span>
                    <span>Dist: <strong>{m.distance_miles ? `${m.distance_miles.toFixed(1)} mi` : 'N/A'}</strong></span>
                  </div>
                  {m.envelope_number && (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-light)', marginTop: '2px' }}>
                      Envelope Number: <strong>{m.envelope_number}</strong>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        <MapController markers={displayMarkers} />
      </MapContainer>
    </div>
  );
}
