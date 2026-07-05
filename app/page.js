"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  AgeDistributionChart,
  GenderChart,
  CityChart,
  DistanceChart,
  PrayerGroupChart,
  GrowthHistoryChart,
  RelationshipChart,
  FinancialTrendChart,
  FinancialMonthlyTrendChart,
  FinancialYearComparisonChart
} from './components/Charts';
import MemberModal from './components/MemberModal';
import { generateRegistryPDF } from './utils/generateRegistryPDF';

// Dynamically import Leaflet Map to prevent SSR window reference error
const LeafletMap = dynamic(() => import('./components/Map'), { 
  ssr: false,
  loading: () => (
    <div className="map-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-secondary)' }}>
      <div className="spinner"></div>
    </div>
  )
});

const GROUP_COLORS = {
  'Tri-Valley': '#4f46e5',
  'Central Valley': '#10b981',
  'Fremont': '#06b6d4',
  'South Bay': '#8b5cf6',
  'San Francisco': '#f43f5e',
  'Sacramento': '#ec4899',
  'Unassigned': '#64748b'
};

// ──────────────────────────────────────────────────────────────
// Column definitions for the member directory table
// required:true  → always visible, checkbox disabled in picker
// sortKey        → column name used in ORDER BY
// ──────────────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { key: 'mail_to',         label: 'Family (MailTo)',   required: true,  sortKey: 'mail_to' },
  { key: 'first_name',      label: 'First Name',       required: true,  sortKey: 'first_name' },
  { key: 'last_name',       label: 'Last Name',        required: true,  sortKey: 'last_name' },
  { key: 'city',            label: 'City',             required: true,  sortKey: 'city' },
  { key: 'personal_email',  label: 'Email',            required: true,  sortKey: 'personal_email' },
  { key: 'phone',           label: 'Individual Phone', required: true,  sortKey: 'mobile_phone' },
  { key: 'hh_phone',        label: 'HH Phone',         required: false, sortKey: 'hh_phone' },
  { key: 'address',         label: 'Mailing Address',  required: false, sortKey: 'address_1' },
  { key: 'relationship',    label: 'Role',             required: false, sortKey: 'relationship' },
  { key: 'gender',          label: 'Gender',           required: false, sortKey: 'gender' },
  { key: 'age',             label: 'Age',              required: false, sortKey: 'age' },
  { key: 'birth_date',      label: 'Birth Date',       required: false, sortKey: 'birth_date' },
  { key: 'marriage_date',   label: 'Anniversary Date', required: false, sortKey: 'marriage_date' },
  { key: 'prayer_group',    label: 'Prayer Group',     required: false, sortKey: 'prayer_group' },
  { key: 'distance_miles',  label: 'Distance',         required: false, sortKey: 'distance_miles' },
  { key: 'envelope_number', label: 'Envelope #',       required: false, sortKey: 'envelope_number' },
];


// Default: all columns visible
const DEFAULT_VISIBLE = new Set(ALL_COLUMNS.map(c => c.key));

// Animated number counter hook
function useCountUp(target, duration = 1200) {
  const [count, setCount] = useState(0);
  const startTime = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (target === 0 || target == null) { setCount(0); return; }
    startTime.current = null;
    const step = (timestamp) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(eased * target));
      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [target, duration]);

  return count;
}

