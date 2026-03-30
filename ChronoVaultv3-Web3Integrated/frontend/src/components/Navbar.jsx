import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import WalletButton from './WalletButton';
import { ModeToggle } from './ModeToggle';
import { Button } from '@/components/ui/button';
import { Menu, X, LogOut } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function Navbar() {
    const location = useLocation();
    const { user, profile, signOut, isAdmin } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef(null);

    const navLinks = [
        { path: '/', label: 'Home' },
        { path: '/upload', label: 'Upload' },
        { path: '/retrieve', label: 'Retrieve' },
    ];

    if (isAdmin) {
        navLinks.push({ path: '/admin', label: 'Admin' });
    }

    const isActive = (path) => location.pathname === path;

    // Close profile dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close profile dropdown on route change
    useEffect(() => {
        setProfileOpen(false);
        setMobileOpen(false);
    }, [location.pathname]);

    return (
        <nav className="sticky top-0 z-[100] w-full border-b border-border/20 bg-background/50 backdrop-blur-xl">
            <div className="px-4 sm:px-8 h-16 flex items-center">

                {/* Left: Logo + Nav Links */}
                <div className="flex items-center gap-8">
                    <Link to="/" className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-lg font-bold tracking-tight">CHRONO</span>
                        <span className="text-lg font-bold tracking-tight text-gradient">VAULT</span>
                    </Link>

                    <div className="hidden md:flex items-center gap-1">
                        {navLinks.map(link => (
                            <Link
                                key={link.path}
                                to={link.path}
                                className={`text-sm font-medium px-3.5 py-1.5 rounded-md transition-colors ${
                                    isActive(link.path)
                                        ? 'text-primary bg-primary/8'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                                }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Right: Actions */}
                <div className="flex items-center gap-3">
                    {user && profile && (
                        <span className="hidden sm:inline text-xs font-medium text-muted-foreground">
                            <span className={
                                profile.credits <= 0 ? 'text-destructive font-mono' :
                                profile.credits < 10 ? 'text-amber-500 font-mono' : 'text-primary font-mono'
                            }>
                                {profile.credits}
                            </span>
                            {' '}credits
                        </span>
                    )}

                    <WalletButton />
                    <ModeToggle />

                    {user ? (
                        <div className="relative" ref={profileRef}>
                            <button
                                onClick={() => setProfileOpen(!profileOpen)}
                                className="flex items-center justify-center rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {profile?.avatar_url ? (
                                    <img
                                        src={profile.avatar_url}
                                        alt="Profile"
                                        className="w-8 h-8 rounded-full border border-border/25 object-cover"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center border border-border/25">
                                        {profile?.full_name?.[0] || profile?.email?.[0] || '?'}
                                    </div>
                                )}
                            </button>

                            {/* Profile dropdown */}
                            {profileOpen && (
                                <div className="absolute right-0 top-full mt-2 w-44 rounded-lg border border-border/25 bg-card/80 backdrop-blur-xl shadow-lg p-1.5 animate-fade-in">
                                    <div className="px-3 py-2 border-b border-border/20 mb-1">
                                        <p className="text-xs font-medium truncate">{profile?.full_name || 'User'}</p>
                                        <p className="text-[11px] text-muted-foreground truncate">{profile?.email}</p>
                                    </div>
                                    <button
                                        onClick={signOut}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-md transition-colors"
                                    >
                                        <LogOut className="w-3.5 h-3.5" />
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link to="/login">
                            <Button size="sm" className="text-xs h-8">
                                Sign In
                            </Button>
                        </Link>
                    )}

                    {/* Mobile menu button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden h-8 w-8"
                        onClick={() => setMobileOpen(!mobileOpen)}
                    >
                        {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* Mobile Nav */}
            {mobileOpen && (
                <div className="md:hidden border-t border-border/20 bg-background/60 backdrop-blur-xl px-4 py-3 space-y-1 animate-fade-in">
                    {navLinks.map(link => (
                        <Link
                            key={link.path}
                            to={link.path}
                            onClick={() => setMobileOpen(false)}
                            className={`block text-sm font-medium px-3 py-2 rounded-md transition-colors ${
                                isActive(link.path)
                                    ? 'text-primary bg-primary/8'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                            }`}
                        >
                            {link.label}
                        </Link>
                    ))}
                    {user && (
                        <button
                            onClick={() => { signOut(); setMobileOpen(false); }}
                            className="flex items-center gap-2 w-full text-left text-sm font-medium px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign Out
                        </button>
                    )}
                </div>
            )}
        </nav>
    );
}