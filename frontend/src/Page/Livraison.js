import React, { useState, useEffect, useMemo  } from 'react';
import { GoogleMap, LoadScript, DirectionsRenderer, Marker } from '@react-google-maps/api';
import DataTable from 'react-data-table-component';
import { Package, Truck, MapPin, Info, Maximize2, X, Loader } from 'lucide-react';
import axios from 'axios';
import '../styles/Livraison.css';
// ========================================
// CONSTANTES
// ========================================
const API_BASE_URL = 'http://10.68.163.2/api';
const PAGINATION_OPTIONS = {
  rowsPerPageText: 'Lignes par page:',
  rangeSeparatorText: 'de',
  selectAllRowsItem: true,
  selectAllRowsItemText: 'Tous',
};
const TABLE_CUSTOM_STYLES = {
  headRow: { style: { backgroundColor: '#f8f9fa', color: 'black', fontSize: '13px', fontWeight: '600', borderBottom: '2px solid #28a745' } },
  headCells: { style: { paddingLeft: '15px', paddingRight: '15px' } },
  cells: { style: { paddingLeft: '15px', paddingRight: '15px', fontSize: '14px' } },
  rows: { style: { borderBottom: '1px solid #e0e0e0', '&:hover': { backgroundColor: '#f8f9fa' } } }
};
const ORDERS_COLUMNS = [
  { name: 'N° Devis', selector: row => row.numero_devis || '', sortable: true, width: '120px' },
  { name: 'Nom du client', selector: row => row.client_name || '', sortable: true, grow: 1, minWidth: '150px' },
  { name: 'Adresse de livraison', selector: row => row.adresse_livraison || '', sortable: true, wrap: true, grow: 2, minWidth: '200px' },
  { name: 'Contact du client', selector: row => row.number || '', sortable: true, width: '130px' },
  { name: 'Adresse du client', selector: row => row.Adresse_client || '', sortable: true, wrap: true, grow: 2, minWidth: '200px' },
  { name: 'Référence', selector: row => row.ref_produit || '', sortable: true, width: '120px' },
  { name: 'Nom Produit', selector: row => row.Name || '', sortable: true, wrap: true, grow: 1, minWidth: '150px' },
  { name: 'Quantités à livrer', selector: row => row.quantity || '', sortable: true, center: true, width: '130px' },
  { name: 'Date de livraison', selector: row => row.planification_date || '', sortable: true, width: '130px' },
  //{ name: 'AM/PM', selector: row => row.period || '', sortable: true, center: true, width: '80px' }
];
const VEHICLE_INFO_COLUMNS = [
  { name: 'Véhicule', selector: row => row.vehicule, sortable: false, minWidth: '130px' },
  { name: 'N° Commande', selector: row => row.numeroCommande, sortable: true, minWidth: '120px' },
  { name: 'Client', selector: row => row.client, sortable: true, wrap: true, grow: 1, minWidth: '180px' },
  { name: 'Téléphone', selector: row => row.telephone, sortable: false, minWidth: '120px' },
  { name: 'Article', selector: row => row.article, sortable: true, wrap: true, grow: 1, minWidth: '150px' },
  { name: 'Qté', selector: row => row.quantite, sortable: true, center: true, width: '70px' },
  { name: 'Lieu de livraison', selector: row => row.lieu_livraison, sortable: true, wrap: true, grow: 2, minWidth: '200px' }
];
// ========================================
// UTILITAIRES
// ========================================
const showAlert = (message, type = 'info') => {
  const alertDiv = document.createElement('div');
  alertDiv.className = `livraison-custom-alert livraison-alert-${type}`;
  alertDiv.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;max-width:350px';
  alertDiv.innerHTML = `<div class="livraison-alert-content"><div class="livraison-alert-icon">${type === 'success' ? '✔' : type === 'error' ? '✕' : 'ℹ'}</div><div class="livraison-alert-message">${message}</div></div>`;
  document.body.appendChild(alertDiv);
  setTimeout(() => alertDiv.classList.add('livraison-alert-show'), 10);
  setTimeout(() => { alertDiv.classList.remove('livraison-alert-show'); setTimeout(() => document.body.removeChild(alertDiv), 300); }, 3000);
};

const getAuthToken = () => {
  const token = localStorage.getItem('authToken');
  if (!token) showAlert("Token d'authentification introuvable !", 'error');
  return token;
};

const filterData = (data, searchText, fields) => {
  const lower = searchText.toLowerCase();
  return data.filter(item => fields.some(field => item[field] && item[field].toString().toLowerCase().includes(lower)));
};

