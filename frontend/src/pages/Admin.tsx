import React, { useState, useEffect } from 'react';
import api from '../services/api';

interface Member {
  _id: string;
  username: string;
  name: string;
  email: string;
  isInNightMode?: boolean;
  isOnline?: boolean;
  createdAt: string;
}

type AdminTab = 'members' | 'study-mode' | 'admins';

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>('members');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'info' | 'success' | 'error'>('info');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [deleteAdminEmail, setDeleteAdminEmail] = useState('');
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');
  const [deletingAdmin, setDeletingAdmin] = useState(false);

  // Members
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [studyModeUpdating, setStudyModeUpdating] = useState<string | null>(null);

  const showMsg = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 5000);
  };

  useEffect(() => { if (tab === 'members' || tab === 'study-mode') fetchMembers(); }, [tab, memberSearch]);

  const fetchMembers = async () => {
    try {
      setMembersLoading(true);
      const res = await api.get('/admin/users', { params: { search: memberSearch || undefined, limit: 100 } });
      setMembers(res.data.users || []);
    } catch (err: any) {
      showMsg(err?.response?.data?.message || 'Failed to fetch members', 'error');
    } finally { setMembersLoading(false); }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!window.confirm(`⚠️ Remove @${member.username} from the platform? This will delete their account and all posts. This cannot be undone.`)) return;
    try {
      setRemovingId(member._id);
      const res = await api.delete(`/admin/users/${member._id}`);
      showMsg(res.data.message, 'success');
      setMembers(prev => prev.filter(m => m._id !== member._id));
    } catch (err: any) { showMsg(err?.response?.data?.message || 'Failed to remove member', 'error'); }
    finally { setRemovingId(null); }
  };

  const handleStudyModeToggle = async (member: Member, approve: boolean) => {
    try {
      setStudyModeUpdating(member._id);
      const res = await api.post(`/admin/users/${member._id}/study-mode`, { approve });
      showMsg(res.data.message, 'success');
      setMembers(prev => prev.map(m => m._id === member._id ? { ...m, isInNightMode: approve } : m));
    } catch (err: any) { showMsg(err?.response?.data?.message || 'Failed to update', 'error'); }
    finally { setStudyModeUpdating(null); }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    window.location.replace('/');
  };

  const handleCreateAdmin = async () => {
    try {
      setCreatingAdmin(true);
      const res = await api.post('/admin/admins', { email: newAdminEmail.trim(), password: newAdminPassword });
      const created = res.data?.admin;
      showMsg(created?.email ? `Admin created: ${created.email} (@${created.username})` : 'Admin created', 'success');
      setNewAdminEmail(''); setNewAdminPassword('');
    } catch (err: any) { showMsg(err?.response?.data?.message || 'Failed to create admin', 'error'); }
    finally { setCreatingAdmin(false); }
  };

  const handleDeleteAdmin = async () => {
    if (!window.confirm(`Delete admin ${deleteAdminEmail.trim()}? This cannot be undone.`)) return;
    try {
      setDeletingAdmin(true);
      const res = await api.post('/admin/admins/delete', { email: deleteAdminEmail.trim(), password: deleteAdminPassword });
      showMsg(res.data?.message || 'Admin deleted', 'success');
      setDeleteAdminEmail(''); setDeleteAdminPassword('');
    } catch (err: any) { showMsg(err?.response?.data?.message || 'Failed to delete admin', 'error'); }
    finally { setDeletingAdmin(false); }
  };

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'members', label: 'Members', icon: '👥' },
    { id: 'study-mode', label: 'Study Mode', icon: '📚' },
    { id: 'admins', label: 'Admins', icon: '🔐' },
  ];

  const S = {
    page: { minHeight: '100vh', background: 'linear-gradient(160deg,#0f172a,#1e293b)', color: '#e2e8f0', fontFamily: '"Inter",system-ui,sans-serif', padding: '0 0 60px' } as React.CSSProperties,
    header: { padding: '18px 24px', borderBottom: '1px solid rgba(251,191,36,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15,23,42,.8)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 } as React.CSSProperties,
    card: { background: 'rgba(30,41,59,.7)', border: '1px solid rgba(96,165,250,.15)', borderRadius: 14, padding: 20, marginBottom: 16 } as React.CSSProperties,
    input: { width: '100%', padding: '10px 12px', background: 'rgba(15,23,42,.6)', color: '#e2e8f0', border: '1px solid rgba(96,165,250,.25)', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' } as React.CSSProperties,
    btn: (color: string) => ({ padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: color, color: 'white' } as React.CSSProperties),
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🎓</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, background: 'linear-gradient(90deg,#fbbf24,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Campus Admin Panel</h1>
            <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>College Social Platform Management</p>
          </div>
        </div>
        <button onClick={handleLogout} style={S.btn('rgba(239,68,68,.8)')}>Logout</button>
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: 4, padding: '14px 24px 0', borderBottom: '1px solid rgba(96,165,250,.1)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 16px', borderRadius: '10px 10px 0 0', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: tab === t.id ? 'rgba(251,191,36,.15)' : 'transparent',
              color: tab === t.id ? '#fbbf24' : '#64748b',
              borderBottom: tab === t.id ? '2px solid #fbbf24' : '2px solid transparent' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>
        {msg && (
          <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, fontSize: 13,
            background: msgType === 'success' ? 'rgba(16,185,129,.15)' : msgType === 'error' ? 'rgba(239,68,68,.15)' : 'rgba(96,165,250,.15)',
            border: `1px solid ${msgType === 'success' ? 'rgba(16,185,129,.4)' : msgType === 'error' ? 'rgba(239,68,68,.4)' : 'rgba(96,165,250,.4)'}`,
            color: msgType === 'success' ? '#6ee7b7' : msgType === 'error' ? '#fca5a5' : '#93c5fd' }}>
            {msg}
          </div>
        )}

        {/* ── MEMBERS TAB ── */}
        {tab === 'members' && (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search by name, username or email…"
                style={{ ...S.input, flex: 1 }}
              />
              <button onClick={fetchMembers} style={S.btn('rgba(96,165,250,.3)')}>🔍</button>
            </div>
            {membersLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>Loading members…</div>
            ) : members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>No members found</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {members.map(m => (
                  <div key={m._id} style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: 'white', flexShrink: 0 }}>
                        {m.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: '#60a5fa' }}>@{m.username}</div>
                        <div style={{ fontSize: 11, color: '#475569' }}>{m.email}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: m.isInNightMode ? 'rgba(251,191,36,.2)' : 'rgba(100,116,139,.15)', color: m.isInNightMode ? '#fbbf24' : '#64748b', border: `1px solid ${m.isInNightMode ? 'rgba(251,191,36,.4)' : 'rgba(100,116,139,.3)'}` }}>
                        {m.isInNightMode ? '📚 In Study Mode' : 'Not in Study Mode'}
                      </span>
                      <button
                        onClick={() => handleStudyModeToggle(m, !m.isInNightMode)}
                        disabled={studyModeUpdating === m._id}
                        style={S.btn(m.isInNightMode ? 'rgba(100,116,139,.4)' : 'linear-gradient(135deg,#fbbf24,#f59e0b)')}>
                        {studyModeUpdating === m._id ? '…' : m.isInNightMode ? 'Revoke Study' : 'Approve Study'}
                      </button>
                      <button
                        onClick={() => handleRemoveMember(m)}
                        disabled={removingId === m._id}
                        style={S.btn('rgba(239,68,68,.7)')}>
                        {removingId === m._id ? 'Removing…' : '🗑 Remove'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STUDY MODE APPROVALS TAB ── */}
        {tab === 'study-mode' && (
          <div>
            <div style={{ ...S.card, background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.25)' }}>
              <h2 style={{ margin: '0 0 6px', color: '#fbbf24', fontSize: 16, fontWeight: 800 }}>📚 Study Mode Approvals</h2>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                Students must be approved by admin to enter Study Mode. Go to the <strong style={{ color: '#fbbf24' }}>Members</strong> tab to approve/revoke individual students.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setTab('members')} style={S.btn('linear-gradient(135deg,#fbbf24,#f59e0b)')}>
                  👥 Go to Members
                </button>
              </div>
            </div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: 14 }}>Currently in Study Mode</h3>
              {members.filter(m => m.isInNightMode).length === 0 ? (
                <p style={{ color: '#475569', fontSize: 13 }}>No students are currently in Study Mode.</p>
              ) : members.filter(m => m.isInNightMode).map(m => (
                <div key={m._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(96,165,250,.08)' }}>
                  <span style={{ fontSize: 14 }}>@{m.username} — {m.name}</span>
                  <button onClick={() => handleStudyModeToggle(m, false)} disabled={studyModeUpdating === m._id}
                    style={S.btn('rgba(239,68,68,.6)')}>
                    {studyModeUpdating === m._id ? '…' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ADMINS TAB ── */}
        {tab === 'admins' && (
          <div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 14px', color: '#fbbf24', fontSize: 15, fontWeight: 800 }}>Create Admin</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="Admin email" type="email" style={{ ...S.input, maxWidth: 280 }} />
                <input value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} placeholder="Password" type="password" style={{ ...S.input, maxWidth: 220 }} />
                <button onClick={handleCreateAdmin} disabled={creatingAdmin || !newAdminEmail.trim() || !newAdminPassword}
                  style={{ ...S.btn('linear-gradient(135deg,#3b82f6,#6366f1)'), opacity: creatingAdmin || !newAdminEmail.trim() || !newAdminPassword ? .5 : 1 }}>
                  {creatingAdmin ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 14px', color: '#ef4444', fontSize: 15, fontWeight: 800 }}>Delete Admin</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input value={deleteAdminEmail} onChange={e => setDeleteAdminEmail(e.target.value)} placeholder="Admin email" type="email" style={{ ...S.input, maxWidth: 280 }} />
                <input value={deleteAdminPassword} onChange={e => setDeleteAdminPassword(e.target.value)} placeholder="Admin password" type="password" style={{ ...S.input, maxWidth: 220 }} />
                <button onClick={handleDeleteAdmin} disabled={deletingAdmin || !deleteAdminEmail.trim() || !deleteAdminPassword}
                  style={{ ...S.btn('rgba(239,68,68,.8)'), opacity: deletingAdmin || !deleteAdminEmail.trim() || !deleteAdminPassword ? .5 : 1 }}>
                  {deletingAdmin ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
