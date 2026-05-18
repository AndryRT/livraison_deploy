import React, { useState, useEffect, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import { Calendar, Download, X, FileSpreadsheet, Search, Filter } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format, isWithinInterval } from 'date-fns';
import '../styles/Livraison.css';
import API_BASE_URL from '../config';

const PAGINATION_OPTIONS = {
  rowsPerPageText: 'Lignes par page:',
  rangeSeparatorText: 'de',
  selectAllRowsItem: true,
  selectAllRowsItemText: 'Tous',
};

const TABLE_CUSTOM_STYLES = {
  headRow: { 
    style: { 
      backgroundColor: '#f8f9fa', 
      color: 'black', 
      fontSize: '13px', 
      fontWeight: '600', 
      borderBottom: '2px solid #28a745' 
    } 
  },
  headCells: { 
    style: { 
      paddingLeft: '15px', 
      paddingRight: '15px' 
    } 
  },
  cells: { 
    style: { 
      paddingLeft: '15px', 
      paddingRight: '15px', 
      fontSize: '14px' 
    } 
  },
  rows: { 
    style: { 
      borderBottom: '1px solid #e0e0e0', 
      '&:hover': { 
        backgroundColor: '#f8f9fa' 
      } 
    } 
  }
};

const columns = [
  { 
    name: 'Date', 
    selector: row => row.planification_date || '—', 
    width: '110px', 
    sortable: true 
  },
  { 
    name: 'N° Devis', 
    selector: row => row.numero_devis || '—', 
    width: '120px',
    sortable: true
  },
  { 
    name: 'Réf Produit', 
    selector: row => row.ref_produit || '—', 
    width: '120px',
    sortable: true
  },
  { 
    name: 'Nom Produit', 
    selector: row => row.Name || '—', 
    minWidth: '180px',
    wrap: true,
    sortable: true
  },
  { 
    name: 'Client', 
    selector: row => row.client_name || '—', 
    minWidth: '140px',
    wrap: true,
    sortable: true
  },
  { 
    name: 'Adresse', 
    selector: row => row.Adresse_client || '—', 
    minWidth: '200px',
    wrap: true
  },
  { 
    name: 'Téléphone', 
    selector: row => row.number || '—', 
    width: '130px' 
  },
  { 
    name: 'Email', 
    selector: row => row.client_email || '—', 
    minWidth: '180px',
    wrap: true
  },
  { 
    name: 'Quantité', 
    selector: row => row.quantity ?? '—', 
    width: '90px', 
    sortable: true, 
    right: true 
  },
  { 
    name: 'Heure de livraison', 
    // CORRECTION : affiche uniquement l'heure au format HH:mm:ss
    selector: row => row.date_livraison 
      ? format(new Date(row.date_livraison), 'HH:mm:ss') 
      : '—',
    width: '140px', 
    sortable: true 
  },
];

