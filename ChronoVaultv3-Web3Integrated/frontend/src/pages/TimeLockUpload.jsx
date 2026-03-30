import { useRef, useState } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../context/AuthContext';
import { supabase, authFetch } from '../lib/supabase';

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

export default function TimeLockUpload() {
    const { profile, deductCredits, linkWallet } = useAuth();

    const [file, setFile] = useState(null);
    const [selectedDuration, setSelectedDuration] = useState(10000);
    const [artifactData, setArtifactData] = useState(null); // 🔥 ADDED
    const [isUploading, setIsUploading] = useState(false);
    const [txStatus, setTxStatus] = useState("");

    const fileInputRef = useRef(null);
    const UPLOAD_COST = 40;

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

        if (profile.credits < UPLOAD_COST) {
            alert(`Insufficient credits. Need ${UPLOAD_COST}, you have ${profile.credits}`);
            return;
        }

        setIsUploading(true);

        try {
            setTxStatus("Verifying Credits...");
            await deductCredits(UPLOAD_COST, 'upload', `Time Lock Upload`);

            setTxStatus("Uploading & Encrypting...");

            const formData = new FormData();
            formData.append('file', file);

            const response = await authFetch(`${import.meta.env.VITE_BACKEND_URL}/upload`, {
                method: "POST",
                body: formData
            });

            const text = await response.text();
            console.log("RAW RESPONSE:", text);

            if (!response.ok) {
                alert(text);
                return;
            }

            const data = JSON.parse(text);
            console.log("PARSED DATA:", data);

            const unlockTime = new Date(Date.now() + selectedDuration);

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
                    console.error("Failed to switch network:", switchError);
                    alert("Please switch your MetaMask network to Sepolia manually.");
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
                    "TimeLock",
                    data.original_hash || "N/A",
                    data.root_hash,
                    "PENDING_MANIFEST_CID"
                );

                setTxStatus("Writing to Blockchain... Please wait.");
                const receipt = await tx.wait();
                txHash = receipt.hash;

                console.log("Time-Locked Vault Secured on Blockchain!");
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
                timer_enabled: true,
                unlock_time: unlockTime.toISOString(),
            });

            setArtifactData(data);
            setTxStatus("Vault created successfully!");
            alert("Time-locked vault created!");

        } catch (err) {
            console.error(err);
            alert("Protocol Failed: " + err.message);
        } finally {
            setIsUploading(false);
            setTxStatus("");
        }
    };

    return (
        <>
            <div className="grid-container">
                <header className="hero-title glass-panel" style={{ background: 'transparent', backdropFilter: 'none' }}>
                    <h1>Upload.<br />Set Timer.<br /><span style={{ color: 'rgba(255,255,255,0.2)' }}>Lock Vault.</span></h1>
                </header>

                <div className="hero-instruction glass-panel">
                    <p>Create a vault that stays locked until the selected unlock time.</p>
                    {/* Credit Info */}
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
            </div>

            {!artifactData ? (
                <div className="grid-container">
                    <div className="glass-panel" style={{ gridColumn: 'span 12', padding: '4rem 2rem', display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '3rem', alignItems: 'center' }}>

                        <div style={{ width: '100%' }}>
                            {/* FILE DROP */}
                            <div
                                style={{
                                    height: '300px', border: '2px dashed',
                                    borderColor: file ? 'var(--success)' : 'rgba(255,255,255,0.2)',
                                    background: file ? 'rgba(50, 215, 75, 0.05)' : 'rgba(255,255,255,0.01)',
                                    borderRadius: '4px', transition: 'all 0.3s ease',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer'
                                }}
                                onDragOver={(e) => { e.preventDefault(); if(!file) e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                onDragLeave={(e) => { e.preventDefault(); if(!file) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input type="file" style={{ display: 'none' }} ref={fileInputRef} onChange={(e) => setFile(e.target.files[0])} />
                                <h3 style={{ margin: 0, color: file ? 'var(--success)' : 'inherit' }}>
                                    {file ? file.name : "Drag & Drop File"}
                                </h3>
                                <p style={{ margin: 0, marginTop: '0.5rem', color: file ? 'var(--success)' : 'var(--text-muted)' }}>
                                    {file ? `${(file.size/1024).toFixed(2)} KB Ready for Encryption` : "or click to browse"}
                                </p>
                            </div>

                            {/* TIMER */}
                            <div style={{ marginTop: '1.5rem' }}>
                                <div className="meta-label" style={{ marginBottom: '0.5rem' }}>Time Lock Duration</div>
                                <select
                                    value={selectedDuration}
                                    onChange={(e) => setSelectedDuration(Number(e.target.value))}
                                    style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', outline: 'none' }}
                                >
                                    <option value={10000} style={{ color: '#000' }}>10 seconds</option>
                                    <option value={30000} style={{ color: '#000' }}>30 seconds</option>
                                    <option value={60000} style={{ color: '#000' }}>1 minute</option>
                                    <option value={3600000} style={{ color: '#000' }}>1 hour</option>
                                    <option value={86400000} style={{ color: '#000' }}>1 day</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', borderLeft: 'var(--glass-border)', paddingLeft: '3rem' }}>
                            <div style={{ width: '100%', textAlign: 'center' }}>
                                <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>
                                    Ready for Time-Lock
                                </p>
                                <button className="btn" style={{ width: '100%' }} onClick={handleUpload} disabled={!file || isUploading || (profile?.credits < UPLOAD_COST)}>
                                    {isUploading ? "Processing..." : profile?.credits < UPLOAD_COST ? "Insufficient Credits" : "Create Time-Locked Vault"}
                                </button>

                                {txStatus && (
                                    <div style={{ marginTop: '1.5rem' }}>
                                        <div style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.1)', borderLeftColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem auto' }} />
                                        <p style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 'bold' }}>{txStatus}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            ) : (
                /* Success Screen */
                <div className="grid-container">
                    <div className="glass-panel" style={{ gridColumn: 'span 12', padding: '2rem', background: 'rgba(50, 215, 75, 0.05)' }}>
                        <h2 style={{ color: '#fff' }}>Protocol Success</h2>
                        <p style={{ color: 'var(--success)', fontWeight: 'bold', marginTop: '0.5rem' }}>✓ Secured to Blockchain — Time-Locked Vault</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                            {UPLOAD_COST} credits deducted. Remaining balance: {profile?.credits || 0}
                        </p>
                    </div>

                    <div className="glass-panel" style={{ gridColumn: 'span 4', wordBreak: 'break-all' }}>
                        <h3>Original Hash</h3>
                        <code style={{ display: 'block', marginTop: '1rem', fontFamily: 'monospace', color: 'var(--accent)' }}>{artifactData.original_hash}</code>
                    </div>

                    <div className="glass-panel" style={{ gridColumn: 'span 4', wordBreak: 'break-all' }}>
                        <h3>Root Hash</h3>
                        <code style={{ display: 'block', marginTop: '1rem', fontFamily: 'monospace', color: 'var(--accent)' }}>{artifactData.root_hash}</code>
                    </div>

                    <div className="glass-panel" style={{ gridColumn: 'span 4', borderRight: 'none', wordBreak: 'break-all' }}>
                        <h3>Private Key</h3>
                        <code style={{ display: 'block', marginTop: '1rem', fontFamily: 'monospace', color: 'var(--accent)' }}>{artifactData.encryption_key}</code>
                    </div>

                    <div className="glass-panel" style={{ gridColumn: 'span 12', borderBottom: 'none', paddingTop: '0' }}>
                        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                            <button className="btn" style={{ width: '100%' }} onClick={downloadManifest}>Download Manifest.txt</button>
                            <button className="btn" style={{ width: '100%' }} onClick={downloadRootHash}>Download RootHash.txt</button>
                            <button className="btn" style={{ width: '100%' }} onClick={downloadKey}>Download Secret.key</button>
                        </div>
                        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                            <button className="btn" style={{ width: '100%' }} onClick={downloadArtifacts}>Download JSON File</button>
                            <button className="btn" style={{ width: '100%' }} onClick={downloadAll}>Download All Files</button>
                            <button className="btn btn-outline" style={{ width: '100%', padding: '1rem 3rem' }} onClick={handleNewUpload}>New Upload</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}