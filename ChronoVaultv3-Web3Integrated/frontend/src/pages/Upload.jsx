import { useState, useRef } from 'react';
import { ethers } from 'ethers';

// --- V2 Smart Contract Configuration ---
const CONTRACT_ADDRESS = "0x551Df3762c81604EAfFb4A82A7d0ff9F71CFF5bF"; 

const CONTRACT_ABI = [
    {
        "inputs": [
            { "internalType": "string", "name": "_fileName", "type": "string" },
            { "internalType": "string", "name": "_category", "type": "string" }, // NEW V2 CATEGORY
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

export default function Upload() {
    const [file, setFile] = useState(null);
    const [category, setCategory] = useState("Personal"); // NEW STATE
    const [isUploading, setIsUploading] = useState(false);
    const [txStatus, setTxStatus] = useState(""); 
    const [artifactData, setArtifactData] = useState(null);
    const fileInputRef = useRef(null);

    const handleDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
    };

    const handleUpload = async () => {
        if (!file) return;
        setIsUploading(true);
        setTxStatus("Encrypting & Pushing to IPFS...");

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('http://localhost:8080/upload', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Upload failed');
            const data = await response.json();
            
            if (window.ethereum) {
                setTxStatus("Switching Network to Sepolia...");
                
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0xaa36a7' }], 
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
                const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

                // Call the V2 Smart Contract (Now with category!)
                const tx = await contract.secureVault(
                    file.name,
                    category, // <-- Injected here
                    data.original_hash || "N/A",
                    data.root_hash,
                    "PENDING_MANIFEST_CID" 
                );

                setTxStatus("Writing to Blockchain... Please wait.");
                await tx.wait(); 
                
                console.log("Vault Secured on Blockchain!");
            } else {
                alert("MetaMask not detected. Artifacts generated locally, but not secured on-chain.");
            }

            setArtifactData(data);
        } catch (error) {
            console.error(error);
            alert("Protocol Failed: " + error.message);
        } finally {
            setIsUploading(false);
            setTxStatus("");
        }
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

    return (
        <>
            <div className="grid-container">
                <header className="hero-title glass-panel" style={{ background: 'transparent', backdropFilter: 'none' }}>
                    <h1>Upload &<br/><span style={{ color: 'rgba(255,255,255,0.2)' }}>Encrypt.</span></h1>
                </header>
                <div className="hero-instruction glass-panel">
                    <p>Your file will be locally encrypted, hashed, and prepared for sharded distribution. Keys remain client-side.</p>
                </div>
            </div>

            {!artifactData ? (
                <div className="grid-container">
                    <div className="glass-panel" style={{ gridColumn: 'span 12', padding: '4rem 2rem', display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '3rem', alignItems: 'center' }}>
                        
                        <div style={{ width: '100%' }}>
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
                                onClick={() => fileInputRef.current.click()}
                            >
                                <input type="file" style={{ display: 'none' }} ref={fileInputRef} onChange={(e) => setFile(e.target.files[0])} />
                                <div style={{ marginBottom: '1rem' }}>
                                    <img src="/images/upload.png" alt="Upload Icon" style={{ width: '60px', height: '60px', objectFit: 'contain' }} />
                                </div>
                                <h3 style={{ margin: 0, color: file ? 'var(--success)' : 'inherit' }}>
                                    {file ? file.name : "Drag & Drop File"}
                                </h3>
                                <p style={{ margin: 0, marginTop: '0.5rem', color: file ? 'var(--success)' : 'var(--text-muted)' }}>
                                    {file ? `${(file.size/1024).toFixed(2)} KB Ready for Encryption` : "or click to browse"}
                                </p>
                            </div>
                            
                            {/* CATEGORY SELECTOR */}
                            <div style={{ marginTop: '1.5rem' }}>
                                <div className="meta-label" style={{ marginBottom: '0.5rem' }}>Artifact Category</div>
                                <select 
                                    value={category} 
                                    onChange={(e) => setCategory(e.target.value)}
                                    style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', outline: 'none' }}
                                >
                                    <option value="Personal" style={{ color: '#000' }}>Personal Data</option>
                                    <option value="Medical" style={{ color: '#000' }}>Medical Records</option>
                                    <option value="Financial" style={{ color: '#000' }}>Financial Documents</option>
                                    <option value="Code" style={{ color: '#000' }}>Source Code</option>
                                </select>
                            </div>

                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', borderLeft: 'var(--glass-border)', paddingLeft: '3rem' }}>
                            <div style={{ width: '100%', textAlign: 'center' }}>
                                <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>
                                    Ready for Encryption
                                </p>
                                <button className="btn" style={{ width: '100%' }} onClick={handleUpload} disabled={!file || isUploading}>
                                    {isUploading ? "Processing..." : "Initiate Protocol"}
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
                /* Success Screen (Unchanged) */
                <div className="grid-container">
                    <div className="glass-panel" style={{ gridColumn: 'span 12', padding: '2rem', background: 'rgba(50, 215, 75, 0.05)' }}>
                        <h2 style={{ color: '#fff' }}>Protocol Success</h2>
                        <p style={{ color: 'var(--success)', fontWeight: 'bold', marginTop: '0.5rem' }}>✓ Secured to Blockchain under category: {category}</p>
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