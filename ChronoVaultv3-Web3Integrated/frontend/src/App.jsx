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
import './index.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="bg-gradient"></div>

        {/* Navbar stays constant across all pages */}
        <Navbar />

        {/* Only the content inside Routes changes when you navigate */}
        <div style={{ minHeight: '80vh' }}>
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
        </div>

        {/* Footer stays constant across all pages */}
        <Footer />
      </AuthProvider>
    </Router>
  );
}

export default App;