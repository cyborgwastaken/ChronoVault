import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home.jsx';
import Upload from './pages/Upload.jsx';
import Retrieve from './pages/Retrieve.jsx';
import Login from './pages/Login.jsx';
import Admin from './pages/Admin.jsx';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import NotFound from './pages/NotFound.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { Toaster } from '@/components/ui/sonner';
import { BeamsBackground } from '@/components/ui/beams-background';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <BeamsBackground intensity="subtle">
          {/* Noise grain overlay for texture */}
          <div className="noise-overlay" />

          <Toaster
            position="top-right"
            toastOptions={{
              className: 'font-sans',
              style: {
                fontFamily: '"DM Sans", system-ui, sans-serif',
              },
            }}
          />

          <Navbar />

          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/upload" element={
                <ProtectedRoute>
                  <Upload />
                </ProtectedRoute>
              } />
              <Route path="/retrieve" element={
                <ProtectedRoute>
                  <Retrieve />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute adminOnly>
                  <Admin />
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>

          <Footer />
        </BeamsBackground>
      </AuthProvider>
    </Router>
  );
}

export default App;