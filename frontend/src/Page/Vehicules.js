import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import DataTable from 'react-data-table-component';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { Trash, Pencil, ShieldCheck, X, Plus } from 'lucide-react';
import '../styles/Vehicules.css';

const API_BASE = '/api/livraison/vehicules';

const INITIAL_VEHICLE = {
  Vehicule: '', Type: '', Immatriculation: '', Tonnage: '', 
  Longueur: '', Largeur: '', Hauteur: '', history: [], active: true, 
  Nom: '', Contact: '', Poste: '', Mat: 0
};

const INITIAL_CHAUFFEUR = {
  Nom: '', Contact: '', Poste: '', Vehicule: '', Immatriculation: ''
};

const showAlert = (icon, title, text, confirmColor = '#374151') => 
  Swal.fire({ icon, title, text, confirmButtonColor: confirmColor });

const ExpandedComponent = ({ data, onAddChauffeur }) => (
  <div className="vehicles-expanded-section">
    <DataTable
      columns={[
        { name: 'N° matricule', selector: row => row.Mat, sortable: true },
        { name: 'Chauffeur', selector: row => row.Nom, sortable: true },
        { name: 'Contact', selector: row => row.Contact, sortable: true },
        { name: 'Poste', selector: row => row.Poste, sortable: true },
        {
          name: 'Actions',
          cell: (row) => (
            <div className="vehicles-actions-cell">
              <button className="vehicles-btn-edit-small" onClick={() => alert('Éditer')}>
                Modifier
              </button>
              <button 
                className={`vehicles-btn-toggle ${row.isActive ? 'active' : 'inactive'}`}
                onClick={() => alert(`Basculer l'état: ${row.isActive ? 'Désactiver' : 'Activer'}`)}
              >
                {row.isActive ? 'Supprimer' : 'Inactif'}
              </button>
            </div>
          ),
        },
      ]}
      data={data.history}
      highlightOnHover
      striped
      noDataComponent="Aucun chauffeur assigné"
    />
    <div style={{ padding: '10px', textAlign: 'center', borderTop: '1px solid #e0e0e0' }}>
      <button className="vehicles-btn-add-chauffeur" onClick={() => onAddChauffeur(data)}>
        <Plus size={16} style={{ marginRight: '6px' }} />
        Ajouter un chauffeur
      </button>
    </div>
  </div>
);

ExpandedComponent.propTypes = {
  data: PropTypes.object.isRequired,
  onAddChauffeur: PropTypes.func.isRequired,
};

