import { useState, useRef, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../context/AuthContext';
import { supabase, authFetch } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { UploadCloud, CheckCircle2, Shield, Download, RefreshCw, ScanFace, BrainCircuit } from 'lucide-react';

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

export default function Upload() {
    const { profile, deductCredits, linkWallet } = useAuth();
    const [file, setFile] = useState(null);
    const [category, setCategory] = useState("Personal"); 
    const [timerEnabled, setTimerEnabled] = useState(false);
    const [selectedDuration, setSelectedDuration] = useState(10000);
    const [isUploading, setIsUploading] = useState(false);
    const [txStatus, setTxStatus] = useState(""); 
    const [artifactData, setArtifactData] = useState(null);
    const [geoEnabled, setGeoEnabled] = useState(false);
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState("");
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef(null);

    // AI Vault States
    const [facialEnabled, setFacialEnabled] = useState(false);
    const [facialPin, setFacialPin] = useState('');
    const [facialStatus, setFacialStatus] = useState('idle');
    const [facialAuthData, setFacialAuthData] = useState(null);

    const [emotionalEnabled, setEmotionalEnabled] = useState(false);
    const [emotionalText, setEmotionalText] = useState('');
    const [emotionalStatus, setEmotionalStatus] = useState('idle');
    const [emotionalAuthData, setEmotionalAuthData] = useState(null);

    const UPLOAD_COST = 40;

    useEffect(() => {
        if (geoEnabled && !location && !locationError) {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setLocation({
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        });
                        setLocationError("");
                    },
                    (err) => {
                        console.error("Geolocation error:", err);
                        setLocationError("Failed to access location. Please enable location services.");
                    }
                );
            } else {
                setLocationError("Geolocation not supported by your browser.");
            }
        }
    }, [geoEnabled, location, locationError]);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
    };

    const MAX_FILE_BYTES = 10 * 1024 * 1024;

    // --- AI Callbacks ---
    const handleFacialAuth = async () => {
        if (!facialPin) { toast.error('PIN Required'); return; }
        
        setFacialStatus('processing');
        toast.info('Initializing Local OpenCV Process...');
    
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
            toast.error('Authentication Error', { description: 'Missing secure session token.' });
            setFacialStatus('error');
            return;
        }
    
        try {
            const response = await fetch('http://localhost:8080/api/enroll-facial-auth', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ pin: facialPin })
            });
            
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            setFacialAuthData(data);
            setFacialStatus('success');
            toast.success('Biometric Profile Matched');
        } catch (err) {
            setFacialStatus('error');
            toast.error('Access Denied: ' + err.message);
        }
    };

    const handleEmotionalAuth = async () => {
        if (!emotionalText.trim()) { toast.error('Input Required'); return; }
        
        setEmotionalStatus('processing');
        toast.info('Running local RoBERTa inference...');
    
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
            toast.error('Authentication Error', { description: 'Missing secure session token.' });
            setEmotionalStatus('error');
            return;
        }
    
        try {
            const response = await fetch('http://localhost:8080/api/enroll-emotional-auth', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: emotionalText })
            });
            
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            setEmotionalAuthData(data);
            setEmotionalStatus('success');
            toast.success('State Verified');
        } catch (err) {
            setEmotionalStatus('error');
            toast.error('NLP Error: ' + err.message);
        }
    };

    // --- Core Upload ---
    const handleUpload = async () => {
        if (!file) { toast.error("No file selected"); return; }
        if (file.size > MAX_FILE_BYTES) { toast.error("File exceeds the 10 MB limit."); return; }
        if (profile.credits < UPLOAD_COST) { toast.error(`Insufficient credits.`); return; }
        if (geoEnabled && !location) { toast.error("Location data is required for Geo-Lock."); return; }
        
        if (facialEnabled && facialStatus !== 'success') { toast.error("Please complete the Facial Recognition scan first."); return; }
        if (emotionalEnabled && emotionalStatus !== 'success') { toast.error("Please complete the Emotional State analysis first."); return; }

        setIsUploading(true);
        setTxStatus("Verifying Credits...");

        try {
            setTxStatus("Encrypting & Pushing to IPFS...");

            const formData = new FormData();
            formData.append('file', file);

            const response = await authFetch(`${import.meta.env.VITE_BACKEND_URL}/upload`, { method: 'POST', body: formData });
            const text = await response.text();
            if (!response.ok) throw new Error(text || "Upload failed");

            const data = JSON.parse(text);
            const unlockTime = timerEnabled ? new Date(Date.now() + Number(selectedDuration)) : null;
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
                    toast.error("Please switch MetaMask network to Sepolia.");
                    setIsUploading(false);
                    return;
                }

                setTxStatus("Awaiting Wallet Approval...");
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const walletAddress = await signer.getAddress();
                const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

                if (!profile.wallet_address || profile.wallet_address !== walletAddress) {
                    await linkWallet(walletAddress);
                }

                const tx = await contract.secureVault(
                    file.name, category,
                    data.original_hash || "N/A",
                    data.root_hash,
                    "PENDING_MANIFEST_CID"
                );

                setTxStatus("Writing to Blockchain...");
                const receipt = await tx.wait();
                txHash = receipt.hash;
                toast.success("Vault Secured on Blockchain!");
            } else {
                toast.warning("MetaMask not detected. Secured locally only.");
            }

            const { error: vaultError } = await supabase.from('vaults').insert({
                user_id: profile.id,
                file_name: file.name,
                original_hash: data.original_hash,
                root_hash: data.root_hash,
                manifest_cid: data.manifest_content,
                blockchain_tx: txHash,
                timer_enabled: timerEnabled,
                unlock_time: unlockTime ? unlockTime.toISOString() : null,
                geo_enabled: geoEnabled,
                latitude: location ? location.latitude : null,
                longitude: location ? location.longitude : null,
                facial_enabled: facialEnabled,
                emotional_enabled: emotionalEnabled,
            });

            if (vaultError) console.error('Error saving vault to Supabase:', vaultError);

            await deductCredits(UPLOAD_COST, 'upload', `Upload: ${file.name}`);

            setArtifactData(data);
            toast.success("File encrypted and shredded successfully.");
        } catch (error) {
            console.error(error);
            toast.error("Protocol Failed: " + error.message);
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

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const handleDownloadAll = async () => { 
        downloadString(artifactData.manifest_content, `manifest_${file.name}.txt`, 'text/plain'); await delay(300);
        downloadString(artifactData.root_hash, `roothash_${file.name}.txt`, 'text/plain'); await delay(300);
        downloadString(artifactData.encryption_key, `secret_${file.name}.key`, 'application/octet-stream'); await delay(300);
        downloadString(JSON.stringify(artifactData, null, 2), `artifacts_${file.name}.json`, 'application/json'); 
    };

    return (
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 animate-fade-in">
            {/* Header */}
            <div className="mb-10">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Upload & Secure</h1>
                <p className="text-muted-foreground text-sm sm:text-base mb-5">
                    Your file will be locally encrypted, shredded, and prepared for distribution. Keys remain yours.
                </p>
                
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                    profile?.credits < UPLOAD_COST 
                        ? 'bg-destructive/8 border-destructive/20 text-destructive' 
                        : 'bg-muted/30 border-border/25 text-muted-foreground'
                }`}>
                    {profile?.credits < UPLOAD_COST ? 'Insufficient credits — ' : ''}
                    This operation costs <strong className="text-foreground font-mono ml-1">{UPLOAD_COST}</strong>&nbsp;credits
                </div>
            </div>

            {!artifactData ? (
                <div className="grid md:grid-cols-5 gap-6">
                    {/* Left: Configuration (3/5) */}
                    <Card className="md:col-span-3 bg-card/40 backdrop-blur-md border-border/25 shadow-xl">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base font-semibold">Vault Configuration</CardTitle>
                            <CardDescription className="text-xs">Setup modular security parameters for your file</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            
                            {/* File Upload Area */}
                            <div 
                                className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                                    isDragOver ? 'border-primary bg-primary/5 scale-[1.01]' :
                                    file ? 'border-primary/40 bg-primary/5' : 'border-border/60 hover:border-primary/30 hover:bg-muted/30'
                                }`}
                                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }} 
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current.click()}
                            >
                                <input type="file" className="hidden" ref={fileInputRef} onChange={(e) => setFile(e.target.files[0])} />
                                <UploadCloud className={`h-10 w-10 mb-3 transition-colors ${file ? 'text-primary' : 'text-muted-foreground/50'}`} />
                                <h3 className={`font-semibold text-sm mb-0.5 ${file ? 'text-primary' : 'text-foreground'}`}>
                                    {file ? file.name : "Drag & Drop File"}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    {file ? `${(file.size/1024).toFixed(2)} KB ready` : "or click to browse"}
                                </p>
                            </div>

                            {/* Category */}
                            <div className="space-y-2">
                                <Label htmlFor="category" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Data Category</Label>
                                <select 
                                    id="category"
                                    value={category} 
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full flex h-9 rounded-md border border-border bg-background/50 px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                >
                                    <option value="Personal">Personal Data</option>
                                    <option value="Medical">Medical Records</option>
                                    <option value="Financial">Financial Documents</option>
                                    <option value="Code">Source Code</option>
                                </select>
                            </div>

                            {/* Standard Locks */}
                            <div className="space-y-4 rounded-xl border border-border/25 bg-muted/20 p-5 shadow-inner">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">Standard Constraints</Label>
                                
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm">Time Lock</Label>
                                        <p className="text-[11px] text-muted-foreground">Prevent decryption until a future date</p>
                                    </div>
                                    <Switch checked={timerEnabled} onCheckedChange={setTimerEnabled} />
                                </div>
                                
                                {timerEnabled && (
                                    <select
                                        value={selectedDuration}
                                        onChange={(e) => setSelectedDuration(Number(e.target.value))}
                                        className="w-full flex h-9 rounded-md border border-input bg-background/50 px-3 py-1.5 text-sm mt-2"
                                    >
                                        <option value={10000}>10 seconds (Demo)</option>
                                        <option value={86400000}>24 Hours</option>
                                        <option value={604800000}>1 Week</option>
                                        <option value={2592000000}>30 Days</option>
                                        <option value={31536000000}>1 Year</option>
                                    </select>
                                )}

                                <div className="border-t border-border/25 pt-4">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-sm">Geo Lock</Label>
                                            <p className="text-[11px] text-muted-foreground">Restrict access to current location</p>
                                        </div>
                                        <Switch checked={geoEnabled} onCheckedChange={setGeoEnabled} />
                                    </div>

                                    {geoEnabled && (
                                        <p className={`text-xs mt-2 ${location ? 'text-emerald-500' : (locationError ? 'text-destructive' : 'text-amber-500 animate-pulse')}`}>
                                            {locationError ? locationError : location ? `GPS verified` : "Acquiring coordinates..."}
                                        </p>
                                    )}
                                </div>
                            </div>
                            
                            {/* AI / Biometric Locks */}
                            <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-5 shadow-[0_0_15px_rgba(59,130,246,0.05)]">
                                <Label className="text-xs uppercase tracking-wider text-primary font-semibold mb-2 flex items-center gap-1.5 block">
                                    <Shield className="w-3.5 h-3.5"/> Deep Verification Constraints
                                </Label>
                                
                                {/* Facial Recognition */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium flex items-center gap-2"><ScanFace className="w-4 h-4 text-blue-400"/> Facial Recognition</Label>
                                        <p className="text-[11px] text-muted-foreground">Require OS-level webcam biometric scanning</p>
                                    </div>
                                    <Switch checked={facialEnabled} onCheckedChange={setFacialEnabled} />
                                </div>
                                
                                {facialEnabled && (
                                    <div className="mt-3 p-4 border border-blue-500/20 bg-blue-500/10 rounded-lg space-y-3">
                                        {facialStatus === 'success' ? (
                                            <div className="text-emerald-400 text-xs flex flex-col gap-2 bg-emerald-500/10 p-3 rounded-md border border-emerald-500/20">
                                                <span className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="w-4 h-4" /> Identity Verified</span>
                                                <code className="text-emerald-300/80 break-all">Auth AES: {facialAuthData?.mock_aes_key}</code>
                                            </div>
                                        ) : (
                                            <>
                                                <Input 
                                                    type="password"
                                                    placeholder="Vault PIN (MFA Validation Level)"
                                                    value={facialPin}
                                                    onChange={(e) => setFacialPin(e.target.value)}
                                                    className="h-9 text-xs font-mono bg-black/40 border-blue-500/30 text-blue-100 placeholder:text-blue-500/50"
                                                />
                                                <Button 
                                                    variant="secondary" 
                                                    onClick={handleFacialAuth}
                                                    disabled={facialStatus === 'processing'}
                                                    className={`w-full text-xs font-semibold tracking-wide ${facialStatus === 'processing' ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400'}`}
                                                >
                                                    {facialStatus === 'processing' ? <span className="flex items-center gap-2 flex-grow justify-center"><RefreshCw className="w-4 h-4 animate-spin"/> Scanning...</span> : 'Authenticate via Local Webcam'}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Emotional NLP Area */}
                                <div className="border-t border-primary/20 pt-4 mt-4">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-sm font-medium flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-purple-400"/> NLP Emotional State</Label>
                                            <p className="text-[11px] text-muted-foreground">Require cognitive contextual polygraph analysis</p>
                                        </div>
                                        <Switch checked={emotionalEnabled} onCheckedChange={setEmotionalEnabled} />
                                    </div>

                                    {emotionalEnabled && (
                                        <div className="mt-3 p-4 border border-purple-500/20 bg-purple-500/10 rounded-lg space-y-3 animate-in fade-in zoom-in-95">
                                            {emotionalStatus === 'success' ? (
                                                <div className="text-emerald-400 text-xs flex flex-col gap-2 bg-emerald-500/10 p-3 rounded-md border border-emerald-500/20">
                                                    <span className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="w-4 h-4" /> Cognitive State Verified</span>
                                                    <code className="text-emerald-300/80 break-all">Auth AES: {emotionalAuthData?.mock_aes_key}</code>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between items-center bg-black/40 px-3 py-1.5 rounded-md border border-purple-500/30">
                                                        <span className="text-[10px] text-purple-300 font-mono uppercase">Target Required:</span>
                                                        <span className="text-xs text-white font-bold bg-purple-600/50 px-2 py-0.5 rounded">JOY</span>
                                                    </div>
                                                    <textarea 
                                                        placeholder="Speak or type your current thoughts natively..."
                                                        value={emotionalText}
                                                        onChange={(e) => setEmotionalText(e.target.value)}
                                                        className="w-full h-20 bg-black/40 border border-purple-500/30 text-purple-50 placeholder-purple-300/40 px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 text-xs font-sans resize-none"
                                                    />
                                                    <Button 
                                                        variant="secondary" 
                                                        onClick={handleEmotionalAuth}
                                                        disabled={emotionalStatus === 'processing'}
                                                        className={`w-full text-xs font-semibold tracking-wide ${emotionalStatus === 'processing' ? 'bg-purple-600/20 text-purple-400' : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400'}`}
                                                    >
                                                        {emotionalStatus === 'processing' ? <span className="flex items-center gap-2 flex-grow justify-center"><RefreshCw className="w-4 h-4 animate-spin"/> Processing RoBERTa...</span> : 'Analyze Emotional State'}
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                        
                        <CardFooter className="pt-2 pb-6 px-6">
                            <Button 
                                className="w-full font-bold tracking-wider h-12 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-shadow" 
                                onClick={handleUpload} 
                                disabled={isUploading}
                            >
                                {isUploading ? (
                                    <span className="flex items-center gap-2">
                                        <RefreshCw className="h-4 w-4 animate-spin" /> {txStatus || "Processing"}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Shield className="h-5 w-5" /> INITIATE PROTOCOL
                                    </span>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                    
                    {/* Right: Info (2/5) */}
                    <div className="md:col-span-2 flex items-start pt-4">
                        <div className="p-6 space-y-6 bg-card/10 border border-white/5 rounded-2xl">
                            <Shield className="w-10 h-10 text-primary/40" />
                            <div>
                                <h4 className="font-semibold text-sm mb-2 text-primary">Zero-Knowledge Architecture</h4>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Everything is encrypted locally via AES-256 before leaving your browser. The biometric protocols operate completely offline.
                                </p>
                            </div>
                            <div className="space-y-3 pt-2">
                                {['Decentralized Blockchain', 'Deepfake Prevention', 'Native NLP Isolation'].map(item => (
                                    <div key={item} className="flex items-center gap-2.5 text-xs text-muted-foreground font-medium">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                                        {item}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* Success View */
                <div className="space-y-6 animate-fade-in shadow-2xl">
                    <Card className="border-emerald-500/30 bg-emerald-500/10 backdrop-blur-md">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-emerald-400 flex items-center gap-2 text-lg font-bold">
                                <CheckCircle2 className="h-6 w-6" /> Protocol Success
                            </CardTitle>
                            <CardDescription className="text-emerald-500/80 text-sm font-medium">
                                Data successfully shredded and deployed under: {category}
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    <div className="grid md:grid-cols-3 gap-5">
                        <Card className="bg-card/40 backdrop-blur-md border-border/25">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Original Hash</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <code className="text-xs text-primary/90 break-all font-mono">{artifactData.original_hash}</code>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-card/40 backdrop-blur-md border-border/25">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Root Hash</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <code className="text-xs text-emerald-400 break-all font-mono">{artifactData.root_hash}</code>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-amber-950/20 backdrop-blur-md border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.05)]">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] text-amber-500 uppercase tracking-widest flex items-center justify-between font-bold">
                                    Private Key
                                    <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-[8px] border border-amber-500/30">
                                        CONFIDENTIAL
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <code className="text-xs text-amber-400 break-all font-mono font-medium">{artifactData.encryption_key}</code>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="bg-card/40 backdrop-blur-md border-border/25">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base font-semibold">Artifact Downloads</CardTitle>
                            <CardDescription className="text-xs">Securely save your cryptographic keys and manifests required for future decryption.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                                <Button variant="secondary" size="sm" className="text-xs font-semibold" onClick={() => downloadString(artifactData.manifest_content, `manifest_${file.name}.txt`, 'text/plain')}>Manifest</Button>
                                <Button variant="secondary" size="sm" className="text-xs font-semibold" onClick={() => downloadString(artifactData.root_hash, `roothash_${file.name}.txt`, 'text/plain')}>Root Hash</Button>
                                <Button size="sm" className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold tracking-wide border border-amber-500/50 shadow-[0_0_15px_rgba(217,119,6,0.5)]" onClick={() => downloadString(artifactData.encryption_key, `secret_${file.name}.key`, 'application/octet-stream')}>Secret Key</Button>
                                <Button variant="outline" size="sm" className="text-xs font-semibold border-white/20" onClick={() => downloadString(JSON.stringify(artifactData, null, 2), `artifacts_${file.name}.json`, 'application/json')}>JSON MetaData</Button>
                            </div>
                            <div className="flex gap-4 pt-5 border-t border-border/25">
                                <Button onClick={handleDownloadAll} className="flex-1 gap-2 h-11 font-bold tracking-wide">
                                    <Download className="h-4 w-4" /> BATCH DOWNLOAD ALL
                                </Button>
                                <Button variant="outline" className="h-11 px-8 font-semibold border-white/20 hover:bg-white/5" onClick={() => { setArtifactData(null); setFile(null); }}>
                                    Lock New Vault
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}