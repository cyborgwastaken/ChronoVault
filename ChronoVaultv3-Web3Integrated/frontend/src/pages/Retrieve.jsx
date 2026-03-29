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

            let blockchainVaults = [];
            try {
                const contract = new ethers.Contract(CONTRACT_ADDRESS, [
                    "function getMyVaults() view returns (tuple(uint256 id,address owner,string fileName,string category,string originalHash,string rootHash,string manifestCID,uint256 timestamp,bool isActive)[])"
                ], signer);

                const data = await contract.getMyVaults();

                blockchainVaults = data
                    .filter(v => v.isActive)
                    .map(v => ({
                        id: v.id.toString(),
                        fileName: v.fileName,
                        category: v.category,
                        originalHash: v.originalHash,
                        rootHash: v.rootHash,
                        manifestCID: v.manifestCID,
                        date: new Date(Number(v.timestamp) * 1000).toLocaleString(),
                        source: "blockchain"
                    }));
            } catch (err) {}

            let supabaseVaults = [];
            if (profile?.id) {
                const { data: dbVaults } = await supabase
                    .from('vaults')
                    .select('*')
                    .eq('user_id', profile.id);

                supabaseVaults = (dbVaults || []).map(db => ({
                    id: "db_" + db.id,
                    fileName: db.file_name,
                    category: "TimeLock",
                    originalHash: db.original_hash,
                    rootHash: db.root_hash,
                    manifestCID: db.manifest_cid,
                    date: new Date(db.created_at).toLocaleString(),
                    timer_enabled: db.timer_enabled,
                    unlock_time: db.unlock_time,
                    source: "supabase"
                }));
            }

            const merged = [...blockchainVaults, ...supabaseVaults];
            setVaults(merged.reverse());

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

        setSelectedVault(selectedVault === vault ? null : vault);
        setKeyFile(null);
        setManifestFile(null);
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

        try {
            await deductCredits(DOWNLOAD_COST, 'download', `Download ${vault.fileName}`);

            const formData = new FormData();
            formData.append('key_file', keyFile);
            formData.append('manifest_file', manifestFile);
            formData.append('original_hash', vault.originalHash);

            const rootBlob = new Blob([vault.rootHash], { type: "text/plain" });
            formData.append("roothash_file", rootBlob, "roothash.txt");

            const response = await fetch("http://localhost:8080/retrieve", {
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

            alert("File restored successfully!");

        } catch (err) {
            alert(err.message);
        } finally {
            setIsRebuilding(false);
        }
    };

    return (
        <>
            {/* HERO */}
            <div className="grid-container">
                <header className="hero-title glass-panel">
                    <h1>Access.<br/>Rebuild.</h1>
                </header>

                <div className="hero-instruction glass-panel">
                    <p>Select a vault and reconstruct your encrypted file.</p>
                </div>
            </div>

            {/* MAIN */}
            <div className="grid-container">

                {!walletConnected ? (
                    <div className="glass-panel" style={{ gridColumn: "span 12", textAlign: "center" }}>
                        <button className="btn" onClick={handleConnect}>Connect Wallet</button>
                    </div>
                ) : isLoading ? (
                    <div className="glass-panel" style={{ gridColumn: "span 12" }}>
                        Loading vaults...
                    </div>
                ) : vaults.length === 0 ? (
                    <div className="glass-panel" style={{ gridColumn: "span 12" }}>
                        No vaults found.
                    </div>
                ) : (
                    vaults.map(vault => (
                        <div key={vault.id} className="glass-panel" style={{ gridColumn: "span 12", marginBottom: "1rem" }}>

                            {/* TOP ROW */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <h3>{vault.fileName}</h3>
                                    <p style={{ opacity: 0.6 }}>{vault.date}</p>
                                </div>

                                <button className="btn" onClick={() => handleUnlockClick(vault)}>
                                    Unlock
                                </button>
                            </div>

                            {/* EXPANDED */}
                            {selectedVault === vault && (
                                <div style={{
                                    marginTop: "1.5rem",
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "1rem"
                                }}>
                                    <input
                                        type="file"
                                        ref={manifestInputRef}
                                        onChange={(e) => setManifestFile(e.target.files[0])}
                                    />

                                    <input
                                        type="file"
                                        ref={keyInputRef}
                                        onChange={(e) => setKeyFile(e.target.files[0])}
                                    />

                                    <button
                                        className="btn"
                                        style={{ gridColumn: "span 2" }}
                                        onClick={() => handleRebuild(vault)}
                                        disabled={isRebuilding}
                                    >
                                        {isRebuilding ? "Rebuilding..." : "Reconstruct Vault"}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </>
    );
}