export default function VehicleTable({ token, addNotification }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addVehicleModalOpen, setAddVehicleModalOpen] = useState(false);
  const [editVehicleModalOpen, setEditVehicleModalOpen] = useState(false);
  const [addChauffeurModalOpen, setAddChauffeurModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [resetPaginationToggle, setResetPaginationToggle] = useState(false);
  const [newVehicle, setNewVehicle] = useState(INITIAL_VEHICLE);
  const [newChauffeur, setNewChauffeur] = useState(INITIAL_CHAUFFEUR);

  const paginationOptions = {
    rowsPerPageText: 'Lignes par page:',
    rangeSeparatorText: 'de',
    selectAllRowsItem: true,
    selectAllRowsItemText: 'Tous',
  };

  const handleOpenAddChauffeurModal = (vehicle) => {
    setSelectedVehicle(vehicle);
    setNewChauffeur({
      Nom: '',
      Contact: '',
      Poste: '',
      Vehicule: vehicle.Vehicule,
      Immatriculation: vehicle.Immatriculation,
    });
    setAddChauffeurModalOpen(true);
  };

  const handleCloseAddChauffeurModal = () => {
    setAddChauffeurModalOpen(false);
    setSelectedVehicle(null);
    setNewChauffeur(INITIAL_CHAUFFEUR);
  };

  const handleOpenEditVehicleModal = (vehicle) => {
    setEditingVehicle(vehicle);
    setEditVehicleModalOpen(true);
  };

  const handleCloseEditVehicleModal = () => {
    setEditingVehicle(null);
    setEditVehicleModalOpen(false);
  };

  const handleOpenAddVehicleModal = () => {
    setNewVehicle(INITIAL_VEHICLE);
    setAddVehicleModalOpen(true);
  };

  const handleCloseAddVehicleModal = () => setAddVehicleModalOpen(false);

  const createDimension = (l, w, h) => {
    const length = l ? parseFloat(l) : 0;
    const width = w ? parseFloat(w) : 0;
    const height = h ? parseFloat(h) : 0;
    return { dimension: `${length} x ${width} x ${height}`, length, width, height };
  };

  const fetchVehicles = useCallback(() => {
    setLoading(true);
    fetch(API_BASE, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : Promise.reject('Erreur réseau'))
      .then(data => {
        const vehicles = {};
        data.forEach(item => {
          const key = item.Immatriculation;
          if (!vehicles[key]) vehicles[key] = { ...item, history: [], active: item.active ?? true };
          if (item.Nom) vehicles[key].history.push({ Nom: item.Nom, Contact: item.Contact, Poste: item.Poste, Mat: item.Mat, isActive: true });
        });
        setRows(Object.values(vehicles));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  const handleAddChauffeur = () => {
    if (!newChauffeur.Nom || !newChauffeur.Contact) {
      return showAlert('error', 'Oops...', 'Les champs "Nom" et "Contact" sont obligatoires.');
    }
    console.log('Ajout chauffeur:', newChauffeur);
    handleCloseAddChauffeurModal();
    showAlert('success', 'Ajouté !', 'Chauffeur ajouté avec succès !', '#10b981');
    addNotification(`Le chauffeur "${newChauffeur.Nom}" a été assigné au véhicule "${newChauffeur.Vehicule}".`);
    fetchVehicles();
  };

  const handleAddVehicle = () => {
    if (!newVehicle.Vehicule || !newVehicle.Immatriculation) {
      return showAlert('error', 'Oops...', 'Les champs "Vehicule" et "Immatriculation" sont obligatoires.');
    }

    const { dimension, length, width, height } = createDimension(newVehicle.Longueur, newVehicle.Largeur, newVehicle.Hauteur);
    const payload = { 
      ...newVehicle, 
      Tonnage: newVehicle.Tonnage ? parseFloat(newVehicle.Tonnage) : 0,
      Dimension: dimension, Longueur: length, Largeur: width, Hauteur: height
    };

    fetch(`${API_BASE}/ajouter/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
      .then(async res => res.ok ? res.json() : Promise.reject(JSON.stringify(await res.json())))
      .then(data => {
        fetchVehicles();
        handleCloseAddVehicleModal();
        showAlert('success', 'Ajouté !', 'Véhicule ajouté avec succès !', '#10b981');
        addNotification(`Le véhicule "${data.Vehicule}" a été ajouté.`);
      })
      .catch(error => {
        console.error("Échec de l'ajout:", error);
        showAlert('error', 'Erreur !', `Échec de l'ajout du véhicule. Détails : ${error.message}`);
      });
  };

  const handleUpdateVehicle = () => {
    if (!editingVehicle) return;
    const vehicleName = editingVehicle.Vehicule;

    const { dimension, length, width, height } = createDimension(editingVehicle.Longueur, editingVehicle.Largeur, editingVehicle.Hauteur);
    const payload = {
      ...editingVehicle,
      Tonnage: editingVehicle.Tonnage ? parseFloat(editingVehicle.Tonnage) : 0,
      Dimension: dimension, Longueur: length, Largeur: width, Hauteur: height
    };

    fetch(`${API_BASE}/${editingVehicle.Mat}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
      .then(res => res.ok ? res.json() : Promise.reject('Erreur lors de la mise à jour'))
      .then(() => {
        fetchVehicles();
        handleCloseEditVehicleModal();
        showAlert('success', 'Mis à jour !', 'Véhicule mis à jour avec succès !', '#10b981');
        addNotification(`Le véhicule "${vehicleName}" a été mis à jour.`);
      })
      .catch(error => {
        console.error('Échec:', error);
        showAlert('error', 'Erreur !', `Échec de la mise à jour: ${error.message}`);
      });
  };

  const handleDeleteVehicle = (mat, vehicle) => {
    const vehicleName = vehicle.Vehicule;
    Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: "Vous ne pourrez pas revenir en arrière !",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Oui, supprimer !',
      cancelButtonText: 'Annuler'
    }).then(result => {
      if (result.isConfirmed) {
        fetch(`${API_BASE}/${mat}/`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        })
          .then(res => {
            if (res.status === 204 || res.ok) {
              fetchVehicles();
              showAlert('success', 'Supprimé !', 'Le véhicule a été supprimé.', '#10b981');
              addNotification(`Le véhicule "${vehicleName}" a été supprimé.`);
            } else throw new Error('Erreur lors de la suppression');
          })
          .catch(error => {
            console.error('Échec:', error);
            showAlert('error', 'Erreur !', `Échec de la suppression: ${error.message}`);
          });
      }
    });
  };

  const filteredRows = rows.filter(item => 
    ['Vehicule', 'Type', 'Immatriculation', 'Tonnage'].some(key => 
      String(item[key]).toLowerCase().includes(filterText.toLowerCase())
    )
  );

  const columns = [
    { name: 'Vehicule', selector: row => row.Vehicule, sortable: true, wrap: true },
    { name: 'Type', selector: row => row.Type, sortable: true },
    { name: 'Immatriculation', selector: row => row.Immatriculation, sortable: true },
    { name: 'Tonnage', selector: row => row.Tonnage, sortable: true },
    { name: 'Dimension', selector: row => row.Dimension, sortable: true, wrap: true },
    {
      name: 'Actions',
      cell: row => (
        <div className="vehicles-actions-cell">
          <button className="vehicles-btn-icon vehicles-btn-active" title="Actif">
            <ShieldCheck size={20} style={{ color:'#6bad4cff' }} />
          </button>
          <button className="vehicles-btn-icon vehicles-btn-delete" onClick={() => handleDeleteVehicle(row.Mat, row)} title="Supprimer">
            <Trash size={20} style={{ color:'#d82e28ff' }} />
          </button>
          <button className="vehicles-btn-icon vehicles-btn-edit" onClick={() => handleOpenEditVehicleModal(row)} title="Éditer">
            <Pencil size={20} style={{ color:'#388fb8ff' }} />
          </button>
        </div>
      ),
      sortable: true,
      center: true,
    },
  ];

  const customStyles = {
    headRow: { style: { backgroundColor: '#f8f9fa', color: 'black', fontSize: '13px', fontWeight: '600', borderBottom: '2px solid #8b7bb9ff' } },
    headCells: { style: { paddingLeft: '15px', paddingRight: '15px' } },
    cells: { style: { paddingLeft: '15px', paddingRight: '15px', fontSize: '14px' } },
    rows: { style: { borderBottom: '1px solid #e0e0e0', '&:hover': { backgroundColor: '#f8f9fa' } } },
  };

  const VehiclesTableSection = () => (
    <div className="vehicles-section-card">
      <h3 className="vehicles-section-title">Gestion des Véhicules</h3>
      <div className="vehicles-filter-container">
        <input
          type="text"
          className="vehicles-filter-input"
          placeholder="Rechercher par véhicule, type, immatriculation..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        {filterText && (
          <button className="vehicles-clear-filter-btn" onClick={() => { setFilterText(''); setResetPaginationToggle(!resetPaginationToggle); }} title="Effacer la recherche">
            <X size={16} />
          </button>
        )}
        <button onClick={handleOpenAddVehicleModal}>
          <Plus size={18} style={{ marginRight: '6px' }} />
          Ajouter un nouveau vehicule
        </button>
      </div>
      <div className="vehicles-datatable-wrapper">
        <DataTable
          columns={columns}
          data={filteredRows}
          customStyles={customStyles}
          pagination
          paginationComponentOptions={paginationOptions}
          paginationResetDefaultPage={resetPaginationToggle}
          paginationPerPage={10}
          paginationRowsPerPageOptions={[5, 10, 15, 20]}
          responsive
          highlightOnHover
          striped
          expandableRows
          expandableRowsComponent={(props) => <ExpandedComponent {...props} onAddChauffeur={handleOpenAddChauffeurModal} />}
          noDataComponent="Aucun véhicule trouvé"
        />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="vehicles-loading-container">
        <div className="vehicles-loading-spinner"></div>
        <p>Chargement des données...</p>
      </div>
    );
  }

  return (
  <>
    <div className="vehicles-container">
      <div className="vehicles-section-card">
        <h3 className="vehicles-section-title">Gestion des Véhicules</h3>
        <div className="vehicles-filter-container">
          <input
            type="text"
            className="vehicles-filter-input"
            placeholder="Rechercher par véhicule, type, immatriculation..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button 
              className="vehicles-clear-filter-btn" 
              onClick={() => { 
                setFilterText(''); 
                setResetPaginationToggle(!resetPaginationToggle); 
              }} 
              title="Effacer la recherche"
            >
              <X size={16} />
            </button>
          )}
          <button onClick={handleOpenAddVehicleModal}>
            <Plus size={18} style={{ marginRight: '6px' }} />
            Ajouter un nouveau vehicule
          </button>
        </div>
        <div className="vehicles-datatable-wrapper">
          <DataTable
            columns={columns}
            data={filteredRows}
            customStyles={customStyles}
            pagination
            paginationComponentOptions={paginationOptions}
            paginationResetDefaultPage={resetPaginationToggle}
            paginationPerPage={10}
            paginationRowsPerPageOptions={[5, 10, 15, 20]}
            responsive
            highlightOnHover
            striped
            expandableRows
            expandableRowsComponent={(props) => <ExpandedComponent {...props} onAddChauffeur={handleOpenAddChauffeurModal} />}
            noDataComponent="Aucun véhicule trouvé"
          />
        </div>
      </div>
    </div>

      {addVehicleModalOpen && (
        <div className="vehicles-modal-overlay" onClick={handleCloseAddVehicleModal}>
          <div className="vehicles-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="vehicles-modal-header">
              <h3>Ajouter un nouveau véhicule</h3>
              <button className="vehicles-modal-close" onClick={handleCloseAddVehicleModal}>
                <X size={24} />
              </button>
            </div>
            <div className="vehicles-modal-body">
              <form className="vehicles-form">
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Vehicule : </label>
                  <input type="text" className="vehicles-form-input" value={newVehicle.Vehicule} onChange={(e) => setNewVehicle({ ...newVehicle, Vehicule: e.target.value })} />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Type : </label>
                  <select className="vehicles-form-select" value={newVehicle.Type} onChange={(e) => setNewVehicle({ ...newVehicle, Type: e.target.value })}>
                    <option value="">Sélectionner</option>
                    <option value="essence">Essence</option>
                    <option value="gasoil">Gasoil</option>
                    <option value="electrique">Électrique</option>
                  </select>
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Immatriculation : </label>
                  <input type="text" className="vehicles-form-input" value={newVehicle.Immatriculation} onChange={(e) => setNewVehicle({ ...newVehicle, Immatriculation: e.target.value })} />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Tonnage : </label>
                  <input type="number" step="0.01" min="0" className="vehicles-form-input" value={newVehicle.Tonnage} onChange={(e) => setNewVehicle({ ...newVehicle, Tonnage: e.target.value })} />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Dimensions (m) : </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block'}}>Longueur</label>
                      <input style={{width: '12.5vh' }} type="number" step="0.01" min="0" className="vehicles-form-input" value={newVehicle.Longueur} onChange={(e) => setNewVehicle({ ...newVehicle, Longueur: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Largeur</label>
                      <input style={{width: '12.5vh' }} type="number" step="0.01" min="0" className="vehicles-form-input" value={newVehicle.Largeur} onChange={(e) => setNewVehicle({ ...newVehicle, Largeur: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Hauteur</label>
                      <input style={{width: '12.5vh'}} type="number" step="0.01" min="0" className="vehicles-form-input" value={newVehicle.Hauteur} onChange={(e) => setNewVehicle({ ...newVehicle, Hauteur: e.target.value })} />
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <div className="vehicles-modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseAddVehicleModal}>Annuler</button>
              <button className="btn btn-primary" onClick={handleAddVehicle}>Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {addChauffeurModalOpen && (
        <div className="vehicles-modal-overlay" onClick={handleCloseAddChauffeurModal}>
          <div className="vehicles-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="vehicles-modal-header">
              <h3>Ajouter un chauffeur</h3>
              <button className="vehicles-modal-close" onClick={handleCloseAddChauffeurModal}>
                <X size={24} />
              </button>
            </div>
            <div className="vehicles-modal-body">
              <form className="vehicles-form">
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Véhicule : </label>
                  <input type="text" className="vehicles-form-input vehicles-input-disabled" value={newChauffeur.Vehicule} disabled />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Immatriculation : </label>
                  <input type="text" className="vehicles-form-input vehicles-input-disabled" value={newChauffeur.Immatriculation} disabled />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">N° Matricule : </label>
                  <input type="text" className="vehicles-form-input" value={newChauffeur.Matricule} onChange={(e) => setNewChauffeur({ ...newChauffeur, Matricule: e.target.value })} />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Nom du chauffeur : </label>
                  <input type="text" className="vehicles-form-input" value={newChauffeur.Nom} onChange={(e) => setNewChauffeur({ ...newChauffeur, Nom: e.target.value })} />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Contact : </label>
                  <input type="text" className="vehicles-form-input" value={newChauffeur.Contact} onChange={(e) => setNewChauffeur({ ...newChauffeur, Contact: e.target.value })} />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Poste : </label>
                  <input type="text" className="vehicles-form-input" value={newChauffeur.Poste} onChange={(e) => setNewChauffeur({ ...newChauffeur, Poste: e.target.value })} />
                </div>
              </form>
            </div>
            <div className="vehicles-modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseAddChauffeurModal}>Annuler</button>
              <button className="btn btn-primary" onClick={handleAddChauffeur}>Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {editingVehicle && editVehicleModalOpen && (
        <div className="vehicles-modal-overlay" onClick={handleCloseEditVehicleModal}>
          <div className="vehicles-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="vehicles-modal-header">
              <h3>Modifier le véhicule</h3>
              <button className="vehicles-modal-close" onClick={handleCloseEditVehicleModal}>
                <X size={24} />
              </button>
            </div>
            <div className="vehicles-modal-body">
              <form className="vehicles-form">
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Vehicule  : </label>
                  <input type="text" className="vehicles-form-input" value={editingVehicle.Vehicule} onChange={(e) => setEditingVehicle({ ...editingVehicle, Vehicule: e.target.value })} />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Type : </label>
                  <select className="vehicles-form-select" value={editingVehicle.Type || ''} onChange={(e) => setEditingVehicle({ ...editingVehicle, Type: e.target.value })}>
                    <option value="">Sélectionner...</option>
                    <option value="essence">Essence</option>
                    <option value="gasoil">Gasoil</option>
                    <option value="electrique">Électrique</option>
                  </select>
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Immatriculation : </label>
                  <input type="text" className="vehicles-form-input vehicles-input-disabled" value={editingVehicle.Immatriculation} disabled />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Tonnage : </label>
                  <input type="number" step="0.01" min="0" className="vehicles-form-input" value={editingVehicle.Tonnage} onChange={(e) => setEditingVehicle({ ...editingVehicle, Tonnage: e.target.value })} />
                </div>
                <div className="vehicles-form-group">
                  <label className="vehicles-form-label">Dimensions (m) : </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Longueur</label>
                      <input style={{width: '12.5vh' }} type="number" step="0.01" min="0" className="vehicles-form-input" value={editingVehicle.Longueur} onChange={(e) => setEditingVehicle({ ...editingVehicle, Longueur: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Largeur</label>
                      <input style={{width: '12.5vh' }} type="number" step="0.01" min="0" className="vehicles-form-input" value={editingVehicle.Largeur} onChange={(e) => setEditingVehicle({ ...editingVehicle, Largeur: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Hauteur</label>
                      <input style={{width: '12.5vh' }} type="number" step="0.01" min="0" className="vehicles-form-input" value={editingVehicle.Hauteur} onChange={(e) => setEditingVehicle({ ...editingVehicle, Hauteur: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="vehicles-form-group vehicles-form-checkbox">
                  <input type="checkbox" id="vehicleActiveEdit" checked={editingVehicle.active} onChange={(e) => setEditingVehicle({ ...editingVehicle, active: e.target.checked })} />
                  <label htmlFor="vehicleActiveEdit">Véhicule actif</label>
                </div>
              </form>
            </div>
            <div className="vehicles-modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseEditVehicleModal}>Annuler</button>
              <button className="btn btn-primary" onClick={handleUpdateVehicle}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

VehicleTable.propTypes = { 
  token: PropTypes.string.isRequired,
  addNotification: PropTypes.func.isRequired,
};