import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import Map from './Map.jsx';
import withSplashScreen from './withSplashScreen.jsx';
import { AuthProvider } from './AuthContext.jsx';

const MapWithSplash = withSplashScreen(Map);

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <MapWithSplash />
  </AuthProvider>
);
