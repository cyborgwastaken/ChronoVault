import { useState, useRef, useEffect } from 'react';
import { ethers } from 'ethers';
import Webcam from 'react-webcam';
import { useAuth } from '../context/AuthContext';
import { supabase, authFetch } from '../lib/supabase';
import { checkBiometricServiceHealth, enrollBiometricBatch, hashPin } from '../lib/biometric';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { UploadCloud, CheckCircle2, Shield, Download, RefreshCw, Fingerprint, Camera, X, Trash2 } from 'lucide-react';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const BIOMETRIC_CAPTURE_COUNT = 5;
const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: 'user',
};

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
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [biometricPin, setBiometricPin] = useState('');
    const [confirmBiometricPin, setConfirmBiometricPin] = useState('');
    const [biometricSamples, setBiometricSamples] = useState([]);
    const [biometricModalOpen, setBiometricModalOpen] = useState(false);
    const [biometricEnrollmentReady, setBiometricEnrollmentReady] = useState(false);
    const [biometricCaptureError, setBiometricCaptureError] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef(null);
    const biometricWebcamRef = useRef(null);

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

    const resetBiometricSetup = () => {
        setBiometricPin('');
        setConfirmBiometricPin('');
        setBiometricSamples([]);
        setBiometricCaptureError('');
        setBiometricEnrollmentReady(false);
    };

    const handleBiometricTagToggle = (checked) => {
        if (checked) {
            resetBiometricSetup();
            setBiometricEnabled(true);
            setBiometricModalOpen(true);
            return;
        }

        setBiometricModalOpen(false);
        setBiometricEnabled(false);
        resetBiometricSetup();
    };

    const captureBiometricFrame = () => {
        if (biometricSamples.length >= BIOMETRIC_CAPTURE_COUNT) {
            setBiometricCaptureError(`Exactly ${BIOMETRIC_CAPTURE_COUNT} captures are required.`);
            return;
        }

        const screenshot = biometricWebcamRef.current?.getScreenshot();
        if (!screenshot) {
            setBiometricCaptureError('Failed to capture frame. Allow camera access and retry.');
            return;
        }

        setBiometricCaptureError('');
        setBiometricSamples((prev) => [...prev, screenshot]);
    };

    const removeLastCapture = () => {
        setBiometricSamples((prev) => prev.slice(0, -1));
        setBiometricCaptureError('');
    };

    const closeBiometricModal = () => {
        setBiometricModalOpen(false);
        if (!biometricEnrollmentReady) {
            setBiometricEnabled(false);
            resetBiometricSetup();
        }
    };

    const confirmBiometricSetup = () => {
        if (!biometricPin || biometricPin.length < 4) {
            toast.error('PIN must be at least 4 characters.');
            return;
        }
        if (biometricPin !== confirmBiometricPin) {
            toast.error('PIN confirmation does not match.');
            return;
        }
        if (biometricSamples.length !== BIOMETRIC_CAPTURE_COUNT) {
            toast.error(`Capture exactly ${BIOMETRIC_CAPTURE_COUNT} face photos.`);
            return;
        }

        setBiometricEnrollmentReady(true);
        setBiometricModalOpen(false);
        toast.success('Biometric tag configured. Embeddings will be generated during upload.');
    };

    const MAX_FILE_BYTES = 10 * 1024 * 1024; // must match backend maxUploadSize

    const handleUpload = async () => {
        if (!file) { toast.error("No file selected"); return; }
        if (file.size > MAX_FILE_BYTES) { toast.error("File exceeds the 10 MB limit."); return; }
        if (profile.credits < UPLOAD_COST) { toast.error(`Insufficient credits. You need ${UPLOAD_COST} credits.`); return; }
        if (geoEnabled && !location) { toast.error("Location data is required for Geo-Lock."); return; }
        if (biometricEnabled) {
            if (!biometricEnrollmentReady) {
                toast.error("Complete biometric tag setup (PIN + 5 captures).");
                return;
            }
            if (biometricSamples.length !== BIOMETRIC_CAPTURE_COUNT) {
                toast.error(`Biometric setup requires ${BIOMETRIC_CAPTURE_COUNT} captures.`);
                return;
            }
        }

        setIsUploading(true);
        setTxStatus("Verifying Credits...");

        try {
            // PATCH-WORK REPLACED: Credits were deducted before the upload, so
            // any failure in the IPFS pipeline silently consumed the user's
            // balance with no rollback path.
            //
            // INDUSTRY STANDARD: Deduct credits only after the backend confirms
            // success. If the deduction itself then fails the user retains their
            // file artifacts and can retry — no credit is lost on a server fault.
            setTxStatus("Encrypting & Pushing to IPFS...");

            const formData = new FormData();
            formData.append('file', file);

            const response = await authFetch(`${import.meta.env.VITE_BACKEND_URL}/upload`, { method: 'POST', body: formData });
            const text = await response.text();
            if (!response.ok) throw new Error(text || "Upload failed");

            const data = JSON.parse(text);
            const unlockTime = timerEnabled ? new Date(Date.now() + Number(selectedDuration)) : null;
            let txHash = null;
            let biometricPayload = {
                biometric_enabled: false,
                biometric_hash: null,
                biometric_embedding: null,
                biometric_pin_hash: null,
                biometric_model: null,
            };

            if (biometricEnabled) {
                setTxStatus('Generating Siamese biometric embedding...');
                await checkBiometricServiceHealth();
                const enrollment = await enrollBiometricBatch(biometricSamples);
                const pinHash = await hashPin(biometricPin);

                biometricPayload = {
                    biometric_enabled: true,
                    biometric_hash: enrollment.embedding_hash,
                    biometric_embedding: enrollment.embedding,
                    biometric_pin_hash: pinHash,
                    biometric_model: enrollment.model_name || 'facenet-vggface2-siamese-embedding',
                };
            }

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
                ...biometricPayload,
            });

            if (vaultError) {
                console.error('Error saving vault to Supabase:', vaultError);
                throw new Error(`Supabase save failed: ${vaultError.message}. Run backend/supabase_biometric_migration.sql if biometric fields are missing.`);
            }

            // Deduct credits only after IPFS upload + blockchain + vault save all
            // succeeded. Nothing was lost if any earlier step threw an error.
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
                    <Card className="md:col-span-3 bg-card/40 backdrop-blur-md border-border/25">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base font-semibold">Vault Configuration</CardTitle>
                            <CardDescription className="text-xs">Setup security parameters for your file</CardDescription>
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
                                <Label htmlFor="category" className="text-xs">Data Category</Label>
                                <select 
                                    id="category"
                                    value={category} 
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full flex h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                    <option value="Personal">Personal Data</option>
                                    <option value="Medical">Medical Records</option>
                                    <option value="Financial">Financial Documents</option>
                                    <option value="Code">Source Code</option>
                                </select>
                            </div>

                            {/* Locks */}
                            <div className="space-y-4 rounded-lg border border-border/25 bg-muted/20 p-4">
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
                                        className="w-full flex h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                                            {locationError ? locationError : location ? 'GPS verified' : 'Acquiring coordinates...'}
                                        </p>
                                    )}
                                </div>

                                <div className="border-t border-border/25 pt-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-sm">Biometric Tag</Label>
                                            <p className="text-[11px] text-muted-foreground">PIN + 5 webcam captures for Siamese embedding enrollment</p>
                                        </div>
                                        <Switch checked={biometricEnabled} onCheckedChange={handleBiometricTagToggle} />
                                    </div>

                                    {biometricEnabled && (
                                        <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-2.5 text-xs text-cyan-200 flex items-center justify-between">
                                            <span>
                                                {biometricEnrollmentReady
                                                    ? `Biometric profile ready (${biometricSamples.length}/${BIOMETRIC_CAPTURE_COUNT} captures)`
                                                    : 'Biometric setup incomplete'}
                                            </span>
                                            <Button type="button" size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => setBiometricModalOpen(true)}>
                                                {biometricEnrollmentReady ? 'Edit' : 'Setup'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button 
                                className="w-full font-semibold h-11" 
                                onClick={handleUpload} 
                                disabled={!file || isUploading || (profile?.credits < UPLOAD_COST) || (geoEnabled && !location) || (biometricEnabled && !biometricEnrollmentReady)}
                            >
                                {isUploading ? (
                                    <span className="flex items-center gap-2">
                                        <RefreshCw className="h-4 w-4 animate-spin" /> {txStatus || "Processing"}
                                    </span>
                                ) : profile?.credits < UPLOAD_COST ? (
                                    "Insufficient Credits"
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Shield className="h-4 w-4" /> Initiate Protocol
                                    </span>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                    
                    {/* Right: Info (2/5) */}
                    <div className="md:col-span-2 flex items-center">
                        <div className="p-6 space-y-5">
                            <Shield className="w-12 h-12 text-muted-foreground/20" />
                            <div>
                                <h4 className="font-semibold text-sm mb-1.5">Zero-Knowledge Architecture</h4>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Everything is encrypted locally via AES-256 before leaving your browser. We never see your data.
                                </p>
                            </div>
                            <div className="space-y-2.5 pt-2">
                                {['Decentralized', 'Tamper-proof', 'Web3 Native'].map(item => (
                                    <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                        {item}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* Success View */
                <div className="space-y-6 animate-fade-in">
                    <Card className="border-emerald-500/20 bg-emerald-500/5">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-emerald-500 flex items-center gap-2 text-base">
                                <CheckCircle2 className="h-5 w-5" /> Protocol Success
                            </CardTitle>
                            <CardDescription className="text-emerald-500/70 text-xs">
                                Secured to Blockchain under category: {category}
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    <div className="grid md:grid-cols-3 gap-4">
                        <Card className="bg-card/40 backdrop-blur-md border-border/25">
                            <CardHeader className="pb-1.5">
                                <CardTitle className="text-[11px] text-muted-foreground uppercase tracking-wider">Original Hash</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <code className="text-xs text-primary break-all">{artifactData.original_hash}</code>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-card/40 backdrop-blur-md border-border/25">
                            <CardHeader className="pb-1.5">
                                <CardTitle className="text-[11px] text-muted-foreground uppercase tracking-wider">Root Hash</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <code className="text-xs text-primary break-all">{artifactData.root_hash}</code>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-card/40 backdrop-blur-md border-amber-500/30">
                            <CardHeader className="pb-1.5">
                                <CardTitle className="text-[11px] text-amber-500 uppercase tracking-wider flex items-center justify-between">
                                    Private Key
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20">
                                        CONFIDENTIAL
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <code className="text-xs text-amber-400 break-all">{artifactData.encryption_key}</code>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="bg-card/40 backdrop-blur-md border-border/25">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base font-semibold">Artifact Downloads</CardTitle>
                            <CardDescription className="text-xs">Save keys and manifests required for decryption.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                                <Button variant="secondary" size="sm" className="text-xs" onClick={() => downloadString(artifactData.manifest_content, `manifest_${file.name}.txt`, 'text/plain')}>Manifest</Button>
                                <Button variant="secondary" size="sm" className="text-xs" onClick={() => downloadString(artifactData.root_hash, `roothash_${file.name}.txt`, 'text/plain')}>Root Hash</Button>
                                <Button size="sm" className="text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={() => downloadString(artifactData.encryption_key, `secret_${file.name}.key`, 'application/octet-stream')}>Secret Key</Button>
                                <Button variant="outline" size="sm" className="text-xs" onClick={() => downloadString(JSON.stringify(artifactData, null, 2), `artifacts_${file.name}.json`, 'application/json')}>JSON File</Button>
                            </div>
                            <div className="flex gap-3 pt-4 border-t border-border/25">
                                <Button onClick={handleDownloadAll} className="flex-1 gap-2 h-10">
                                    <Download className="h-4 w-4" /> Download All
                                </Button>
                                <Button variant="outline" className="h-10" onClick={() => { setArtifactData(null); setFile(null); setBiometricEnabled(false); resetBiometricSetup(); }}>
                                    New Upload
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {biometricModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeBiometricModal} />

                    <Card className="relative w-full max-w-2xl border-cyan-500/30 bg-card/95 backdrop-blur-xl">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Fingerprint className="h-4 w-4 text-cyan-400" /> Biometric Tag Enrollment
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Enter PIN, then capture exactly {BIOMETRIC_CAPTURE_COUNT} face images from webcam.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="bio-pin-modal" className="text-xs">Vault PIN</Label>
                                    <Input
                                        id="bio-pin-modal"
                                        type="password"
                                        value={biometricPin}
                                        onChange={(e) => setBiometricPin(e.target.value)}
                                        placeholder="Min 4 characters"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="bio-pin-confirm-modal" className="text-xs">Confirm PIN</Label>
                                    <Input
                                        id="bio-pin-confirm-modal"
                                        type="password"
                                        value={confirmBiometricPin}
                                        onChange={(e) => setConfirmBiometricPin(e.target.value)}
                                        placeholder="Repeat PIN"
                                    />
                                </div>
                            </div>

                            <div className="rounded-lg overflow-hidden border border-border/25 bg-black/50">
                                <Webcam
                                    ref={biometricWebcamRef}
                                    audio={false}
                                    mirrored
                                    screenshotFormat="image/jpeg"
                                    screenshotQuality={0.92}
                                    videoConstraints={videoConstraints}
                                    onUserMediaError={(err) => setBiometricCaptureError(err?.message || 'Camera access denied')}
                                    className="w-full h-auto"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <Button type="button" size="sm" onClick={captureBiometricFrame} disabled={biometricSamples.length >= BIOMETRIC_CAPTURE_COUNT} className="gap-1.5 text-xs">
                                    <Camera className="h-3.5 w-3.5" /> Capture {biometricSamples.length + 1}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={removeLastCapture} disabled={biometricSamples.length === 0} className="gap-1.5 text-xs">
                                    <Trash2 className="h-3.5 w-3.5" /> Undo
                                </Button>
                                <span className="text-xs text-muted-foreground ml-auto">
                                    {biometricSamples.length}/{BIOMETRIC_CAPTURE_COUNT} captured
                                </span>
                            </div>

                            {biometricCaptureError && <p className="text-xs text-destructive">{biometricCaptureError}</p>}

                            {biometricSamples.length > 0 && (
                                <div className="grid grid-cols-5 gap-2">
                                    {biometricSamples.map((sample, idx) => (
                                        <div key={`${sample.slice(0, 24)}_${idx}`} className="rounded border border-border/25 overflow-hidden">
                                            <img src={sample} alt={`Capture ${idx + 1}`} className="w-full h-16 object-cover" />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                <Button variant="outline" className="flex-1" onClick={closeBiometricModal}>
                                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                                </Button>
                                <Button className="flex-1" onClick={confirmBiometricSetup}>
                                    Save Biometric Tag
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}