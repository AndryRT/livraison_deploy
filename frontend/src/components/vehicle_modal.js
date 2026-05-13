import React, { useState, useEffect, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Chip,
  Paper,
} from '@mui/material';
import axios from 'axios';
import API_BASE_URL from '../config';

const formatFullDate = (date) => {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export default function VehicleSelectionDialog({ open, onClose, onConfirm }) {
  const [rows, setRows] = useState([]);
  const [selectionModel, setSelectionModel] = useState([]);
  const [loading, setLoading] = useState(false);
  const today = useMemo(() => formatFullDate(new Date()), []);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setSelectionModel([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const fetchVehicles = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        alert('Token manquant. Veuillez vous reconnecter.');
        onClose();
        return;
      }

      setLoading(true);
      try {
        const response = await axios.get(`${API_BASE_URL}/vehicules/active/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const list = response.data.vehicles || [];

        // ✅ Le backend envoie déjà un `id` string unique → on l'utilise directement
        const formatted = list
          .filter(v => v && v.id) // seulement les véhicules avec un id
          .map(v => ({
            id: v.id, // ← string unique depuis MongoDB
            immatriculation: v.immatriculation || 'N/A',
            vehicule: v.vehicule || 'Non spécifié',
            type_vehicule: v.type_vehicule || 'Inconnu',
            raw: v,
          }));

        setRows(formatted);
        setSelectionModel([]);
      } catch (err) {
        console.error('Erreur chargement véhicules:', err);
        alert('Erreur lors du chargement des véhicules.');
        onClose();
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, [open, onClose]);

  const handleConfirm = async () => {
    const vehiculesDisponibles = rows
      .filter((row) => !selectionModel.includes(row.id))
      .map((row) => row.raw);

    const token = localStorage.getItem('authToken');
    const date = new Date().toISOString().split('T')[0];

    try {
      await axios.post(
        `${API_BASE_URL}/livraisons/disponible/`,
        {
          date,
          vehicules_disponibles: vehiculesDisponibles,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const availableIds = vehiculesDisponibles.map(v => v.id); // ← déjà string
      onConfirm(availableIds);
      onClose();
    } catch (error) {
      console.error('Erreur envoi disponibilité:', error);
      alert('Échec de la confirmation. Veuillez réessayer.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        },
      }}
    >
      <DialogTitle
        sx={{
          bgcolor: '#374151',
          color: 'white',
          py: 2.5,
          textAlign: 'center',
          fontSize: '1.35rem',
        }}
      >
        Sélectionnez les véhicules indisponibles le {today}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        {loading ? (
          <Box textAlign="center" py={8}>
            <CircularProgress size={56} />
            <Typography mt={2}>Chargement...</Typography>
          </Box>
        ) : rows.length === 0 ? (
          <Typography textAlign="center" color="text.secondary" py={6}>
            Aucun véhicule trouvé
          </Typography>
        ) : (
          <Paper elevation={6} sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <DataTable
              columns={[
                {
                  name: 'Immatriculation',
                  selector: row => row.immatriculation,
                  sortable: true,
                  grow: 1,
                },
                {
                  name: 'Véhicule',
                  selector: row => row.vehicule,
                  sortable: true,
                  grow: 1.5,
                },
                {
                  name: 'Type',
                  cell: row => {
                    const type = (row.type_vehicule || '').toString().toLowerCase();
                    const isElectric = type.includes('électrique') || type.includes('electric');
                    return (
                      <Chip
                        label={row.type_vehicule || 'Inconnu'}
                        size="small"
                        color={isElectric ? 'success' : 'warning'}
                        variant="outlined"
                      />
                    );
                  },
                  width: '140px',
                },
              ]}
              data={rows}
              selectableRows
              onSelectedRowsChange={({ selectedRows }) => {
                const selectedIds = selectedRows.map(row => row.id);
                setSelectionModel(selectedIds);
              }}
              clearSelectedRows={rows.length === 0}
              pagination
              highlightOnHover
              pointerOnHover
            />
          </Paper>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, bgcolor: '#f8f9fa' }}>
        <Button onClick={onClose} color="error" variant="outlined">
          Annuler
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          sx={{ bgcolor: '#374151', color: 'white' }}
        >
          Confirmer
        </Button>
      </DialogActions>
    </Dialog>
  );
}