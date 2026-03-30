import { useRef, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

const CONTRACT_ABI = [
    {
        "inputs": [
            { "internalType": "string", "name": "_fileName", "type": "string" },
            { "internalType": "string", "name": "_category", "type": "string" },
            { "internalType": "string", "name": "_originalHash", "type": "string" },
            { "internalType": "string", "name": "_rootHash", "type": "string" },
            { "internalType": "string", "name": "_manifestCID", "type": "string" }
        ],
        "name": "secureVault",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

export default function GeoLockUpload() {
    const { profile, deductCredits, linkWallet } = useAuth();

    const [file, setFile] = useState(null);
    const [artifactData, setArtifactData] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [txStatus, setTxStatus] = useState("");
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState("");

    const fileInputRef = useRef(null);
    const UPLOAD_COST = 40;

    useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                (err) => {
                    console.error("Geolocation error:", err);
                    setLocationError("Failed to access location. Please enable location services.");
                }
            );
        } else {
            setLocationError("Geolocation is not supported by your browser.");
        }
    }, []);

    const handleDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
    };

    const downloadString = (content, filename, contentType) => {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadManifest = () => downloadString(artifactData.manifest_content, `manifest_${file.name}.txt`, 'text/plain');
    const downloadRootHash = () => downloadString(artifactData.root_hash, `roothash_${file.name}.txt`, 'text/plain');
    const downloadKey = () => downloadString(artifactData.encryption_key, `secret_${file.name}.key`, 'application/octet-stream');
    const downloadArtifacts = () => downloadString(JSON.stringify(artifactData, null, 2), `artifacts_${file.name}.json`, 'application/json');

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const downloadAll = async () => {
        downloadManifest(); await delay(300);
        downloadRootHash(); await delay(300);
        downloadKey(); await delay(300);
        downloadArtifacts();
    };

    const handleNewUpload = () => { setArtifactData(null); setFile(null); };

    const handleUpload = async () => {
        if (!file) return;

        if (!location) {
            alert("Location data is required for a Geo-Locked Vault. Please allow location access.");
            return;
        }

        if (profile.credits < UPLOAD_COST) {
            alert(`Insufficient credits. Need ${UPLOAD_COST}, you have ${profile.credits}`);
            return;
        }

        setIsUploading(true);

        try {
            setTxStatus("Verifying Credits...");
            await deductCredits(UPLOAD_COST, 'upload', `Geo-Lock Upload`);

            setTxStatus("Uploading & Encrypting...");

            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/upload`, {
                method: "POST",
                body: formData
            });

            const text = await response.text();
            
            if (!response.ok) {
                alert(text);
                return;
            }

            const data = JSON.parse(text);

            // ---------- BLOCKCHAIN ----------
            let txHash = null;

            if (window.ethereum) {
                setTxStatus("Switching Network to Sepolia...");

                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: import.meta.env.VITE_SEPOLIA_CHAIN_ID }],
                    });
                } catch (switchError) {
                    setIsUploading(false);
                    return;
                }

                setTxStatus("Awaiting MetaMask Approval...");

                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const walletAddress = await signer.getAddress();
                const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

                if (!profile.wallet_address || profile.wallet_address !== walletAddress) {
                    await linkWallet(walletAddress);
                }

                const tx = await contract.secureVault(
                    file.name,
                    "GeoLock",
                    data.original_hash || "N/A",
                    data.root_hash,
                    "PENDING_MANIFEST_CID"
                );

                setTxStatus("Writing to Blockchain... Please wait.");
                const receipt = await tx.wait();
                txHash = receipt.hash;
            } else {
                alert("MetaMask not detected. Artifacts generated locally, but not secured on-chain.");
            }

            // ---------- SUPABASE ----------
            await supabase.from('vaults').insert({
                user_id: profile.id,
                file_name: file.name,
                original_hash: data.original_hash,
                root_hash: data.root_hash,
                manifest_cid: data.manifest_content,
                blockchain_tx: txHash,
                timer_enabled: false,
                geo_enabled: true,
                latitude: location.latitude,
                longitude: location.longitude,
            });

            setArtifactData(data);
            setTxStatus("Vault created successfully!");
            alert("Geo-locked vault created successfully!");

        } catch (err) {
            console.error(err);
            alert("Protocol Failed: " + err.message);
        } finally {
            setIsUploading(false);
            setTxStatus("");
        }
    };

    return (
        <div className="grid-container">
            <header className="hero-title glass-panel" style={{ background: 'transparent', backdropFilter: 'none' }}>
                <h1>Upload.<br />Lock Location.<br /><span style={{ color: 'rgba(255,255,255,0.2)' }}>Secure Vault.</span></h1>
            </header>

            <div className="hero-instruction glass-panel">
                <p>Create a vault that can only be unlocked from your current physical location.</p>
                <div style={{
                    marginTop: '1rem', padding: '0.75rem',
                    background: profile?.credits < UPLOAD_COST ? 'rgba(255,59,48,0.1)' : 'rgba(50,215,75,0.05)',
                    border: `1px solid ${profile?.credits < UPLOAD_COST ? 'rgba(255,59,48,0.2)' : 'rgba(50,215,75,0.15)'}`,
                    borderRadius: '6px'
                }}>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Cost: <strong style={{ color: '#fff' }}>{UPLOAD_COST} credits</strong>
                        </span>
                        <span style={{
                            fontSize: '0.8rem', fontWeight: '700',
                            color: profile?.credits < UPLOAD_COST ? 'var(--accent)' : '#32d74b'
                        }}>
                            Balance: {profile?.credits || 0}
                        </span>
                    </div>
                </div>
            </div>

            {!artifactData ? (
                <div className="glass-panel" style={{ gridColumn: 'span 12', padding: '4rem', textAlign: 'center' }}>
                    <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        style={{
                            border: '2px dashed rgba(255,255,255,0.2)',
                            padding: '4rem', borderRadius: '12px',
                            cursor: 'pointer', transition: 'border-color 0.3s ease',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: '1rem',
                            marginBottom: '2rem'
                        }}
                        onClick={() => fileInputRef.current.click()}
                    >
                        <input
                            type="file"
                            onChange={(e) => setFile(e.target.files[0])}
                            style={{ display: 'none' }}
                            ref={fileInputRef}
                        />
                        <div style={{ fontSize: '3rem', opacity: '0.5' }}>📍</div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
                            {file ? file.name : 'Drag & drop file or click to browse'}
                        </p>
                    </div>

                    <div style={{ marginBottom: '2rem', textAlign: 'left' }}>
                        <h4 style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.8rem', marginBottom: '1rem' }}>
                            Location Status
                        </h4>
                        {locationError ? (
                            <div style={{ color: 'var(--accent)', padding: '1rem', background: 'rgba(255,59,48,0.1)', borderRadius: '6px' }}>{locationError}</div>
                        ) : location ? (
                            <div style={{ color: '#32d74b', padding: '1rem', background: 'rgba(50,215,75,0.1)', borderRadius: '6px' }}>
                                Location acquired: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                Requesting location permission...
                            </div>
                        )}
                    </div>

                    <button
                        className="btn"
                        onClick={handleUpload}
                        disabled={!file || !location || profile?.credits < UPLOAD_COST || isUploading}
                        style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', marginTop: '1rem' }}
                    >
                        {isUploading ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <div style={{
                                    width: '18px', height: '18px',
                                    border: '2px solid rgba(255,255,255,0.2)',
                                    borderLeftColor: '#fff',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                {txStatus}
                            </div>
                        ) : profile?.credits < UPLOAD_COST ? "Insufficient Credits" : "Upload & Lock to Location"}
                    </button>
                    {txStatus && !isUploading && (
                        <p style={{ marginTop: '1rem', color: '#32d74b' }}>{txStatus}</p>
                    )}
                </div>
            ) : (
                <div className="glass-panel" style={{ gridColumn: 'span 12', padding: '4rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✨</div>
                    <h2 style={{ marginBottom: '1rem' }}>Vault Secured</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '3rem' }}>
                        Important: Only individuals at the target coordinates can retrieve this file. Download and save the decryption artifacts safely.
                    </p>

                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem', marginBottom: '3rem'
                    }}>
                        <button className="btn-outline" onClick={downloadManifest}>⬇️ Manifest</button>
                        <button className="btn-outline" onClick={downloadRootHash}>⬇️ Root Hash</button>
                        <button className="btn-outline" onClick={downloadKey}>🔑 Secret Key</button>
                        <button className="btn" onClick={downloadAll}>📦 Download All</button>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
                        <button className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }} onClick={handleNewUpload}>
                            Create Another Geo-Vault
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
