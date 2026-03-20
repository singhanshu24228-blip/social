import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

export default function Payment() {
  const me = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const myId = String(me?._id || me?.id || '');

  const [user, setUser] = useState<any>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAccountHolderName, setWithdrawAccountHolderName] = useState('');
  const [withdrawBankName, setWithdrawBankName] = useState('');
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState('');
  const [withdrawIfsc, setWithdrawIfsc] = useState('');
  const [withdrawUpiId, setWithdrawUpiId] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');

  const totalEarnings = Number(user?.totalEarnings || 0);
  const withdrawnTotal = Number(user?.withdrawnTotal || 0);
  const pendingTotal = useMemo(() => {
    return (withdrawals || [])
      .filter((w) => String(w?.status || '') === 'pending')
      .reduce((sum, w) => sum + Number(w?.amount || 0), 0);
  }, [withdrawals]);
  const availableBalance = Math.max(0, totalEarnings - withdrawnTotal - pendingTotal);

  const fetchMyProfile = async () => {
    if (!myId) return;
    const res = await api.get(`/users/profile/${myId}`);
    setUser(res.data.user);
  };

  const fetchMyWithdrawals = async () => {
    if (!myId) return;
    const res = await api.get('/withdrawals/me');
    setWithdrawals(res.data.withdrawals || []);
  };

  useEffect(() => {
    const load = async () => {
      if (!myId) {
        setError('Please log in to view payments');
        setLoading(false);
        return;
      }
      try {
        await fetchMyProfile();
        await fetchMyWithdrawals();
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load payments');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  const requestWithdrawal = async () => {
    if (!myId) return;
    setWithdrawError('');
    setWithdrawSuccess('');

    const amt = Number(withdrawAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setWithdrawError('Enter a valid amount');
      return;
    }
    if (amt > availableBalance) {
      setWithdrawError(`Amount exceeds available balance (₹${availableBalance})`);
      return;
    }

    const accountHolderName = withdrawAccountHolderName.trim();
    const bankName = withdrawBankName.trim();
    const accountNumber = withdrawAccountNumber.trim();
    const ifsc = withdrawIfsc.trim();
    const upiId = withdrawUpiId.trim();

    if (!accountHolderName || !bankName || !accountNumber || (!ifsc && !upiId)) {
      setWithdrawError('Enter account holder name, bank name, account number, and IFSC or UPI ID');
      return;
    }

    setWithdrawLoading(true);
    try {
      await api.post('/withdrawals', {
        amount: amt,
        accountInfo: {
          accountHolderName,
          bankName,
          accountNumber,
          ifsc,
          upiId,
        },
      });
      setWithdrawSuccess('Withdrawal request submitted');
      setWithdrawAmount('');
      setWithdrawAccountHolderName('');
      setWithdrawBankName('');
      setWithdrawAccountNumber('');
      setWithdrawIfsc('');
      setWithdrawUpiId('');
      try {
        await fetchMyProfile();
        await fetchMyWithdrawals();
      } catch {}
    } catch (err: any) {
      setWithdrawError(err?.response?.data?.message || 'Failed to submit withdrawal request');
    } finally {
      setWithdrawLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (error) return <div className="text-center py-8 text-red-600">{error}</div>;

  return (
    <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Payments</h1>
        <button
          // onClick={() => (window.location.pathname = myId ? `/profile/${myId}` : '/message')}
          onClick={() => (window.location.pathname = myId ? '/message' : '/profile/${myId}')}
          className="px-3 py-2 bg-gray-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-50 rounded hover:bg-gray-300 dark:hover:bg-neutral-600"
          type="button"
        >
          ← Back
        </button>
      </div>

      <div className="bg-white dark:bg-neutral-800 p-6 rounded shadow">
        <h2 className="text-lg font-semibold mb-3">Earnings</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="p-3 bg-gray-50 dark:bg-neutral-900/40 rounded border border-gray-200 dark:border-neutral-700">
              <div className="text-gray-500">Total earned</div>
              <div className="text-black dark:text-white font-semibold">₹{totalEarnings}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-neutral-900/40 rounded border border-gray-200 dark:border-neutral-700">
              <div className="text-gray-500">Withdrawn</div>
              <div className="text-black dark:text-white font-semibold">₹{withdrawnTotal}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-neutral-900/40 rounded border border-gray-200 dark:border-neutral-700">
              <div className="text-gray-500">Pending</div>
              <div className="text-black dark:text-white font-semibold">₹{pendingTotal}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-neutral-900/40 rounded border border-gray-200 dark:border-neutral-700">
              <div className="text-gray-500">Available</div>
              <div className="text-black dark:text-white font-semibold">₹{availableBalance}</div>
            </div>
          </div>

        <div className="mt-4 p-4 bg-gray-50 dark:bg-neutral-900/40 border border-gray-200 dark:border-neutral-700 rounded">
          <div className="font-semibold text-black dark:text-white mb-2">Request withdrawal</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Amount (₹)"
              className="p-2 border rounded text-black"
              inputMode="numeric"
            />
            <input
              value={withdrawUpiId}
              onChange={(e) => setWithdrawUpiId(e.target.value)}
              placeholder="UPI ID (required if no IFSC)"
              className="p-2 border rounded text-black"
            />
            <input
              value={withdrawAccountHolderName}
              onChange={(e) => setWithdrawAccountHolderName(e.target.value)}
              placeholder="Account holder name"
              className="p-2 border rounded text-black"
            />
            <input
              value={withdrawBankName}
              onChange={(e) => setWithdrawBankName(e.target.value)}
              placeholder="Bank name"
              className="p-2 border rounded text-black"
            />
            <input
              value={withdrawAccountNumber}
              onChange={(e) => setWithdrawAccountNumber(e.target.value)}
              placeholder="Account number"
              className="p-2 border rounded text-black"
            />
            <input
              value={withdrawIfsc}
              onChange={(e) => setWithdrawIfsc(e.target.value)}
              placeholder="IFSC (required if no UPI ID)"
              className="p-2 border rounded text-black"
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={requestWithdrawal}
              disabled={withdrawLoading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              type="button"
            >
              {withdrawLoading ? 'Submitting...' : 'Submit Request'}
            </button>
            {withdrawSuccess && <div className="text-green-700 text-sm">{withdrawSuccess}</div>}
            {withdrawError && <div className="text-red-600 text-sm">{withdrawError}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
