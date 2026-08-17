import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './state/AuthContext';
import { supabaseConfigured } from './lib/supabase';
import BuilderPage from './pages/BuilderPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (!supabaseConfigured) return children;
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={24} className="animate-spin text-brand" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><BuilderPage /></RequireAuth>} />
          <Route path="/invoice/:id" element={<RequireAuth><BuilderPage /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
