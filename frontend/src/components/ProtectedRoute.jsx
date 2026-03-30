import { useAuth } from '../context/AuthContext'; 
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children, adminOnly }) {
    const { user, profile, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex h-[80vh] w-full items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-medium tracking-widest uppercase">Authorizing Session...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (adminOnly && profile?.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    return children;
}