// ========================================
// COMPOSANTS
// ========================================
const OrdersSection = ({ isFullscreen, setFullscreenContainer, orders, filterText, setFilterText, resetPaginationToggle, setResetPaginationToggle, filteredOrders, getActionButton }) => (
  <div className={`livraison-section-card ${isFullscreen ? 'livraison-fullscreen' : ''}`} id="livraison-orders-section">
    <button className="livraison-fullscreen-btn" onClick={() => setFullscreenContainer(isFullscreen ? null : 'orders')} title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}>
      {isFullscreen ? <X size={20} /> : <Maximize2 size={20} />}
    </button>
    <h3 className="livraison-section-title"><Package size={20} style={{ marginRight: '8px', color: '#209e26ff' }} />Gestion des Commandes</h3>
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', marginBottom: '15px' }}>
      <div className="livraison-filter-container">
        {orders.length > 0 && (
          <>
            <input type="text" className="livraison-filter-input" placeholder="Rechercher par client, article..." value={filterText} onChange={(e) => setFilterText(e.target.value)} />
            {filterText && <button className="livraison-clear-filter-btn" onClick={() => { setFilterText(''); setResetPaginationToggle(!resetPaginationToggle); }} title="Effacer la recherche"><X size={16} /></button>}
          </>
        )}
      </div>
      {getActionButton()}
    </div>
    {orders.length > 0 && (
      <div className="livraison-datatable-wrapper">
        <DataTable columns={ORDERS_COLUMNS} data={filteredOrders} customStyles={TABLE_CUSTOM_STYLES} pagination paginationComponentOptions={PAGINATION_OPTIONS} paginationResetDefaultPage={resetPaginationToggle} paginationPerPage={10} paginationRowsPerPageOptions={[5, 10, 15, 20, 50, 100]} responsive highlightOnHover striped noDataComponent="Aucune commande trouvée" persistTableHead fixedHeader fixedHeaderScrollHeight={isFullscreen ? 'calc(100vh - 280px)' : '400px'} />
      </div>
    )}
  </div>
);

const VehiclesSection = ({ isFullscreen, setFullscreenContainer, vehicles, selectedVehicle, setSelectedVehicle }) => (
  <div className={`livraison-section-card ${isFullscreen ? 'livraison-fullscreen' : ''}`} id="livraison-vehicles-section">
    <button className="livraison-fullscreen-btn" onClick={() => setFullscreenContainer(isFullscreen ? null : 'vehicles')} title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}>
      {isFullscreen ? <X size={20} /> : <Maximize2 size={20} />}
    </button>
    <h3 className="livraison-section-title"><Truck size={20} style={{ marginRight: '8px', color:'#8b7bb9ff' }} />Véhicules de Livraison</h3>
    <div className="livraison-vehicles-list">
      {vehicles.map((vehicle) => (
        <div key={vehicle.immatriculation} className={`livraison-vehicle-item ${selectedVehicle?.immatriculation === vehicle.immatriculation ? 'livraison-selected' : ''}`} onClick={() => setSelectedVehicle(vehicle)}>
          <span className="livraison-vehicle-name">{vehicle.immatriculation}</span>
          <span style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{vehicle.commandes.length} commande(s) • {vehicle.totalArticles} article(s)</span>
          {selectedVehicle?.immatriculation === vehicle.immatriculation && <span className="livraison-vehicle-status">Sélectionné</span>}
        </div>
      ))}
    </div>
  </div>
);

