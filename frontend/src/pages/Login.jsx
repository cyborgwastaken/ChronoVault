import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function Login() {
    const { user, loading, signInWithGoogle } = useAuth();

    if (loading) {
        return (
            <div className="flex h-[80vh] w-full items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs font-medium text-muted-foreground tracking-widest uppercase">
                        Initializing Secure Session
                    </p>
                </div>
            </div>
        );
    }

    if (user) return <Navigate to="/" replace />;

    return (
        <div className="flex min-h-[85vh] items-center justify-center px-4">
            <div className="w-full max-w-sm space-y-6 animate-fade-in">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20 mb-4">
                        <svg className="h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Access Protocol
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Authenticate with Google to manage your encrypted vaults
                    </p>
                </div>

                {/* Google Sign In */}
                <Button
                    variant="outline"
                    type="button"
                    className="w-full h-11 text-sm font-medium"
                    onClick={signInWithGoogle}
                >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        <path d="M1 1h22v22H1z" fill="none" />
                    </svg>
                    Continue with Google
                </Button>

                {/* Info Card */}
                <Card className="border-border/25 bg-card/40 backdrop-blur-md">
                    <CardHeader className="pb-2 text-center">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-primary">
                            New Agent Bonus
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <p className="text-xs text-center text-muted-foreground mb-3 leading-relaxed">
                            First authentication grants <strong className="text-foreground">150 credits</strong> for network operations.
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="rounded-md bg-muted/50 border border-border/25 py-2.5 px-2">
                                <div className="text-lg font-bold font-mono">40</div>
                                <div className="text-[10px] text-muted-foreground uppercase mt-0.5">Cost / Upload</div>
                            </div>
                            <div className="rounded-md bg-muted/50 border border-border/25 py-2.5 px-2">
                                <div className="text-lg font-bold font-mono">10</div>
                                <div className="text-[10px] text-muted-foreground uppercase mt-0.5">Cost / Retrieve</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <p className="text-center text-[11px] text-muted-foreground leading-relaxed px-4">
                    By signing in, you agree to our encryption protocols and smart contract execution logic.
                </p>
            </div>
        </div>
    );
}
