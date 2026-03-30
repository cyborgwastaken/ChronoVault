import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

export default function Retrieve() {
    const { profile, deductCredits, linkWallet } = useAuth();

    const [vaults, setVaults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [walletConnected, setWalletConnected] = useState(false);

    const [selectedVault, setSelectedVault] = useState(null);
    const [keyFile, setKeyFile] = useState(null);
    const [manifestFile, setManifestFile] = useState(null);
    const [isRebuilding, setIsRebuilding] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [txStatus, setTxStatus] = useState("");
    const [restoreSuccess, setRestoreSuccess] = useState(null);
    const [filter, setFilter] = useState('all');

    const manifestInputRef = useRef(null);
    const keyInputRef = useRef(null);

    const DOWNLOAD_COST = 10;

    useEffect(() => {
        checkWalletAndFetch();
    }, []);

    const checkWalletAndFetch = async () => {
        if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                setWalletConnected(true);
                fetchVaults();
            }
        }
    };

    const fetchVaults = async () => {
        setIsLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const walletAddress = await signer.getAddress();

            if (profile && (!profile.wallet_address || profile.wallet_address !== walletAddress)) {
                await linkWallet(walletAddress);
            }

            // Fetch blockchain vaults
            const blockchainByRoot = new Map();
            try {
                const contract = new ethers.Contract(CONTRACT_ADDRESS, [
                    "function getMyVaults() view returns (tuple(uint256 id,address owner,string fileName,string category,string originalHash,string rootHash,string manifestCID,uint256 timestamp,bool isActive)[])"
                ], signer);

                const data = await contract.getMyVaults();

                data.filter(v => v.isActive).forEach(v => {
                    const ts = Number(v.timestamp) * 1000;
                    blockchainByRoot.set(v.rootHash, {
                        id: v.id.toString(),
                        fileName: v.fileName,
                        category: v.category,
                        originalHash: v.originalHash,
                        rootHash: v.rootHash,
                        manifestCID: v.manifestCID,
                        date: new Date(ts).toLocaleString(),
                        timestamp: ts,
                        onChain: true
                    });
                });
            } catch (err) {}

            // Fetch Supabase vaults and merge with blockchain data
            const allVaults = [];
            const seenRoots = new Set();

            if (profile?.id) {
                const { data: dbVaults } = await supabase
                    .from('vaults')
                    .select('*')
                    .eq('user_id', profile.id);

                (dbVaults || []).forEach(db => {
                    seenRoots.add(db.root_hash);
                    const ts = new Date(db.created_at).getTime();
                    allVaults.push({
                        id: "db_" + db.id,
                        fileName: db.file_name,
                        category: db.geo_enabled ? "GeoLock" : db.timer_enabled ? "TimeLock" : "Standard",
                        originalHash: db.original_hash,
                        rootHash: db.root_hash,
                        manifestCID: db.manifest_cid,
                        date: new Date(ts).toLocaleString(),
                        timestamp: ts,
                        timer_enabled: db.timer_enabled,
                        unlock_time: db.unlock_time,
                        geo_enabled: db.geo_enabled,
                        latitude: db.latitude,
                        longitude: db.longitude,
                        onChain: blockchainByRoot.has(db.root_hash)
                    });
                });
            }

            allVaults.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            setVaults(allVaults);

        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = async () => {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        setWalletConnected(true);
        fetchVaults();
    };

    const handleUnlockClick = (vault) => {
        if (vault.timer_enabled) {
            const now = new Date();
            const unlockTime = new Date(vault.unlock_time);

            if (now < unlockTime) {
                const seconds = Math.ceil((unlockTime - now) / 1000);
                alert(`Vault locked. Try again in ${seconds}s`);
                return;
            }
        }

        setRestoreSuccess(null);
        setSelectedVault(selectedVault === vault ? null : vault);
        setKeyFile(null);
        setManifestFile(null);
    };

    const handleDelete = async (vault) => {
        if (!vault.manifestCID) {
            alert("No manifest data found. Unable to purge shards from IPFS.");
            return;
        }
        
        const ok = window.confirm(`WARNING: Are you sure you want to permanently delete '${vault.fileName}'? This will destroy the shredded data from the IPFS network and remove the database record.`);
        if (!ok) return;

        setIsDeleting(true);
        try {
            const formData = new FormData();
            const manifestBlob = new Blob([vault.manifestCID], { type: "text/plain" });
            formData.append("manifest_file", manifestBlob, "manifest.txt");

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/delete`, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText);
            }

            // Remove from Supabase
            if (vault.id && vault.id.toString().startsWith("db_")) {
                const dbId = vault.id.replace("db_", "");
                await supabase.from('vaults').delete().eq('id', dbId);
            } else {
                await supabase.from('vaults').delete().eq('root_hash', vault.rootHash);
            }

            setVaults(prev => prev.filter(v => v.id !== vault.id));
            if (selectedVault === vault) setSelectedVault(null);
            alert("Vault and its IPFS shards have been permanently destroyed.");
        } catch (err) {
            alert("Delete failed: " + err.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRebuild = async (vault) => {
        if (!keyFile || !manifestFile) {
            alert("Need manifest + key");
            return;
        }

        if (profile.credits < DOWNLOAD_COST) {
            alert("Not enough credits");
            return;
        }

        setIsRebuilding(true);
        setRestoreSuccess(null);

        if (vault.geo_enabled) {
            setTxStatus("Verifying your physical location...");
            const getLoc = () => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
            try {
                const pos = await getLoc();
                const userLat = pos.coords.latitude;
                const userLon = pos.coords.longitude;
                
                // Haversine formula
                const p = 0.017453292519943295;
                const c = Math.cos;
                const a = 0.5 - c((userLat - vault.latitude) * p)/2 + 
                        c(vault.latitude * p) * c(userLat * p) * 
                        (1 - c((userLon - vault.longitude) * p))/2;
                const distanceKm = 12742 * Math.asin(Math.sqrt(a));

                if (distanceKm > 2) { // 2km radius
                    alert(`Access Denied: You are not at the required location to unlock this vault. You are ${distanceKm.toFixed(2)} km away.`);
                    setIsRebuilding(false);
                    setTxStatus("");
                    return;
                }
            } catch (err) {
                alert("Failed to verify location. You must allow location access to unlock this Geo-Locked Vault.");
                setIsRebuilding(false);
                setTxStatus("");
                return;
            }
        }

        try {
            setTxStatus("Reconstructing vault from nodes...");
            await deductCredits(DOWNLOAD_COST, 'download', `Download ${vault.fileName}`);

            const formData = new FormData();
            formData.append('key_file', keyFile);
            formData.append('manifest_file', manifestFile);
            formData.append('original_hash', vault.originalHash);

            const rootBlob = new Blob([vault.rootHash], { type: "text/plain" });
            formData.append("roothash_file", rootBlob, "roothash.txt");

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/retrieve`, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(err);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = vault.fileName;
            a.click();

            URL.revokeObjectURL(url);

            setRestoreSuccess(vault.fileName);
            setSelectedVault(null);

        } catch (err) {
            alert(err.message);
        } finally {
            setIsRebuilding(false);
            setTxStatus("");
        }
    };

    const dropZoneStyle = (hasFile) => ({
        padding: '2rem 1.5rem',
        border: '2px dashed',
        borderColor: hasFile ? 'var(--success)' : 'rgba(255,255,255,0.15)',
        background: hasFile ? 'rgba(50, 215, 75, 0.05)' : 'rgba(255,255,255,0.02)',
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        textAlign: 'center',
        minHeight: '120px',
    });

    const handleDropFile = (e, setter) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) setter(e.dataTransfer.files[0]);
    };

    return (
        <>
            {/* HERO */}
            <div className="grid-container">
                <header className="hero-title glass-panel" style={{ background: 'transparent', backdropFilter: 'none' }}>
                    <h1>Access.<br/>Rebuild.</h1>
                </header>

                <div className="hero-instruction glass-panel">
                    <p>Select a vault and reconstruct your encrypted file.</p>
                    {/* Credit Info */}
                    <div style={{
                        marginTop: '1rem', padding: '0.75rem',
                        background: profile?.credits < DOWNLOAD_COST ? 'rgba(255,59,48,0.1)' : 'rgba(50,215,75,0.05)',
                        border: `1px solid ${profile?.credits < DOWNLOAD_COST ? 'rgba(255,59,48,0.2)' : 'rgba(50,215,75,0.15)'}`,
                        borderRadius: '6px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Cost: <strong style={{ color: '#fff' }}>{DOWNLOAD_COST} credits</strong>
                            </span>
                            <span style={{
                                fontSize: '0.8rem', fontWeight: '700',
                                color: profile?.credits < DOWNLOAD_COST ? 'var(--accent)' : '#32d74b'
                            }}>
                                Balance: {profile?.credits || 0}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* SUCCESS BANNER */}
            {restoreSuccess && (
                <div className="grid-container">
                    <div className="glass-panel" style={{
                        gridColumn: 'span 12',
                        padding: '2rem',
                        background: 'rgba(50, 215, 75, 0.08)',
                        border: '1px solid rgba(50, 215, 75, 0.2)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <h2 style={{ color: '#fff', margin: 0 }}>Restored Successfully</h2>
                            <p style={{ color: 'var(--success)', fontWeight: 'bold', marginTop: '0.5rem' }}>
                                ✓ {restoreSuccess} has been decrypted and downloaded.
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                                {DOWNLOAD_COST} credits deducted. Remaining balance: {profile?.credits || 0}
                            </p>
                        </div>
                        <button
                            className="btn btn-outline"
                            style={{ padding: '0.5rem 1.5rem', fontSize: '0.8rem' }}
                            onClick={() => setRestoreSuccess(null)}
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* MAIN */}
            <div className="grid-container">

                {!walletConnected ? (
                    <div className="glass-panel" style={{ gridColumn: "span 12", textAlign: "center", padding: '4rem 2rem' }}>
                        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Connect your wallet to view your vaults</p>
                        <button className="btn" onClick={handleConnect}>Connect Wallet</button>
                    </div>
                ) : isLoading ? (
                    <div className="glass-panel" style={{
                        gridColumn: "span 12",
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem'
                    }}>
                        <div style={{
                            width: '40px', height: '40px',
                            border: '3px solid rgba(255,255,255,0.1)',
                            borderLeftColor: 'var(--accent)',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginBottom: '1rem'
                        }} />
                        <p className="meta-label">Loading Vaults...</p>
                    </div>
                ) : vaults.length === 0 ? (
                    <div className="glass-panel" style={{ gridColumn: "span 12", textAlign: 'center', padding: '4rem 2rem' }}>
                        <p style={{ color: 'var(--text-muted)' }}>No vaults found.</p>
                    </div>
                ) : (
                    <>
                    {/* FILTER BAR */}
                    <div className="glass-panel" style={{
                        gridColumn: 'span 12',
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        padding: '1rem 1.5rem',
                        marginBottom: '0.5rem'
                    }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginRight: '0.5rem' }}>Filter:</span>
                        {['all', 'standard', 'time-locked', 'geo-locked'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                style={{
                                    padding: '0.4rem 1rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    border: filter === f ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '20px',
                                    background: filter === f ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    color: filter === f ? '#fff' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {f === 'all' ? 'All' : f === 'standard' ? 'Standard' : f === 'geo-locked' ? 'Geo-Locked' : 'Time-Locked'}
                            </button>
                        ))}
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {vaults.filter(v =>
                                filter === 'all' ? true :
                                filter === 'time-locked' ? v.timer_enabled :
                                filter === 'geo-locked' ? v.geo_enabled :
                                !v.timer_enabled && !v.geo_enabled
                            ).length} vault{vaults.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {vaults.filter(v =>
                        filter === 'all' ? true :
                        filter === 'time-locked' ? v.timer_enabled :
                        filter === 'geo-locked' ? v.geo_enabled :
                        !v.timer_enabled && !v.geo_enabled
                    ).map(vault => (
                        <div key={vault.id} className="glass-panel" style={{ gridColumn: "span 12", marginBottom: "1rem" }}>

                            {/* TOP ROW */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <h3 style={{ margin: 0 }}>{vault.fileName}</h3>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.3rem' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vault.date}</span>
                                        {vault.timer_enabled && (
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: '700',
                                                padding: '0.2rem 0.6rem',
                                                background: 'rgba(255,59,48,0.1)',
                                                border: '1px solid rgba(255,59,48,0.25)',
                                                borderRadius: '20px',
                                                color: 'var(--accent)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                            }}>
                                                Time-Locked
                                            </span>
                                        )}
                                        {vault.geo_enabled && (
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: '700',
                                                padding: '0.2rem 0.6rem',
                                                background: 'rgba(50,173,230,0.1)',
                                                border: '1px solid rgba(50,173,230,0.3)',
                                                borderRadius: '20px',
                                                color: '#32ade6',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                            }}>
                                                Geo-Locked
                                            </span>
                                        )}
                                        {vault.onChain && (
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: '700',
                                                padding: '0.2rem 0.6rem',
                                                background: 'rgba(50,215,75,0.1)',
                                                border: '1px solid rgba(50,215,75,0.2)',
                                                borderRadius: '20px',
                                                color: '#32d74b',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                            }}>
                                                On-Chain ✓
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button 
                                        className="btn-outline" 
                                        style={{ borderColor: 'rgba(255,59,48,0.5)', color: '#ff3b30' }} 
                                        onClick={() => handleDelete(vault)} 
                                        disabled={isDeleting || isRebuilding}
                                    >
                                        Deploy Purge
                                    </button>
                                    <button className="btn" onClick={() => handleUnlockClick(vault)}>
                                        {selectedVault === vault ? "Close" : "Unlock"}
                                    </button>
                                </div>
                            </div>

                            {/* EXPANDED — Drag & Drop Zones */}
                            {selectedVault === vault && (
                                <div style={{ marginTop: "1.5rem" }}>
                                    <div style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr",
                                        gap: "1rem"
                                    }}>
                                        {/* MANIFEST DROP ZONE */}
                                        <div
                                            style={dropZoneStyle(manifestFile)}
                                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                            onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = manifestFile ? 'var(--success)' : 'rgba(255,255,255,0.15)'; }}
                                            onDrop={(e) => handleDropFile(e, setManifestFile)}
                                            onClick={() => manifestInputRef.current?.click()}
                                        >
                                            <input
                                                type="file"
                                                style={{ display: 'none' }}
                                                ref={manifestInputRef}
                                                onChange={(e) => setManifestFile(e.target.files[0])}
                                            />
                                            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📄</div>
                                            <h4 style={{ margin: 0, color: manifestFile ? 'var(--success)' : '#fff', fontSize: '0.9rem' }}>
                                                {manifestFile ? manifestFile.name : "Manifest File"}
                                            </h4>
                                            <p style={{ margin: 0, marginTop: '0.3rem', fontSize: '0.75rem', color: manifestFile ? 'var(--success)' : 'var(--text-muted)' }}>
                                                {manifestFile ? `${(manifestFile.size / 1024).toFixed(2)} KB` : "Drag & drop or click to browse"}
                                            </p>
                                        </div>

                                        {/* KEY DROP ZONE */}
                                        <div
                                            style={dropZoneStyle(keyFile)}
                                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                            onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = keyFile ? 'var(--success)' : 'rgba(255,255,255,0.15)'; }}
                                            onDrop={(e) => handleDropFile(e, setKeyFile)}
                                            onClick={() => keyInputRef.current?.click()}
                                        >
                                            <input
                                                type="file"
                                                style={{ display: 'none' }}
                                                ref={keyInputRef}
                                                onChange={(e) => setKeyFile(e.target.files[0])}
                                            />
                                            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔑</div>
                                            <h4 style={{ margin: 0, color: keyFile ? 'var(--success)' : '#fff', fontSize: '0.9rem' }}>
                                                {keyFile ? keyFile.name : "Secret Key File"}
                                            </h4>
                                            <p style={{ margin: 0, marginTop: '0.3rem', fontSize: '0.75rem', color: keyFile ? 'var(--success)' : 'var(--text-muted)' }}>
                                                {keyFile ? `${(keyFile.size / 1024).toFixed(2)} KB` : "Drag & drop or click to browse"}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        className="btn"
                                        style={{ width: '100%', marginTop: '1rem' }}
                                        onClick={() => handleRebuild(vault)}
                                        disabled={isRebuilding || !keyFile || !manifestFile}
                                    >
                                        {isRebuilding 
                                            ? (txStatus || "Rebuilding...") 
                                            : !keyFile || !manifestFile 
                                                ? "Upload Manifest & Key to Continue" 
                                                : "Reconstruct Vault"}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    </>
                )}
            </div>
        </>
    );
}