const MapSection = ({ isFullscreen, setFullscreenContainer, selectedVehicle }) => {
  const [map, setMap] = useState(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [routeRenderers, setRouteRenderers] = useState([]);
  
  // Extraire les coordonnées depuis optimizationResult
  const { vehicleCoordinates, routeInfo } = useMemo(() => {
    if (!selectedVehicle || !selectedVehicle.commandes) {
      return { vehicleCoordinates: [], routeInfo: [] };
    }
    
    const savedOptimization = localStorage.getItem('livraison_optimization_result');
    if (!savedOptimization) {
      return { vehicleCoordinates: [], routeInfo: [] };
    }
    
    const optimizationData = JSON.parse(savedOptimization);
    const vehiclesData = optimizationData?.solution || optimizationData;
    const vehicleKey = selectedVehicle.immatriculation;
    const vehicleData = vehiclesData[vehicleKey];
    
    if (!vehicleData || !Array.isArray(vehicleData) || vehicleData.length < 3) {
      return { vehicleCoordinates: [], routeInfo: [] };
    }
    
    const [routeCoordinates, routeTimes] = vehicleData;
    
    const coordinates = [];
    if (Array.isArray(routeCoordinates)) {
      routeCoordinates.forEach(coordStr => {
        const match = coordStr.match(/^(.+?)\((-?\d+\.?\d*),(-?\d+\.?\d*)\)$/);
        if (match) {
          const lieu = match[1].trim();
          const lat = parseFloat(match[2]);
          const lng = parseFloat(match[3]);
          coordinates.push({ lat, lng, lieu });
        }
      });
    }
    
    const routes = Array.isArray(routeTimes) ? routeTimes : [];
    
    return { vehicleCoordinates: coordinates, routeInfo: routes };
  }, [selectedVehicle]);
  
  // Heure de départ fixe à 9h00
  const START_TIME = 9 * 60; // 9h00 en minutes
  
  // Calculer les heures d'arrivée estimées pour chaque point
  const estimatedTimes = useMemo(() => {
    const times = [START_TIME]; // Point de départ à 9h00
    
    routeInfo.forEach((route) => {
      if (route && route[1]) {
        const timeStr = route[1];
        const [hours, minutes] = timeStr.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes;
        // Ajouter le temps cumulé depuis le départ
        const previousTime = times[times.length - 1];
        times.push(previousTime + totalMinutes);
      }
    });
    
    return times;
  }, [routeInfo]);
  
  // Fonction pour formater l'heure en HH:MM
  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };
  
  const center = vehicleCoordinates.length > 0 
    ? vehicleCoordinates[0] 
    : { lat: -18.8792, lng: 47.5079 };

  // Fonction pour tracer les itinéraires segment par segment
  const traceRoutes = (mapInstance) => {
    if (!window.google || !window.google.maps || vehicleCoordinates.length < 2) return;
    
    // Nettoyer les anciens renderers
    routeRenderers.forEach(renderer => renderer.setMap(null));
    setRouteRenderers([]);
    
    const directionsService = new window.google.maps.DirectionsService();
    const newRenderers = [];
    
    // Couleurs alternées pour chaque segment
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    
    // Tracer chaque segment individuellement
    for (let i = 0; i < vehicleCoordinates.length - 1; i++) {
      const origin = vehicleCoordinates[i];
      const destination = vehicleCoordinates[i + 1];
      const segmentColor = colors[i % colors.length];
      
      directionsService.route(
        {
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          travelMode: window.google.maps.TravelMode.DRIVING,
          avoidHighways: false,
          avoidTolls: false,
          avoidFerries: true
        },
        (result, status) => {
          if (status === 'OK') {
            // Créer un renderer pour ce segment
            const directionsRenderer = new window.google.maps.DirectionsRenderer({
              map: mapInstance,
              suppressMarkers: true,
              preserveViewport: true,
              polylineOptions: {
                strokeColor: segmentColor,
                strokeWeight: 5,
                strokeOpacity: 0.8
              }
            });
            
            directionsRenderer.setDirections(result);
            newRenderers.push(directionsRenderer);
            
            // Ajouter des flèches de direction (en noir)
            const route = result.routes[0];
            const path = route.overview_path;
            
            const arrowSymbol = {
              path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 3,
              strokeColor: '#000000',
              fillColor: '#000000',
              fillOpacity: 1,
              strokeWeight: 2
            };
            
            const arrowPolyline = new window.google.maps.Polyline({
              path: path,
              geodesic: true,
              strokeOpacity: 0,
              icons: [{
                icon: arrowSymbol,
                offset: '50%',
                repeat: '150px'
              }],
              map: mapInstance
            });
            
            console.log(`✅ Segment ${i + 1}/${vehicleCoordinates.length - 1} tracé`);
          } else {
            console.error(`Erreur segment ${i + 1}:`, status);
          }
        }
      );
    }
    
    setRouteRenderers(newRenderers);
    
    // Ajuster la vue pour voir tout l'itinéraire
    const bounds = new window.google.maps.LatLngBounds();
    vehicleCoordinates.forEach(coord => {
      bounds.extend({ lat: coord.lat, lng: coord.lng });
    });
    mapInstance.fitBounds(bounds, { padding: 50 });
  };

  // Charger la carte et tracer les routes
  const onMapLoad = (mapInstance) => {
    setMap(mapInstance);
    setIsGoogleLoaded(true);
    traceRoutes(mapInstance);
  };

  // Retracer quand le véhicule change
  useEffect(() => {
    if (map && vehicleCoordinates.length >= 2 && isGoogleLoaded) {
      traceRoutes(map);
    }
  }, [selectedVehicle, vehicleCoordinates, isGoogleLoaded]);

  return (
    <div className={`livraison-map-container ${isFullscreen ? 'livraison-fullscreen' : ''}`} id="livraison-map-section">
      <button className="livraison-fullscreen-btn" onClick={() => setFullscreenContainer(isFullscreen ? null : 'map')} title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}>
        {isFullscreen ? <X size={20} /> : <Maximize2 size={20} />}
      </button>
      
      {vehicleCoordinates.length === 0 ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <MapPin size={48} color="#999" />
          <p style={{ marginTop: '16px', color: '#666' }}>
            Aucune coordonnée GPS disponible pour ce véhicule.
          </p>
        </div>
      ) : (
        <LoadScript 
          googleMapsApiKey="AIzaSyBPp50ByhH43bsf5ayKyQjUg7jbYagwSKY"
          loadingElement={<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Chargement de la carte...</div>}
        >
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={center}
            zoom={13}
            mapTypeId="roadmap"
            onLoad={onMapLoad}
          >
            {/* ✅ Marqueurs avec heures d'arrivée estimées */}
            {isGoogleLoaded && window.google && window.google.maps && vehicleCoordinates.map((coord, idx) => {
              const isStart = idx === 0;
              const isEnd = idx === vehicleCoordinates.length - 1;
              const estimatedTime = estimatedTimes[idx] || START_TIME;
              const timeLabel = formatTime(estimatedTime);
              
              // Calculer la durée depuis le départ
              const durationFromStart = estimatedTime - START_TIME;
              const durationHours = Math.floor(durationFromStart / 60);
              const durationMins = durationFromStart % 60;
              const durationStr = durationHours > 0 
                ? `${durationHours}h${String(durationMins).padStart(2, '0')}` 
                : `${durationMins}min`;
              
              return (
                <Marker
                  key={idx}
                  position={{ lat: coord.lat, lng: coord.lng }}
                  label={{
                    text: isStart ? '🚀' : isEnd ? '🏁' : `${idx}`,
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}
                  icon={{
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: isStart || isEnd ? 14 : 11,
                    fillColor: isStart ? '#22c55e' : isEnd ? '#ef4444' : '#3b82f6',
                    fillOpacity: 1,
                    strokeColor: 'white',
                    strokeWeight: 3
                  }}
                  onClick={() => {
                    const infoWindow = new window.google.maps.InfoWindow({
                      content: `
                        <div style="font-family: system-ui; padding: 12px; min-width: 220px;">
                          <div style="font-weight: bold; font-size: 16px; color: #1f2937; margin-bottom: 10px; border-bottom: 2px solid #3b82f6; padding-bottom: 6px;">
                            📍 ${coord.lieu}
                          </div>
                          
                          <div style="margin: 10px 0; padding: 8px; background: ${isStart ? '#dcfce7' : isEnd ? '#fee2e2' : '#dbeafe'}; border-radius: 8px;">
                            <div style="font-weight: 600; color: ${isStart ? '#16a34a' : isEnd ? '#dc2626' : '#2563eb'}; font-size: 14px; margin-bottom: 4px;">
                              ${isStart ? '🚀 DÉPART' : isEnd ? '🏁 RETOUR' : '📦 LIVRAISON'}
                            </div>
                            <div style="font-size: 18px; font-weight: bold; color: #1f2937;">
                              ⏰ ${timeLabel}
                            </div>
                          </div>
                          
                          ${!isStart ? `
                            <div style="margin-top: 10px; font-size: 13px; color: #666; padding: 6px; background: #f3f4f6; border-radius: 6px;">
                              ⏱️ Temps depuis départ: <strong>${durationStr}</strong>
                            </div>
                          ` : ''}
                          
                          ${routeInfo[idx - 1] ? `
                            <div style="margin-top: 10px; padding: 8px; background: #fff7ed; border-left: 3px solid #f59e0b; border-radius: 6px;">
                              <div style="font-size: 13px; color: #92400e; margin-bottom: 4px;">
                                🛣️ Distance: <strong>${routeInfo[idx - 1][0]}</strong>
                              </div>
                              <div style="font-size: 13px; color: #92400e;">
                                🕐 Durée trajet: <strong>${routeInfo[idx - 1][1]}</strong>
                              </div>
                            </div>
                          ` : ''}
                        </div>
                      `
                    });
                    infoWindow.open(map, this);
                  }}
                />
              );
            })}
            
            {/* ✅ Labels de distance/temps entre les segments */}
            {isGoogleLoaded && window.google && window.google.maps && routeInfo.map((route, idx) => {
              if (!route || idx >= vehicleCoordinates.length - 1) return null;
              
              const start = vehicleCoordinates[idx];
              const end = vehicleCoordinates[idx + 1];
              const midLat = (start.lat + end.lat) / 2;
              const midLng = (start.lng + end.lng) / 2;
              
              return (
                <Marker
                  key={`route-${idx}`}
                  position={{ lat: midLat, lng: midLng }}
                  icon={{
                    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                      <svg xmlns="http://www.w3.org/2000/svg" width="150" height="44">
                        <rect width="150" height="44" rx="12" fill="white" stroke="#f59e0b" stroke-width="3" opacity="0.95"/>
                        <text x="75" y="18" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="700" fill="#ea580c">
                          🛣️ ${route[0]}
                        </text>
                        <text x="75" y="34" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="700" fill="#ea580c">
                          🕐 ${route[1]}
                        </text>
                      </svg>
                    `)}`,
                    anchor: new window.google.maps.Point(75, 22),
                    scaledSize: new window.google.maps.Size(150, 44)
                  }}
                />
              );
            })}
          </GoogleMap>
        </LoadScript>
      )}
    </div>
  );
};

