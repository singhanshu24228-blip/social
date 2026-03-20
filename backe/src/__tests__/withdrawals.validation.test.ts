describe('withdrawals validation', () => {
  test('rejects missing account fields', async () => {
    const { createWithdrawalRequest } = await import('../controllers/withdrawalsController.js');

    const req: any = {
      user: { _id: 'u1' },
      body: {
        amount: 100,
        accountInfo: {
          accountHolderName: '   ',
          bankName: 'HDFC',
          accountNumber: '123',
          ifsc: 'HDFC0000001',
        },
      },
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await createWithdrawalRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('accountHolderName'),
      })
    );
  });

  test('rejects when both IFSC and UPI are missing', async () => {
    const { createWithdrawalRequest } = await import('../controllers/withdrawalsController.js');

    const req: any = {
      user: { _id: 'u1' },
      body: {
        amount: 100,
        accountInfo: {
          accountHolderName: 'Alice',
          bankName: 'HDFC',
          accountNumber: '123',
          ifsc: '   ',
          upiId: '',
        },
      },
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await createWithdrawalRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('ifsc or upiId'),
      })
    );
  });
});

