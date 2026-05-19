import React, { useState, useEffect, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import { Calendar, Download, X, Search, Filter, FileSpreadsheet, Palette } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import '../styles/Livraison.css';
import API_BASE_URL from '../config';

const PAGINATION_OPTIONS = {
  rowsPerPageText: 'Lignes par page:',
  rangeSeparatorText: 'de',
  selectAllRowsItem: true,
  selectAllRowsItemText: 'Tous',
};

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined || seconds === '—' || isNaN(seconds)) return '—';
  const sec = parseInt(seconds, 10);
  if (sec === 0) return '0s';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  
  let result = [];
  if (hrs > 0) result.push(`${hrs}h`);
  if (mins > 0) result.push(`${mins}m`);
  if (secs > 0 || result.length === 0) result.push(`${secs}s`);
  return result.join(' ');
};

const TABLE_CUSTOM_STYLES = {
  headRow: {
    style: {
      backgroundColor: '#f1f5f9', // Slate 100
      color: '#1e293b',          // Slate 800
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      borderBottom: '2px solid #cbd5e1', // Slate 300
      minHeight: '48px',
    }
  },
  headCells: {
    style: { paddingLeft: '16px', paddingRight: '16px' }
  },
  cells: {
    style: { paddingLeft: '16px', paddingRight: '16px', fontSize: '13px' }
  },
  rows: {
    style: {
      minHeight: '48px',
      color: '#334155',
      borderBottom: '1px solid #e2e8f0', // Slate 200
      '&:hover': { 
        backgroundColor: '#f8fafc', // Slate 50
        transition: 'background-color 0.15s ease'
      }
    }
  },
  pagination: {
    style: {
      borderTop: '1px solid #e2e8f0',
      color: '#475569',
      fontSize: '13px'
    }
  }
};

const isRowActive = (row) => {
  const service = parseInt(row.Service, 10);
  const dist = parseFloat(row.distance);
  const hasService = !isNaN(service) && service > 0;
  const hasDistance = !isNaN(dist) && dist > 0;
  return hasService || hasDistance;
};

const conditionalRowStyles = [
  {
    when: row => !isRowActive(row),
    style: {
      backgroundColor: '#fef9c3', // Soft yellow
      color: '#713f12',          // Dark amber text
      '&:hover': {
        backgroundColor: '#fef08a',
      },
    },
  },
  {
    when: row => isRowActive(row),
    style: {
      backgroundColor: '#d1fae5', // Soft green (Emerald 100)
      color: '#065f46',          // Dark green text
      '&:hover': {
        backgroundColor: '#a7f3d0', // Emerald 200 on hover
      },
    },
  },
];

const columns = [
  { name: 'Date', selector: row => row.Date || '—', sortable: true, minWidth: '110px' },
  { name: 'Véhicule', selector: row => row.Vehicules || '—', sortable: true, minWidth: '320px' },
  { name: 'Immatriculation', selector: row => row.Immatriculation || '—', sortable: true, minWidth: '140px' },
  { name: 'Marque', selector: row => row.Marque || '—', sortable: true, minWidth: '110px' },
  { name: 'Catégorie', selector: row => row.category || '—', sortable: true, minWidth: '130px' },
  { name: 'Odomètre', selector: row => row.odometer !== undefined && row.odometer !== null ? `${row.odometer.toLocaleString()} km` : '—', sortable: true, right: true, minWidth: '130px' },
  { name: 'Distance', selector: row => row.distance !== undefined && row.distance !== null ? `${row.distance.toLocaleString()} km` : '—', sortable: true, right: true, minWidth: '110px' },
  { name: 'Temps Service', selector: row => formatDuration(row.Service), sortable: true, right: true, minWidth: '130px' },
  { name: 'Temps Arrêt', selector: row => formatDuration(row.Stop_service), sortable: true, right: true, minWidth: '120px' },
  { name: 'Carburant', selector: row => row.fuel !== undefined && row.fuel !== null ? `${row.fuel.toLocaleString()} L` : '—', sortable: true, right: true, minWidth: '110px' },
];