const DetailsSection = ({ isFullscreen, setFullscreenContainer, selectedVehicle }) => {
  const [vehicleFilterText, setVehicleFilterText] = useState('');
  const [vehicleResetPagination, setVehicleResetPagination] = useState(false);
  const vehicleAllInfoData = selectedVehicle ? selectedVehicle.commandes.map(cmd => ({
    vehicule: selectedVehicle.immatriculation, numeroCommande: cmd.commande_id, client: cmd.client, telephone: cmd.telephone, article: cmd.article, quantite: cmd.quantite, lieu_livraison: cmd.lieu_livraison
  })) : [];
  const filteredVehicleData = filterData(vehicleAllInfoData, vehicleFilterText, ['vehicule', 'numeroCommande', 'client', 'telephone', 'article', 'quantite', 'lieu_livraison']);

  return (
    <div className={`livraison-details-container ${isFullscreen ? 'livraison-fullscreen' : ''}`} id="livraison-details-section">
      <button className="livraison-fullscreen-btn" onClick={() => setFullscreenContainer(isFullscreen ? null : 'details')} title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}>
        {isFullscreen ? <X size={20} /> : <Maximize2 size={20} />}
      </button>
      <h3 className="livraison-section-title"><Info size={20} style={{ marginRight: '8px', color: '#3283cfff' }} />Informations Véhicule pour {selectedVehicle?.immatriculation || 'le véhicule sélectionné'}</h3>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', marginBottom: '15px' }}>
        <div className="livraison-filter-container">
          {vehicleAllInfoData.length > 0 && (
            <>
              <input type="text" className="livraison-filter-input" placeholder="Rechercher par véhicule, client, article..." value={vehicleFilterText} onChange={(e) => setVehicleFilterText(e.target.value)} />
              {vehicleFilterText && <button className="livraison-clear-filter-btn" onClick={() => { setVehicleFilterText(''); setVehicleResetPagination(!vehicleResetPagination); }} title="Effacer la recherche"><X size={16} /></button>}
            </>
          )}
        </div>
      </div>
      {vehicleAllInfoData.length > 0 && (
        <div className="livraison-datatable-wrapper livraison-vehicle-details-table">
          <DataTable columns={VEHICLE_INFO_COLUMNS} data={filteredVehicleData} customStyles={TABLE_CUSTOM_STYLES} pagination paginationComponentOptions={PAGINATION_OPTIONS} paginationResetDefaultPage={vehicleResetPagination} paginationPerPage={5} paginationRowsPerPageOptions={[5, 10, 15, 20]} responsive highlightOnHover striped noDataComponent="Aucune information disponible" persistTableHead fixedHeader fixedHeaderScrollHeight={isFullscreen ? 'calc(100vh - 280px)' : '300px'} />
        </div>
      )}
    </div>
  );
};

