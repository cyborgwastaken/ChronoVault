import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';

// --- V2 Smart Contract Configuration ---
const CONTRACT_ADDRESS = "0x551Df3762c81604EAfFb4A82A7d0ff9F71CFF5bF"; 

const CONTRACT_ABI = [
    {
        "inputs": [],
        "name": "getMyVaults",
        "outputs": [{
            "components": [
                { "internalType": "uint256", "name": "id", "type": "uint256" },
                { "internalType": "address", "name": "owner", "type": "address" },
                { "internalType": "string", "name": "fileName", "type": "string" },
                { "internalType": "string", "name": "category", "type": "string" },
                { "internalType": "string", "name": "originalHash", "type": "string" },
                { "internalType": "string", "name": "rootHash", "type": "string" },
                { "internalType": "string", "name": "manifestCID", "type": "string" },
                { "internalType": "uint256", "name": "timestamp", "type": "uint256" },
                { "internalType": "bool", "name": "isActive", "type": "bool" }
            ],
            "internalType": "struct ChronoVaultV2.Vault[]",
            "name": "",
            "type": "tuple[]"
        }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "_vaultId", "type": "uint256" }],
        "name": "deleteVault",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "_vaultId", "type": "uint256" },
            { "internalType": "address", "name": "_recipient", "type": "address" }
        ],
        "name": "shareVault",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

