import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Login() {
    const { user, loading, signInWithGoogle } = useAuth();

    if (loading) {
        return (
            <div className="grid-container" style={{ minHeight: '80vh' }}>
                <div className="glass-panel" style={{
                    gridColumn: 'span 12', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem'
                }}>
                    <div style={{
                        width: '40px', height: '40px',
                        border: '3px solid rgba(255,255,255,0.1)',
                        borderLeftColor: 'var(--accent)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        marginBottom: '1rem'
                    }} />
                    <p className="meta-label">Loading...</p>
                </div>
            </div>
        );
    }

    if (user) return <Navigate to="/" replace />;

    return (
        <>
            <div className="grid-container" style={{ minHeight: '85vh' }}>
                <header className="hero-title glass-panel" style={{
                    background: 'transparent', backdropFilter: 'none',
                    gridColumn: 'span 7', display: 'flex', flexDirection: 'column',
                    justifyContent: 'center', borderBottom: 'none'
                }}>
                    <h1>Access.<br /><span style={{ color: 'rgba(255,255,255,0.2)' }}>Vault.</span></h1>
                </header>

                <div className="glass-panel" style={{
                    gridColumn: 'span 5', display: 'flex', flexDirection: 'column',
                    justifyContent: 'center', alignItems: 'center', padding: '4rem',
                    borderBottom: 'none', borderRight: 'none'
                }}>
                    <div style={{ width: '100%', maxWidth: '380px' }}>
                        {/* Logo / Icon */}
                        <div style={{
                            width: '80px', height: '80px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--accent), #0064ff)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 2rem auto', fontSize: '2rem',
                            boxShadow: '0 0 40px rgba(255, 59, 48, 0.3)'
                        }}>
                            🔐
                        </div>

                        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Sign In</h2>
                        <p style={{
                            textAlign: 'center', marginBottom: '2.5rem',
                            fontSize: '0.9rem', color: 'var(--text-muted)'
                        }}>
                            Authenticate to access the ChronoVault network and manage your encrypted vaults.
                        </p>

                        {/* Google Sign-In Button */}
                        <button
                            onClick={signInWithGoogle}
                            style={{
                                width: '100%',
                                padding: '1rem 1.5rem',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.75rem',
                                transition: 'all 0.3s ease',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            {/* Google Icon SVG */}
                            <svg width="20" height="20" viewBox="0 0 48 48">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                            </svg>
                            Continue with Google
                        </button>

                        {/* Info */}
                        <div style={{
                            marginTop: '2rem', padding: '1rem',
                            background: 'rgba(255,59,48,0.05)',
                            border: '1px solid rgba(255,59,48,0.15)',
                            borderRadius: '8px'
                        }}>
                            <div className="meta-label" style={{ marginBottom: '0.5rem', fontSize: '0.7rem' }}>
                                Welcome Bonus
                            </div>
                            <p style={{ fontSize: '0.85rem', margin: 0 }}>
                                New accounts receive <strong style={{ color: '#fff' }}>150 credits</strong> to get started.
                                Upload costs 40 credits, download costs 10 credits.
                            </p>
                        </div>

                        {/* Credit Pricing */}
                        <div style={{
                            marginTop: '1rem', display: 'grid',
                            gridTemplateColumns: '1fr 1fr', gap: '0.75rem'
                        }}>
                            <div style={{
                                padding: '0.75rem', textAlign: 'center',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '6px'
                            }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#fff' }}>40</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                    credits / upload
                                </div>
                            </div>
                            <div style={{
                                padding: '0.75rem', textAlign: 'center',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '6px'
                            }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#fff' }}>10</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                    credits / download
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
