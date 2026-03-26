import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabase';

export default function Navbar({ session, credits }) {
    const location = useLocation();

    const allLinks = [
        { path: '/', label: 'Home' },
        { path: '/upload', label: 'Upload' },
        { path: '/retrieve', label: 'Retrieve' }
    ];

    const visibleLinks = allLinks.filter(link => link.path !== location.pathname);

    // Trigger Supabase Google OAuth
    const handleLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
        });
        if (error) alert("Error logging in!");
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <nav className="navbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link to="/" className="nav-brand" style={{ color: 'white', textDecoration: 'none' }}>
                CHRONOVAULT®
            </Link>
            
            <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <Link to={visibleLinks[0].path} style={{ color: 'white', textDecoration: 'none' }}>
                    {visibleLinks[0].label}
                </Link>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                <Link to={visibleLinks[1].path} style={{ color: 'white', textDecoration: 'none' }}>
                    {visibleLinks[1].label}
                </Link>

                {/* --- NEW SaaS AUTHENTICATION UI --- */}
                <div style={{ 
                    marginLeft: '2rem', 
                    borderLeft: '1px solid rgba(255,255,255,0.1)', 
                    paddingLeft: '2rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1rem' 
                }}>
                    {!session ? (
                        <button className="btn-outline" onClick={handleLogin} style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)' }}>
                            {/* Google G Logo SVG */}
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Sign In
                        </button>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 1rem 0.3rem 0.3rem', borderRadius: '50px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <img src={session.user.user_metadata.avatar_url} alt="Profile" style={{ width: '30px', height: '30px', borderRadius: '50%' }} />
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', lineHeight: '1' }}>{session.user.user_metadata.full_name}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--success)', marginTop: '0.1rem', fontWeight: 'bold' }}>₹{credits} Credits</span>
                                </div>
                            </div>
                            <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.5rem', transition: '0.2s' }} onMouseOver={(e) => e.target.style.color = 'var(--accent)'} onMouseOut={(e) => e.target.style.color = 'rgba(255,255,255,0.5)'}>
                                Logout
                            </button>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}