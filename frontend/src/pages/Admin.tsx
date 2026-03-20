import React, { useState, useEffect } from 'react';
import api from '../services/api';

interface Withdrawal {
  _id: string;
  username: string;
  amount: number;
  totalMoney: number;
  status: 'pending' | 'approved' | 'rejected';
  accountInfo: {
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifsc?: string;
    upiId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function Admin() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [deleteAdminEmail, setDeleteAdminEmail] = useState('');
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');
  const [deletingAdmin, setDeletingAdmin] = useState(false);

  useEffect(() => {
    fetchWithdrawals();
  }, [filter]);

  const fetchWithdrawals = async () => {
    try {
      setLoading(true);
      setMsg('');
      const params = filter === 'all' ? {} : { status: filter };
      const res = await api.get('/admin/withdrawals', { params });
      setWithdrawals(res.data.withdrawals || []);
    } catch (err: any) {
      setMsg(err?.response?.data?.message || err?.message || 'Failed to fetch withdrawals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await api.post(`/admin/withdrawals/${id}/approve`);
      setMsg(res.data.message);
      await fetchWithdrawals();
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    try {
      const reason = prompt('Enter rejection reason:');
      if (!reason) return;
      const res = await api.post(`/admin/withdrawals/${id}/reject`, { reason });
      setMsg(res.data.message);
      await fetchWithdrawals();
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Failed to reject');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    window.location.pathname = '/login';
  };

  const handleCreateAdmin = async () => {
    try {
      setCreatingAdmin(true);
      setMsg('');
      const res = await api.post('/admin/admins', {
        email: newAdminEmail.trim(),
        password: newAdminPassword,
      });
      const created = res.data?.admin;
      setMsg(created?.email ? `Admin created: ${created.email} (@${created.username})` : 'Admin created');
      setNewAdminEmail('');
      setNewAdminPassword('');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || err?.message || 'Failed to create admin');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleDeleteAdmin = async () => {
    if (!window.confirm(`Delete admin ${deleteAdminEmail.trim()}? This cannot be undone.`)) return;
    try {
      setDeletingAdmin(true);
      setMsg('');
      const res = await api.post('/admin/admins/delete', {
        email: deleteAdminEmail.trim(),
        password: deleteAdminPassword,
      });
      setMsg(res.data?.message || 'Admin deleted');
      setDeleteAdminEmail('');
      setDeleteAdminPassword('');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || err?.message || 'Failed to delete admin');
    } finally {
      setDeletingAdmin(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Admin Panel</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Logout
          </button>
        </div>

        {msg && (
          <div className="mb-4 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
            {msg}
          </div>
        )}

        <div className="mb-6 bg-white rounded-lg shadow border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-lg font-semibold text-gray-800">Create Admin</div>
              <div className="text-sm text-gray-500">Create a new admin login (email + password)</div>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <input
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="admin email"
                className="px-3 py-2 border rounded text-sm w-64"
                type="email"
                autoComplete="off"
              />
              <input
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="password"
                className="px-3 py-2 border rounded text-sm w-56"
                type="password"
                autoComplete="new-password"
              />
              <button
                onClick={handleCreateAdmin}
                disabled={creatingAdmin || !newAdminEmail.trim() || !newAdminPassword}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingAdmin ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 bg-white rounded-lg shadow border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-lg font-semibold text-gray-800">Delete Admin</div>
              <div className="text-sm text-gray-500">Delete an admin by verifying that admin's email + password</div>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <input
                value={deleteAdminEmail}
                onChange={(e) => setDeleteAdminEmail(e.target.value)}
                placeholder="admin email"
                className="px-3 py-2 border rounded text-sm w-64"
                type="email"
                autoComplete="off"
              />
              <input
                value={deleteAdminPassword}
                onChange={(e) => setDeleteAdminPassword(e.target.value)}
                placeholder="admin password"
                className="px-3 py-2 border rounded text-sm w-56"
                type="password"
                autoComplete="off"
              />
              <button
                onClick={handleDeleteAdmin}
                disabled={deletingAdmin || !deleteAdminEmail.trim() || !deleteAdminPassword}
                className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingAdmin ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded capitalize ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : withdrawals.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No withdrawal requests found</div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="w-full">
              <thead className="bg-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Username</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Account Info</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w._id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-3 text-black font-medium">{w.username}</td>
                    <td className="px-6 py-3 font-semibold text-black">₹{w.amount}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          w.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : w.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <div className="space-y-1">
                        <p className="font-medium text-black">{w.accountInfo.accountHolderName}</p>
                        {w.accountInfo.bankName && (
                          <p className="text-gray-700"><span className="font-medium">Bank:</span> {w.accountInfo.bankName}</p>
                        )}
                        {w.accountInfo.accountNumber && (
                          <p className="text-gray-700"><span className="font-medium">Account:</span> {w.accountInfo.accountNumber}</p>
                        )}
                        {w.accountInfo.ifsc && (
                          <p className="text-gray-700"><span className="font-medium">IFSC:</span> {w.accountInfo.ifsc}</p>
                        )}
                        {w.accountInfo.upiId && (
                          <p className="text-gray-700"><span className="font-medium">UPI:</span> {w.accountInfo.upiId}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {new Date(w.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">
                      {w.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(w._id)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(w._id)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {w.status !== 'pending' && (
                        <span className="text-gray-500 text-sm">{w.status.charAt(0).toUpperCase() + w.status.slice(1)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
