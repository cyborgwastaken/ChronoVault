import { Link } from 'react-router-dom';

export default function NotFound() {
    return (
        <div className="grid-container" style={{ minHeight: '80vh' }}>
            
            {/* Left Panel - Stretches to bottom, text centered */}
            <header 
                className="hero-title glass-panel" 
                style={{ 
                    background: 'transparent', 
                    backdropFilter: 'none', 
                    gridColumn: 'span 8', 
                    borderBottom: 'none', 
                    justifyContent: 'center' // Vertically centers the 404 text
                }}
            >
                <h1 style={{ fontSize: 'clamp(4rem, 12vw, 10rem)' }}>
                    404.<br/>
                    <span style={{ color: 'var(--accent)' }}>Lost.</span>
                </h1>
            </header>
            
            {/* Right Panel - Stretches to bottom, text centered */}
            <div 
                className="hero-instruction glass-panel" 
                style={{ 
                    gridColumn: 'span 4', 
                    borderBottom: 'none', 
                    justifyContent: 'center' // Vertically centers the instructions
                }}
            >
                <div style={{ width: '100%' }}>
                    <div className="meta-label">Error Code: 404</div>
                    <p style={{ marginBottom: '2rem' }}>
                        The vault coordinates you entered are invalid, or the artifact has been permanently shredded from the network.
                    </p>
                    <Link to="/" className="btn" style={{ width: '100%', textAlign: 'center', boxSizing: 'border-box' }}>
                        Return to Safety
                    </Link>
                </div>
            </div>
            
        </div>
    );
}