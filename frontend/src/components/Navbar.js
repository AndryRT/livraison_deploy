import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';
import '../styles/Navbar.css';
import logo from '../assets/logo/logo.png';

const Navbar = ({ onLogout }) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const menuItems = [
    { name: 'Livraisons', path: '/livraisons' },
    { name: 'Véhicules', path: '/vehicules' },
    { name: 'Commandes', path: '/commandes' }
  ];

  const handleLogoutClick = () => {
    setShowDropdown(false);
    setShowLogoutModal(true);
  };

  const handleProfileClick = () => {
    setShowDropdown(false);
    // Naviguer vers la page profil ou afficher le profil
    console.log('Naviguer vers profil');
  };

  const handleConfirmLogout = () => {
    onLogout();
    navigate('/login', { replace: true });
  };

  const handleCancelLogout = () => {
    setShowLogoutModal(false);
  };

  const toggleDropdown = () => {
    setShowDropdown((prev) => !prev);
  };

  // Fermer le dropdown si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container">
          <div className="navbar-brand">
            <img src={logo} alt="Logo" className="navbar-logo" />
          </div>

          {/* Menu principal */}
          <ul className="navbar-menu">
            {menuItems.map((item) => (
              <li key={item.name} className="navbar-item">
                <NavLink
                  to={item.path}
                  className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
                >
                  {item.name}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Menu profil avec dropdown */}
          <div className="navbar-profile" ref={dropdownRef}>
            <button 
              className="profile-btn" 
              onClick={toggleDropdown}
              aria-label="Menu profil"
              type="button"
            >
              <User size={20} />
            </button>

            {showDropdown && (
              <div className="profile-dropdown">
                <button 
                  className="dropdown-item"
                  onClick={handleProfileClick}
                  type="button"
                >
                  <User size={18} />
                  <span>Profil</span>
                </button>
                <button 
                  className="dropdown-item logout-item"
                  onClick={handleLogoutClick}
                  type="button"
                >
                  <LogOut size={18} />
                  <span>Se déconnecter</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Modale de confirmation */}
      {showLogoutModal && (
        <div className="logout-modal-overlay" onClick={handleCancelLogout}>
          <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
            <div className="logout-modal-header">
              <h3>Confirmation de déconnexion</h3>
            </div>
            <div className="logout-modal-body">
              <p>Êtes-vous sûr de vouloir vous déconnecter ?</p>
            </div>
            <div className="logout-modal-footer">
              <button 
                className="logout-modal-btn cancel-btn" 
                onClick={handleCancelLogout}
                type="button"
              >
                Annuler
              </button>
              <button 
                className="logout-modal-btn confirm-btn" 
                onClick={handleConfirmLogout}
                type="button"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;