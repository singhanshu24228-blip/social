import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function SetDetail() {
  const [professionTypeInput, setProfessionTypeInput] = useState('');
  const [professionDetailInput, setProfessionDetailInput] = useState('');
  const [additionalDetailsInput, setAdditionalDetailsInput] = useState<string[]>([]);
  const [isUpdatingDetail, setIsUpdatingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  
  useEffect(() => {
    try {
      const me = JSON.parse(localStorage.getItem('user') || 'null');
      if (me) {
        setProfessionTypeInput(me.professionType || '');
        setProfessionDetailInput(me.professionDetail || '');
        setAdditionalDetailsInput(me.additionalDetails || []);
      }
    } catch {}
  }, []);

  const handleDetailUpdate = async () => {
    if (professionTypeInput && !['Student', 'Working Professional'].includes(professionTypeInput)) {
      setDetailError('Invalid profession type');
      return;
    }

    if (professionDetailInput.length > 280) {
      setDetailError('Detail must be 280 characters or less');
      return;
    }

    if (additionalDetailsInput.some(d => d.length > 280)) {
      setDetailError('Each additional detail must be 280 characters or less');
      return;
    }

    setIsUpdatingDetail(true);
    setDetailError('');

    try {
      const response = await api.put('/users/bio', {
        professionType: professionTypeInput,
        professionDetail: professionDetailInput.trim(),
        additionalDetails: additionalDetailsInput.map(d => d.trim()).filter(d => d.length > 0),
      });

      const me = JSON.parse(localStorage.getItem('user') || 'null');
      if (me) {
        me.professionType = response.data.user.professionType;
        me.professionDetail = response.data.user.professionDetail;
        me.additionalDetails = response.data.user.additionalDetails;
        localStorage.setItem('user', JSON.stringify(me));
      }

      window.location.replace('/message'); // Go back to message home
    } catch (err: any) {
      setDetailError(err?.response?.data?.message || 'Failed to update details');
    } finally {
      setIsUpdatingDetail(false);
    }
  };

  const addDetailField = () => {
    if (additionalDetailsInput.length >= 5) {
      setDetailError('Maximum of 5 additional details allowed.');
      return;
    }
    setAdditionalDetailsInput([...additionalDetailsInput, '']);
  };

  const updateAdditionalDetail = (index: number, value: string) => {
    const newDetails = [...additionalDetailsInput];
    newDetails[index] = value;
    setAdditionalDetailsInput(newDetails);
  };

  const removeAdditionalDetail = (index: number) => {
    const newDetails = [...additionalDetailsInput];
    newDetails.splice(index, 1);
    setAdditionalDetailsInput(newDetails);
  };

  return (
    <div className="max-w-md mx-auto p-4 mt-8">
      <h1 className="text-3xl font-bold mb-6 text-center text-blue-600">Set Detail</h1>
      
      <div className="bg-white dark:bg-neutral-800 p-6 rounded-lg shadow-lg">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Profession Type</label>
          <select
            value={professionTypeInput}
            onChange={(e) => setProfessionTypeInput(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-neutral-700 dark:border-neutral-600"
          >
            <option value="">Select Profession</option>
            <option value="Student">Student</option>
            <option value="Working Professional">Working Professional</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Profession Details</label>
          <textarea
            value={professionDetailInput}
            onChange={(e) => setProfessionDetailInput(e.target.value)}
            maxLength={280}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-neutral-700 dark:border-neutral-600"
            placeholder={professionTypeInput === 'Student' ? 'Education details (e.g. B.Tech Computer Science)' : 'Working details (e.g. Software Engineer at XYZ)'}
            rows={4}
          />
          <div className="text-right text-xs text-gray-500 mt-1">{professionDetailInput.length}/280</div>
        </div>

        <div className="mb-6 space-y-4">
          {additionalDetailsInput.map((detail, index) => (
            <div key={index} className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                More Detail {index + 1}
              </label>
              <textarea
                value={detail}
                onChange={(e) => updateAdditionalDetail(index, e.target.value)}
                maxLength={280}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-neutral-700 dark:border-neutral-600"
                placeholder="Enter more details here..."
                rows={3}
              />
              <button
                onClick={() => removeAdditionalDetail(index)}
                className="absolute top-0 right-0 mt-1 mr-1 text-red-500 hover:text-red-700 transition"
                title="Remove this detail"
              >
                ✕
              </button>
              <div className="text-right text-xs text-gray-500 mt-1">{detail.length}/280</div>
            </div>
          ))}

          <div className="flex justify-center mt-2">
            <button
              onClick={addDetailField}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition shadow-sm border border-blue-200"
              title="Add more detail"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {detailError && (
          <div className="text-sm text-red-600 mb-4 text-center">{detailError}</div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleDetailUpdate}
            disabled={isUpdatingDetail}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50"
          >
            {isUpdatingDetail ? 'Saving...' : 'Save Detail'}
          </button>
          
          <button
            onClick={() => window.location.replace('/message')}
            disabled={isUpdatingDetail}
            className="w-full py-3 bg-gray-200 text-gray-800 dark:bg-neutral-700 dark:text-neutral-200 rounded-lg font-semibold hover:bg-gray-300 transition disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
