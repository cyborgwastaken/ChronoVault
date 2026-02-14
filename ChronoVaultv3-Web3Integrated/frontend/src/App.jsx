import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Upload from './pages/Upload.jsx';
import Retrieve from './pages/Retrieve.jsx';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import NotFound from './pages/NotFound.jsx';
import './index.css';

function App() {
  return (
    <Router>
      <div className="bg-gradient"></div>
      
      {/* Navbar stays constant across all pages */}
      <Navbar />

      {/* Only the content inside Routes changes when you navigate */}
      <div style={{ minHeight: '80vh' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/retrieve" element={<Retrieve />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
      </div>

      {/* Footer stays constant across all pages */}
      <Footer />
      
    </Router>
  );
}

export default App;