const exportToExcel = (data, filename = 'historique_livraison.xlsx') => {
  if (!data?.length) {
    alert('Aucune donnée à exporter');
    return;
  }
  
  const worksheetData = data.map(row => ({
    Date: row.planification_date || '',
    'N° Devis': row.numero_devis || '',
    'Réf Produit': row.ref_produit || '',
    'Nom Produit': row.Name || '',
    Client: row.client_name || '',
    Adresse: row.Adresse_client || '',
    Téléphone: row.number || '',
    Email: row.client_email || '',
    Quantité: row.quantity ?? '',
    // CORRECTION : heure au format HH:mm:ss dans l'export Excel
    'Heure de livraison': row.date_livraison 
      ? format(new Date(row.date_livraison), 'HH:mm:ss') 
      : '',
  }));

  const ws = XLSX.utils.json_to_sheet(worksheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Historique');
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  saveAs(blob, filename);
};

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const showAlert = (message, type = 'info') => {
  const alertDiv = document.createElement('div');
  alertDiv.className = `livraison-custom-alert livraison-alert-${type}`;
  alertDiv.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;max-width:350px';
  alertDiv.innerHTML = `<div class="livraison-alert-content"><div class="livraison-alert-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</div><div class="livraison-alert-message">${message}</div></div>`;
  document.body.appendChild(alertDiv);
  setTimeout(() => alertDiv.classList.add('livraison-alert-show'), 10);
  setTimeout(() => { 
    alertDiv.classList.remove('livraison-alert-show'); 
    setTimeout(() => document.body.removeChild(alertDiv), 300); 
  }, 3000);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

export default function Historique({ token, addNotification }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [resetPaginationToggle, setResetPaginationToggle] = useState(false);

  useEffect(() => {
    setTempStartDate(startDate);
    setTempEndDate(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const authToken = token || localStorage.getItem('authToken');
        
        if (!authToken) {
          showAlert("Token d'authentification introuvable", 'error');
          return;
        }

        const res = await axios.get(`${API_BASE_URL}/history/`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        
        setData(res.data || []);
        showAlert(`${res.data?.length || 0} livraisons chargées`, 'success');
      } catch (err) {
        console.error('Erreur:', err);
        showAlert('Échec du chargement des données', 'error');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [token]);

  const filteredData = useMemo(() => {
    if (!data.length) return data;
    
    let result = data;

    // Filtrage par texte
    if (filterText) {
      const lower = filterText.toLowerCase();
      result = result.filter(row => 
        (row.numero_devis && row.numero_devis.toLowerCase().includes(lower)) ||
        (row.ref_produit && row.ref_produit.toLowerCase().includes(lower)) ||
        (row.Name && row.Name.toLowerCase().includes(lower)) ||
        (row.client_name && row.client_name.toLowerCase().includes(lower)) ||
        (row.Adresse_client && row.Adresse_client.toLowerCase().includes(lower)) ||
        (row.number && row.number.toLowerCase().includes(lower)) ||
        (row.client_email && row.client_email.toLowerCase().includes(lower)) ||
        (row.date_livraison && row.date_livraison.toLowerCase().includes(lower))
      );
    }

    // Filtrage par dates
    if (startDate || endDate) {
      result = result.filter(row => {
        const rowDate = parseLocalDate(row.planification_date);
        if (!rowDate) return true;
        
        if (startDate && !endDate) {
          return rowDate >= parseLocalDate(startDate);
        }
        if (!startDate && endDate) {
          return rowDate <= parseLocalDate(endDate);
        }
        
        const start = parseLocalDate(startDate);
        const end = parseLocalDate(endDate);
        return isWithinInterval(rowDate, { start, end });
      });
    }

    return result;
  }, [data, startDate, endDate, filterText]);

  const handleExport = () => {
    if (filteredData.length === 0) {
      showAlert('Aucune donnée à exporter', 'error');
      return;
    }
    exportToExcel(filteredData);
    showAlert(`${filteredData.length} ligne(s) exportée(s)`, 'success');
  };

  return (
    <div className="livraison-container">
      <div className="livraison-section-card" style={{ width: '100%', maxWidth: '100%' }}>
        <h3 className="livraison-section-title" style={{ display: 'flex', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
          <Calendar size={20} style={{ marginRight: '8px', color: '#3b82f6' }} />
          Historique de Livraison
        </h3>

        {/* Filtres et bouton export */}
        <div className="premium-filter-card">
          <div className="premium-filter-grid" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr', alignItems: 'flex-end', gap: '16px' }}>
            
            {/* Recherche textuelle */}
            <div className="premium-filter-group">
              <label className="premium-filter-label">
                <Search size={13} style={{ color: '#64748b' }} />
                Recherche
              </label>
              <div className="premium-search-wrapper">
                <input
                  type="text"
                  className="premium-filter-input premium-search-input"
                  placeholder="Rechercher par client, article, devis..."
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

            {/* Période */}
            <div className="premium-filter-group" style={{ position: 'relative' }}>
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
                        >
                          Annuelle
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: '4px' }}>
                      <button 
                        type="button"
                        onClick={() => {
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

            {/* Bouton Export */}
            <div className="premium-filter-group">
              <button
                className="premium-export-btn"
                onClick={handleExport}
                disabled={loading || filteredData.length === 0}
              >
                <FileSpreadsheet size={18} />
                Export Excel
              </button>
            </div>

          </div>
        </div>

        {/* Indicateur de résultats */}
        {!loading && (
          <div style={{ 
            fontSize: '13px', 
            color: '#666', 
            marginBottom: '10px',
            padding: '8px 12px',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            {filteredData.length === data.length 
              ? `📊 Total: ${data.length} livraison(s)`
              : `📊 ${filteredData.length} sur ${data.length} livraison(s) (filtrée(s))`
            }
          </div>
        )}

        {/* Tableau */}
        <div className="livraison-datatable-wrapper">
          <DataTable
            columns={columns}
            data={filteredData}
            progressPending={loading}
            progressComponent={
              <div style={{ padding: '40px', textAlign: 'center' }}>
                Chargement des données...
              </div>
            }
            pagination
            paginationComponentOptions={PAGINATION_OPTIONS}
            paginationResetDefaultPage={resetPaginationToggle}
            paginationPerPage={25}
            paginationRowsPerPageOptions={[10, 25, 50, 100]}
            customStyles={TABLE_CUSTOM_STYLES}
            responsive
            highlightOnHover
            striped
            noDataComponent={
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                Aucune livraison trouvée
              </div>
            }
            persistTableHead
          />
        </div>
      </div>
    </div>
  );
}