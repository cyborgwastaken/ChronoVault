import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';

export default function ProtectedRoute({ children, adminOnly = false }) {
    const { user, profile, loading, isAdmin } = useAuth();
    const [timedOut, setTimedOut] = useState(false);

    // Safety timeout — never show "Authenticating..." for more than 5 seconds
    useEffect(() => {
        if (loading) {
            const timer = setTimeout(() => setTimedOut(true), 5000);
            return () => clearTimeout(timer);
        }
    }, [loading]);

    if (loading && !timedOut) {
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
                    <p className="meta-label">Authenticating...</p>
                </div>
            </div>
        );
    }

    // If timed out or no user, redirect to login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (adminOnly && !isAdmin) {
        return <Navigate to="/" replace />;
    }

    return children;
}
