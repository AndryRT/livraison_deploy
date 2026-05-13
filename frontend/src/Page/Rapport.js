import React, { useState, useEffect, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import { Calendar, Download, X } from 'lucide-react';
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
    style: { paddingLeft: '15px', paddingRight: '15px' }
  },
  cells: {
    style: { paddingLeft: '15px', paddingRight: '15px', fontSize: '14px' }
  },
  rows: {
    style: {
      borderBottom: '1px solid #e0e0e0',
      '&:hover': { backgroundColor: '#f8f9fa' }
    }
  }
};

const columns = [
  { name: 'Date', selector: row => row.Date || '—', width: '110px', sortable: true },
  { name: 'Véhicule', selector: row => row.Vehicules || '—', minWidth: '150px', wrap: true, sortable: true },
  { name: 'Immatriculation', selector: row => row.Immatriculation || '—', width: '140px', sortable: true },
  { name: 'Marque', selector: row => row.Marque || '—', width: '110px', sortable: true },
  { name: 'Catégorie', selector: row => row.category || '—', width: '120px', sortable: true },
  { name: 'Label', selector: row => row.label || '—', minWidth: '120px', wrap: true },
  { name: 'Odometre (km)', selector: row => row.odometer ?? '—', width: '130px', sortable: true, right: true },
  { name: 'Distance (km)', selector: row => row.distance ?? '—', width: '120px', sortable: true, right: true },
  { name: 'Service (s)', selector: row => row.Service ?? '—', width: '110px', sortable: true, right: true },
  { name: 'Arrêt (s)', selector: row => row.Stop_service ?? '—', width: '110px', sortable: true, right: true },
  { name: 'Carburant (L)', selector: row => row.fuel ?? '—', width: '120px', sortable: true, right: true },
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
    'Odometre (km)': row.odometer ?? '',
    'Distance (km)': row.distance ?? '',
    'Service (s)': row.Service ?? '',
    'Arrêt (s)': row.Stop_service ?? '',
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
  const [resetPaginationToggle, setResetPaginationToggle] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
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
        setLoading(false);
      }
    };
    fetchData();
  }, [token, startDate, endDate]);

  const filteredData = useMemo(() => {
    if (!data.length || !filterText) return data;
    const lower = filterText.toLowerCase();
    return data.filter(row =>
      (row.Vehicules && row.Vehicules.toLowerCase().includes(lower)) ||
      (row.Immatriculation && row.Immatriculation.toLowerCase().includes(lower)) ||
      (row.Marque && row.Marque.toLowerCase().includes(lower)) ||
      (row.category && row.category.toLowerCase().includes(lower)) ||
      (row.Date && row.Date.toLowerCase().includes(lower))
    );
  }, [data, filterText]);

  const handleExport = () => {
    if (filteredData.length === 0) return;
    exportToExcel(filteredData);
  };

  return (
    <div className="livraison-container">
      <div className="livraison-section-card" style={{ width: '100%', maxWidth: '100%' }}>
        <h3 className="livraison-section-title">
          <Calendar size={20} style={{ marginRight: '8px', color: '#3b82f6' }} />
          Rapport Véhicules
        </h3>

        <div style={{
          display: 'flex', gap: '10px', alignItems: 'center',
          marginTop: '15px', marginBottom: '15px', flexWrap: 'wrap'
        }}>
          <div className="livraison-filter-container" style={{ flex: '1 1 200px' }}>
            <input
              type="text"
              className="livraison-filter-input"
              placeholder="Rechercher par véhicule, immatriculation..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {filterText && (
              <button className="livraison-clear-filter-btn" onClick={() => { setFilterText(''); setResetPaginationToggle(!resetPaginationToggle); }} title="Effacer">
                <X size={16} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Date début</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>Date fin</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
          </div>

          <button className="livraison-btn livraison-btn-success" onClick={handleExport}
            disabled={loading || filteredData.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', marginLeft: 'auto' }}>
            <Download size={18} /> Export Excel
          </button>
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
            responsive
            highlightOnHover
            striped
            noDataComponent={<div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Aucune donnée</div>}
            persistTableHead
            fixedHeader
            fixedHeaderScrollHeight="calc(100vh - 350px)"
          />
        </div>
      </div>
    </div>
  );
}
