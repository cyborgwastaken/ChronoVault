import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ScanFace, LockOpen, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export default function FacialRecognitionUnlock() {
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [pin, setPin] = useState('');
  const [authData, setAuthData] = useState(null);
  const { session } = useAuth();
  const navigate = useNavigate();

  const handleAuthenticate = async () => {
    if (!pin) {
      toast.error('PIN Required', { description: 'Please enter your secondary MFA PIN.' });
      return;
    }
    if (!session?.access_token) {
      toast.error('Authentication Error', { description: 'Missing secure session token.' });
      return;
    }

    setStatus('processing');
    toast.info('Initializing Local OpenCV Process...', { 
        description: 'Webcam native integration starting. Look directly into your hardware camera.'
    });

    try {
      const response = await fetch('http://localhost:8080/api/trigger-facial-auth', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pin: pin })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Biometric verification failed');
      }

      const data = await response.json();
      setAuthData(data);
      setStatus('success');
      toast.success('Access Granted', { description: 'Biometric profile matched successfully.' });
      
    } catch (err) {
      console.error(err);
      setStatus('error');
      toast.error('Access Denied', { description: err.message });
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 relative">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl w-full backdrop-blur-xl bg-black/40 border border-white/10 rounded-2xl p-8 overflow-hidden relative shadow-2xl"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/0 via-blue-500 to-blue-500/0 opacity-50" />
        
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
            <ScanFace className="w-10 h-10 text-blue-400" />
          </div>
          <h2 className="text-3xl font-light text-white tracking-tight mb-2">Biometric Verification</h2>
          <p className="text-gray-400 text-sm">Layer 3 / Facial Recognition + MFA PIN constraint.</p>
        </div>

        <div className="space-y-6">
          {/* Futuristic Scanner Box UI */}
          <div className="relative w-full h-48 bg-black/50 border border-white/10 rounded-xl overflow-hidden flex items-center justify-center">
             <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
             
             {status === 'processing' && (
               <motion.div 
                 initial={{ top: '0%' }}
                 animate={{ top: '100%' }}
                 transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                 className="absolute left-0 right-0 h-1 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)] z-10"
               />
             )}
             
             <div className="text-center z-10 relative">
               {status === 'processing' ? (
                 <>
                   <Camera className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-pulse" />
                   <p className="text-blue-400 font-mono text-sm tracking-widest uppercase">Capturing Feed...</p>
                 </>
               ) : (
                 <>
                   <ScanFace className="w-8 h-8 text-white/20 mx-auto mb-2" />
                   <p className="text-white/40 font-mono text-sm uppercase">Scanner Offline</p>
                 </>
               )}
             </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-sm">
            <h3 className="text-white font-medium flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4 text-blue-400" /> Secure Terminal Bridge
            </h3>
            <p className="text-gray-400 leading-relaxed text-xs">
              MFA hardware required layer enabled. Please supply your embedding pin unlock.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {status === 'idle' || status === 'error' ? (
              <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wider mb-2 font-mono">Vault PIN (MFA)</label>
                  <input 
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter mathematical pin"
                    className="w-full bg-black/30 border border-white/10 text-white placeholder-white/20 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                  />
                </div>
                <button
                  onClick={handleAuthenticate}
                  className="w-full relative group overflow-hidden rounded-xl bg-blue-600/20 border border-blue-500/30 hover:border-blue-500 hover:bg-blue-600/40 transition-all duration-300 py-4 font-medium text-white shadow-[0_0_20px_rgba(59,130,246,0.1)] hover:shadow-[0_0_30px_rgba(59,130,246,0.3)]"
                >
                  <span className="relative z-10 font-bold tracking-wide">AUTHENTICATE VIA LOCAL WEBCAM</span>
                </button>
              </motion.div>
            ) : status === 'processing' ? (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-6">
                <p className="text-blue-400 font-medium animate-pulse">Computing Matrix Confidence...</p>
                <p className="text-gray-500 text-xs mt-2">Check local OpenCV output if blocked by OS.</p>
              </motion.div>
            ) : (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-xl text-center">
                <LockOpen className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <h3 className="text-xl font-medium text-white mb-1">Identity Verified</h3>
                <p className="text-emerald-400/80 text-sm mb-4">FaceNet Embedding aligned > 85%.</p>
                
                <div className="bg-black/50 p-3 rounded font-mono text-xs text-emerald-300 mb-6 truncate border border-emerald-500/20">
                  <span className="text-gray-500">AES:</span> {authData?.mock_aes_key || "Unknown Payload"}
                </div>

                <button
                  onClick={() => navigate('/retrieve')}
                  className="w-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-semibold py-3 rounded-lg hover:bg-emerald-500/30 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                >
                  Confirm & Proceed to File Decryption →
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
