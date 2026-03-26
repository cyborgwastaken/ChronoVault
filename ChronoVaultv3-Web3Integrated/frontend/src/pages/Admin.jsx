import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Admin() {
    const { profile } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [grantAmount, setGrantAmount] = useState({});
    const [grantMessage, setGrantMessage] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [stats, setStats] = useState({ totalUsers: 0, totalCredits: 0, totalVaults: 0 });

    useEffect(() => {
        fetchUsers();
        fetchStats();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error fetching users:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const { data: usersData } = await supabase.from('users').select('credits');
            const { count: vaultCount } = await supabase.from('vaults').select('*', { count: 'exact', head: true });

            setStats({
                totalUsers: usersData?.length || 0,
                totalCredits: usersData?.reduce((sum, u) => sum + (u.credits || 0), 0) || 0,
                totalVaults: vaultCount || 0,
            });
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    };

    const handleGrantCredits = async (userId) => {
        const amount = parseInt(grantAmount[userId]) || 0;
        if (amount <= 0) return alert('Enter a valid credit amount');

        try {
            const { data, error } = await supabase.rpc('admin_grant_credits', {
                target_user_id: userId,
                amount: amount,
                grant_description: `Admin grant: ${amount} credits`,
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.error);

            setGrantMessage({ ...grantMessage, [userId]: `✓ Granted ${amount} credits` });
            setGrantAmount({ ...grantAmount, [userId]: '' });
            fetchUsers();
            fetchStats();

            setTimeout(() => setGrantMessage(prev => ({ ...prev, [userId]: '' })), 3000);
        } catch (err) {
            alert('Failed to grant credits: ' + err.message);
        }
    };

    const handleToggleRole = async (userId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        if (userId === profile?.id) return alert("You can't change your own role");

        if (!confirm(`Change this user's role to "${newRole}"?`)) return;

        try {
            const { error } = await supabase
                .from('users')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) throw error;
            fetchUsers();
        } catch (err) {
            alert('Failed to update role: ' + err.message);
        }
    };

    const filteredUsers = users.filter(u =>
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.wallet_address?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <>
            {/* Header */}
            <div className="grid-container">
                <header className="hero-title glass-panel" style={{
                    background: 'transparent', backdropFilter: 'none',
                    gridColumn: 'span 8', padding: '4rem 2rem'
                }}>
                    <h1>Admin<br /><span style={{ color: 'rgba(255,255,255,0.2)' }}>Panel.</span></h1>
                </header>
                <div className="hero-instruction glass-panel" style={{ gridColumn: 'span 4' }}>
                    <div className="meta-label">System Control</div>
                    <p>Manage users, grant credits, and monitor the ChronoVault network. Only admin-role users can access this interface.</p>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid-container">
                <div className="glass-panel" style={{ gridColumn: 'span 4', textAlign: 'center' }}>
                    <div className="meta-label" style={{ fontSize: '0.7rem' }}>Total Users</div>
                    <h2 style={{ fontSize: '2.5rem', marginTop: '0.5rem' }}>{stats.totalUsers}</h2>
                </div>
                <div className="glass-panel" style={{ gridColumn: 'span 4', textAlign: 'center' }}>
                    <div className="meta-label" style={{ fontSize: '0.7rem' }}>Credits in Circulation</div>
                    <h2 style={{ fontSize: '2.5rem', marginTop: '0.5rem' }}>{stats.totalCredits}</h2>
                </div>
                <div className="glass-panel" style={{ gridColumn: 'span 4', textAlign: 'center', borderRight: 'none' }}>
                    <div className="meta-label" style={{ fontSize: '0.7rem' }}>Total Vaults</div>
                    <h2 style={{ fontSize: '2.5rem', marginTop: '0.5rem' }}>{stats.totalVaults}</h2>
                </div>
            </div>

            {/* Search Bar */}
            <div className="grid-container">
                <div className="glass-panel" style={{ gridColumn: 'span 12', padding: '1.5rem 2rem', borderRight: 'none' }}>
                    <input
                        type="text"
                        placeholder="Search users by name, email, or wallet address..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%', padding: '0.8rem 1rem',
                            background: 'rgba(255,255,255,0.05)',
                            color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '6px', outline: 'none',
                            fontSize: '0.9rem', fontFamily: 'inherit'
                        }}
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="grid-container" style={{ borderBottom: 'none' }}>
                <div style={{ gridColumn: 'span 12', overflow: 'auto' }}>
                    {loading ? (
                        <div className="glass-panel" style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem'
                        }}>
                            <div style={{
                                width: '40px', height: '40px',
                                border: '3px solid rgba(255,255,255,0.1)',
                                borderLeftColor: 'var(--accent)',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                marginBottom: '1rem'
                            }} />
                            <p className="meta-label">Loading Users...</p>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="glass-panel" style={{
                            textAlign: 'center', padding: '4rem 2rem', borderBottom: 'none'
                        }}>
                            <p style={{ color: 'var(--text-muted)' }}>No users found.</p>
                        </div>
                    ) : (
                        filteredUsers.map((u, i) => (
                            <div key={u.id} className="glass-panel" style={{
                                display: 'grid',
                                gridTemplateColumns: '60px 1.5fr 1fr 0.7fr 0.5fr 1.5fr',
                                gap: '1.5rem', alignItems: 'center',
                                borderBottom: i === filteredUsers.length - 1 ? 'none' : 'var(--glass-border)',
                                borderRight: 'none', padding: '1.5rem 2rem'
                            }}>
                                {/* Avatar */}
                                <div>
                                    {u.avatar_url ? (
                                        <img src={u.avatar_url} alt="" style={{
                                            width: '45px', height: '45px', borderRadius: '50%',
                                            border: '2px solid rgba(255,255,255,0.1)', objectFit: 'cover'
                                        }} />
                                    ) : (
                                        <div style={{
                                            width: '45px', height: '45px', borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '1.2rem', fontWeight: '700'
                                        }}>
                                            {u.full_name?.[0] || u.email?.[0] || '?'}
                                        </div>
                                    )}
                                </div>

                                {/* Name + Email */}
                                <div>
                                    <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>
                                        {u.full_name || 'Unnamed'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                        {u.email}
                                    </div>
                                    {u.wallet_address && (
                                        <div style={{
                                            fontSize: '0.7rem', color: 'var(--accent)',
                                            marginTop: '0.2rem', fontFamily: 'monospace'
                                        }}>
                                            {u.wallet_address.substring(0, 6)}...{u.wallet_address.substring(u.wallet_address.length - 4)}
                                        </div>
                                    )}
                                </div>

                                {/* Joined */}
                                <div>
                                    <div className="meta-label" style={{ fontSize: '0.65rem', marginBottom: '0.2rem' }}>Joined</div>
                                    <div style={{ fontSize: '0.85rem' }}>
                                        {new Date(u.created_at).toLocaleDateString()}
                                    </div>
                                </div>

                                {/* Credits */}
                                <div style={{ textAlign: 'center' }}>
                                    <div className="meta-label" style={{ fontSize: '0.65rem', marginBottom: '0.2rem' }}>Credits</div>
                                    <div style={{
                                        fontSize: '1.3rem', fontWeight: '800',
                                        color: u.credits <= 0 ? 'var(--accent)' : u.credits < 10 ? '#ff9f0a' : '#32d74b'
                                    }}>
                                        {u.credits}
                                    </div>
                                </div>

                                {/* Role Badge */}
                                <div style={{ textAlign: 'center' }}>
                                    <button
                                        onClick={() => handleToggleRole(u.id, u.role)}
                                        style={{
                                            padding: '0.3rem 0.7rem',
                                            background: u.role === 'admin'
                                                ? 'rgba(255,59,48,0.15)'
                                                : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${u.role === 'admin' ? 'rgba(255,59,48,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                            borderRadius: '20px',
                                            color: u.role === 'admin' ? 'var(--accent)' : 'var(--text-muted)',
                                            fontSize: '0.7rem', fontWeight: '700',
                                            textTransform: 'uppercase',
                                            cursor: u.id === profile?.id ? 'not-allowed' : 'pointer',
                                            letterSpacing: '0.5px'
                                        }}
                                    >
                                        {u.role}
                                    </button>
                                </div>

                                {/* Grant Credits */}
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <input
                                        type="number"
                                        placeholder="Credits"
                                        value={grantAmount[u.id] || ''}
                                        onChange={(e) => setGrantAmount({ ...grantAmount, [u.id]: e.target.value })}
                                        style={{
                                            width: '80px', padding: '0.4rem 0.6rem',
                                            background: 'rgba(255,255,255,0.05)',
                                            color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '4px', outline: 'none', fontSize: '0.85rem'
                                        }}
                                    />
                                    <button
                                        className="btn"
                                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                        onClick={() => handleGrantCredits(u.id)}
                                    >
                                        Grant
                                    </button>
                                    {grantMessage[u.id] && (
                                        <span style={{ fontSize: '0.75rem', color: '#32d74b', whiteSpace: 'nowrap' }}>
                                            {grantMessage[u.id]}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
