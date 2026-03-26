import { Link } from 'react-router-dom';

export default function Home() {
    return (
        <>
            {/* Hero Section */}
            <div className="grid-container">
                <header className="hero-title glass-panel" style={{ background: 'transparent', backdropFilter: 'none', gridColumn: 'span 8' }}>
                    <h1>Secure.<br/>Digital.<br/><span style={{ color: 'rgba(255,255,255,0.2)' }}>Future.</span></h1>
                </header>
                
                <div className="hero-meta glass-panel" style={{ gridColumn: 'span 4' }}>
                    <div className="meta-label">01 — What is ChronoVault !?</div>
                    <p>
                        ChronoVault creates “vaults” of digital memories and assets, accessible only via specific triggers—time, biometrics, or real-life events. 
                        Integrating blockchain for unmatched transparency, immutability, and user sovereignty.
                    </p>
                    <div style={{ marginTop: '2rem' }}>
                        <Link to="/upload" className="btn">Upload</Link>
                        <Link to="/retrieve" className="btn btn-outline" style={{ marginLeft: '1rem' }}>Retrieve</Link>
                    </div>
                </div>
            </div>

            {/* Core Features Grid */}
            <div className="grid-container">
                <div className="glass-panel feature-large" style={{ gridColumn: 'span 6' }}>
                    <div className="feature-icon" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
                    <div className="feature-content">
                        <div className="meta-label">02 — Encryption</div>
                        <h3>Passphrase Vault</h3>
                        <p>Assets encrypted with a customizable secret word. Simple, effective, and completely private access.</p>
                    </div>
                </div>
                <div className="glass-panel feature-large" style={{ gridColumn: 'span 6', borderRight: 'none' }}>
                    <div className="feature-icon" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤝</div>
                    <div className="feature-content">
                        <div className="meta-label">03 — Consensus</div>
                        <h3>Multi-Signature</h3>
                        <p>Collaborative security requiring strict consensus (e.g., 3-of-5 approvals) before data release.</p>
                    </div>
                </div>
                <div className="glass-panel feature-small" style={{ gridColumn: 'span 3' }}>
                    <div className="feature-content">
                        <div className="meta-label">04</div>
                        <h3>AI Guardian</h3>
                        <p>Emotional intelligence & gatekeeping.</p>
                    </div>
                </div>
                <div className="glass-panel feature-small" style={{ gridColumn: 'span 3' }}>
                    <div className="feature-content">
                        <div className="meta-label">05</div>
                        <h3>Geo-Lock</h3>
                        <p>Physical location check (GPS).</p>
                    </div>
                </div>
                <div className="glass-panel feature-small" style={{ gridColumn: 'span 3' }}>
                    <div className="feature-content">
                        <div className="meta-label">06</div>
                        <h3>Biometric</h3>
                        <p>FaceID, fingerprint, retina access.</p>
                    </div>
                </div>
                <div className="glass-panel feature-small" style={{ gridColumn: 'span 3', borderRight: 'none' }}>
                    <div className="feature-content">
                        <div className="meta-label">07</div>
                        <h3>Hardware</h3>
                        <p>NFC/RFID Physical keys.</p>
                    </div>
                </div>
            </div>

            {/* Expanded Vault Index */}
            <div className="grid-container">
                <div className="section-header glass-panel" style={{ gridColumn: 'span 4' }}>
                    <h2>Vault<br/>Index</h2>
                    <p style={{ marginTop: '1rem' }}>Comprehensive architecture configurations for diverse deployment needs.</p>
                </div>
                <div className="section-content" style={{ gridColumn: 'span 8', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <div className="list-item glass-panel">
                        <div className="meta-label">Oracle Trigger</div>
                        <h3>Life Event</h3>
                        <p>Graduation, breakup, milestone.</p>
                    </div>
                    <div className="list-item glass-panel" style={{ borderRight: 'none' }}>
                        <div className="meta-label">Sequential</div>
                        <h3>Capsule Chain</h3>
                        <p>Event-driven serial unlocking.</p>
                    </div>
                    <div className="list-item glass-panel" style={{ borderBottom: 'none' }}>
                        <div className="meta-label">Ephemeral</div>
                        <h3>Auto-Destruct</h3>
                        <p>One-time access for confidentiality.</p>
                    </div>
                    <div className="list-item glass-panel" style={{ borderBottom: 'none', borderRight: 'none' }}>
                        <div className="meta-label">Organization</div>
                        <h3>Groups/Rooms</h3>
                        <p>Thematic categorization.</p>
                    </div>
                </div>
            </div>

            {/* Blockchain Integration */}
            <div className="grid-container">
                <div className="section-header glass-panel" style={{ gridColumn: 'span 4' }}>
                    <h2>Chain<br/>Logic</h2>
                    <p style={{ marginTop: '1rem' }}>Built on decentralized infrastructure.</p>
                </div>
                <div className="section-content" style={{ gridColumn: 'span 8', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <div className="list-item glass-panel">
                        <h3>Immutability</h3>
                        <p>Data hashes timestamped for permanent, auditable proof.</p>
                    </div>
                    <div className="list-item glass-panel" style={{ borderRight: 'none' }}>
                        <h3>Smart Contracts</h3>
                        <p>Automate unlock logic ensuring impartial enforcement.</p>
                    </div>
                    <div className="list-item glass-panel" style={{ borderBottom: 'none' }}>
                        <h3>Oracles</h3>
                        <p>Link real-world events directly to contract logic.</p>
                    </div>
                    <div className="list-item glass-panel" style={{ borderBottom: 'none', borderRight: 'none' }}>
                        <h3>Sovereignty</h3>
                        <p>Users retain full control of private encryption keys.</p>
                    </div>
                </div>
            </div>

            {/* Use Cases */}
            <div className="grid-container" style={{ borderBottom: 'none' }}>
                <div className="section-header glass-panel" style={{ gridColumn: 'span 4', borderBottom: 'none' }}>
                    <h2>Use<br/>Cases</h2>
                </div>
                <div className="section-content" style={{ gridColumn: 'span 8', display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: 'none' }}>
                    <div className="list-item glass-panel">
                        <h3>Students</h3>
                        <p>“Open on graduation” advice capsules.</p>
                    </div>
                    <div className="list-item glass-panel" style={{ borderRight: 'none' }}>
                        <h3>Families</h3>
                        <p>Consensus-based inheritance and group vaults.</p>
                    </div>
                    <div className="list-item glass-panel" style={{ borderBottom: 'none' }}>
                        <h3>Elderly</h3>
                        <p>Legacy messages released after inactivity.</p>
                    </div>
                    <div className="list-item glass-panel" style={{ borderBottom: 'none', borderRight: 'none' }}>
                        <h3>Relationships</h3>
                        <p>Time capsules for anniversaries or milestones.</p>
                    </div>
                </div>
            </div>
        </>
    );
}