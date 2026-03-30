import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import WalletButton from './WalletButton';

export default function Navbar() {
    const location = useLocation();
    const { user, profile, signOut, isAdmin } = useAuth();

    const allLinks = [
        { path: '/', label: 'Home' },
        { path: '/upload', label: 'Upload' },
        { path: '/time-lock', label: 'Time Lock' },
        { path: '/geo-lock', label: 'Geo Lock' },
        { path: '/retrieve', label: 'Retrieve' },
    ];

    if (isAdmin) {
        allLinks.push({ path: '/admin', label: 'Admin' });
    }

    const visibleLinks = allLinks.filter(link => link.path !== location.pathname);

    return (
        <nav className="navbar">
            <Link to="/" className="nav-brand" style={{ color: 'white', textDecoration: 'none' }}>
                CHRONOVAULT®
            </Link>

            <div className="nav-links" style={{ display: 'flex', alignItems: 'center' }}>
                {visibleLinks.map((link, i) => (
                    <span key={link.path} style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        {i > 0 && <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>}
                        <Link to={link.path} style={{ color: 'white', textDecoration: 'none' }}>
                            {link.label}
                        </Link>
                    </span>
                ))}

                {user && profile && (
                    <>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>

                        {/* Credits Badge */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.35rem 0.8rem',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '20px',
                            fontSize: '0.8rem', fontWeight: '700',
                        }}>
                            <span style={{
                                color: profile.credits <= 0 ? 'var(--accent)' :
                                    profile.credits < 10 ? '#ff9f0a' : '#32d74b'
                            }}>
                                ⬡ {profile.credits}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>credits</span>
                        </div>
                    </>
                )}

                {/* Wallet Connect Button */}
                <WalletButton />

                {/* User Profile / Auth */}
                {user ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                        {profile?.avatar_url && (
                            <img
                                src={profile.avatar_url}
                                alt=""
                                style={{
                                    width: '32px', height: '32px', borderRadius: '50%',
                                    border: '2px solid rgba(255,255,255,0.2)',
                                    objectFit: 'cover'
                                }}
                            />
                        )}
                        <button
                            onClick={signOut}
                            className="btn-outline"
                            style={{
                                padding: '0.3rem 0.8rem', fontSize: '0.75rem',
                                borderColor: 'rgba(255,59,48,0.4)',
                                color: 'var(--accent)'
                            }}
                        >
                            Sign Out
                        </button>
                    </div>
                ) : (
                    <Link to="/login" className="btn" style={{
                        padding: '0.4rem 1rem', fontSize: '0.8rem',
                        textDecoration: 'none'
                    }}>
                        Sign In
                    </Link>
                )}
            </div>
        </nav>
    );
}