export default function Retrieve() {
    const [vaults, setVaults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [walletConnected, setWalletConnected] = useState(false);
    
    // Unlocking State
    const [selectedVault, setSelectedVault] = useState(null);
    const [keyFile, setKeyFile] = useState(null);
    const [manifestFile, setManifestFile] = useState(null);
    const [isRebuilding, setIsRebuilding] = useState(false);

    const manifestInputRef = useRef(null);
    const keyInputRef = useRef(null);

    useEffect(() => {
        checkWalletAndFetch();
    }, []);

    const checkWalletAndFetch = async () => {
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    setWalletConnected(true);
                    fetchVaults();
                }
            } catch (error) {
                console.error("Wallet check failed:", error);
            }
        }
    };

    const fetchVaults = async () => {
        setIsLoading(true);
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0xaa36a7' }], 
            });

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const data = await contract.getMyVaults();
            
            // Format AND filter out deleted vaults
            const activeVaults = data
                .filter(v => v.isActive === true) // THE SOFT DELETE FILTER!
                .map(v => ({
                    id: v.id.toString(), // Store the unique ID
                    fileName: v.fileName,
                    category: v.category,
                    originalHash: v.originalHash,
                    rootHash: v.rootHash,
                    manifestCID: v.manifestCID,
                    date: new Date(Number(v.timestamp) * 1000).toLocaleString() 
                })).reverse(); 

            setVaults(activeVaults);
        } catch (error) {
            console.error("Error fetching vaults:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = async () => {
        if (window.ethereum) {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            setWalletConnected(true);
            fetchVaults();
        } else {
            alert("Please install MetaMask!");
        }
    };

    // --- NEW V2 FUNCTIONS ---
    const handleDeleteVault = async (vaultId) => {
        if (!confirm("Are you sure you want to permanently delete this vault?")) return;
        
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const tx = await contract.deleteVault(vaultId);
            alert("Deletion transaction submitted. Waiting for blockchain confirmation...");
            await tx.wait();
            
            alert("Vault deleted!");
            fetchVaults(); // Refresh the list, it will instantly disappear!
        } catch (error) {
            console.error(error);
            alert("Failed to delete vault.");
        }
    };

    const handleShareVault = async (vaultId) => {
        const recipient = prompt("Enter the MetaMask address of the person you want to share this with:");
        if (!recipient) return;

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const tx = await contract.shareVault(vaultId, recipient);
            alert("Sharing transaction submitted. Waiting for blockchain confirmation...");
            await tx.wait();
            
            alert(`Access granted to ${recipient}!`);
        } catch (error) {
            console.error(error);
            alert("Failed to share vault. Check console for details.");
        }
    };

    const handleUnlockClick = (vault) => {
        if (selectedVault === vault) {
            setSelectedVault(null);
        } else {
            setSelectedVault(vault);
            setKeyFile(null);
            setManifestFile(null);
        }
    };

    const handleManifestDrop = (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = manifestFile ? '#32d74b' : 'rgba(255,255,255,0.2)';
        if (e.dataTransfer.files.length) setManifestFile(e.dataTransfer.files[0]);
    };

    const handleKeyDrop = (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = keyFile ? '#32d74b' : 'rgba(255,255,255,0.2)';
        if (e.dataTransfer.files.length) setKeyFile(e.dataTransfer.files[0]);
    };

    const handleRebuild = async (vault) => {
        if (!keyFile || !manifestFile) {
            alert("Access Denied: Both Secret Key and Manifest are required.");
            return;
        }

        setIsRebuilding(true);

        try {
            const formData = new FormData();
            const rootHashBlob = new Blob([vault.rootHash], { type: 'text/plain' });
            formData.append('roothash_file', rootHashBlob, 'roothash.txt');
            formData.append('original_hash', vault.originalHash);
            formData.append('key_file', keyFile);
            formData.append('manifest_file', manifestFile);

            const response = await fetch('http://localhost:8080/retrieve', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || "Network swarm failed to rebuild artifact.");
            }

            const isVerified = response.headers.get('X-Integrity-Verified') === 'true';

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = vault.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            if (isVerified) {
                alert("Protocol Success! Artifact Decrypted and Verified against Blockchain Hash.");
            } else {
                alert("Warning: Artifact rebuilt, but failed integrity hash check.");
            }
            
            setSelectedVault(null); 

        } catch (error) {
            console.error(error);
            alert("Decryption Failed: " + error.message);
        } finally {
            setIsRebuilding(false);
        }
    };

    return (
        <>
            <div className="grid-container">
                <header className="hero-title glass-panel" style={{ background: 'transparent', backdropFilter: 'none', gridColumn: 'span 8' }}>
                    <h1>Access.<br/><span style={{ color: 'rgba(255,255,255,0.2)' }}>Rebuild.</span></h1>
                </header>
                <div className="hero-instruction glass-panel" style={{ gridColumn: 'span 4' }}>
                    <p>Connect your Web3 identity to view your secured artifacts. The blockchain ledger ensures absolute mathematical proof of ownership.</p>
                </div>
            </div>

            <div className="grid-container" style={{ minHeight: '40vh' }}>
                {!walletConnected ? (
                    <div className="glass-panel" style={{ gridColumn: 'span 12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem' }}>
                        <h2 style={{ marginBottom: '1rem' }}>Identity Required</h2>
                        <p style={{ textAlign: 'center', marginBottom: '2rem' }}>You must connect your wallet to query the Smart Contract.</p>
                        <button className="btn" onClick={handleConnect}>Connect MetaMask</button>
                    </div>
                ) : isLoading ? (
                    <div className="glass-panel" style={{ gridColumn: 'span 12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem' }}>
                        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderLeftColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
                        <p className="meta-label">Querying Ethereum Ledger...</p>
                    </div>
                ) : vaults.length === 0 ? (
                    <div className="glass-panel" style={{ gridColumn: 'span 12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem' }}>
                        <h2 style={{ color: 'var(--text-muted)' }}>No Vaults Found</h2>
                        <p style={{ marginTop: '1rem' }}>This wallet address has no records on the ChronoVault Smart Contract.</p>
                    </div>
                ) : (
                    
                    <div style={{ gridColumn: 'span 12', display: 'flex', flexDirection: 'column' }}>
                        
                        <div className="glass-panel" style={{ padding: '2rem', borderBottom: 'var(--glass-border)' }}>
                            <div className="meta-label">Secured Artifacts ({vaults.length})</div>
                        </div>
                        
                        {vaults.map((vault) => (
                            <div key={vault.id} style={{ display: 'flex', flexDirection: 'column' }}>
                                
                                <div className="glass-panel list-item" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr 1.5fr', gap: '2rem', alignItems: 'center', borderBottom: selectedVault === vault ? 'none' : 'var(--glass-border)' }}>
                                    <div>
                                        {/* NEW: Display the Category Badge */}
                                        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.6rem', color: '#fff', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                            {vault.category}
                                        </div>
                                        <div className="meta-label" style={{ fontSize: '0.7rem' }}>Artifact Name</div>
                                        <h3 style={{ fontSize: '1.2rem', margin: 0, wordBreak: 'break-all' }}>{vault.fileName}</h3>
                                    </div>
                                    <div>
                                        <div className="meta-label" style={{ fontSize: '0.7rem' }}>Timestamp</div>
                                        <p style={{ margin: 0, fontSize: '0.9rem' }}>{vault.date}</p>
                                    </div>
                                    <div style={{ overflow: 'hidden' }}>
                                        <div className="meta-label" style={{ fontSize: '0.7rem' }}>Root Hash</div>
                                        <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: 'var(--accent)' }}>
                                            {vault.rootHash}
                                        </p>
                                    </div>

                                    {/* NEW V2 ACTIONS PANEL */}
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button 
                                            className="btn-outline" 
                                            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', color: '#65C2CB', borderColor: 'rgba(101,194,203,0.3)' }}
                                            onClick={() => handleShareVault(vault.id)}
                                        >
                                            Share
                                        </button>
                                        <button 
                                            className="btn-outline" 
                                            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', color: 'var(--accent)', borderColor: 'rgba(255,0,0,0.3)' }}
                                            onClick={() => handleDeleteVault(vault.id)}
                                        >
                                            Delete
                                        </button>
                                        <button 
                                            className={selectedVault === vault ? "btn" : "btn-outline"} 
                                            style={{ padding: '0.5rem 1.5rem', fontSize: '0.8rem' }}
                                            onClick={() => handleUnlockClick(vault)}
                                        >
                                            {selectedVault === vault ? "Close" : "Unlock"}
                                        </button>
                                    </div>
                                </div>

                                {/* Drag & Drop Unlocking Panel (Unchanged) */}
                                {selectedVault === vault && (
                                    <div className="glass-panel" style={{ background: 'rgba(255,255,255,0.01)', padding: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', alignItems: 'stretch' }}>
                                        
                                        <div 
                                            style={{
                                                border: '2px dashed', 
                                                borderColor: manifestFile ? '#32d74b' : 'rgba(255,255,255,0.2)',
                                                background: manifestFile ? 'rgba(50, 215, 75, 0.05)' : 'rgba(255,255,255,0.01)', 
                                                borderRadius: '4px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
                                            }}
                                            onDragOver={(e) => { e.preventDefault(); if(!manifestFile) e.currentTarget.style.borderColor = 'var(--accent)'; }} 
                                            onDragLeave={(e) => { e.preventDefault(); if(!manifestFile) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                                            onDrop={handleManifestDrop}
                                            onClick={() => manifestInputRef.current.click()}
                                        >
                                            <input type="file" style={{ display: 'none' }} ref={manifestInputRef} onChange={(e) => setManifestFile(e.target.files[0])} />
                                            <div className="meta-label" style={{ marginBottom: '0.5rem', color: manifestFile ? '#32d74b' : 'var(--accent)' }}>1. Manifest.txt</div>
                                            <h4 style={{ margin: 0, fontSize: '0.9rem', color: manifestFile ? '#32d74b' : 'inherit', wordBreak: 'break-all' }}>
                                                {manifestFile ? manifestFile.name : "Drag & Drop or Click"}
                                            </h4>
                                        </div>

                                        <div 
                                            style={{
                                                border: '2px dashed', 
                                                borderColor: keyFile ? '#32d74b' : 'rgba(255,255,255,0.2)',
                                                background: keyFile ? 'rgba(50, 215, 75, 0.05)' : 'rgba(255,255,255,0.01)', 
                                                borderRadius: '4px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
                                            }}
                                            onDragOver={(e) => { e.preventDefault(); if(!keyFile) e.currentTarget.style.borderColor = 'var(--accent)'; }} 
                                            onDragLeave={(e) => { e.preventDefault(); if(!keyFile) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                                            onDrop={handleKeyDrop}
                                            onClick={() => keyInputRef.current.click()}
                                        >
                                            <input type="file" style={{ display: 'none' }} ref={keyInputRef} onChange={(e) => setKeyFile(e.target.files[0])} />
                                            <div className="meta-label" style={{ marginBottom: '0.5rem', color: keyFile ? '#32d74b' : 'var(--accent)' }}>2. Secret.key</div>
                                            <h4 style={{ margin: 0, fontSize: '0.9rem', color: keyFile ? '#32d74b' : 'inherit', wordBreak: 'break-all' }}>
                                                {keyFile ? keyFile.name : "Drag & Drop or Click"}
                                            </h4>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                            <button 
                                                className="btn" 
                                                style={{ 
                                                    width: '100%', 
                                                    padding: '1.5rem', 
                                                    background: (manifestFile && keyFile) ? '#32d74b' : 'rgba(255,255,255,0.1)', 
                                                    color: (manifestFile && keyFile) ? '#000' : 'rgba(255,255,255,0.5)',
                                                    cursor: (manifestFile && keyFile) ? 'pointer' : 'not-allowed',
                                                    border: 'none',
                                                }}
                                                onClick={() => handleRebuild(vault)}
                                                disabled={isRebuilding || !manifestFile || !keyFile}
                                            >
                                                {isRebuilding ? "Fetching from IPFS..." : "Reconstruct File"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}