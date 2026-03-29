import { useRef, useState } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

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

    const downloadFile = (content, filename) => {
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

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

            const response = await fetch("http://localhost:8080/upload", {
                method: "POST",
                body: formData
            });

            console.log("STATUS:", response.status);

            const text = await response.text();
            console.log("RAW RESPONSE:", text);

            const data = JSON.parse(text);
            console.log("PARSED DATA:", data);

            // 🔥 THIS FIXES EVERYTHING
            setArtifactData(data);

            const unlockTime = new Date(Date.now() + selectedDuration);

            // ---------- BLOCKCHAIN ----------
            let txHash = null;

            if (window.ethereum) {
                setTxStatus("Connecting wallet...");
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const walletAddress = await signer.getAddress();

                if (!profile.wallet_address || profile.wallet_address !== walletAddress) {
                    await linkWallet(walletAddress);
                }
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

            setTxStatus("Vault created successfully!");
            alert("Time-locked vault created!");

        } catch (err) {
            console.error(err);
            alert("Protocol Failed: " + err.message);
        } finally {
            setIsUploading(false);
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
                </div>
            </div>

            <div className="grid-container">
                <div className="glass-panel" style={{
                    gridColumn: 'span 12',
                    padding: '3rem 2rem',
                    display: 'grid',
                    gridTemplateColumns: '7fr 3fr',
                    gap: '3rem',
                    alignItems: 'center'
                }}>
                    <div>

                        {/* FILE DROP */}
                        <div
                            style={{
                                height: '260px',
                                border: '2px dashed',
                                borderColor: file ? 'var(--success)' : 'rgba(255,255,255,0.2)',
                                background: file ? 'rgba(50, 215, 75, 0.05)' : 'rgba(255,255,255,0.01)',
                                borderRadius: '4px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input type="file" hidden ref={fileInputRef} onChange={(e) => setFile(e.target.files[0])} />
                            <h3>{file ? file.name : "Drag & Drop File"}</h3>
                        </div>

                        {/* TIMER */}
                        <div style={{ marginTop: '1.5rem' }}>
                            <div className="meta-label">Time Lock Duration</div>
                            <select
                                value={selectedDuration}
                                onChange={(e) => setSelectedDuration(Number(e.target.value))}
                                style={{ width: '100%', padding: '1rem' }}
                            >
                                <option value={10000}>10 sec</option>
                                <option value={30000}>30 sec</option>
                                <option value={60000}>1 min</option>
                                <option value={3600000}>1 hour</option>
                                <option value={86400000}>1 day</option>
                            </select>
                        </div>

                        {/* 🔥 DOWNLOAD SECTION */}
                        {artifactData && (
                            <div style={{ marginTop: '2rem' }}>
                                <h4>Vault Artifacts</h4>

                                <button
                                    className="btn"
                                    onClick={() => downloadFile(artifactData.manifest_content, "manifest.txt")}
                                >
                                    Download Manifest
                                </button>

                                <button
                                    className="btn"
                                    style={{ marginLeft: '1rem' }}
                                    onClick={() => downloadFile(artifactData.encryption_key, "secret.key")}
                                >
                                    Download Key
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RIGHT PANEL */}
                    <div style={{ paddingLeft: '3rem' }}>
                        <button
                            className="btn"
                            style={{ width: '100%' }}
                            onClick={handleUpload}
                            disabled={!file || isUploading}
                        >
                            {isUploading ? "Processing..." : "Create Time-Locked Vault"}
                        </button>

                        {txStatus && (
                            <p style={{ marginTop: '1rem', color: 'var(--accent)' }}>
                                {txStatus}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}