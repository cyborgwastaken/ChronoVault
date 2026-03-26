import { useState, useRef } from 'react';

export default function Retrieve() {
    const [artifactData, setArtifactData] = useState(null);
    const [jsonStatus, setJsonStatus] = useState(null);
    const [manualFiles, setManualFiles] = useState({ root: null, manifest: null, key: null });
    const [originalHash, setOriginalHash] = useState('');
    const [isRetrieving, setIsRetrieving] = useState(false);
    const [downloadInfo, setDownloadInfo] = useState(null);

    const jsonInputRef = useRef(null);
    const rootInputRef = useRef(null);
    const manifestInputRef = useRef(null);
    const keyInputRef = useRef(null);

    const processJson = async (file) => {
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!parsed.root_hash || !parsed.encryption_key || !parsed.manifest_content) {
                throw new Error("Invalid Artifact Structure");
            }
            setArtifactData(parsed);
            setJsonStatus({ success: true, text: "Artifacts Loaded Successfully" });
            if (parsed.original_hash) setOriginalHash(parsed.original_hash);
            setManualFiles({ root: null, manifest: null, key: null });
        } catch (err) {
            console.error(err);
            setJsonStatus({ success: false, text: "Error: Invalid JSON File" });
            setArtifactData(null);
        }
    };

    const handleManualFile = (type, file) => {
        if (!file) return;
        setManualFiles(prev => ({ ...prev, [type]: file }));
        setArtifactData(null);
        setJsonStatus(null);
    };

    const handleRetrieve = async () => {
        setIsRetrieving(true);
        setDownloadInfo(null);
        const formData = new FormData();

        if (artifactData) {
            formData.append('roothash_file', new Blob([artifactData.root_hash], { type: 'text/plain' }), 'roothash.txt');
            formData.append('manifest_file', new Blob([artifactData.manifest_content], { type: 'text/plain' }), 'manifest.txt');
            formData.append('key_file', new Blob([artifactData.encryption_key], { type: 'text/plain' }), 'secret.key');
        } else {
            if (!manualFiles.root || !manualFiles.manifest || !manualFiles.key) {
                setIsRetrieving(false);
                return alert("Please upload all 3 required files (Root, Manifest, Key) or use the JSON Fast Track.");
            }
            formData.append('roothash_file', manualFiles.root);
            formData.append('manifest_file', manualFiles.manifest);
            formData.append('key_file', manualFiles.key);
        }

        if (originalHash.trim()) formData.append('original_hash', originalHash.trim());

        try {
            const response = await fetch('http://localhost:8080/retrieve', { method: 'POST', body: formData });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || 'Retrieval failed');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="?([^";]+)"?/i);
            const fileName = match ? match[1] : 'restored_file';

            const verifiedHeader = response.headers.get('X-Integrity-Verified');
            let verifiedStatus = 'unavailable';
            if (verifiedHeader === 'true') verifiedStatus = 'true';
            if (verifiedHeader === 'false') verifiedStatus = 'false';

            setDownloadInfo({ url, fileName, verifiedStatus });
        } catch (error) {
            console.error(error);
            alert(`Retrieval Failed: ${error.message}`);
        } finally {
            setIsRetrieving(false);
        }
    };

    const ManualDropZone = ({ label, title, subtitle, type, fileState, inputRef }) => (
        <div className="glass-panel" style={{ gridColumn: 'span 4', borderRight: type === 'key' ? 'none' : '' }}>
            <span className="meta-label">{label}</span>
            <div 
                style={{ 
                    height: '150px', border: '1px solid rgba(255,255,255,0.1)', 
                    background: fileState ? 'rgba(50, 215, 75, 0.05)' : 'rgba(0,0,0,0.2)', 
                    borderColor: fileState ? 'var(--success)' : 'rgba(255,255,255,0.1)',
                    marginTop: '1rem', opacity: artifactData ? 0.3 : 1, transition: '0.3s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer'
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleManualFile(type, e.dataTransfer.files[0]); }}
                onClick={() => inputRef.current.click()}
            >
                <input type="file" style={{ display: 'none' }} ref={inputRef} onChange={e => handleManualFile(type, e.target.files[0])} />
                <p style={{ margin: 0 }}>{title}</p>
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: fileState ? 'var(--success)' : 'inherit' }}>
                    {fileState ? fileState.name : subtitle}
                </div>
            </div>
        </div>
    );

    return (
        <>
            <div className="grid-container">
                <header className="hero-title glass-panel" style={{ background: 'transparent', backdropFilter: 'none' }}>
                    <h1>Retrieve &<br/><span style={{ color: 'rgba(255,255,255,0.2)' }}>Decrypt.</span></h1>
                </header>
                <div className="hero-instruction glass-panel">
                    <p>Reconstruct your file by providing the necessary artifacts. Verification against the blockchain root hash is automatic.</p>
                </div>
            </div>

            <div className="grid-container">
                <div className="section-header glass-panel" style={{ gridColumn: 'span 12', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div className="meta-label">Option A</div>
                        <h2>Fast Track</h2>
                    </div>
                </div>
                <div className="glass-panel" style={{ gridColumn: 'span 12', padding: '3rem 2rem' }}>
                    <div 
                        style={{ 
                            width: '100%', height: '200px', border: '2px dashed rgba(255,255,255,0.2)', 
                            background: artifactData ? 'rgba(50, 215, 75, 0.05)' : 'rgba(255,255,255,0.01)', 
                            borderRadius: '4px', borderColor: artifactData ? 'var(--success)' : 'rgba(255,255,255,0.2)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer'
                        }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); processJson(e.dataTransfer.files[0]); }}
                        onClick={() => jsonInputRef.current.click()}
                    >
                        <input type="file" accept=".json" style={{ display: 'none' }} ref={jsonInputRef} onChange={e => processJson(e.target.files[0])} />
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
                            <img src="/images/upload.png" alt="Upload Icon" style={{ width: '60px', height: '60px', objectFit: 'contain' }} />
                        </div>
                        <h3 style={{ margin: 0 }}>Drag Artifacts JSON</h3>
                        <p style={{ margin: 0 }}>artifacts_filename.json</p>
                        {jsonStatus && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: jsonStatus.success ? 'var(--success)' : 'var(--accent)', fontWeight: 'bold' }}>
                                {jsonStatus.text}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid-container">
                <div className="section-header glass-panel" style={{ gridColumn: 'span 12' }}>
                    <div className="meta-label">Option B</div>
                    <h2>Manual Entry</h2>
                </div>
                <ManualDropZone label="01. Root Hash" title="Drag .txt file" subtitle="" type="root" fileState={manualFiles.root} inputRef={rootInputRef} />
                <ManualDropZone label="02. Manifest" title="Drag .txt file" subtitle="" type="manifest" fileState={manualFiles.manifest} inputRef={manifestInputRef} />
                <ManualDropZone label="03. Private Key" title="Drag .key file" subtitle="" type="key" fileState={manualFiles.key} inputRef={keyInputRef} />
            </div>

            {/* --- FIXED ALIGNMENT SECTION --- */}
            <div className="grid-container">
                {/* Standard Right Border Applied */}
                <div className="glass-panel" style={{ gridColumn: 'span 8' }}>
                    <input 
                        type="text" 
                        value={originalHash}
                        onChange={(e) => setOriginalHash(e.target.value)}
                        placeholder="Optional: Paste Original Hash for Integrity Check" 
                        style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'Inter', outline: 'none' }} 
                    />
                </div>
                {/* Right Border Removed (End of Screen) */}
                <div className="glass-panel" style={{ gridColumn: 'span 4', borderRight: 'none', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <button className="btn" style={{ width: '100%' }} onClick={handleRetrieve} disabled={isRetrieving || (!artifactData && !manualFiles.root)}>
                        {isRetrieving ? "Reconstructing..." : "Initiate Retrieval"}
                    </button>
                    {isRetrieving && (
                        <div style={{ marginTop: '1.5rem' }}>
                            <div style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.1)', borderLeftColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                        </div>
                    )}
                </div>
            </div>

            {downloadInfo && (
                <div className="grid-container">
                    <div className="glass-panel" style={{ gridColumn: 'span 12', padding: '4rem 2rem', textAlign: 'center', background: 'rgba(50, 215, 75, 0.05)' }}>
                        <h2 style={{ color: '#fff' }}>File Restored Successfully</h2>
                        <div style={{ margin: '2rem 0', fontSize: '1.2rem', fontWeight: 700 }}>
                            {downloadInfo.verifiedStatus === 'true' && <span style={{ color: 'var(--success)' }}>✓ Blockchain Integrity Verified</span>}
                            {downloadInfo.verifiedStatus === 'false' && <span style={{ color: 'var(--accent)' }}>✗ Hash Mismatch Detected (Data Corrupted)</span>}
                            {downloadInfo.verifiedStatus === 'unavailable' && <span style={{ color: 'var(--text-muted)' }}>Integrity check unavailable</span>}
                        </div>
                        <a className="btn-outline" href={downloadInfo.url} download={downloadInfo.fileName} style={{ fontSize: '1rem', padding: '1rem 2rem', border: '1px solid #fff', display: 'inline-block' }}>
                            Download {downloadInfo.fileName}
                        </a>
                    </div>
                </div>
            )}
        </>
    );
}