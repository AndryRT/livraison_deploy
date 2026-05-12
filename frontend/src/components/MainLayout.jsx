
import React from 'react';
import { Outlet } from 'react-router-dom';
import AppNavbar from './Navbar';

const MainLayout = ({ onLogout }) => {
  return (
    <div>
      <AppNavbar onLogout={onLogout} />
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
