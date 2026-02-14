import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
    // Get the current URL path (e.g., '/', '/upload', or '/retrieve')
    const location = useLocation();

    // Define all available pages
    const allLinks = [
        { path: '/', label: 'Home' },
        { path: '/upload', label: 'Upload' },
        { path: '/retrieve', label: 'Retrieve' }
    ];

    // Filter out the link that matches the current page
    const visibleLinks = allLinks.filter(link => link.path !== location.pathname);

    return (
        <nav className="navbar">
            <Link to="/" className="nav-brand" style={{ color: 'white', textDecoration: 'none' }}>
                CHRONOVAULT®
            </Link>
            
            <div className="nav-links">
                {/* Dynamically render the two remaining links with a separator */}
                <Link to={visibleLinks[0].path} style={{ color: 'white', textDecoration: 'none' }}>
                    {visibleLinks[0].label}
                </Link>
                
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                
                <Link to={visibleLinks[1].path} style={{ color: 'white', textDecoration: 'none' }}>
                    {visibleLinks[1].label}
                </Link>
            </div>
        </nav>
    );
}