const exportToExcel = (data, filename = 'rapport_vehicules.xlsx') => {
  if (!data?.length) {
    alert('Aucune donnée à exporter');
    return;
  }
  const worksheetData = data.map(row => ({
    Date: row.Date || '',
    Véhicule: row.Vehicules || '',
    Immatriculation: row.Immatriculation || '',
    Marque: row.Marque || '',
    Catégorie: row.category || '',
    Label: row.label || '',
    'Odomètre (km)': row.odometer ?? '',
    'Distance (km)': row.distance ?? '',
    'Temps Service (s)': row.Service ?? '',
    'Temps Arrêt (s)': row.Stop_service ?? '',
    'Carburant (L)': row.fuel ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(worksheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rapport');
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, filename);
};

export default function Rapport({ token, addNotification }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterText, setFilterText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [selectedPlates, setSelectedPlates] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [plateSearchText, setPlateSearchText] = useState('');
  const [resetPaginationToggle, setResetPaginationToggle] = useState(false);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [activityDropdownOpen, setActivityDropdownOpen] = useState(false);

  useEffect(() => {
    if (dateDropdownOpen) {
      setTempStartDate(startDate);
      setTempEndDate(endDate);
    }
  }, [dateDropdownOpen, startDate, endDate]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  useEffect(() => {
    const fetchData = async (isSilent = false) => {
      try {
        if (!isSilent) setLoading(true);
        const authToken = token || localStorage.getItem('authToken');
        if (!authToken) return;

        const params = {};
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;

        const res = await axios.get(`${API_BASE_URL}/output/reporting/`, {
          headers: { Authorization: `Bearer ${authToken}` },
          params,
        });
        setData(res.data || []);
      } catch (err) {
        console.error('Erreur:', err);
      } finally {
        if (!isSilent) setLoading(false);
      }
    };
    fetchData();

    const intervalId = setInterval(() => {
      fetchData(true);
    }, 15000);

    return () => clearInterval(intervalId);
  }, [token, startDate, endDate]);

  const categoriesList = useMemo(() => {
    const catsMap = {};
    data.forEach(row => {
      if (row.category && typeof row.category === 'string') {
        const catName = row.category.trim();
        catsMap[catName] = (catsMap[catName] || 0) + 1;
      }
    });
    return Object.entries(catsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const immatriculationsList = useMemo(() => {
    let filteredForPlates = data;
    if (selectedCategory) {
      filteredForPlates = data.filter(row => 
        row.category && 
        typeof row.category === 'string' && 
        row.category.trim() === selectedCategory.trim()
      );
    }
    const plates = new Set(
      filteredForPlates
        .map(row => row.Immatriculation && typeof row.Immatriculation === 'string' ? row.Immatriculation.trim() : null)
        .filter(Boolean)
    );
    return Array.from(plates).sort();
  }, [data, selectedCategory]);

  const availablePlates = useMemo(() => {
    return immatriculationsList.filter(plate => 
      !selectedPlates.includes(plate) &&
      plate.toLowerCase().includes(plateSearchText.toLowerCase())
    );
  }, [immatriculationsList, selectedPlates, plateSearchText]);

  const filteredData = useMemo(() => {
    let result = data;
    if (selectedCategory) {
      result = result.filter(row => 
        row.category && 
        typeof row.category === 'string' && 
        row.category.trim() === selectedCategory.trim()
      );
    }
    if (selectedPlates.length > 0) {
      result = result.filter(row => 
        row.Immatriculation && 
        typeof row.Immatriculation === 'string' && 
        selectedPlates.includes(row.Immatriculation.trim())
      );
    }
    if (activityFilter) {
      if (activityFilter === 'active') {
        result = result.filter(isRowActive);
      } else if (activityFilter === 'inactive') {
        result = result.filter(row => !isRowActive(row));
      }
    }
    if (filterText) {
      const lower = filterText.toLowerCase();
      result = result.filter(row =>
        (row.Vehicules && row.Vehicules.toLowerCase().includes(lower)) ||
        (row.Immatriculation && row.Immatriculation.toLowerCase().includes(lower)) ||
        (row.Marque && row.Marque.toLowerCase().includes(lower)) ||
        (row.category && typeof row.category === 'string' && row.category.toLowerCase().includes(lower)) ||
        (row.Date && row.Date.toLowerCase().includes(lower))
      );
    }
    return result;
  }, [data, selectedCategory, selectedPlates, filterText, activityFilter]);

  const handleExport = () => {
    if (filteredData.length === 0) return;
    exportToExcel(filteredData);
  };

  return (
    <div className="livraison-container">
      <div className="livraison-section-card" style={{ width: '100%', maxWidth: '100%' }}>
        <style>{`
          @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.5; }
          }
          .premium-filter-card {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 20px;
            margin-top: 20px;
            margin-bottom: 24px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          }
          .premium-filter-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            align-items: flex-end;
          }
          @media (min-width: 1200px) {
            .premium-filter-grid {
              grid-template-columns: 1.1fr 1.3fr 1.1fr 1.3fr 1.1fr 0.8fr;
            }
          }
          .premium-filter-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .premium-filter-label {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .premium-filter-input {
            padding: 10px 14px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            font-size: 14px;
            color: #0f172a;
            background-color: #ffffff;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            outline: none;
            height: 42px;
            box-sizing: border-box;
            width: 100%;
          }
          .premium-filter-input:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
          }
          .premium-search-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            width: 100%;
          }
          .premium-search-clear {
            position: absolute;
            right: 12px;
            border: none;
            background: none;
            color: #94a3b8;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            border-radius: 50%;
            transition: all 0.2s;
          }
          .premium-search-clear:hover {
            background-color: #f1f5f9;
            color: #334155;
          }
          .premium-m2m-container {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 6px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background-color: #ffffff;
            min-height: 42px;
            cursor: text;
            align-items: center;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-sizing: border-box;
            width: 100%;
          }
          .premium-m2m-container:focus-within {
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
          }
          .premium-m2m-tag {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background-color: #eff6ff;
            color: #1d4ed8;
            border: 1px solid #bfdbfe;
            border-radius: 6px;
            padding: 3px 8px;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.15s;
          }
          .premium-m2m-tag:hover {
            background-color: #dbeafe;
          }
          .premium-m2m-tag-close {
            border: none;
            background: none;
            color: #3b82f6;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            padding: 0;
            font-weight: bold;
            font-size: 12px;
            transition: color 0.15s;
            margin-left: 2px;
          }
          .premium-m2m-tag-close:hover {
            color: #1d4ed8;
          }
          .premium-dropdown-list {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background-color: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            z-index: 999;
            max-height: 200px;
            overflow-y: auto;
            margin-top: 6px;
            padding: 4px;
          }
          .premium-dropdown-item {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 13px;
            border-radius: 6px;
            color: #334155;
            transition: all 0.15s;
          }
          .premium-dropdown-item:hover {
            background-color: #f1f5f9;
            color: #0f172a;
          }
          .premium-export-btn {
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-weight: 600;
            font-size: 14px;
            border-radius: 8px;
            padding: 10px 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: #ffffff;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease-in-out;
            box-shadow: 0 2px 4px rgba(16, 185, 129, 0.1);
            width: 100%;
            box-sizing: border-box;
          }
          .premium-export-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
          }
          .premium-export-btn:active:not(:disabled) {
            transform: translateY(0);
          }
          .premium-export-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: #cbd5e1;
            color: #94a3b8;
            box-shadow: none;
          }
        `}</style>
        <h3 className="livraison-section-title" style={{ display: 'flex', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
          <Calendar size={20} style={{ marginRight: '8px', color: '#3b82f6' }} />
          Rapport Véhicules
        </h3>

        <div className="premium-filter-card">
          <div className="premium-filter-grid">
            
            <div className="premium-filter-group">
              <label className="premium-filter-label">
                <Search size={13} style={{ color: '#64748b' }} />
                Recherche
              </label>
              <div className="premium-search-wrapper">
                <input
                  type="text"
                  className="premium-filter-input premium-search-input"
                  placeholder="Rechercher véhicule..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
                {filterText && (
                  <button className="premium-search-clear" onClick={() => { setFilterText(''); setResetPaginationToggle(!resetPaginationToggle); }} title="Effacer">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="premium-filter-group" style={{ position: 'relative', minWidth: '320px', flex: '1.5 1 320px' }}>
              <label className="premium-filter-label">
                <Calendar size={13} style={{ color: '#64748b' }} />
                Période
              </label>
              <div 
                className="premium-m2m-container"
                style={{ cursor: 'pointer', justifyContent: 'space-between', height: '42px' }}
                onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              >
                <span style={{ fontSize: '13px', color: (startDate || endDate) ? '#0f172a' : '#94a3b8', fontWeight: (startDate || endDate) ? '600' : 'normal' }}>
                  {startDate && endDate 
                    ? `${formatDate(startDate)} ➔ ${formatDate(endDate)}`
                    : startDate 
                      ? `Depuis le ${formatDate(startDate)}`
                      : endDate 
                        ? `Jusqu'au ${formatDate(endDate)}`
                        : "Toutes les dates"}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', transform: dateDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  ▼
                </span>
              </div>

              {dateDropdownOpen && (
                <>
                  <div 
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} 
                    onClick={() => setDateDropdownOpen(false)} 
                  />
                  <div 
                    className="premium-dropdown-list" 
                    style={{ 
                      padding: '16px', 
                      minWidth: '320px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '12px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>DEBUT</label>
                        <input 
                          type="date" 
                          value={tempStartDate} 
                          onChange={(e) => setTempStartDate(e.target.value)}
                          style={{
                            padding: '8px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none',
                            width: '100%',
                            boxSizing: 'border-box'
                          }} 
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>FIN</label>
                        <input 
                          type="date" 
                          value={tempEndDate} 
                          onChange={(e) => setTempEndDate(e.target.value)}
                          style={{
                            padding: '8px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none',
                            width: '100%',
                            boxSizing: 'border-box'
                          }} 
                        />
                      </div>
                    </div>

                    {/* Quick selections */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Filtres rapides</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date().toISOString().split('T')[0];
                            setStartDate(today);
                            setEndDate(today);
                            setDateDropdownOpen(false);
                            setResetPaginationToggle(!resetPaginationToggle);
                          }}
                          style={{
                            fontSize: '11px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#f8fafc',
                            color: '#475569',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#f8fafc'}
                        >
                          Aujourd'hui
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const yesterday = new Date();
                            yesterday.setDate(yesterday.getDate() - 1);
                            const ystrStr = yesterday.toISOString().split('T')[0];
                            setStartDate(ystrStr);
                            setEndDate(ystrStr);
                            setDateDropdownOpen(false);
                            setResetPaginationToggle(!resetPaginationToggle);
                          }}
                          style={{
                            fontSize: '11px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#f8fafc',
                            color: '#475569',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#f8fafc'}
                        >
                          Hier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date();
                            const day = today.getDay();
                            const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1);
                            const monday = new Date(today.setDate(diffToMonday));
                            const sunday = new Date(today.setDate(diffToMonday + 6));
                            setStartDate(monday.toISOString().split('T')[0]);
                            setEndDate(sunday.toISOString().split('T')[0]);
                            setDateDropdownOpen(false);
                            setResetPaginationToggle(!resetPaginationToggle);
                          }}
                          style={{
                            fontSize: '11px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#eff6ff',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#dbeafe'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#eff6ff'}
                        >
                          Hebdomadaire
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date();
                            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                            setStartDate(firstDay.toISOString().split('T')[0]);
                            setEndDate(lastDay.toISOString().split('T')[0]);
                            setDateDropdownOpen(false);
                            setResetPaginationToggle(!resetPaginationToggle);
                          }}
                          style={{
                            fontSize: '11px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#eff6ff',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#dbeafe'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#eff6ff'}
                        >
                          Mensuelle
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date();
                            const firstDay = new Date(today.getFullYear(), 0, 1);
                            const lastDay = new Date(today.getFullYear(), 11, 31);
                            setStartDate(firstDay.toISOString().split('T')[0]);
                            setEndDate(lastDay.toISOString().split('T')[0]);
                            setDateDropdownOpen(false);
                            setResetPaginationToggle(!resetPaginationToggle);
                          }}
                          style={{
                            fontSize: '11px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#eff6ff',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#dbeafe'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#eff6ff'}
                        >
                          Annuelle
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      <button 
                        type="button"
                        onClick={() => {
                          setTempStartDate('');
                          setTempEndDate('');
                          setStartDate('');
                          setEndDate('');
                          setDateDropdownOpen(false);
                          setResetPaginationToggle(!resetPaginationToggle);
                        }}
                        style={{
                          padding: '8px 12px',
                          fontSize: '12px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: 'transparent',
                          color: '#64748b',
                          cursor: 'pointer',
                          flex: 1,
                          fontWeight: '600'
                        }}
                      >
                        Effacer
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setStartDate(tempStartDate);
                          setEndDate(tempEndDate);
                          setDateDropdownOpen(false);
                          setResetPaginationToggle(!resetPaginationToggle);
                        }}
                        style={{
                          padding: '8px 12px',
                          fontSize: '12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#1a73e8',
                          color: '#ffffff',
                          cursor: 'pointer',
                          fontWeight: '600',
                          flex: 1
                        }}
                      >
                        Appliquer
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="premium-filter-group" style={{ position: 'relative' }}>
              <label className="premium-filter-label">
                <Filter size={13} style={{ color: '#64748b' }} />
                Catégorie
              </label>
              <div 
                className="premium-m2m-container"
                style={{ cursor: 'pointer', justifyContent: 'space-between', height: '42px' }}
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
              >
                <span style={{ fontSize: '14px', color: selectedCategory ? '#0f172a' : '#94a3b8', fontWeight: selectedCategory ? '600' : 'normal' }}>
                  {selectedCategory ? `${selectedCategory} (${categoriesList.find(c => c.name === selectedCategory)?.count || 0})` : "Toutes les catégories"}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', transform: categoryDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  ▼
                </span>
              </div>

              {categoryDropdownOpen && (
                <>
                  <div 
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} 
                    onClick={() => setCategoryDropdownOpen(false)} 
                  />
                  <div className="premium-dropdown-list">
                    <div 
                      onClick={() => {
                        setSelectedCategory('');
                        setSelectedPlates([]);
                        setCategoryDropdownOpen(false);
                        setResetPaginationToggle(!resetPaginationToggle);
                      }}
                      className="premium-dropdown-item"
                      style={{ fontWeight: !selectedCategory ? 'bold' : 'normal', backgroundColor: !selectedCategory ? '#f1f5f9' : 'transparent', color: !selectedCategory ? '#1d4ed8' : '#334155' }}
                    >
                      Toutes les catégories ({data.length})
                    </div>
                    {categoriesList.map(cat => (
                      <div 
                        key={cat.name} 
                        onClick={() => {
                          setSelectedCategory(cat.name);
                          setSelectedPlates([]);
                          setCategoryDropdownOpen(false);
                          setResetPaginationToggle(!resetPaginationToggle);
                        }}
                        className="premium-dropdown-item"
                        style={{ fontWeight: selectedCategory === cat.name ? 'bold' : 'normal', backgroundColor: selectedCategory === cat.name ? '#eff6ff' : 'transparent', color: selectedCategory === cat.name ? '#1d4ed8' : '#334155' }}
                      >
                        {cat.name} ({cat.count})
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="premium-filter-group" style={{ position: 'relative' }}>
              <label className="premium-filter-label">
                <Filter size={13} style={{ color: '#64748b' }} />
                Immatriculations
              </label>
              <div 
                className="premium-m2m-container"
                onClick={() => setDropdownOpen(true)}
              >
                {selectedPlates.map(plate => (
                  <span key={plate} className="premium-m2m-tag">
                    {plate}
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlates(selectedPlates.filter(p => p !== plate));
                        setResetPaginationToggle(!resetPaginationToggle);
                      }}
                      className="premium-m2m-tag-close"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input 
                  type="text"
                  placeholder={selectedPlates.length === 0 ? "Sélectionner..." : ""}
                  value={plateSearchText}
                  onChange={(e) => {
                    setPlateSearchText(e.target.value);
                    setDropdownOpen(true);
                  }}
                  style={{
                    border: 'none',
                    outline: 'none',
                    flex: '1 1 80px',
                    fontSize: '14px',
                    padding: '2px 0',
                    backgroundColor: 'transparent'
                  }}
                />
                {selectedPlates.length > 0 && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPlates([]);
                      setResetPaginationToggle(!resetPaginationToggle);
                    }}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '12px',
                      marginLeft: 'auto',
                      padding: '0 4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {dropdownOpen && (
                <>
                  <div 
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} 
                    onClick={() => setDropdownOpen(false)} 
                  />
                  <div className="premium-dropdown-list">
                    {availablePlates.length === 0 ? (
                      <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>Aucun résultat</div>
                    ) : (
                      availablePlates.map(plate => (
                        <div 
                          key={plate} 
                          onClick={() => {
                            setSelectedPlates([...selectedPlates, plate]);
                            setPlateSearchText('');
                            setResetPaginationToggle(!resetPaginationToggle);
                          }}
                          className="premium-dropdown-item"
                        >
                          {plate}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="premium-filter-group" style={{ position: 'relative' }}>
              <label className="premium-filter-label">
                <Palette size={13} style={{ color: '#64748b' }} />
                Statut (Couleur)
              </label>
              <div 
                className="premium-m2m-container"
                style={{ cursor: 'pointer', justifyContent: 'space-between', height: '42px' }}
                onClick={() => setActivityDropdownOpen(!activityDropdownOpen)}
              >
                <span style={{ fontSize: '13px', color: activityFilter ? '#0f172a' : '#94a3b8', fontWeight: activityFilter ? '600' : 'normal', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {activityFilter === 'active' ? (
                    <>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                      Actifs (Vert)
                    </>
                  ) : activityFilter === 'inactive' ? (
                    <>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#eab308' }} />
                      Immobiles (Jaune)
                    </>
                  ) : (
                    "Tous les statuts"
                  )}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', transform: activityDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  ▼
                </span>
              </div>

              {activityDropdownOpen && (
                <>
                  <div 
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} 
                    onClick={() => setActivityDropdownOpen(false)} 
                  />
                  <div className="premium-dropdown-list">
                    <div 
                      onClick={() => {
                        setActivityFilter('');
                        setActivityDropdownOpen(false);
                        setResetPaginationToggle(!resetPaginationToggle);
                      }}
                      className="premium-dropdown-item"
                      style={{ fontWeight: !activityFilter ? 'bold' : 'normal', backgroundColor: !activityFilter ? '#f1f5f9' : 'transparent', color: !activityFilter ? '#1d4ed8' : '#334155' }}
                    >
                      Tous les statuts
                    </div>
                    <div 
                      onClick={() => {
                        setActivityFilter('active');
                        setActivityDropdownOpen(false);
                        setResetPaginationToggle(!resetPaginationToggle);
                      }}
                      className="premium-dropdown-item"
                      style={{ fontWeight: activityFilter === 'active' ? 'bold' : 'normal', backgroundColor: activityFilter === 'active' ? '#eff6ff' : 'transparent', color: activityFilter === 'active' ? '#1d4ed8' : '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                      Actifs (Vert)
                    </div>
                    <div 
                      onClick={() => {
                        setActivityFilter('inactive');
                        setActivityDropdownOpen(false);
                        setResetPaginationToggle(!resetPaginationToggle);
                      }}
                      className="premium-dropdown-item"
                      style={{ fontWeight: activityFilter === 'inactive' ? 'bold' : 'normal', backgroundColor: activityFilter === 'inactive' ? '#eff6ff' : 'transparent', color: activityFilter === 'inactive' ? '#1d4ed8' : '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#eab308' }} />
                      Immobiles (Jaune)
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="premium-filter-group">
              <button 
                className="premium-export-btn" 
                onClick={handleExport}
                disabled={loading || filteredData.length === 0}
              >
                <FileSpreadsheet size={18} /> Export Excel
              </button>
            </div>

          </div>
        </div>

        {!loading && (
          <div style={{ fontSize: '13px', color: '#666', marginBottom: '10px', padding: '8px 12px',
            backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
            {filteredData.length === data.length
              ? `📊 Total: ${data.length} enregistrement(s)`
              : `📊 ${filteredData.length} sur ${data.length} (filtré(s))`}
          </div>
        )}

        <div className="livraison-datatable-wrapper">
          <DataTable
            key={selectedCategory + "_" + selectedPlates.join(",") + "_" + filterText + "_" + activityFilter}
            columns={columns}
            data={filteredData}
            progressPending={loading}
            progressComponent={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}
            pagination
            paginationComponentOptions={PAGINATION_OPTIONS}
            paginationResetDefaultPage={resetPaginationToggle}
            paginationPerPage={25}
            paginationRowsPerPageOptions={[10, 25, 50, 100]}
            customStyles={TABLE_CUSTOM_STYLES}
            conditionalRowStyles={conditionalRowStyles}
            responsive
            highlightOnHover
            striped
            noDataComponent={<div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Aucune donnée</div>}
            persistTableHead
          />
        </div>
      </div>
    </div>
  );
}