// ========================================
// COMPOSANT PRINCIPAL
// ========================================
function Livraison() {
  // Charger les états depuis localStorage au démarrage
  const [step, setStep] = useState(() => {
    const saved = localStorage.getItem('livraison_step');
    return saved || 'initial';
  });
  
  const [selectedVehicle, setSelectedVehicle] = useState(() => {
    const saved = localStorage.getItem('livraison_selectedVehicle');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [orders, setOrders] = useState(() => {
    const saved = localStorage.getItem('livraison_orders');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [vehicles, setVehicles] = useState(() => {
    const saved = localStorage.getItem('livraison_vehicles');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentDelivery, setCurrentDelivery] = useState(() => {
    const saved = localStorage.getItem('livraison_current_delivery');
    return saved ? JSON.parse(saved) : null;
  });

  
  const [filterText, setFilterText] = useState('');
  const [resetPaginationToggle, setResetPaginationToggle] = useState(false);
  const [fullscreenContainer, setFullscreenContainer] = useState(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingOptimization, setIsLoadingOptimization] = useState(false);

  const [optimizationResult, setOptimizationResult] = useState(() => {
  const saved = localStorage.getItem('livraison_optimization_result');
  return saved ? JSON.parse(saved) : null;
  });

// 2. Sauvegarder optimizationResult dans localStorage
useEffect(() => {
  if (optimizationResult) {
    localStorage.setItem('livraison_optimization_result', JSON.stringify(optimizationResult));
  }
}, [optimizationResult]);
  // Sauvegarder l'état à chaque modification
  useEffect(() => {
    localStorage.setItem('livraison_step', step);
  }, [step]);

  useEffect(() => {
    localStorage.setItem('livraison_selectedVehicle', JSON.stringify(selectedVehicle));
  }, [selectedVehicle]);

  useEffect(() => {
    localStorage.setItem('livraison_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('livraison_vehicles', JSON.stringify(vehicles));
  }, [vehicles]);

  useEffect(() => {
    if (fullscreenContainer) document.body.classList.add('livraison-fullscreen-active');
    else document.body.classList.remove('livraison-fullscreen-active');
    return () => document.body.classList.remove('livraison-fullscreen-active');
  }, [fullscreenContainer]);

  const filteredOrders = filterData(orders, filterText, ['numero_devis', 'client_name', 'adresse_livraison', 'number', 'Adresse_client', 'ref_produit', 'Name', 'quantity', 'planification_date', 'period']);
  const handleRecuperCommandes = async () => {
    const token = getAuthToken();
    if (!token) return;
    setIsLoadingOrders(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/get-all-product/`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      const data = response.data;
      console.log('=== DEBUT DEBUG JSON ===');
      console.log('Type de données:', typeof data, 'Longueur:', data.length);
      if (data.length > 0) console.log('Première entrée:', data[0]);
      const validData = data.filter((row, index) => {
        const hasData = row && Object.keys(row).some(key => row[key] !== '' && row[key] !== null && row[key] !== undefined);
        if (index < 5) console.log(`Entrée ${index} valide?`, hasData);
        return hasData;
      });
      console.log('Entrées valides:', validData.length);
      if (validData.length === 0) {
        showAlert('Aucun produit valide trouvé.', 'error');
        setIsLoadingOrders(false);
        return;
      }
      const formattedOrders = validData.map((order, index) => {
        const cleaned = {};
        Object.keys(order).forEach(key => { const cleanKey = key.trim(); cleaned[cleanKey] = typeof order[key] === 'string' ? order[key].trim() : order[key]; });
        return {
          id: cleaned._id || cleaned.id || (index + 1).toString(),
          numero_devis: cleaned.numero_devis || cleaned.num_devis || '-',  // NOUVEAU
          client_name: cleaned.client_name || 'Client non spécifié',
          adresse_livraison: cleaned.adresse_livraison || 'Adresse non spécifiée',
          number: cleaned.number || '-', 
          Adresse_client: cleaned.Adresse_client || '-',
          ref_produit: cleaned.ref_produit || '-', 
          Name: cleaned.Name || 'Produit non spécifié',
          quantity: cleaned.quantity || '1', 
          planification_date: cleaned.planification_date || '-', 
          period: cleaned.period || '-'
        };
      });
      if (formattedOrders.length > 0) {
        setOrders(formattedOrders);
        setStep('initial');
        showAlert(`${formattedOrders.length} produits récupérés avec succès !`, 'success');
      } else showAlert('Aucun produit trouvé.', 'error');
    } catch (error) {
      console.error('Erreur:', error);
      if (error.response) showAlert(`Erreur ${error.response.status}: ${error.response.data?.error || error.response.statusText}`, 'error');
      else if (error.request) showAlert('Aucune réponse du serveur.', 'error');
      else showAlert('Erreur: ' + error.message, 'error');
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleOptimiserItineraires = async () => {
    if (orders.length === 0) { showAlert("Veuillez d'abord récupérer les commandes", 'error'); return; }
    const token = getAuthToken();
    if (!token) return;
    setIsLoadingOptimization(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/vrp/optimization/result/`, { 
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } 
      });
      const optimizationData = response.data;
      
      console.log('==================== DEBUT LOG DONNEES BACKEND ====================');
      console.log('Données brutes complètes:', JSON.stringify(optimizationData, null, 2));
      console.log('==================== FIN LOG DONNEES BACKEND ====================');
      
      let formattedVehicles = [];
      
      const vehiclesData = optimizationData?.solution || optimizationData;
      
      if (vehiclesData && typeof vehiclesData === 'object' && !Array.isArray(vehiclesData)) {
        formattedVehicles = Object.keys(vehiclesData).map(immat => {
          const vehicleData = vehiclesData[immat];
          
          if (!Array.isArray(vehicleData) || vehicleData.length < 3) {
            console.warn(`Véhicule "${immat}" ignoré (format invalide)`);
            return null;
          }
          
          const [routeCoordinates, routeTimes, commandes] = vehicleData;
          
          if (!Array.isArray(commandes)) {
            console.warn(`Véhicule "${immat}" ignoré (commandes invalides)`);
            return null;
          }
          
          const coordinatesMap = {};
          if (Array.isArray(routeCoordinates)) {
            routeCoordinates.forEach(coordStr => {
              const match = coordStr.match(/^(.+?)\((-?\d+\.?\d*),(-?\d+\.?\d*)\)$/);
              if (match) {
                const lieu = match[1].trim();
                const lat = parseFloat(match[2]);
                const lng = parseFloat(match[3]);
                coordinatesMap[lieu] = { lat, lng };
              }
            });
          }
          
          console.log(`Véhicule ${immat} - Coordonnées extraites:`, coordinatesMap);
          
          const enrichedCommandes = commandes.map((cmd, i) => {
            const lieuLivraison = cmd.lieu_livraison || '';
            const coords = coordinatesMap[lieuLivraison];
            
            return {
              id: cmd.id || `cmd_${immat}_${i}`,
              commande_id: cmd.commande_id || '-',
              client: cmd.client || 'Client non spécifié',
              telephone: cmd.telephone || '-',
              article: cmd.article || 'Article non spécifié',
              quantite: cmd.quantite || 0,
              lieu_livraison: lieuLivraison || 'Adresse non spécifiée',
              latitude: coords ? coords.lat : null,
              longitude: coords ? coords.lng : null
            };
          });
          
          const commandesAvecCoords = enrichedCommandes.filter(c => c.latitude && c.longitude).length;
          console.log(`Véhicule ${immat}: ${commandesAvecCoords}/${enrichedCommandes.length} commandes avec coordonnées`);
          
          return {
            immatriculation: immat,
            commandes: enrichedCommandes,
            totalArticles: commandes.reduce((sum, cmd) => sum + (parseInt(cmd.quantite) || 0), 0)
          };
        }).filter(v => v !== null);
      }
      
      console.log('Véhicules formatés:', formattedVehicles);
      console.log('Nombre de véhicules:', formattedVehicles.length);
      
      if (formattedVehicles.length === 0) { 
        showAlert('Aucune donnée d\'optimisation valide trouvée.', 'error'); 
        setIsLoadingOptimization(false);
        return; 
      }
      
      // ✅ SOLUTION : Tout mettre à jour ensemble
      setVehicles(formattedVehicles);
      setOptimizationResult(optimizationData); // ⚠️ DÉPLACÉ ICI
      setStep('optimized');
      
      showAlert(`Optimisation terminée ! ${formattedVehicles.length} véhicule(s) chargé(s).`, 'success');
    } catch (error) {
      console.error('Erreur optimisation:', error);
      if (error.response) showAlert(error.response.status === 401 ? 'Session expirée.' : `Erreur ${error.response.status}`, 'error');
      else if (error.request) showAlert('Aucune réponse du serveur.', 'error');
      else showAlert('Erreur: ' + error.message, 'error');
    } finally {
      setIsLoadingOptimization(false);
    }
  };

  const handleEnvoyerAuChauffeur = async () => {
    const token = getAuthToken();
    if (!token) return;
    
    // ✅ RÉCUPÉRER depuis localStorage si null en mémoire
    let dataToSend = optimizationResult;
    if (!dataToSend) {
      const saved = localStorage.getItem('livraison_optimization_result');
      dataToSend = saved ? JSON.parse(saved) : null;
    }
    
    if (!dataToSend) {
      showAlert('Aucun résultat à envoyer.', 'error');
      return;
    }
    
    // 🔍 LOGS DÉTAILLÉS AVANT L'ENVOI
    console.log('==================== ENVOI AU CHAUFFEUR ====================');
    console.log('📍 URL:', `${API_BASE_URL}/vrp/send/result`);
    console.log('📦 Données à envoyer:', JSON.stringify(dataToSend, null, 2));
    console.log('📊 Nombre de véhicules:', vehicles.length);
    console.log('🚚 Véhicules:', vehicles.map(v => v.immatriculation).join(', '));
    console.log('📋 Total commandes:', vehicles.reduce((sum, v) => sum + v.commandes.length, 0));
    console.log('==========================================================');
    
    try {
      const response = await axios.post(
        `${API_BASE_URL}/vrp/send/result`, 
        dataToSend, 
        {
          headers: { 
            'Content-Type': 'application/json', 
            Authorization: `Bearer ${token}` 
          }
        }
      );
      
      // 🔍 LOGS DÉTAILLÉS APRÈS RÉCEPTION
      console.log('==================== RÉPONSE DU SERVEUR ====================');
      console.log('✅ Status:', response.status);
      console.log('📥 Données reçues:', JSON.stringify(response.data, null, 2));
      console.log('🔑 Headers:', response.headers);
      console.log('==========================================================');
      
      if (response.data.success) {
        showAlert('✅ Plan envoyé aux chauffeurs !', 'success');
        
        setStep('tracking');
        
        const deliveryTracking = {
          delivery_id: `DEL_${Date.now()}`,
          sent_at: new Date().toISOString(),
          vehicles: vehicles.map(v => v.immatriculation),
          total_commandes: vehicles.reduce((sum, v) => sum + v.commandes.length, 0),
          status: 'sent'
        };
        
        console.log('💾 Tracking créé:', deliveryTracking);
        
        setCurrentDelivery(deliveryTracking);
        localStorage.setItem('livraison_current_delivery', JSON.stringify(deliveryTracking));
        
      } else {
        console.error('❌ Échec:', response.data);
        showAlert(response.data.error || 'Erreur lors de l\'envoi', 'error');
      }
    } catch (error) {
      // 🔍 LOGS D'ERREUR DÉTAILLÉS
      console.error('==================== ERREUR ENVOI ====================');
      console.error('❌ Type d\'erreur:', error.message);
      if (error.response) {
        console.error('📛 Status HTTP:', error.response.status);
        console.error('📛 Données d\'erreur:', error.response.data);
        console.error('📛 Headers:', error.response.headers);
      } else if (error.request) {
        console.error('📛 Requête envoyée mais pas de réponse:', error.request);
      } else {
        console.error('📛 Erreur config:', error.message);
      }
      console.error('📛 Config complète:', error.config);
      console.error('=====================================================');
      
      showAlert('Erreur lors de l\'envoi au backend', 'error');
    }
  };

// NOUVEAU : Actualiser le statut depuis le backend
const handleTerminerLivraison = async () => {
  if (!currentDelivery) return;
  
  const token = getAuthToken();
  if (!token) return;
  
  try {
    const response = await axios.get(
      `${API_BASE_URL}/delivery-status/${currentDelivery.delivery_id}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    const updatedDelivery = response.data;
    setCurrentDelivery(updatedDelivery);
    localStorage.setItem('livraison_current_delivery', JSON.stringify(updatedDelivery));
    
    const allDelivered = updatedDelivery.commandes.every(c => c.status === 'delivered');
    
    if (allDelivered) {
      showAlert('🎉 Toutes les destinations ont été livrées !', 'success');
      setTimeout(() => {
        handleResetComplet();
      }, 2000);
    } else {
      const livrees = updatedDelivery.commandes.filter(c => c.status === 'delivered').length;
      showAlert(`Statut actualisé: ${livrees}/${updatedDelivery.commandes.length} livrées`, 'info');
    }
  } catch (error) {
    console.error('Erreur actualisation:', error);
    showAlert('Erreur lors de l\'actualisation', 'error');
  }
};

// NOUVEAU : Annuler la livraison en cours
const handleAnnulerLivraison = () => {
  if (window.confirm('Êtes-vous sûr de vouloir annuler cette livraison ?')) {
    handleResetComplet();
    showAlert('Livraison annulée', 'info');
  }
};

// NOUVEAU : Reset complet
const handleResetComplet = () => {
  setStep('initial'); 
  setOrders([]); 
  setVehicles([]); 
  setSelectedVehicle(null);
  setCurrentDelivery(null);
  setOptimizationResult(null); // NOUVEAU
  
  localStorage.removeItem('livraison_step');
  localStorage.removeItem('livraison_orders');
  localStorage.removeItem('livraison_vehicles');
  localStorage.removeItem('livraison_selectedVehicle');
  localStorage.removeItem('livraison_current_delivery');
  localStorage.removeItem('livraison_optimization_result'); // NOUVEAU
};

  const getActionButton = () => {
    if (step === 'initial' && orders.length === 0) {
      return (
        <button 
          className="livraison-btn livraison-btn-primary" 
          onClick={handleRecuperCommandes} 
          disabled={isLoadingOrders}
        >
          {isLoadingOrders ? 'Chargement...' : 'Récupérer les commandes'}
        </button>
      );
    }
    
    if (step === 'initial' && orders.length > 0) {
      return (
        <button 
          className="livraison-btn livraison-btn-success" 
          onClick={handleOptimiserItineraires} 
          disabled={isLoadingOptimization}
        >
          {isLoadingOptimization ? 'Optimisation en cours...' : 'Lancer optimisation'}
        </button>
      );
    }
    
    // Et simplifier le bouton
    if (step === 'optimized') {
      return (
        <button 
          className="livraison-btn livraison-btn-warning" 
          onClick={handleEnvoyerAuChauffeur}
        >
          📤 Envoyer au chauffeur
        </button>
      );
    }
    
    if (step === 'tracking') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          <div style={{
            padding: '15px',
            backgroundColor: '#d4edda',
            borderRadius: '8px',
            border: '1px solid #28a745'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
              ✅ Plan envoyé avec succès
            </div>
            <div style={{ fontSize: '14px', color: '#666' }}>
              Véhicules: {currentDelivery?.vehicles?.join(', ') || 'N/A'}
            </div>
            <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
              Total commandes: {currentDelivery?.total_commandes || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
              Envoyé le: {currentDelivery?.sent_at ? new Date(currentDelivery.sent_at).toLocaleString('fr-FR') : 'N/A'}
            </div>
          </div>
          
          <button 
            className="livraison-btn livraison-btn-danger" 
            onClick={handleAnnulerLivraison}
            style={{ marginTop: '10px' }}
          >
            ✖️ Terminer et réinitialiser
          </button>
        </div>
      );
    }
    
    return null;
  };

  // NOUVEAU : Section de suivi détaillé
  const TrackingDetailsSection = ({ delivery }) => {
    if (!delivery || !delivery.commandes) return null;
    
    return (
      <div className="livraison-section-card" style={{ marginTop: '20px' }}>
        <h3 className="livraison-section-title">
          📊 Détails de la livraison - {delivery.vehicle}
        </h3>
        
        <div style={{ 
          padding: '15px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <div style={{ fontSize: '14px', marginBottom: '5px' }}>
            <strong>ID:</strong> {delivery.delivery_id}
          </div>
          <div style={{ fontSize: '14px', marginBottom: '5px' }}>
            <strong>Assigné le:</strong> {new Date(delivery.assigned_at).toLocaleString('fr-FR')}
          </div>
          <div style={{ fontSize: '14px' }}>
            <strong>Statut:</strong> 
            <span style={{
              marginLeft: '10px',
              padding: '3px 10px',
              borderRadius: '12px',
              backgroundColor: delivery.status === 'completed' ? '#28a745' : '#ffc107',
              color: 'white',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>
              {delivery.status === 'completed' ? '✓ Complété' : '⏳ En cours'}
            </span>
          </div>
        </div>
        
        <div style={{ marginTop: '15px' }}>
          <h4 style={{ fontSize: '16px', marginBottom: '10px', color: '#333' }}>
            Destinations ({delivery.commandes.length})
          </h4>
          {delivery.commandes.map((cmd, idx) => (
            <div 
              key={idx} 
              style={{
                padding: '12px',
                marginBottom: '10px',
                backgroundColor: cmd.status === 'delivered' ? '#d4edda' : '#fff',
                border: '1px solid',
                borderColor: cmd.status === 'delivered' ? '#c3e6cb' : '#ddd',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                  #{cmd.order} - {cmd.client}
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '3px' }}>
                  📍 {cmd.lieu_livraison}
                </div>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  {cmd.article} • Qté: {cmd.quantite}
                </div>
                {cmd.delivered_at && (
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#28a745', 
                    marginTop: '5px',
                    fontStyle: 'italic'
                  }}>
                    ✅ Livré le {new Date(cmd.delivered_at).toLocaleString('fr-FR')}
                  </div>
                )}
              </div>
              
              <div style={{
                padding: '5px 15px',
                borderRadius: '20px',
                backgroundColor: cmd.status === 'delivered' ? '#28a745' : '#ffc107',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {cmd.status === 'delivered' ? '✓ Livré' : '⏳ En attente'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
    
      {(isLoadingOrders || isLoadingOptimization) && (
        <div className="livraison-loading-overlay">
          <div className="livraison-loading-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Loader size={48} className="spinning" style={{ color: '#10b981' }} />
            <p>{isLoadingOrders ? 'Chargement des commandes...' : 'Optimisation des itinéraires en cours...'}</p>
          </div>
        </div>
      )}
      {fullscreenContainer ? (
        <div className="livraison-fullscreen-overlay">
          {fullscreenContainer === 'orders' && <OrdersSection isFullscreen setFullscreenContainer={setFullscreenContainer} orders={orders} filterText={filterText} setFilterText={setFilterText} resetPaginationToggle={resetPaginationToggle} setResetPaginationToggle={setResetPaginationToggle} filteredOrders={filteredOrders} getActionButton={getActionButton} />}
          {fullscreenContainer === 'vehicles' && <VehiclesSection isFullscreen setFullscreenContainer={setFullscreenContainer} vehicles={vehicles} selectedVehicle={selectedVehicle} setSelectedVehicle={setSelectedVehicle} />}
          {fullscreenContainer === 'map' && <MapSection isFullscreen setFullscreenContainer={setFullscreenContainer} selectedVehicle={selectedVehicle} />}
          {fullscreenContainer === 'details' && <DetailsSection isFullscreen setFullscreenContainer={setFullscreenContainer} selectedVehicle={selectedVehicle} />}
        </div>
      ) : (
        <div className="livraison-container">
          <div className="livraison-left-section">
            <OrdersSection isFullscreen={false} setFullscreenContainer={setFullscreenContainer} orders={orders} filterText={filterText} setFilterText={setFilterText} resetPaginationToggle={resetPaginationToggle} setResetPaginationToggle={setResetPaginationToggle} filteredOrders={filteredOrders} getActionButton={getActionButton} />
            {step === 'optimized' && <VehiclesSection isFullscreen={false} setFullscreenContainer={setFullscreenContainer} vehicles={vehicles} selectedVehicle={selectedVehicle} setSelectedVehicle={setSelectedVehicle} />}
            {step === 'tracking' && currentDelivery && <TrackingDetailsSection delivery={currentDelivery} />}
          </div>
          {selectedVehicle && step === 'optimized' && (
            <div className="livraison-right-section">
              <MapSection isFullscreen={false} setFullscreenContainer={setFullscreenContainer} selectedVehicle={selectedVehicle} />
              <DetailsSection isFullscreen={false} setFullscreenContainer={setFullscreenContainer} selectedVehicle={selectedVehicle} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default Livraison;
