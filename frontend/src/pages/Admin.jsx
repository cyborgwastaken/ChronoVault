import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Users, Coins, Database, ShieldAlert, Search } from 'lucide-react';

export default function Admin() {
    const { profile } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [grantAmount, setGrantAmount] = useState({});
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
                .from('users').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setUsers(data || []);
        } catch (err) { toast.error('Error fetching users: ' + err.message); }
        finally { setLoading(false); }
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
        } catch (err) { console.error('Error fetching stats:', err); }
    };

    const handleGrantCredits = async (userId) => {
        const amount = parseInt(grantAmount[userId]) || 0;
        if (amount <= 0) return toast.error('Enter a valid credit amount');
        try {
            const { data, error } = await supabase.rpc('admin_grant_credits', {
                target_user_id: userId, amount, grant_description: `Admin grant: ${amount} credits`,
            });
            if (error) throw error;
            if (!data.success) throw new Error(data.error);
            toast.success(`Granted ${amount} credits`);
            setGrantAmount({ ...grantAmount, [userId]: '' });
            fetchUsers(); fetchStats();
        } catch (err) { toast.error('Failed: ' + err.message); }
    };

    const handleToggleRole = async (userId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        if (userId === profile?.id) return toast.error("Can't change your own role");
        if (!confirm(`Change role to "${newRole}"?`)) return;
        try {
            const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);
            if (error) throw error;
            toast.success(`Role updated to ${newRole}`);
            fetchUsers();
        } catch (err) { toast.error('Failed: ' + err.message); }
    };

    const filteredUsers = users.filter(u =>
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.wallet_address?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const statCards = [
        { label: 'Total Users', value: stats.totalUsers, icon: Users, color: '' },
        { label: 'Credits in Circulation', value: stats.totalCredits, icon: Coins, color: 'text-amber-500' },
        { label: 'Active Vaults', value: stats.totalVaults, icon: Database, color: 'text-emerald-500' },
    ];

    return (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 animate-fade-in">
            {/* Header */}
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-3">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-1">System Admin</h1>
                    <p className="text-sm text-muted-foreground">Manage users, grant credits, and monitor network telemetry.</p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/8 text-destructive border border-destructive/20 text-xs font-semibold">
                    <ShieldAlert className="w-3.5 h-3.5" /> Root Access
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {statCards.map(s => (
                    <Card key={s.label} className="bg-card/40 backdrop-blur-md border-border/25">
                        <CardHeader className="flex flex-row items-center justify-between pb-1.5">
                            <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
                            <s.icon className="w-4 h-4 text-muted-foreground/50" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/25 bg-card/40 backdrop-blur-md mb-6">
                <Search className="w-4 h-4 text-muted-foreground/50" />
                <Input 
                    placeholder="Search by name, email, or wallet..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border-0 focus-visible:ring-0 shadow-none bg-transparent h-8 text-sm"
                />
            </div>

            {/* Users Table */}
            <Card className="bg-card/40 backdrop-blur-md border-border/25">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">User Directory</CardTitle>
                    <CardDescription className="text-xs">Manage roles and network balances</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="py-12 flex justify-center items-center gap-2 text-muted-foreground text-sm">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                            Loading...
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="py-12 text-center text-sm text-muted-foreground">No users found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/25 bg-muted/20">
                                        <th className="px-5 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">User</th>
                                        <th className="px-5 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Joined</th>
                                        <th className="px-5 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                                        <th className="px-5 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Balance</th>
                                        <th className="px-5 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((u) => (
                                        <tr key={u.id} className="border-b border-border/30 hover:bg-muted/15 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-2.5">
                                                    {u.avatar_url ? (
                                                        <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full border border-border/25 object-cover" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                                                            {u.full_name?.[0] || u.email?.[0] || '?'}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="font-medium text-sm">{u.full_name || 'Unnamed'}</div>
                                                        <div className="text-[11px] text-muted-foreground">{u.email}</div>
                                                        {u.wallet_address && (
                                                            <div className="text-[10px] text-primary/70 font-mono mt-0.5">
                                                                {u.wallet_address.substring(0,6)}...{u.wallet_address.substring(u.wallet_address.length - 4)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 text-xs text-muted-foreground">
                                                {new Date(u.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span 
                                                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border cursor-pointer transition-colors ${
                                                        u.role === 'admin' 
                                                            ? 'bg-destructive/8 text-destructive border-destructive/20 hover:bg-destructive/15' 
                                                            : 'bg-primary/8 text-primary border-primary/20 hover:bg-primary/15'
                                                    }`}
                                                    onClick={() => handleToggleRole(u.id, u.role)}
                                                >
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 font-bold text-base font-mono">
                                                {u.credits}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Input 
                                                        type="number" 
                                                        className="w-16 h-7 text-xs" 
                                                        placeholder="Amt"
                                                        value={grantAmount[u.id] || ''}
                                                        onChange={(e) => setGrantAmount({ ...grantAmount, [u.id]: e.target.value })}
                                                    />
                                                    <Button size="sm" className="h-7 text-xs px-2.5" onClick={() => handleGrantCredits(u.id)}>Grant</Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