// Individual stat card with count-up animation
function StatCard({ label, value, sub, colorClass, icon }) {
  const animatedValue = useCountUp(typeof value === 'number' ? value : 0);
  const displayValue = typeof value === 'string' ? value : animatedValue;
  return (
    <div className={`stat-card ${colorClass}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{displayValue}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

// Helper to get string value of a field for CSV export
const getColValue = (m, colKey) => {
  switch (colKey) {
    case 'mail_to':         return m.mail_to || '';
    case 'first_name':      return m.first_name || '';
    case 'last_name':       return m.last_name || '';
    case 'city':            return m.city || '';
    case 'personal_email':  return m.personal_email || '';
    case 'phone':           return m.mobile_phone || m.home_phone || '';
    case 'hh_phone':        return m.hh_phone || '';
    case 'address': {
      const parts = [
        m.address_1,
        m.address_2,
        m.city && m.state ? `${m.city}, ${m.state}` : (m.city || m.state),
        m.zip
      ].filter(Boolean);
      return parts.join(', ');
    }
    case 'relationship':    return m.relationship || '';
    case 'gender':          return m.gender || '';
    case 'age':             return m.age != null ? String(m.age) : '';
    case 'birth_date':      return m.birth_date || '';
    case 'marriage_date':   return m.marriage_date || '';
    case 'prayer_group':    return m.prayer_group || 'Unassigned';
    case 'distance_miles':  return m.distance_miles != null ? m.distance_miles.toFixed(2) : '';
    case 'envelope_number': return m.envelope_number || '';
    default:                return '';
  }
};

export default function DashboardPage() {
  // Active Tab
  const [activeTab, setActiveTab] = useState('dashboard');
  const [birthdayFilter, setBirthdayFilter] = useState('this_week');
  const [anniversaryFilter, setAnniversaryFilter] = useState('this_week');

  // Financial tab filters
  const [financialYear, setFinancialYear] = useState('');
  const [nonDonorSearch, setNonDonorSearch] = useState('');

  // Loading states
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // Stats & Map State
  const [stats, setStats] = useState(null);
  const [mapMarkers, setMapMarkers] = useState([]);

  // Compute top donors using useMemo to ensure proper recalculation
  const computedTopDonors = useMemo(() => {
    if (!stats?.financial?.allContributions) {
      return [];
    }
    const f = stats.financial;
    const y = financialYear;
    const filtered = y ? f.allContributions.filter(c => c.giving_date && String(c.giving_date).startsWith(y)) : f.allContributions;
    const donorMap = {};
    filtered.forEach(c => {
      const dn = c.donor_number ? String(c.donor_number) : null;
      if (dn) {
        if (!donorMap[dn]) {
          donorMap[dn] = { donor_number: dn, family_first_name: c.family_first_name, family_last_name: c.family_last_name, total_giving: 0, gift_count: 0 };
        }
        donorMap[dn].total_giving += c.amount || 0;
        donorMap[dn].gift_count += 1;
      }
    });
    const sorted = Object.values(donorMap).sort((a, b) => b.total_giving - a.total_giving).slice(0, 15);
    return sorted;
  }, [stats, financialYear]);

  // Compute filtered financial data based on year
  const getFilteredFinancialData = () => {
    if (!stats?.financial) return null;
    const f = stats.financial;
    // Ensure we're using string for year comparison
    const y = financialYear ? String(financialYear) : '';

    // Use ALL contributions for filtering (not just recent 50)
    const sourceData = f.allContributions || f.recentContributions || [];

    // Filter by year - ensure both sides are strings
    const filteredContributions = y
      ? sourceData?.filter(c => c.giving_date && String(c.giving_date).startsWith(y))
      : sourceData;

    // Calculate filtered stats
    const filteredTotal = filteredContributions?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
    const filteredRecordCount = filteredContributions?.length || 0;
    const filteredUniqueDonors = new Set(filteredContributions?.map(c => c.donor_number ? String(c.donor_number) : null).filter(Boolean)).size;
    const filteredHouseholds = new Set(filteredContributions?.map(c => c.household_id).filter(Boolean)).size;
    const filteredAvgDonation = filteredRecordCount > 0 ? filteredTotal / filteredRecordCount : 0;

    // Calculate top donors for filtered year
    const donorMap = {};
    filteredContributions?.forEach(c => {
      // Use string version of donor_number as key to avoid type mismatch
      const donorNum = c.donor_number ? String(c.donor_number) : null;
      if (donorNum) {
        if (!donorMap[donorNum]) {
          donorMap[donorNum] = {
            donor_number: donorNum,
            family_last_name: c.family_last_name,
            family_first_name: c.family_first_name,
            total_giving: 0,
            gift_count: 0,
            household_id: c.household_id,
            mail_to: c.mail_to
          };
        }
        donorMap[donorNum].total_giving += c.amount || 0;
        donorMap[donorNum].gift_count += 1;
      }
    });
    const filteredTopDonors = Object.values(donorMap)
      .sort((a, b) => b.total_giving - a.total_giving)
      .slice(0, 20);

    // Filter by year for fund breakdown
    const filteredByFund = f.fundByYear
      ? f.fundByYear
          .filter(fy => !y || fy.year === y)
          .reduce((acc, fy) => {
            const existing = acc.find(a => a.fund_name === fy.fund_name);
            if (existing) {
              existing.total = (existing.total || 0) + (fy.total || 0);
              existing.count = (existing.count || 0) + (fy.count || 0);
            } else {
              acc.push({ fund_name: fy.fund_name, total: fy.total, count: fy.count });
            }
            return acc;
          }, [])
          .sort((a, b) => b.total - a.total)
      : [];

    // Filter by year for prayer group - calculate from filtered contributions
    const prayerGroupMap = {};
    filteredContributions?.forEach(c => {
      const pg = c.prayer_group || 'Unassigned';
      if (!prayerGroupMap[pg]) {
        prayerGroupMap[pg] = { prayer_group: pg, total: 0, household_count: new Set(), gift_count: 0 };
      }
      prayerGroupMap[pg].total += c.amount || 0;
      prayerGroupMap[pg].gift_count += 1;
      if (c.household_id) {
        prayerGroupMap[pg].household_count.add(c.household_id);
      }
    });
    const filteredByPrayerGroup = Object.values(prayerGroupMap).map(pg => ({
      ...pg,
      household_count: pg.household_count.size
    })).sort((a, b) => b.total - a.total);

    // Compute non-donors: households that did NOT give in the filtered period
    const donorHouseholdIds = new Set(
      filteredContributions?.map(c => c.household_id).filter(Boolean)
    );
    const allHouseholds = f.allHouseholds || [];
    const nonDonors = allHouseholds.filter(
      hh => !donorHouseholdIds.has(hh.household_id)
    );

    return {
      filteredTopDonors,
      filteredByFund,
      filteredByPrayerGroup,
      filteredContributions,
      nonDonors,
      filteredStats: {
        totalContributions: filteredTotal,
        totalRecords: filteredRecordCount,
        uniqueDonors: filteredUniqueDonors,
        householdsWithGiving: filteredHouseholds,
        avgDonation: filteredAvgDonation
      }
    };
  };

  // Call the function directly in render
  const filteredFinancialData = getFilteredFinancialData();

  // Table Data State
  const [members, setMembers] = useState([]);
  const [pagination, setPagination] = useState({
    totalItems: 0,
    page: 1,
    limit: 25,
    totalPages: 1
  });

  // Selected Member for Detail Modal
  const [selectedMember, setSelectedMember] = useState(null);

  // Active Filters State
  const [search, setSearch] = useState('');
  const [prayerGroup, setPrayerGroup] = useState('');
  const [gender, setGender] = useState('');
  const [relationship, setRelationship] = useState('');
  const [ageBracket, setAgeBracket] = useState('');
  const [distanceRange, setDistanceRange] = useState('');

  // Sorting State
  const [sortBy, setSortBy] = useState('last_name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Debounced Search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const tableRef = useRef(null);
  const colPickerRef = useRef(null);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE);
  const [showColPicker, setShowColPicker] = useState(false);

  // File upload states & refs
  const [exportFile, setExportFile] = useState(null);
  const [envelopeFile, setEnvelopeFile] = useState(null);
  const [groupsFile, setGroupsFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [parserLog, setParserLog] = useState('');

  const exportInputRef = useRef(null);
  const envelopeInputRef = useRef(null);
  const groupsInputRef = useRef(null);

  // Financial file upload states
  const [fundFile, setFundFile] = useState(null);
  const [fundYear, setFundYear] = useState('');
  const [fundUploading, setFundUploading] = useState(false);
  const [fundUploadError, setFundUploadError] = useState('');
  const [fundUploadSuccess, setFundUploadSuccess] = useState('');
  const fundInputRef = useRef(null);

  // Close column picker when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target)) {
        setShowColPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleColumn = useCallback((key) => {
    setVisibleColumns(prev => {
      const col = ALL_COLUMNS.find(c => c.key === key);
      if (col?.required) return prev; // can't remove required columns
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Initial Data Fetch helper
  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/data?page=1&limit=25');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setMembers(data.members || []);
      setPagination(data.pagination);
      setStats(data.stats || null);
      setMapMarkers(data.stats?.mapMarkers || []);
    } catch (err) {
      console.error("Error fetching initial dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch updated table data when filters, pagination, or sorting changes
  const fetchTableData = useCallback(async () => {
    setTableLoading(true);
    try {
      const queryParams = new URLSearchParams({
        onlyTable: 'true',
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        search: debouncedSearch,
        prayer_group: prayerGroup,
        gender: gender,
        relationship: relationship,
        age_bracket: ageBracket,
        distance_range: distanceRange,
        sort_by: sortBy,
        sort_order: sortOrder
      });

      const res = await fetch(`/api/data?${queryParams.toString()}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setMembers(data.members || []);
      setPagination(data.pagination);
    } catch (err) {
      console.error("Error fetching table data:", err);
    } finally {
      setTableLoading(false);
    }
  }, [
    pagination.page,
    pagination.limit,
    debouncedSearch,
    prayerGroup,
    gender,
    relationship,
    ageBracket,
    distanceRange,
    sortBy,
    sortOrder
  ]);

  useEffect(() => {
    if (loading) return;
    fetchTableData();
  }, [loading, fetchTableData]);

  // Handle resets
  const handleResetFilters = () => {
    setSearch('');
    setPrayerGroup('');
    setGender('');
    setRelationship('');
    setAgeBracket('');
    setDistanceRange('');
    setSortBy('last_name');
    setSortOrder('asc');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Click handler from charts to apply filters
  const handleChartFilter = (filterType, value) => {
    setPagination(prev => ({ ...prev, page: 1 }));
    if (filterType === 'prayer_group') {
      setPrayerGroup(value === 'Unassigned' ? 'Unassigned' : value);
    } else if (filterType === 'age_bracket') {
      setAgeBracket(value);
    } else if (filterType === 'gender') {
      setGender(value);
    } else if (filterType === 'relationship') {
      setRelationship(value === 'Unknown' ? '' : value);
    } else if (filterType === 'distance_range') {
      const val = value.replace(' miles', '');
      setDistanceRange(val);
    } else if (filterType === 'city') {
      setSearch(value);
    }
    // Switch to directory tab and scroll to table
    setActiveTab('directory');
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Table Sort toggler
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Ingestion upload files handler
  const handleUploadFiles = async () => {
    if (!exportFile || !envelopeFile || !groupsFile) {
      setUploadError("Please select all three required Excel files.");
      return;
    }
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');
    setParserLog('');

    const formData = new FormData();
    formData.append('exportFile', exportFile);
    formData.append('envelopeFile', envelopeFile);
    formData.append('groupsFile', groupsFile);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Server responded with an error during ingestion.');
      }

      setUploadSuccess("Database rebuilt successfully!");
      setParserLog(data.parserOutput || 'Done.');
      
      // Clear file inputs in state and DOM
      setExportFile(null);
      setEnvelopeFile(null);
      setGroupsFile(null);
      if (exportInputRef.current) exportInputRef.current.value = '';
      if (envelopeInputRef.current) envelopeInputRef.current.value = '';
      if (groupsInputRef.current) groupsInputRef.current.value = '';

      // Re-fetch statistics and table data
      fetchInitialData();
    } catch (err) {
      console.error(err);
      setUploadError(err.message || 'An error occurred during file upload.');
    } finally {
      setUploading(false);
    }
  };

  // Financial file upload handler
  const handleFundUpload = async () => {
    if (!fundFile) {
      setFundUploadError("Please select FundActivitySpreadsheet file.");
      return;
    }
    setFundUploading(true);
    setFundUploadError('');
    setFundUploadSuccess('');

    const formData = new FormData();
    formData.append('fundFile', fundFile);
    if (fundYear) {
      formData.append('year', fundYear);
    }

    try {
      const res = await fetch('/api/upload-financial', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Server responded with an error during upload.');
      }

      setFundUploadSuccess(data.message || "Financial data imported successfully!");
      setFundFile(null);
      setFundYear('');
      if (fundInputRef.current) fundInputRef.current.value = '';

      // Re-fetch statistics to get financial data
      fetchInitialData();
    } catch (err) {
      console.error(err);
      setFundUploadError(err.message || 'An error occurred during file upload.');
    } finally {
      setFundUploading(false);
    }
  };

  // CSV Exporter — exports only the currently visible columns, ignoring pagination
  const handleExportCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const queryParams = new URLSearchParams({
        onlyTable: 'true',
        page: '1',
        limit: 'all',
        search,
        prayer_group: prayerGroup,
        gender,
        relationship,
        age_bracket: ageBracket,
        distance_range: distanceRange,
        sort_by: sortBy,
        sort_order: sortOrder
      });

      const res = await fetch(`/api/data?${queryParams.toString()}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const allFilteredMembers = data.members || [];
      if (allFilteredMembers.length === 0) {
        alert("No members to export.");
        return;
      }
      
      const activeCols = ALL_COLUMNS.filter(col => visibleColumns.has(col.key));
      const headers = activeCols.map(col => col.label);

      const escapeCSV = (val) => {
        const s = String(val ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const rows = allFilteredMembers.map(m => 
        activeCols.map(col => escapeCSV(getColValue(m, col.key)))
      );

      const csvString = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Parish_Members_Export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting CSV:", err);
      alert("Failed to export CSV: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = search || prayerGroup || gender || relationship || ageBracket || distanceRange;

  if (loading) {
    return (
      <div className="loading-overlay" style={{ height: '70vh', flexDirection: 'column', gap: '16px' }} id="initial-loading-area">
        <div className="spinner"></div>
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-heading)', fontWeight: '600' }}>
          Loading Parish Registry & Analytics...
        </p>
      </div>
    );
  }

  return (
    <div id="dashboard-main-view">
      {/* Tab Navigation */}
      <nav className="tab-nav" id="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
          id="tab-btn-dashboard"
        >
          <span className="tab-icon">📊</span>
          <span>Analytics</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'directory' ? 'active' : ''}`}
          onClick={() => setActiveTab('directory')}
          id="tab-btn-directory"
        >
          <span className="tab-icon">👥</span>
          <span>Member Directory</span>
          {pagination.totalItems > 0 && (
            <span className="tab-badge">{stats?.totalMembers || pagination.totalItems}</span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
          id="tab-btn-import"
        >
          <span className="tab-icon">📤</span>
          <span>Import Data</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'financial' ? 'active' : ''}`}
          onClick={() => setActiveTab('financial')}
          id="tab-btn-financial"
        >
          <span className="tab-icon">💰</span>
          <span>Financial</span>
        </button>
      </nav>

      {/* ========== ANALYTICS TAB ========== */}
      {activeTab === 'dashboard' && (
        <>
          {/* 1. Statistics Cards */}
          <section className="stats-grid" id="stats-cards-section">
            <StatCard
              label="Total Households"
              value={stats?.totalHouseholds || 0}
              sub={`${stats?.activeHouseholds || 0} Active Families`}
              colorClass="stat-hh"
              icon="🏠"
            />
            <StatCard
              label="Total Members"
              value={stats?.totalMembers || 0}
              sub={`${stats?.activeMembers || 0} Active Individuals`}
              colorClass="stat-mem"
              icon="👥"
            />
            <StatCard
              label="Avg. Family Size"
              value={stats?.avgFamilySize ? `${stats.avgFamilySize.toFixed(1)}` : '0.0'}
              sub="Members per household"
              colorClass="stat-fam"
              icon="👨‍👩‍👧‍👦"
            />
            <StatCard
              label="Avg. Age"
              value={stats?.avgAge ? `${stats.avgAge.toFixed(0)} yrs` : 'N/A'}
              sub={`Range: ${stats?.minAge || 0}–${stats?.maxAge || 0} years`}
              colorClass="stat-age"
              icon="🎂"
            />
            <StatCard
              label="Avg. Distance"
              value={stats?.avgDistance ? `${stats.avgDistance.toFixed(1)} mi` : '0.0 mi'}
              sub="Based on geocoded locations"
              colorClass="stat-dist"
              icon="📍"
            />
          </section>

          {/* 2. Visualizations Panel */}
          <section className="dashboard-grid" id="visualizations-section">
            {/* Prayer Group Breakdown */}
            <div className="dashboard-card" id="card-prayer-group">
              <div className="card-title-container">
                <h2 className="card-title">Members by Prayer Group</h2>
                <span className="card-hint">Click bar to filter</span>
              </div>
              <div className="chart-container">
                <PrayerGroupChart 
                  data={stats?.distributions?.prayerGroup} 
                  onFilterClick={(val) => handleChartFilter('prayer_group', val)}
                />
              </div>
            </div>

            {/* Age Distribution */}
            <div className="dashboard-card" id="card-age-dist">
              <div className="card-title-container">
                <h2 className="card-title">Age Demographics</h2>
                <span className="card-hint">Click bar to filter</span>
              </div>
              <div className="chart-container">
                <AgeDistributionChart 
                  data={stats?.distributions?.age} 
                  onFilterClick={(val) => handleChartFilter('age_bracket', val)}
                />
              </div>
            </div>

            {/* Gender + Relationship double */}
            <div className="dashboard-card" style={{ gridColumn: 'span 2' }} id="card-gender-rel">
              <div className="card-title-container">
                <h2 className="card-title">Gender & Relationship Breakdown</h2>
                <span className="card-hint">Click segment to filter</span>
              </div>
              <div className="double-chart-container">
                <div className="chart-container">
                  <GenderChart 
                    data={stats?.distributions?.gender} 
                    onFilterClick={(val) => handleChartFilter('gender', val)}
                  />
                </div>
                <div className="chart-container">
                  <RelationshipChart 
                    data={stats?.distributions?.relationship}
                    onFilterClick={(val) => handleChartFilter('relationship', val)}
                  />
                </div>
              </div>
            </div>

            {/* Distance Distribution */}
            <div className="dashboard-card" id="card-distance">
              <div className="card-title-container">
                <h2 className="card-title">Distance from Church</h2>
                <span className="card-hint">Click bar to filter</span>
              </div>
              <div className="chart-container">
                <DistanceChart 
                  data={stats?.distributions?.distance} 
                  onFilterClick={(val) => handleChartFilter('distance_range', val)}
                />
              </div>
            </div>

            {/* Geographic Breakdown (Cities) */}
            <div className="dashboard-card" id="card-city">
              <div className="card-title-container">
                <h2 className="card-title">Location Breakdown (Top Cities)</h2>
                <span className="card-hint">Click bar to search city</span>
              </div>
              <div className="chart-container">
                <CityChart 
                  data={stats?.distributions?.city} 
                  onFilterClick={(val) => handleChartFilter('city', val)}
                />
              </div>
            </div>

            {/* Parish History / Growth */}
            <div className="dashboard-card" style={{ gridColumn: 'span 2' }} id="card-growth">
              <div className="card-title-container">
                <h2 className="card-title">Parish Growth History (Cumulative)</h2>
                <span className="card-hint">Based on registration years</span>
              </div>
              <div className="chart-container" style={{ height: '300px' }}>
                <GrowthHistoryChart data={stats?.distributions?.history} />
              </div>
            </div>

            {/* Geographic Map */}
            <div className="dashboard-card map-outer-container" id="card-map">
              <div className="card-title-container">
                <h2 className="card-title">Interactive Parish Map</h2>
                <div className="map-legend">
                  {Object.entries(GROUP_COLORS).map(([name, color]) => (
                    <span key={name} className="legend-item">
                      <span className="legend-dot" style={{ background: color }}></span>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <LeafletMap markers={mapMarkers} selectedGroup={prayerGroup} />
            </div>
          </section>

          {/* 3. Parish Celebrations */}
          <h3 className="celebrations-section-title">
            <span>🎉</span> Parish Celebrations
          </h3>
          <section className="celebrations-grid" id="celebrations-section">
            {/* Birthdays Card */}
            <div className="dashboard-card" id="card-birthdays">
              <div className="card-title-container">
                <h2 className="card-title">🎂 Upcoming Birthdays</h2>
                <span className="card-hint">
                  {stats?.events?.birthdays?.[birthdayFilter]?.length || 0} birthdays
                </span>
              </div>
              
              <div className="filter-pill-container">
                {['today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'next_month'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setBirthdayFilter(filter)}
                    className={`filter-pill ${birthdayFilter === filter ? 'active' : ''}`}
                  >
                    {filter.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </button>
                ))}
              </div>

              <div className="celebrations-list">
                {stats?.events?.birthdays?.[birthdayFilter] && stats.events.birthdays[birthdayFilter].length > 0 ? (
                  stats.events.birthdays[birthdayFilter].map((bday) => (
                    <div key={bday.member_id} className="celebration-item">
                      <div className="celebration-left">
                        <span className="celebration-name">
                          {bday.first_name} {bday.last_name}
                        </span>
                        <span className="celebration-sub">
                          <span className="celebration-badge">{bday.relationship || 'Member'}</span>
                          <span>Born: {bday.birth_date}</span>
                        </span>
                      </div>
                      <div className="celebration-right">
                        <span className="celebration-date-badge">{bday.month_day_str}</span>
                        <span className="celebration-meta">turning {bday.turning}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="celebration-empty">
                    <span className="celebration-empty-icon">🎂</span>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>No birthdays found</p>
                    <p style={{ fontSize: '0.75rem' }}>Try switching filters to see other ranges.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Wedding Anniversaries Card */}
            <div className="dashboard-card" id="card-anniversaries">
              <div className="card-title-container">
                <h2 className="card-title">💍 Wedding Anniversaries</h2>
                <span className="card-hint">
                  {stats?.events?.anniversaries?.[anniversaryFilter]?.length || 0} anniversaries
                </span>
              </div>

              <div className="filter-pill-container">
                {['today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'next_month'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setAnniversaryFilter(filter)}
                    className={`filter-pill ${anniversaryFilter === filter ? 'active' : ''}`}
                  >
                    {filter.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </button>
                ))}
              </div>

              <div className="celebrations-list">
                {stats?.events?.anniversaries?.[anniversaryFilter] && stats.events.anniversaries[anniversaryFilter].length > 0 ? (
                  stats.events.anniversaries[anniversaryFilter].map((ann, idx) => (
                    <div key={`${ann.household_id}_${idx}`} className="celebration-item">
                      <div className="celebration-left">
                        <span className="celebration-name">{ann.names}</span>
                        <span className="celebration-sub">
                          Married: {ann.marriage_date}
                        </span>
                      </div>
                      <div className="celebration-right">
                        <span className="celebration-date-badge">{ann.month_day_str}</span>
                        <span className="celebration-meta">{ann.years} years married</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="celebration-empty">
                    <span className="celebration-empty-icon">💍</span>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>No anniversaries found</p>
                    <p style={{ fontSize: '0.75rem' }}>Try switching filters to see other ranges.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {/* ========== DIRECTORY TAB ========== */}
      {activeTab === 'directory' && (
        <>
          {/* Filters Panel */}
          <section className="filters-panel" id="filters-controls-area" ref={tableRef}>
            <div className="filters-header">
              <h2 className="filters-title">🔎 Search & Filters</h2>
              {hasActiveFilters && (
                <button className="reset-button" onClick={handleResetFilters} id="btn-reset-filters">
                  ✕ Reset All Filters
                </button>
              )}
            </div>
            <div className="filters-grid">
              {/* Text Search */}
              <div className="filter-group" style={{ gridColumn: 'span 2' }}>
                <label className="filter-label">Search Directory</label>
                <input 
                  type="text" 
                  className="filter-input" 
                  placeholder="Search by name, city, zip, email, phone..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  id="filter-search-input"
                />
              </div>

              {/* Prayer Group Filter */}
              <div className="filter-group">
                <label className="filter-label">Prayer Group</label>
                <select 
                  className="filter-select" 
                  value={prayerGroup}
                  onChange={(e) => { setPrayerGroup(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
                  id="filter-group-select"
                >
                  <option value="">All Groups</option>
                  <option value="Tri-Valley">Tri-Valley</option>
                  <option value="Central Valley">Central Valley</option>
                  <option value="Fremont">Fremont</option>
                  <option value="South Bay">South Bay</option>
                  <option value="San Francisco">San Francisco</option>
                  <option value="Sacramento">Sacramento</option>
                  <option value="Unassigned">Unassigned / Unknown</option>
                </select>
              </div>

              {/* Relationship Filter */}
              <div className="filter-group">
                <label className="filter-label">Relationship</label>
                <select 
                  className="filter-select" 
                  value={relationship}
                  onChange={(e) => { setRelationship(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
                  id="filter-relationship-select"
                >
                  <option value="">All Relationships</option>
                  <option value="Husband">Husband</option>
                  <option value="Wife">Wife</option>
                  <option value="Son">Son</option>
                  <option value="Daughter">Daughter</option>
                </select>
              </div>

              {/* Age Bracket Filter */}
              <div className="filter-group">
                <label className="filter-label">Age Bracket</label>
                <select 
                  className="filter-select" 
                  value={ageBracket}
                  onChange={(e) => { setAgeBracket(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
                  id="filter-age-select"
                >
                  <option value="">All Ages</option>
                  <option value="0-9">0 - 9</option>
                  <option value="10-19">10 - 19</option>
                  <option value="20-29">20 - 29</option>
                  <option value="30-39">30 - 39</option>
                  <option value="40-49">40 - 49</option>
                  <option value="50-59">50 - 59</option>
                  <option value="60-69">60 - 69</option>
                  <option value="70+">70+</option>
                </select>
              </div>

              {/* Gender Filter */}
              <div className="filter-group">
                <label className="filter-label">Gender</label>
                <select 
                  className="filter-select" 
                  value={gender}
                  onChange={(e) => { setGender(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
                  id="filter-gender-select"
                >
                  <option value="">All Genders</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              {/* Distance Filter */}
              <div className="filter-group">
                <label className="filter-label">Distance from Church</label>
                <select 
                  className="filter-select" 
                  value={distanceRange}
                  onChange={(e) => { setDistanceRange(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
                  id="filter-distance-select"
                >
                  <option value="">All Distances</option>
                  <option value="<5">&lt; 5 miles</option>
                  <option value="5-10">5 - 10 miles</option>
                  <option value="10-20">10 - 20 miles</option>
                  <option value="20-50">20 - 50 miles</option>
                  <option value="50+">50+ miles</option>
                </select>
              </div>
            </div>

            {/* Active filter badges */}
            {hasActiveFilters && (
              <div className="active-filters-badges" id="active-badges-list">
                {search && (
                  <span className="filter-badge">
                    🔍 Search: &quot;{search}&quot;
                    <span className="remove-badge" onClick={() => setSearch('')}>×</span>
                  </span>
                )}
                {prayerGroup && (
                  <span className="filter-badge">
                    ✦ Group: {prayerGroup}
                    <span className="remove-badge" onClick={() => setPrayerGroup('')}>×</span>
                  </span>
                )}
                {relationship && (
                  <span className="filter-badge">
                    👤 Relation: {relationship}
                    <span className="remove-badge" onClick={() => setRelationship('')}>×</span>
                  </span>
                )}
                {ageBracket && (
                  <span className="filter-badge">
                    🎂 Age: {ageBracket}
                    <span className="remove-badge" onClick={() => setAgeBracket('')}>×</span>
                  </span>
                )}
                {gender && (
                  <span className="filter-badge">
                    ⚤ Gender: {gender}
                    <span className="remove-badge" onClick={() => setGender('')}>×</span>
                  </span>
                )}
                {distanceRange && (
                  <span className="filter-badge">
                    📍 Distance: {distanceRange} miles
                    <span className="remove-badge" onClick={() => setDistanceRange('')}>×</span>
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Main Members Table */}
          <section className="table-panel" id="members-list-table-panel">

            {/* ── Table toolbar: count · inline search · column picker · export ── */}
            <div className="table-toolbar" id="table-toolbar">
              <div className="table-info" id="table-results-info">
                Found <span>{pagination.totalItems}</span> members
              </div>

              {/* Inline Search */}
              <div className="table-search-wrap" id="table-inline-search">
                <span className="table-search-icon">🔍</span>
                <input
                  type="text"
                  className="table-search-input"
                  placeholder="Quick search name, city, email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  id="table-inline-search-input"
                />
                {search && (
                  <button
                    className="table-search-clear"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                  >✕</button>
                )}
              </div>

              <div className="table-toolbar-actions">
                {/* Column Picker */}
                <div className="col-picker-wrap" ref={colPickerRef}>
                  <button
                    className={`col-picker-btn ${showColPicker ? 'active' : ''}`}
                    onClick={() => setShowColPicker(p => !p)}
                    id="btn-col-picker"
                    title="Show/hide columns"
                  >
                    <span>⊞</span> Columns
                    <span className="col-picker-count">
                      {visibleColumns.size}/{ALL_COLUMNS.length}
                    </span>
                  </button>

                  {showColPicker && (
                    <div className="col-picker-dropdown" id="col-picker-dropdown">
                      <div className="col-picker-header">
                        <span>Show / Hide Columns</span>
                        <button
                          className="col-picker-reset"
                          onClick={() => setVisibleColumns(DEFAULT_VISIBLE)}
                        >Reset</button>
                      </div>
                      <ul className="col-picker-list">
                        {ALL_COLUMNS.map(col => (
                          <li key={col.key} className="col-picker-item">
                            <label className={`col-picker-label ${col.required ? 'col-required' : ''}`}>
                              <input
                                type="checkbox"
                                checked={visibleColumns.has(col.key)}
                                disabled={col.required}
                                onChange={() => toggleColumn(col.key)}
                                id={`col-check-${col.key}`}
                              />
                              <span>{col.label}</span>
                              {col.required && <span className="col-min-tag">min</span>}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <button
                  className="export-button"
                  onClick={handleExportCSV}
                  id="btn-export-csv"
                  disabled={exporting}
                >
                  {exporting ? '⏳ Exporting...' : '📥 Export CSV'}
                </button>

                <button
                  className="export-button"
                  onClick={() => generateRegistryPDF(setGeneratingPDF)}
                  id="btn-download-pdf-registry"
                  disabled={generatingPDF}
                  style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' }}
                  title="Download full Parish Registry as PDF (one family per page)"
                >
                  {generatingPDF ? '⏳ Generating PDF...' : '📄 Download PDF Registry'}
                </button>
              </div>
            </div>

            <div className="table-wrapper">
              {tableLoading ? (
                <div className="loading-overlay" style={{ height: '200px' }} id="table-loading-area">
                  <div className="spinner"></div>
                </div>
              ) : members.length === 0 ? (
                <div className="empty-state" id="table-empty-state">
                  <div className="empty-icon">🔍</div>
                  <h3>No Members Found</h3>
                  <p>Try clearing or modifying your active search filters.</p>
                </div>
              ) : (
                <table className="members-table" id="members-table-dom">
                  <thead>
                    <tr>
                      {ALL_COLUMNS.filter(col => visibleColumns.has(col.key)).map(col => (
                        <th
                          key={col.key}
                          id={`th-${col.key}`}
                          onClick={col.sortKey ? () => handleSort(col.sortKey) : undefined}
                          style={{ cursor: col.sortKey ? 'pointer' : 'default' }}
                        >
                          {col.label}{' '}
                          {col.sortKey && (
                            sortBy === col.sortKey
                              ? (sortOrder === 'asc' ? '▲' : '▼')
                              : <span className="sort-neutral">⇅</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr
                        key={m.member_id}
                        id={`row-member-${m.member_id}`}
                        className="member-row"
                        onClick={() => setSelectedMember(m)}
                        title="Click to view member details"
                      >
                        {ALL_COLUMNS.filter(col => visibleColumns.has(col.key)).map(col => {
                          switch (col.key) {
                            case 'first_name':
                              return <td key={col.key} className="td-first-name">{m.first_name}</td>;
                            case 'last_name':
                              return <td key={col.key}>{m.last_name}</td>;
                            case 'mail_to':
                              return <td key={col.key} className="td-mailto">{m.mail_to || '—'}</td>;
                            case 'city':
                              return <td key={col.key}>{m.city || '—'}</td>;
                            case 'personal_email':
                              return (
                                <td key={col.key} className="td-email">
                                  {m.personal_email
                                    ? <a href={`mailto:${m.personal_email}`} className="table-link" onClick={e => e.stopPropagation()}>{m.personal_email}</a>
                                    : <span className="td-empty">—</span>}
                                </td>
                              );
                            case 'phone':
                              return (
                                <td key={col.key} className="td-phone">
                                  {(m.mobile_phone || m.home_phone)
                                    ? <a href={`tel:${m.mobile_phone || m.home_phone}`} className="table-link" onClick={e => e.stopPropagation()}>{m.mobile_phone || m.home_phone}</a>
                                    : <span className="td-empty">—</span>}
                                </td>
                              );
                            case 'hh_phone':
                              return (
                                <td key={col.key} className="td-phone">
                                  {m.hh_phone
                                    ? <a href={`tel:${m.hh_phone}`} className="table-link" onClick={e => e.stopPropagation()}>{m.hh_phone}</a>
                                    : <span className="td-empty">—</span>}
                                </td>
                              );
                            case 'address': {
                              const parts = [
                                m.address_1,
                                m.address_2,
                                m.city && m.state ? `${m.city}, ${m.state}` : (m.city || m.state),
                                m.zip
                              ].filter(Boolean);
                              const fullAddr = parts.join(', ');
                              return (
                                <td key={col.key} className="td-address">
                                  {fullAddr
                                    ? <a href={`https://maps.google.com/?q=${encodeURIComponent(fullAddr)}`} target="_blank" rel="noopener noreferrer" className="table-link" onClick={e => e.stopPropagation()} title={fullAddr}>
                                        {fullAddr}
                                      </a>
                                    : <span className="td-empty">—</span>}
                                </td>
                              );
                            }
                            case 'relationship':
                              return (
                                <td key={col.key}>
                                  <span className="badge-cell badge-relationship">{m.relationship || 'Member'}</span>
                                </td>
                              );
                            case 'gender':
                              return (
                                <td key={col.key}>
                                  <span className={`badge-cell badge-gender-${String(m.gender || '').toLowerCase()}`}>
                                    {m.gender || 'Unknown'}
                                  </span>
                                </td>
                              );
                            case 'age':
                              return <td key={col.key} className="td-age">{m.age ?? 'N/A'}</td>;
                            case 'birth_date':
                              return <td key={col.key} className="td-date">{m.birth_date || '—'}</td>;
                            case 'marriage_date':
                              return <td key={col.key} className="td-date">{m.marriage_date || '—'}</td>;
                            case 'prayer_group':
                              return (
                                <td key={col.key}>
                                  <span className="badge-cell badge-group" style={{
                                    backgroundColor: `${GROUP_COLORS[m.prayer_group] || '#64748b'}18`,
                                    color: GROUP_COLORS[m.prayer_group] || '#64748b',
                                    borderColor: `${GROUP_COLORS[m.prayer_group] || '#64748b'}30`
                                  }}>
                                    {m.prayer_group || 'Unassigned'}
                                  </span>
                                </td>
                              );
                            case 'distance_miles':
                              return <td key={col.key} className="td-distance">{m.distance_miles ? `${m.distance_miles.toFixed(1)} mi` : 'N/A'}</td>;
                            case 'envelope_number':
                              return <td key={col.key} className="td-envelope">{m.envelope_number || '—'}</td>;
                            default:
                              return <td key={col.key}>—</td>;
                          }
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {members.length > 0 && (
              <div className="pagination-container" id="table-pagination-area">
                <div className="pagination-stats">
                  Showing <span>{(pagination.page - 1) * pagination.limit + 1}</span> –{' '}
                  <span>{Math.min(pagination.page * pagination.limit, pagination.totalItems)}</span> of{' '}
                  <span>{pagination.totalItems}</span> members
                </div>
                <div className="pagination-buttons">
                  <button 
                    className="pagination-button" 
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    id="btn-prev-page"
                  >
                    ← Prev
                  </button>
                  
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter(p => Math.abs(p - pagination.page) <= 2 || p === 1 || p === pagination.totalPages)
                    .map((p, idx, arr) => {
                      const items = [];
                      if (idx > 0 && p - arr[idx - 1] > 1) {
                        items.push(<span key={`ellipsis-${p}`} style={{ padding: '8px 4px', color: 'var(--color-text-light)' }}>…</span>);
                      }
                      items.push(
                        <button 
                          key={`page-${p}`}
                          className={`pagination-button ${pagination.page === p ? 'active' : ''}`}
                          onClick={() => setPagination(prev => ({ ...prev, page: p }))}
                          id={`btn-page-${p}`}
                        >
                          {p}
                        </button>
                      );
                      return items;
                    })
                  }
                  
                  <button 
                    className="pagination-button" 
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    id="btn-next-page"
                  >
                    Next →
                  </button>
                </div>

                {/* Per-page selector */}
                <div className="per-page-selector">
                  <label className="filter-label" style={{ margin: 0 }}>Per page:</label>
                  <select
                    className="filter-select"
                    style={{ width: 'auto', padding: '6px 10px' }}
                    value={pagination.limit}
                    onChange={(e) => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
                    id="per-page-select"
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* ========== IMPORT TAB ========== */}
      {activeTab === 'import' && (
        <section className="import-section" id="import-section-area">
          <div className="import-card">
            <h2 className="import-title">📤 Upload Excel Registry Data</h2>
            <p className="import-subtitle">
              Upload the three Microsoft Excel (.xls) files to parse membership data and rebuild the database.
            </p>

            {uploadError && (
              <div className="import-alert import-alert-error" id="upload-error-alert">
                <span className="alert-icon">⚠️</span>
                <div>
                  <strong>Import Failed:</strong> {uploadError}
                </div>
              </div>
            )}

            {uploadSuccess && (
              <div className="import-alert import-alert-success" id="upload-success-alert">
                <span className="alert-icon">✅</span>
                <div>
                  <strong>Success!</strong> {uploadSuccess}
                </div>
              </div>
            )}

            <div className="dropzone-grid">
              {/* File 1: ExportFile.xls */}
              <div className={`dropzone-card ${exportFile ? 'has-file' : ''}`}>
                <div className="dropzone-header">
                  <span className="dropzone-icon">📊</span>
                  <div className="dropzone-meta">
                    <h4>ExportFile.xls</h4>
                    <p>Household & Member columns</p>
                  </div>
                </div>
                <label className="file-input-label">
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    ref={exportInputRef}
                    onChange={(e) => {
                      setExportFile(e.target.files[0] || null);
                      setUploadError('');
                      setUploadSuccess('');
                    }}
                    id="input-export-file"
                  />
                  {exportFile ? 'Change File' : 'Select File'}
                </label>
                {exportFile && (
                  <div className="file-info-badge">
                    📄 {exportFile.name} ({(exportFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>

              {/* File 2: Envelope.xls */}
              <div className={`dropzone-card ${envelopeFile ? 'has-file' : ''}`}>
                <div className="dropzone-header">
                  <span className="dropzone-icon">✉️</span>
                  <div className="dropzone-meta">
                    <h4>Envelope.xls</h4>
                    <p>Household Record ID & Envelope mappings</p>
                  </div>
                </div>
                <label className="file-input-label">
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    ref={envelopeInputRef}
                    onChange={(e) => {
                      setEnvelopeFile(e.target.files[0] || null);
                      setUploadError('');
                      setUploadSuccess('');
                    }}
                    id="input-envelope-file"
                  />
                  {envelopeFile ? 'Change File' : 'Select File'}
                </label>
                {envelopeFile && (
                  <div className="file-info-badge">
                    📄 {envelopeFile.name} ({(envelopeFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>

              {/* File 3: GroupsH.xls */}
              <div className={`dropzone-card ${groupsFile ? 'has-file' : ''}`}>
                <div className="dropzone-header">
                  <span className="dropzone-icon">👥</span>
                  <div className="dropzone-meta">
                    <h4>GroupsH.xls</h4>
                    <p>Household Record ID & Prayer Group mappings</p>
                  </div>
                </div>
                <label className="file-input-label">
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    ref={groupsInputRef}
                    onChange={(e) => {
                      setGroupsFile(e.target.files[0] || null);
                      setUploadError('');
                      setUploadSuccess('');
                    }}
                    id="input-groups-file"
                  />
                  {groupsFile ? 'Change File' : 'Select File'}
                </label>
                {groupsFile && (
                  <div className="file-info-badge">
                    📄 {groupsFile.name} ({(groupsFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>
            </div>

            <div className="import-action-bar">
              <button
                className="import-submit-btn"
                onClick={handleUploadFiles}
                disabled={uploading || !exportFile || !envelopeFile || !groupsFile}
                id="btn-submit-import"
              >
                {uploading ? '⏳ Processing & Rebuilding Database...' : '🚀 Process & Rebuild Database'}
              </button>
            </div>

            {parserLog && (
              <div className="parser-log-container">
                <h5>📋 Parser Output Execution Logs:</h5>
                <pre className="parser-log-output">{parserLog}</pre>
              </div>
            )}
          </div>

          {/* Financial Data Import */}
          <div className="import-card" style={{ marginTop: '24px' }}>
            <h2 className="import-title">💰 Import Financial Data</h2>
            <p className="import-subtitle">
              Upload the FundActivitySpreadsheet Excel file (.xls) to import contribution/donation data.
            </p>

            {fundUploadError && (
              <div className="import-alert import-alert-error" id="fund-upload-error-alert">
                <span className="alert-icon">⚠️</span>
                <div>
                  <strong>Import Failed:</strong> {fundUploadError}
                </div>
              </div>
            )}

            {fundUploadSuccess && (
              <div className="import-alert import-alert-success" id="fund-upload-success-alert">
                <span className="alert-icon">✅</span>
                <div>
                  <strong>Success!</strong> {fundUploadSuccess}
                </div>
              </div>
            )}

            <div className="dropzone-grid">
              <div className={`dropzone-card ${fundFile ? 'has-file' : ''}`}>
                <div className="dropzone-header">
                  <span className="dropzone-icon">💵</span>
                  <div className="dropzone-meta">
                    <h4>FundActivitySpreadsheet_[Year].xls</h4>
                    <p>Donor contributions & fund data (e.g., FundActivitySpreadsheet_2025.xls)</p>
                  </div>
                </div>

                {/* Year Selection */}
                <div className="filter-group" style={{ marginBottom: '12px' }}>
                  <label className="filter-label">Select Year</label>
                  <select
                    className="filter-select"
                    value={fundYear}
                    onChange={(e) => setFundYear(e.target.value)}
                    id="select-fund-year"
                    style={{ width: '100%' }}
                  >
                    <option value="">-- Select Year --</option>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                    <option value="2023">2023</option>
                    <option value="2022">2022</option>
                    <option value="2021">2021</option>
                    <option value="2020">2020</option>
                  </select>
                </div>

                <label className="file-input-label">
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    ref={fundInputRef}
                    onChange={(e) => {
                      setFundFile(e.target.files[0] || null);
                      setFundUploadError('');
                      setFundUploadSuccess('');
                    }}
                    id="input-fund-file"
                  />
                  {fundFile ? 'Change File' : 'Select File'}
                </label>
                {fundFile && (
                  <div className="file-info-badge">
                    📄 {fundFile.name} ({(fundFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>
            </div>

            <div className="import-action-bar">
              <button
                className="import-submit-btn"
                onClick={handleFundUpload}
                disabled={fundUploading || !fundFile}
                id="btn-submit-fund-import"
              >
                {fundUploading ? '⏳ Importing Financial Data...' : '💰 Import Financial Data'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========== FINANCIAL TAB ========== */}
      {activeTab === 'financial' && (
        <section className="financial-section" id="financial-section-area">
          {!stats?.financial ? (
            <div className="import-card">
              <h2 className="import-title">💰 Financial Analytics</h2>
              <p className="import-subtitle">
                No financial data found. Please import the FundActivitySpreadsheet from the Import Data tab.
              </p>
              <button
                className="import-submit-btn"
                onClick={() => setActiveTab('import')}
                style={{ marginTop: '16px' }}
              >
                Go to Import Data
              </button>
            </div>
          ) : (
            <>
              {/* Financial Stats Cards */}
              <section className="stats-grid" id="financial-stats-section">
                <StatCard
                  label={`Total Contributions ${financialYear ? `(${financialYear})` : '(All Years)'}`}
                  value={`$${filteredFinancialData?.filteredStats.totalContributions?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`}
                  sub={`${filteredFinancialData?.filteredStats.totalRecords || 0} contribution records`}
                  colorClass="stat-hh"
                  icon="💵"
                />
                <StatCard
                  label="Unique Donors"
                  value={filteredFinancialData?.filteredStats.uniqueDonors || 0}
                  sub={`${filteredFinancialData?.filteredStats.householdsWithGiving || 0} households with giving`}
                  colorClass="stat-mem"
                  icon="👤"
                />
                <StatCard
                  label="Avg. Donation"
                  value={`$${filteredFinancialData?.filteredStats.avgDonation?.toFixed(2) || '0.00'}`}
                  sub="Per contribution"
                  colorClass="stat-fam"
                  icon="📊"
                />
              </section>

              {/* Year Filter for Financial Analytics */}
              <div className="filter-pill-container" style={{ marginBottom: '20px' }}>
                <span style={{ marginRight: '12px', fontWeight: '600', color: 'var(--color-text-muted)' }}>Filter by Year:</span>
                <button
                  className={`filter-pill ${financialYear === '' ? 'active' : ''}`}
                  onClick={() => setFinancialYear('')}
                >
                  All Years
                </button>
                {stats.financial.availableYears?.map(year => (
                  <button
                    key={year}
                    className={`filter-pill ${financialYear === String(year) ? 'active' : ''}`}
                    onClick={() => setFinancialYear(String(year))}
                  >
                    {year}
                  </button>
                ))}
              </div>

              {/* Financial Trend Charts */}
              <section className="dashboard-grid" id="financial-trend-section">
                {/* Year over Year Trend */}
                <div className="dashboard-card" style={{ gridColumn: 'span 2' }} id="card-fund-trend">
                  <div className="card-title-container">
                    <h2 className="card-title">Giving Trend (Year over Year)</h2>
                  </div>
                  <div className="chart-container" style={{ height: '280px' }}>
                    {stats.financial.yearlyTrend && stats.financial.yearlyTrend.length > 0 ? (
                      <FinancialTrendChart data={stats.financial.yearlyTrend} />
                    ) : (
                      <p>No trend data available</p>
                    )}
                  </div>
                </div>

                {/* Monthly Trend */}
                <div className="dashboard-card" style={{ gridColumn: 'span 2' }} id="card-fund-monthly-trend">
                  <div className="card-title-container">
                    <h2 className="card-title">Monthly Giving {financialYear ? `(${financialYear})` : '(All Years)'}</h2>
                  </div>
                  <div className="chart-container" style={{ height: '280px' }}>
                    {stats.financial.monthlyTrend && stats.financial.monthlyTrend.length > 0 ? (
                      <FinancialMonthlyTrendChart data={stats.financial.monthlyTrend} selectedYear={financialYear || null} />
                    ) : (
                      <p>No monthly data available</p>
                    )}
                  </div>
                </div>
              </section>

              {/* Financial Charts Grid */}
              <section className="dashboard-grid" id="financial-visualizations-section">
                {/* Giving by Fund */}
                <div className="dashboard-card" id="card-fund-breakdown">
                  <div className="card-title-container">
                    <h2 className="card-title">Giving by Fund {financialYear ? `(${financialYear})` : '(All Years)'}</h2>
                  </div>
                  <div className="chart-container">
                    {filteredFinancialData?.filteredByFund && filteredFinancialData.filteredByFund.length > 0 ? (
                      <table className="financial-table">
                        <thead>
                          <tr>
                            <th>Fund</th>
                            <th style={{ textAlign: 'right' }}>Total</th>
                            <th style={{ textAlign: 'right' }}>Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFinancialData.filteredByFund.slice(0, 10).map((fund, idx) => (
                            <tr key={idx}>
                              <td>{fund.fund_name}</td>
                              <td style={{ textAlign: 'right' }}>${fund.total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</td>
                              <td style={{ textAlign: 'right' }}>{fund.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>No fund data available</p>
                    )}
                  </div>
                </div>

                {/* Giving by Prayer Group */}
                <div className="dashboard-card" id="card-fund-prayer-group">
                  <div className="card-title-container">
                    <h2 className="card-title">Giving by Prayer Group {financialYear ? `(${financialYear})` : '(All Years)'}</h2>
                  </div>
                  <div className="chart-container">
                    {filteredFinancialData?.filteredByPrayerGroup && filteredFinancialData.filteredByPrayerGroup.length > 0 ? (
                      <table className="financial-table">
                        <thead>
                          <tr>
                            <th>Prayer Group</th>
                            <th style={{ textAlign: 'right' }}>Total</th>
                            <th style={{ textAlign: 'right' }}>Households</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFinancialData.filteredByPrayerGroup.map((pg, idx) => (
                            <tr key={idx}>
                              <td>{pg.prayer_group}</td>
                              <td style={{ textAlign: 'right' }}>${pg.total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</td>
                              <td style={{ textAlign: 'right' }}>{pg.household_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>No prayer group data available</p>
                    )}
                  </div>
                </div>

                {/* Giving by Year */}
                <div className="dashboard-card" id="card-fund-year">
                  <div className="card-title-container">
                    <h2 className="card-title">Giving by Year (All Years)</h2>
                  </div>
                  <div className="chart-container">
                    {stats.financial.byYear && stats.financial.byYear.length > 0 ? (
                      <table className="financial-table">
                        <thead>
                          <tr>
                            <th>Year</th>
                            <th style={{ textAlign: 'right' }}>Total</th>
                            <th style={{ textAlign: 'right' }}>Contributions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.financial.byYear.map((year, idx) => (
                            <tr key={idx}>
                              <td>{year.year}</td>
                              <td style={{ textAlign: 'right' }}>${year.total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</td>
                              <td style={{ textAlign: 'right' }}>{year.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>No year data available</p>
                    )}
                  </div>
                </div>

                {/* Top Donors - Using useMemo */}
                <div className="dashboard-card" id="card-top-donors" style={{ gridColumn: 'span 2' }}>
                  <div className="card-title-container">
                    <h2 className="card-title">Top Donors {financialYear ? `(${financialYear})` : '(All Years)'}</h2>
                  </div>
                  <div className="chart-container">
                    {!computedTopDonors.length ? (
                      <p>No data</p>
                    ) : (
                      <table className="financial-table">
                        <thead>
                          <tr>
                            <th>Donor</th>
                            <th style={{ textAlign: 'right' }}>Total Giving</th>
                            <th style={{ textAlign: 'right' }}>Gifts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {computedTopDonors.map((donor, idx) => (
                            <tr key={idx}>
                              <td>{idx+1}. {donor.family_first_name} {donor.family_last_name} ({donor.donor_number})</td>
                              <td style={{ textAlign: 'right' }}>${donor.total_giving?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</td>
                              <td style={{ textAlign: 'right' }}>{donor.gift_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </section>

              {/* Non-Donors Section */}
              <section className="table-panel" id="non-donors-section">
                <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
                  <div className="card-title-container" style={{ flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h2 className="card-title">🚫 Non-Donors {financialYear ? `(${financialYear})` : '(All Years)'}</h2>
                      {filteredFinancialData?.nonDonors && (
                        <span className="tab-badge" style={{ background: 'var(--color-accent-rose, #f43f5e)', color: '#fff', borderRadius: '999px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: '700' }}>
                          {filteredFinancialData.nonDonors.filter(hh => {
                            const q = nonDonorSearch.toLowerCase();
                            return !q || (hh.mail_to || '').toLowerCase().includes(q) || (hh.last_name || '').toLowerCase().includes(q) || (hh.first_name || '').toLowerCase().includes(q) || (hh.city || '').toLowerCase().includes(q);
                          }).length} households
                        </span>
                      )}
                    </div>
                    <div className="table-search-wrap" style={{ maxWidth: '280px', flex: '1' }}>
                      <span className="table-search-icon">🔍</span>
                      <input
                        type="text"
                        className="table-search-input"
                        placeholder="Search non-donors…"
                        value={nonDonorSearch}
                        onChange={e => setNonDonorSearch(e.target.value)}
                        id="non-donor-search-input"
                      />
                      {nonDonorSearch && (
                        <button className="table-search-clear" onClick={() => setNonDonorSearch('')} aria-label="Clear">✕</button>
                      )}
                    </div>
                  </div>
                  <div className="table-wrapper" style={{ maxHeight: '700px', overflow: 'auto' }}>
                    {!filteredFinancialData?.nonDonors || filteredFinancialData.nonDonors.length === 0 ? (
                      <div className="empty-state" style={{ padding: '32px' }}>
                        <div className="empty-icon">🎉</div>
                        <h3>All households have donated!</h3>
                        <p>No non-donors found for the selected period.</p>
                      </div>
                    ) : (() => {
                      const q = nonDonorSearch.toLowerCase();
                      const filtered = filteredFinancialData.nonDonors.filter(hh =>
                        !q || (hh.mail_to || '').toLowerCase().includes(q) || (hh.last_name || '').toLowerCase().includes(q) || (hh.first_name || '').toLowerCase().includes(q) || (hh.city || '').toLowerCase().includes(q)
                      );
                      return filtered.length === 0 ? (
                        <div className="empty-state" style={{ padding: '32px' }}>
                          <div className="empty-icon">🔍</div>
                          <h3>No results found</h3>
                          <p>Try a different search term.</p>
                        </div>
                      ) : (
                        <table className="financial-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Family (Mail To)</th>
                              <th>Last Name</th>
                              <th>First Name</th>
                              <th>City</th>
                              <th>Prayer Group</th>
                              <th>Envelope #</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((hh, idx) => (
                              <tr key={hh.household_id}>
                                <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{idx + 1}</td>
                                <td style={{ fontWeight: '600' }}>{hh.mail_to || '—'}</td>
                                <td>{hh.last_name || '—'}</td>
                                <td>{hh.first_name || '—'}</td>
                                <td>{hh.city || '—'}</td>
                                <td>
                                  {hh.prayer_group ? (
                                    <span className="badge-cell badge-group" style={{
                                      backgroundColor: `${GROUP_COLORS[hh.prayer_group] || '#64748b'}18`,
                                      color: GROUP_COLORS[hh.prayer_group] || '#64748b',
                                      borderColor: `${GROUP_COLORS[hh.prayer_group] || '#64748b'}30`
                                    }}>
                                      {hh.prayer_group}
                                    </span>
                                  ) : <span style={{ color: 'var(--color-text-muted)' }}>Unassigned</span>}
                                </td>
                                <td>{hh.envelope_number || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>
              </section>

              {/* Recent Contributions Table */}
              <section className="table-panel" id="recent-contributions-section">
                <div className="dashboard-card" style={{ gridColumn: 'span 2' }}>
                  <div className="card-title-container">
                    <h2 className="card-title">Recent Contributions</h2>
                  </div>
                  <div className="table-wrapper" style={{ maxHeight: '400px', overflow: 'auto' }}>
                    <table className="members-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Donor</th>
                          <th>Fund</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                          <th>Type</th>
                          <th>Check #</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFinancialData?.filteredContributions && filteredFinancialData.filteredContributions.length > 0 ? (
                          filteredFinancialData.filteredContributions.slice(0, 25).map((contrib, idx) => (
                            <tr key={idx}>
                              <td>{contrib.giving_date || '-'}</td>
                              <td>
                                {contrib.family_first_name} {contrib.family_last_name}
                                {contrib.mail_to && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{contrib.mail_to}</span>}
                              </td>
                              <td>{contrib.fund_name || '-'}</td>
                              <td style={{ textAlign: 'right', fontWeight: '600' }}>${contrib.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</td>
                              <td>{contrib.currency_type || '-'}</td>
                              <td>{contrib.check_number || '-'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '24px' }}>No contributions found</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          )}
        </section>
      )}

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}
