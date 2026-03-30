import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Wallet, Check } from 'lucide-react';

export default function WalletButton() {
    const [walletAddress, setWalletAddress] = useState("");

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

    const connectWallet = async () => {
        if (window.ethereum) {
            try {
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

    return (
        <Button 
            variant={walletAddress ? "ghost" : "outline"}
            size="sm"
            onClick={connectWallet}
            className={`text-xs h-8 ${walletAddress ? 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 gap-1.5' : 'gap-2'}`}
        >
            {walletAddress ? (
                <>
                    <Check className="w-3.5 h-3.5" />
                    Connected
                </>
            ) : (
                <>
                    <Wallet className="w-3.5 h-3.5" />
                    Wallet
                </>
            )}
        </Button>
    );
}