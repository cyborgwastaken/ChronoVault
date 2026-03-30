import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../context/AuthContext';
import { supabase, authFetch } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ShieldAlert, Download, Clock, GlobeLock, Database, Trash2, Key, FileText, CheckCircle2, ChevronUp, AlertTriangle } from 'lucide-react';

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
    const [filter, setFilter] = useState('all');
    const [purgeModal, setPurgeModal] = useState(null); // vault to purge, or null
    const [purgeText, setPurgeText] = useState("");

    const manifestInputRef = useRef(null);
    const keyInputRef = useRef(null);

    const DOWNLOAD_COST = 10;

    useEffect(() => { checkWalletAndFetch(); }, []);

    const checkWalletAndFetch = async () => {
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    setWalletConnected(true);
                    fetchVaults();
                }
            } catch (error) { console.error(error); }
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

            const blockchainByRoot = new Map();
            let blockchainQueryOk = false; // stays false if the RPC call throws

            try {
                const contract = new ethers.Contract(CONTRACT_ADDRESS, [
                    "function getMyVaults() view returns (tuple(uint256 id,address owner,string fileName,string category,string originalHash,string rootHash,string manifestCID,uint256 timestamp,bool isActive)[])"
                ], signer);
                const data = await contract.getMyVaults();
                data.filter(v => v.isActive).forEach(v => {
                    const ts = Number(v.timestamp) * 1000;
                    blockchainByRoot.set(v.rootHash, {
                        id: v.id.toString(), fileName: v.fileName, category: v.category,
                        originalHash: v.originalHash, rootHash: v.rootHash, manifestCID: v.manifestCID,
                        date: new Date(ts).toLocaleString(), timestamp: ts, onChain: true
                    });
                });
                blockchainQueryOk = true;
            } catch (err) { console.error("Blockchain error:", err); }

            const allVaults = [];
            const seenRoots = new Set();

            if (profile?.id) {
                const { data: dbVaults } = await supabase.from('vaults').select('*').eq('user_id', profile.id);
                (dbVaults || []).forEach(db => {
                    seenRoots.add(db.root_hash);
                    const ts = new Date(db.created_at).getTime();
                    allVaults.push({
                        id: "db_" + db.id, fileName: db.file_name,
                        category: db.geo_enabled ? "GeoLock" : db.timer_enabled ? "TimeLock" : "Standard",
                        originalHash: db.original_hash, rootHash: db.root_hash,
                        manifestCID: db.manifest_cid, date: new Date(ts).toLocaleString(),
                        timestamp: ts, timer_enabled: db.timer_enabled, unlock_time: db.unlock_time,
                        geo_enabled: db.geo_enabled, latitude: db.latitude, longitude: db.longitude,
                        blockchainTx: db.blockchain_tx || null,
                        // onChain: the Supabase root_hash exists as a key in the
                        // blockchain map, meaning on-chain rootHash === db root_hash.
                        onChain: blockchainByRoot.has(db.root_hash),
                        // blockchainQueryOk lets handleUnlockClick distinguish
                        // "tampered" from "RPC temporarily unavailable".
                        blockchainQueryOk,
                    });
                });
            }

            allVaults.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            setVaults(allVaults);
        } catch (error) {
            toast.error("Error fetching vaults: " + error.message);
        } finally { setIsLoading(false); }
    };

    const handleConnect = async () => {
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            setWalletConnected(true);
            fetchVaults();
        } catch (error) { toast.error("Wallet connection denied"); }
    };

    const handleUnlockClick = (vault) => {
        // Blockchain integrity check.
        // Only block when ALL three conditions are true:
        //   1. This vault was registered on-chain (has a tx hash in Supabase).
        //   2. The blockchain RPC call succeeded this session (network was reachable).
        //   3. The root hash from Supabase is NOT found in the on-chain vault set.
        // Condition 2 prevents a temporary RPC outage from locking every vault.
        if (vault.blockchainTx && vault.blockchainQueryOk && !vault.onChain) {
            toast.error("Integrity check failed: root hash in Supabase does not match the blockchain record. Access blocked.");
            return;
        }

        if (vault.timer_enabled) {
            const now = new Date();
            const unlockTime = new Date(vault.unlock_time);
            if (now < unlockTime) {
                const seconds = Math.ceil((unlockTime - now) / 1000);
                toast.error(`Vault locked. Try again in ${seconds}s`);
                return;
            }
        }
        setSelectedVault(selectedVault?.id === vault.id ? null : vault);
        setKeyFile(null);
        setManifestFile(null);
    };

    const handleDelete = (vault) => {
        if (!vault.manifestCID) { toast.error("No manifest data found."); return; }
        setPurgeText("");
        setPurgeModal(vault);
        document.body.style.overflow = 'hidden';
    };

    const closePurgeModal = () => {
        setPurgeModal(null);
        document.body.style.overflow = '';
    };

    const executePurge = async () => {
        const vault = purgeModal;
        closePurgeModal();
        setIsDeleting(true);
        try {
            const formData = new FormData();
            const manifestBlob = new Blob([vault.manifestCID], { type: "text/plain" });
            formData.append("manifest_file", manifestBlob, "manifest.txt");

            const response = await authFetch(`${import.meta.env.VITE_BACKEND_URL}/delete`, {
                method: "POST", body: formData
            });
            if (!response.ok) throw new Error(await response.text());

            if (vault.id?.toString().startsWith("db_")) {
                await supabase.from('vaults').delete().eq('id', vault.id.replace("db_", ""));
            } else {
                await supabase.from('vaults').delete().eq('root_hash', vault.rootHash);
            }

            setVaults(prev => prev.filter(v => v.id !== vault.id));
            if (selectedVault?.id === vault.id) setSelectedVault(null);
            toast.success("Vault and IPFS shards permanently destroyed.");
        } catch (err) { toast.error("Delete failed: " + err.message); }
        finally { setIsDeleting(false); }
    };

    const handleRebuild = async (vault) => {
        if (!keyFile || !manifestFile) { toast.error("Manifest and Key files required"); return; }
        if (profile.credits < DOWNLOAD_COST) { toast.error("Insufficient credits"); return; }

        setIsRebuilding(true);

        if (vault.geo_enabled) {
            setTxStatus("Verifying location...");
            const getLoc = () => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
            try {
                const pos = await getLoc();
                const uLat = pos.coords.latitude, uLon = pos.coords.longitude;
                const p = 0.017453292519943295, c = Math.cos;
                const a = 0.5 - c((uLat - vault.latitude) * p)/2 + 
                        c(vault.latitude * p) * c(uLat * p) * (1 - c((uLon - vault.longitude) * p))/2;
                const distKm = 12742 * Math.asin(Math.sqrt(a));
                if (distKm > 2) { 
                    toast.error(`Access Denied: ${distKm.toFixed(2)} km away from unlock zone.`);
                    setIsRebuilding(false); setTxStatus(""); return;
                }
            } catch (err) {
                toast.error("Location verification failed.");
                setIsRebuilding(false); setTxStatus(""); return;
            }
        }

        try {
            setTxStatus("Reconstructing from nodes...");
            await deductCredits(DOWNLOAD_COST, 'download', `Download ${vault.fileName}`);

            const formData = new FormData();
            formData.append('key_file', keyFile);
            formData.append('manifest_file', manifestFile);
            formData.append('original_hash', vault.originalHash);
            const rootBlob = new Blob([vault.rootHash], { type: "text/plain" });
            formData.append("roothash_file", rootBlob, "roothash.txt");

            const response = await authFetch(`${import.meta.env.VITE_BACKEND_URL}/retrieve`, {
                method: "POST", body: formData
            });
            if (!response.ok) throw new Error(await response.text());

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = vault.fileName; a.click();
            URL.revokeObjectURL(url);

            toast.success(`Successfully restored ${vault.fileName}`);
            setSelectedVault(null);
            await fetchVaults();
        } catch (err) { toast.error(err.message); }
        finally { setIsRebuilding(false); setTxStatus(""); }
    };

    const handleDropFile = (e, setter) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) setter(e.dataTransfer.files[0]);
    };

    const filteredVaults = vaults.filter(v =>
        filter === 'all' ? true :
        filter === 'time-locked' ? v.timer_enabled :
        filter === 'geo-locked' ? v.geo_enabled :
        !v.timer_enabled && !v.geo_enabled
    );

    const Badge = ({ children, className }) => (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${className}`}>
            {children}
        </span>
    );

    return (
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 animate-fade-in">
            {/* Header */}
            <div className="mb-10">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Access & Retrieve</h1>
                <p className="text-muted-foreground text-sm sm:text-base mb-5">
                    Select a vault and securely reconstruct your encrypted files.
                </p>
                
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                    profile?.credits < DOWNLOAD_COST 
                        ? 'bg-destructive/8 border-destructive/20 text-destructive' 
                        : 'bg-muted/30 border-border/25 text-muted-foreground'
                }`}>
                    {profile?.credits < DOWNLOAD_COST ? 'Insufficient credits — ' : ''}
                    This operation costs <strong className="text-foreground font-mono ml-1">{DOWNLOAD_COST}</strong>&nbsp;credits
                </div>
            </div>

            {!walletConnected ? (
                <Card className="text-center py-16 bg-card/40 backdrop-blur-md border-border/25">
                    <CardHeader>
                        <ShieldAlert className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                        <CardTitle className="text-xl font-semibold">Wallet Required</CardTitle>
                        <CardDescription className="text-sm mx-auto max-w-sm">
                            Connect your Ethereum wallet to access and decrypt your vaults.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button size="lg" onClick={handleConnect} className="h-11">Connect Wallet</Button>
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mb-3" />
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Querying Nodes...</p>
                </div>
            ) : vaults.length === 0 ? (
                <Card className="text-center py-20 bg-card/40 backdrop-blur-md border-border/25 border-dashed">
                    <Database className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <CardTitle className="text-lg mb-1 text-muted-foreground">No vaults found</CardTitle>
                    <CardDescription>You haven't uploaded any files yet.</CardDescription>
                </Card>
            ) : (
                <div className="space-y-5">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-1.5 items-center bg-muted/30 p-1.5 rounded-lg border border-border/25">
                        {[
                            { id: 'all', label: 'All' },
                            { id: 'standard', label: 'Standard' },
                            { id: 'time-locked', label: 'Time-Locked' },
                            { id: 'geo-locked', label: 'Geo-Locked' }
                        ].map(f => (
                            <Button 
                                key={f.id}
                                variant={filter === f.id ? "default" : "ghost"}
                                size="sm"
                                onClick={() => setFilter(f.id)}
                                className="rounded-md text-xs h-7 px-3"
                            >
                                {f.label}
                            </Button>
                        ))}
                        <span className="ml-auto pr-2 text-[11px] text-muted-foreground font-medium">
                            {filteredVaults.length} vault{filteredVaults.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Vault List */}
                    <div className="space-y-3">
                        {filteredVaults.map(vault => (
                            <Card key={vault.id} className={`overflow-hidden transition-all duration-200 ${
                                selectedVault?.id === vault.id 
                                    ? 'border-primary/40 bg-card' 
                                    : 'hover:border-border bg-card/40 backdrop-blur-md border-border/25'
                            }`}>
                                <div className="p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                                {vault.fileName}
                                            </h3>
                                            <div className="flex flex-wrap gap-1.5 items-center mt-1.5">
                                                <span className="text-[11px] text-muted-foreground">{vault.date}</span>
                                                
                                                {vault.timer_enabled && (
                                                    <Badge className="bg-amber-500/8 text-amber-500 border-amber-500/20">
                                                        <Clock className="w-2.5 h-2.5" /> Time
                                                    </Badge>
                                                )}
                                                {vault.geo_enabled && (
                                                    <Badge className="bg-indigo-500/8 text-indigo-400 border-indigo-500/20">
                                                        <GlobeLock className="w-2.5 h-2.5" /> Geo
                                                    </Badge>
                                                )}
                                                {vault.onChain && (
                                                    <Badge className="bg-emerald-500/8 text-emerald-500 border-emerald-500/20">
                                                        <CheckCircle2 className="w-2.5 h-2.5" /> Chain
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button 
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive/70 hover:text-destructive hover:bg-destructive/8 h-8 px-2.5 text-xs"
                                                onClick={() => handleDelete(vault)} 
                                                disabled={isDeleting || isRebuilding}
                                            >
                                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Purge
                                            </Button>
                                            <Button 
                                                variant={selectedVault?.id === vault.id ? "secondary" : "default"}
                                                size="sm"
                                                className="h-8 text-xs"
                                                onClick={() => handleUnlockClick(vault)}
                                            >
                                                {selectedVault?.id === vault.id ? (
                                                    <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Cancel</>
                                                ) : (
                                                    <><Key className="w-3.5 h-3.5 mr-1" /> Unlock</>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Decrypt Panel */}
                                {selectedVault?.id === vault.id && (
                                    <div className="bg-muted/20 border-t border-border/25 p-4 animate-fade-in">
                                        <div className="grid sm:grid-cols-2 gap-3">
                                            {/* Manifest */}
                                            <div
                                                className={`border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                                                    manifestFile ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border/25 hover:border-primary/30 hover:bg-muted/30'
                                                }`}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => handleDropFile(e, setManifestFile)}
                                                onClick={() => manifestInputRef.current?.click()}
                                            >
                                                <input type="file" className="hidden" ref={manifestInputRef} onChange={(e) => setManifestFile(e.target.files[0])} />
                                                <FileText className={`w-6 h-6 mb-1.5 ${manifestFile ? 'text-emerald-500' : 'text-muted-foreground/50'}`} />
                                                <h4 className={`text-xs font-semibold mb-0.5 ${manifestFile ? 'text-emerald-500' : 'text-foreground'}`}>
                                                    {manifestFile ? manifestFile.name : "Manifest File"}
                                                </h4>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {manifestFile ? `${(manifestFile.size / 1024).toFixed(2)} KB` : "Drop .txt"}
                                                </p>
                                            </div>

                                            {/* Key */}
                                            <div
                                                className={`border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                                                    keyFile ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/25 hover:border-primary/30 hover:bg-muted/30'
                                                }`}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => handleDropFile(e, setKeyFile)}
                                                onClick={() => keyInputRef.current?.click()}
                                            >
                                                <input type="file" className="hidden" ref={keyInputRef} onChange={(e) => setKeyFile(e.target.files[0])} />
                                                <Key className={`w-6 h-6 mb-1.5 ${keyFile ? 'text-amber-500' : 'text-muted-foreground/50'}`} />
                                                <h4 className={`text-xs font-semibold mb-0.5 ${keyFile ? 'text-amber-500' : 'text-foreground'}`}>
                                                    {keyFile ? keyFile.name : "Secret Key"}
                                                </h4>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {keyFile ? `${(keyFile.size / 1024).toFixed(2)} KB` : "Drop .key"}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <Button
                                                className="w-full h-10 text-sm font-semibold"
                                                onClick={() => handleRebuild(vault)}
                                                disabled={isRebuilding || !keyFile || !manifestFile}
                                            >
                                                {isRebuilding 
                                                    ? (txStatus || "Rebuilding...") 
                                                    : !keyFile || !manifestFile 
                                                        ? "Provide credentials to reconstruct" 
                                                        : <span className="flex items-center gap-2"><Download className="w-4 h-4"/> Reconstruct & Download</span>}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Purge Confirmation Modal */}
            {purgeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={closePurgeModal}
                    />

                    {/* Panel */}
                    <div className="relative w-full max-w-md rounded-xl border border-destructive/30 bg-card shadow-2xl p-6 animate-fade-in">
                        <div className="flex items-start gap-4 mb-5">
                            <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10 border border-destructive/20">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-foreground mb-1">Permanently Destroy Vault</h2>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    This will unpin all IPFS shards for{' '}
                                    <span className="font-mono text-foreground break-all">"{purgeModal.fileName}"</span>.
                                    {' '}This action cannot be undone.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2 mb-5">
                            <label className="text-xs font-medium text-muted-foreground">
                                Type <span className="font-mono font-bold text-destructive">PURGE</span> to confirm
                            </label>
                            <Input
                                autoFocus
                                value={purgeText}
                                onChange={e => setPurgeText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && purgeText === 'PURGE') executePurge(); }}
                                placeholder="PURGE"
                                className="font-mono border-destructive/30 focus-visible:ring-destructive/40"
                            />
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={closePurgeModal}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                disabled={purgeText !== 'PURGE'}
                                onClick={executePurge}
                            >
                                <Trash2 className="w-4 h-4 mr-2" /> Confirm Purge
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
