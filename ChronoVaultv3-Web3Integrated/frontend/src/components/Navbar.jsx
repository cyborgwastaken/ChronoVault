import { Link, useLocation } from 'react-router-dom';
import WalletButton from './WalletButton'; // <-- Import the new button

export default function Navbar() {
    const location = useLocation();

    const allLinks = [
        { path: '/', label: 'Home' },
        { path: '/upload', label: 'Upload' },
        { path: '/retrieve', label: 'Retrieve' }
    ];

    const visibleLinks = allLinks.filter(link => link.path !== location.pathname);

    return (
        <nav className="navbar">
            <Link to="/" className="nav-brand" style={{ color: 'white', textDecoration: 'none' }}>
                CHRONOVAULT®
            </Link>
            
            <div className="nav-links" style={{ display: 'flex', alignItems: 'center' }}>
                <Link to={visibleLinks[0].path} style={{ color: 'white', textDecoration: 'none' }}>
                    {visibleLinks[0].label}
                </Link>
                
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                
                <Link to={visibleLinks[1].path} style={{ color: 'white', textDecoration: 'none' }}>
                    {visibleLinks[1].label}
                </Link>

                {/* The new Connect Button lives here */}
                <WalletButton />
            </div>
        </nav>
    );
}