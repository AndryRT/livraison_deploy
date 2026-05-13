import React, { useState, useEffect } from 'react'; // ← Ajout de useEffect
import './App.css';
import Login from './Page/Login';
import CreateAccount from './Page/account';
import { Routes, Route, Navigate } from 'react-router-dom';

// Imports from the other App.js
import MainLayout from './components/MainLayout';
import Livraison from './Page/Livraison';
import CollapsibleTable from './Page/Vehicules';
import Historique from './Page/Historique';
import Rapport from './Page/Rapport';
import Toast from './components/Toast';

function App() {
  const [token, setToken] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true); // ← Nouveau state pour le chargement

  // ✅ CECI EST LA SOLUTION - Vérifier le token au chargement
  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      setToken(savedToken);
    }
    setIsLoading(false);
  }, []);

  const addNotification = (message, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleLoginSuccess = (accessToken) => {
    setToken(accessToken);
    localStorage.setItem('authToken', accessToken); // ← Sauvegarder aussi ici
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('authToken'); // ← Supprimer le token
  };

  // ← Afficher un loader pendant la vérification
  if (isLoading) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="App">
      <div className="toast-container">
        {notifications.map(n => (
          <Toast 
            key={n.id} 
            message={n.message} 
            type={n.type} 
            onClose={() => removeNotification(n.id)} 
          />
        ))}
      </div>
      <Routes>
        <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
        <Route path="/register" element={<CreateAccount />} />
        <Route 
          path="/" 
          element={
            token ? (
              <MainLayout onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<Navigate to="/livraisons" replace />} />
          <Route path="livraisons" element={<Livraison token={token} />} />
          <Route path="vehicules" element={<CollapsibleTable token={token} addNotification={addNotification} />} />
          <Route path="commandes" element={<Historique token={token} addNotification={addNotification} />} />
          <Route path="rapports" element={<Rapport token={token} addNotification={addNotification} />} />
        </Route>
        <Route path="*" element={<Navigate to={token ? "/" : "/login"} replace />} />
      </Routes>
    </div>
  );
}

export default App;