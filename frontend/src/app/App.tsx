/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Navbar, Footer } from '../layouts';
import { LoginPage, SignupPage } from '../features/auth';
import { ProtectedRoute, PublicRoute } from './router';
import { FabricLoader } from '../shared/components/FabricLoader';

// Lazy-load heavy pages so they don't block initial render
const LandingPage = lazy(() => import('../features/landing').then(m => ({ default: m.LandingPage })));
const SetupPage = lazy(() => import('../features/setup').then(m => ({ default: m.SetupPage })));

/**
 * Main App component
 */
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FabricLoader />}>
        <Routes>
          {/* Landing Page - redirect to /setup if logged in */}
          <Route
            path="/"
            element={
              <PublicRoute>
                <div className="min-h-screen font-sans">
                  <Navbar />
                  <main>
                    <LandingPage />
                  </main>
                  <Footer />
                </div>
              </PublicRoute>
            }
          />

          {/* Login Page - redirect to /setup if logged in */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

          {/* Signup Page - redirect to /setup if logged in */}
          <Route path="/register" element={<PublicRoute><SignupPage /></PublicRoute>} />

          {/* Setup Page - redirect to /login if not logged in */}
          <Route path="/setup" element={<ProtectedRoute><SetupPage /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
