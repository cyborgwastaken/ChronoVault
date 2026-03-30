import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Activity, LockOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export default function EmotionalStateUnlock() {
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [nlpText, setNlpText] = useState('');
  const [authData, setAuthData] = useState(null);
  const { session } = useAuth();
  const navigate = useNavigate();

  const handleAuthenticate = async () => {
    if (!nlpText.trim()) {
      toast.error('Input Required', { description: 'Please provide emotional text input.' });
      return;
    }
    if (!session?.access_token) {
      toast.error('Authentication Error', { description: 'Missing secure session token.' });
      return;
    }

    setStatus('processing');
    toast.info('Running local RoBERTa inference...', { 
        description: 'Piping data to deep learning engine natively.'
    });

    try {
      const response = await fetch('http://localhost:8080/api/trigger-emotional-auth', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: nlpText })
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
        
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
            <BrainCircuit className="w-10 h-10 text-purple-400" />
          </div>
          <h2 className="text-3xl font-light text-white tracking-tight mb-2">Cognitive Verification</h2>
          <p className="text-gray-400 text-sm">Layer 4 / NLP Emotional State Constraint.</p>
        </div>

        <div className="space-y-6">
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4 flex items-center justify-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
            </div>
            <h3 className="text-purple-300 font-mono tracking-wide text-sm">Target Emotion: <span className="text-white font-bold ml-1">JOY</span></h3>
          </div>

          <AnimatePresence mode="wait">
            {status === 'idle' || status === 'error' ? (
              <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wider mb-2 font-mono flex items-center gap-2">
                    <Activity className="w-3 h-3"/> Polygraph Text Analysis Input
                  </label>
                  <textarea 
                    value={nlpText}
                    onChange={(e) => setNlpText(e.target.value)}
                    placeholder="Speak or type your current thoughts..."
                    className="w-full h-32 bg-black/30 border border-white/10 text-white placeholder-white/20 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-sans resize-none"
                  />
                </div>
                <button
                  onClick={handleAuthenticate}
                  className="w-full relative group overflow-hidden rounded-xl bg-purple-600/20 border border-purple-500/30 hover:border-purple-500 hover:bg-purple-600/40 transition-all duration-300 py-4 font-medium text-white shadow-[0_0_20px_rgba(168,85,247,0.1)] hover:shadow-[0_0_30px_rgba(168,85,247,0.3)]"
                >
                  <span className="relative z-10 font-bold tracking-wide">ANALYZE EMOTIONAL STATE</span>
                  <div className="absolute inset-0 bg-purple-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </button>
              </motion.div>
            ) : status === 'processing' ? (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-6">
                <div className="relative mb-6">
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-3 h-10 bg-purple-500 rounded-full"
                        animate={{ height: ["10px", "40px", "10px"] }}
                        transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-purple-400 font-medium font-mono text-sm tracking-widest uppercase">Executing RoBERTa...</p>
              </motion.div>
            ) : (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-xl text-center">
                <LockOpen className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <h3 className="text-xl font-medium text-white mb-1">State Verified</h3>
                <p className="text-emerald-400/80 text-sm mb-4">Emotional constraints matched threshold.</p>
                
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
