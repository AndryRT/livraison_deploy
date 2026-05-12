import React, { useState, useEffect, useMemo } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Box,
  Button,
} from '@mui/material';
import DataTable from 'react-data-table-component';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import HistoryIcon from '@mui/icons-material/History';
import frLocale from 'date-fns/locale/fr';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import DownloadIcon from '@mui/icons-material/FileDownload';
import { format, isWithinInterval } from 'date-fns';

const API_BASE_URL = 'http://10.68.38.17/api';

const columns = [
  { name: 'Date', selector: row => row.planification_date || '—', width: '110px', sortable: true },
  { name: 'N° Devis', selector: row => row.numero_devis || '—', width: '120px' },
  { name: 'Réf Produit', selector: row => row.ref_produit || '—', width: '120px' },
  { name: 'Nom Produit', selector: row => row.Name || '—', minWidth: '180px' },
  { name: 'Client', selector: row => row.client_name || '—', minWidth: '140px' },
  { name: 'Adresse', selector: row => row.Adresse_client || '—', minWidth: '200px' },
  { name: 'Téléphone', selector: row => row.number || '—', width: '130px' },
  { name: 'Email', selector: row => row.client_email || '—', minWidth: '180px' },
  { name: 'Quantité', selector: row => row.quantity ?? '—', width: '90px', sortable: true, right: true },
];

const exportToExcel = (data, filename = 'historique_livraison.xlsx') => {
  if (!data?.length) return;
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
  }));

  const ws = XLSX.utils.json_to_sheet(worksheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Historique');
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, filename);
};

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function ProductHistoryTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('authToken');
        const res = await axios.get(`${API_BASE_URL}/history/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log(res.data)
        setData(res.data || []);
      } catch (err) {
        console.error('Erreur:', err);
        alert('Échec du chargement des données');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    if (!data.length) return data;
    return data.filter(row => {
      const rowDate = parseLocalDate(row.planification_date);
      if (!rowDate) return true;
      if (!startDate && !endDate) return true;
      if (startDate && !endDate) return rowDate >= parseLocalDate(format(startDate, 'yyyy-MM-dd'));
      if (!startDate && endDate) return rowDate <= parseLocalDate(format(endDate, 'yyyy-MM-dd'));
      const start = parseLocalDate(format(startDate, 'yyyy-MM-dd'));
      const end = parseLocalDate(format(endDate, 'yyyy-MM-dd'));
      return isWithinInterval(rowDate, { start, end });
    });
  }, [data, startDate, endDate]);

  return (
    <Box sx={{ width: '100%', p: 0 }}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 2,
          border: '1px solid #e0e0e0',
          backgroundColor: '#fafafa',
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography
            
            variant="h6"
            fontWeight="700"
            sx={{
              letterSpacing: '0.5px',
              
            }}
          >
            <HistoryIcon sx={{ verticalAlign: 'middle', mr: 1, fontSize: '1.2rem' }} />
            Historique de Livraison
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={frLocale}>
              <DatePicker
                label="Date de début"
                value={startDate}
                onChange={(date) => setStartDate(date)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    sx={{
                      width: { xs: '150px', sm: '180px' },
                      '& .MuiInputBase-root': {
                        height: '20px',
                        fontSize: '0.85rem',
                        padding: '0 8px',
                        },
                      '& .MuiInputLabel-root': { 
                        fontSize: '0.85rem',
                        lineHeight: 1,
                        },
                    }}
                    InputLabelProps={{ shrink: true }}
                  />
                )}
              />
            </LocalizationProvider>

            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={frLocale}>
              <DatePicker
                label="Date de fin"
                value={endDate}
                onChange={(date) => setEndDate(date)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    sx={{
                      width: { xs: '150px', sm: '180px' },
                      '& .MuiInputBase-root': { height: '32px', fontSize: '0.85rem' },
                      '& .MuiInputLabel-root': { fontSize: '0.85rem' },
                    }}
                    InputLabelProps={{ shrink: true }}
                  />
                )}
              />
            </LocalizationProvider>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={() => exportToExcel(filteredData)}
            disabled={loading || filteredData.length === 0}
            sx={{
              bgcolor: '#2e7d32',
              '&:hover': { bgcolor: '#1b5e20' },
              textTransform: 'none',
              fontWeight: '500',
              px: 1.2,
              py: 0.3,
              minHeight: '28px',
              fontSize: '1rem',
              whiteSpace: 'nowrap',
            }}
          >
            Export Excel
          </Button>
        </Box>

        {/* Tableau */}
        <DataTable
          columns={columns}
          data={filteredData}
          progressPending={loading}
          pagination
          paginationPerPage={25}
          paginationRowsPerPageOptions={[10, 25, 50, 100]}
          highlightOnHover
          dense
          noDataComponent={
            <Typography color="text.secondary" py={4}>
              Aucune livraison trouvée
            </Typography>
          }
          customStyles={{
            headCells: {
              style: {
                fontWeight: '700',
                backgroundColor: '#374151',
                color: '#ffffff',
                fontSize: '0.85rem',
                paddingLeft: '12px',
                paddingRight: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              },
            },
            cells: {
              style: {
                fontSize: '0.82rem',
                paddingLeft: '12px',
                paddingRight: '12px',
                color: '#333',
              },
            },
          }}
        />
      </Paper>
    </Box>
  );
}