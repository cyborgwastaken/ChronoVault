import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

export default function WalletButton() {
    const [walletAddress, setWalletAddress] = useState("");

    // 1. Check if wallet is already connected when page loads
    useEffect(() => {
        checkConnection();
    }, []);

    const checkConnection = async () => {
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    setWalletAddress(accounts[0]);
                }
            } catch (err) {
                console.error("Error checking wallet connection:", err);
            }
        }
    };

    // 2. Function to trigger connection
    const connectWallet = async () => {
        if (window.ethereum) {
            try {
                // Request access to the user's wallet
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                setWalletAddress(accounts[0]);
            } catch (err) {
                console.error("User rejected connection:", err);
            }
        } else {
            alert("MetaMask not found! Please install it to use ChronoVault.");
            window.open("https://metamask.io/download/", "_blank");
        }
    };

    // Helper to shorten the address (e.g., 0x1234...5678)
    const formatAddress = (addr) => {
        return addr ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}` : "";
    };

    return (
        <button 
            className="btn-outline" 
            onClick={connectWallet}
            style={{ 
                marginLeft: '1rem', 
                borderColor: walletAddress ? '#32d74b' : 'var(--text-main)', 
                color: walletAddress ? '#32d74b' : 'var(--text-main)',
                display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}
        >
            {/* Simple dot indicator */}
            <div style={{ 
                width: '8px', height: '8px', borderRadius: '50%', 
                background: walletAddress ? '#32d74b' : 'rgba(255,255,255,0.3)' 
            }} />
            
            {walletAddress ? formatAddress(walletAddress) : "Connect Wallet"}
        </button>
    );
}