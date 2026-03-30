import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Fingerprint, LockOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export default function EmotionalStateUnlock() {
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [authData, setAuthData] = useState(null);
  const { session } = useAuth();
  const navigate = useNavigate();

  const handleAuthenticate = async () => {
    if (!session?.access_token) {
      toast.error('Authentication Error', { description: 'Missing secure session token.' });
      return;
    }

    setStatus('processing');
    toast.info('NLP Interrogation Pending', { 
        description: 'Check the backend terminal to type your target emotional text sequence.'
    });

    try {
      const response = await fetch('http://localhost:8080/api/trigger-emotional-auth', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'NLP verification failed');
      }

      const data = await response.json();
      setAuthData(data);
      setStatus('success');
      toast.success('Cognitive State Verified', { description: 'Emotional constraints passed successfully.' });
      
    } catch (err) {
      console.error(err);
      setStatus('error');
      toast.error('Access Denied', { description: err.message });
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 relative">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-xl w-full backdrop-blur-xl bg-black/40 border border-white/10 rounded-2xl p-8 overflow-hidden relative shadow-[0_0_50px_rgba(168,85,247,0.1)]"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500/0 via-purple-500 to-purple-500/0 opacity-50" />
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6">
            <BrainCircuit className="w-10 h-10 text-purple-400" />
          </div>
          <h2 className="text-3xl font-light text-white tracking-tight mb-2">Cognitive Verification</h2>
          <p className="text-gray-400">Layer 4 / NLP Emotional State Constraint.</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-sm">
            <h3 className="text-white font-medium flex items-center gap-2 mb-2">
              <Fingerprint className="w-4 h-4 text-purple-400" /> Active Polygraph Engine
            </h3>
            <p className="text-gray-400 leading-relaxed">
              Execution requires native integration isolated from web browser injection vectors. The backend 
              terminal has initiated a secure terminal interface to analyze your current target state.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {status === 'idle' || status === 'error' ? (
              <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button
                  onClick={handleAuthenticate}
                  className="w-full relative group overflow-hidden rounded-xl bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all duration-300 py-4 font-medium text-white"
                >
                  <span className="relative z-10 font-bold tracking-wide">CONNECT NATIVE TERMINAL</span>
                  <div className="absolute inset-0 bg-purple-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </button>
              </motion.div>
            ) : status === 'processing' ? (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-6">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-purple-500 animate-spin" />
                  <BrainCircuit className="w-6 h-6 text-purple-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-purple-400 font-medium animate-pulse">Native NLP Terminal is active...</p>
                <p className="text-gray-500 text-sm mt-2">Switch to the backend console to provide input.</p>
              </motion.div>
            ) : (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-green-500/10 border border-green-500/20 p-6 rounded-xl text-center">
                <LockOpen className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h3 className="text-xl font-medium text-white mb-1">State Verified</h3>
                <p className="text-green-400/80 text-sm mb-4">Emotional constraints matched.</p>
                
                <div className="bg-black/50 p-3 rounded font-mono text-xs text-gray-400 mb-6 truncate border border-white/5">
                  key: {authData?.mock_aes_key || "Unknown Payload"}
                </div>

                <button
                  onClick={() => navigate('/retrieve')}
                  className="w-full bg-purple-600 text-white font-semibold py-3 rounded-lg hover:bg-purple-500 transition-colors"
                >
                  Proceed to File Decryption →
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
