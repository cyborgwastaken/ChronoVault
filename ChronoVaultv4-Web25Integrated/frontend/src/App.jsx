import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from './supabase';

import Home from './pages/Home.jsx';
import Upload from './pages/Upload.jsx';
import Retrieve from './pages/Retrieve.jsx';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import NotFound from './pages/NotFound.jsx';
import './index.css';

function App() {
  const [session, setSession] = useState(null);
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    // 1. Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserData(session.user.id);
    });

    // 2. Listen for Google Login/Logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserData(session.user.id);
      } else {
        setCredits(0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 3. Fetch the live credit balance from our new Postgres table
  const fetchUserData = async (userId) => {
    const { data, error } = await supabase
      .from('users')
      .select('credits')
      .eq('id', userId)
      .single();

    if (data) setCredits(data.credits);
    if (error) console.error("Error fetching credits:", error);
  };

  return (
    <Router>
      <div className="bg-gradient"></div>
      
      {/* Pass the auth state down to the Navbar */}
      <Navbar session={session} credits={credits} />

      <div style={{ minHeight: '80vh' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/retrieve" element={<Retrieve />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
      </div>

      <Footer />
      
    </Router>
  );
}

export default App;