const FabricRepository = require('../src/repositories/fabricRepository');
const PostgresRepository = require('../src/repositories/postgresRepository');
const { decrypt } = require('../src/cryptoUtils');
const fs = require('fs');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');

jest.mock('fs');
jest.mock('@grpc/grpc-js');
jest.mock('@hyperledger/fabric-gateway');
jest.mock('../src/repositories/postgresRepository');
jest.mock('../src/cryptoUtils');
jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  return {
    ...actualCrypto,
    createPrivateKey: jest.fn().mockReturnValue({})
  };
});

describe('FabricRepository', () => {
  const mockIdentity = {
    msp_id: 'Org1MSP',
    certificate: 'cert',
    encrypted_private_key: 'encrypted-key'
  };

  const mockCCP = {
    peers: {
      'peer0.org1.example.com': {
        url: 'grpcs://localhost:7051',
        tlsCACerts: { path: 'path/to/cert' },
        grpcOptions: { 'ssl-target-name-override': 'peer0.org1.example.com' }
      }
    },
    organizations: {
      'Org1MSP': {
        peers: ['peer0.org1.example.com']
      }
    }
  };

  const mockContract = {
    submitTransaction: jest.fn(),
    evaluateTransaction: jest.fn()
  };

  const mockNetwork = {
    getContract: jest.fn(() => mockContract)
  };

  const mockGateway = {
    getNetwork: jest.fn(() => mockNetwork),
    close: jest.fn()
  };

  const mockClient = {
    close: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fs.readFileSync.mockImplementation((path) => {
      if (path.includes('connection-profile')) return JSON.stringify(mockCCP);
      return 'root-cert';
    });
    PostgresRepository.getIdentity.mockResolvedValue(mockIdentity);
    decrypt.mockReturnValue('decrypted-key');
    grpc.credentials.createSsl.mockReturnValue({});
    grpc.Client.mockReturnValue(mockClient);
    connect.mockReturnValue(mockGateway);
    signers.newPrivateKeySigner.mockReturnValue({});
  });

  describe('submit', () => {
    it('should submit transaction successfully', async () => {
      mockContract.submitTransaction.mockResolvedValue(Buffer.from('success'));
      const result = await FabricRepository.submit('testTx', ['arg1'], 'user1');
      expect(result).toBe('success');
      expect(mockContract.submitTransaction).toHaveBeenCalledWith('testTx', 'arg1');
    });

    it('should throw error if identity not found', async () => {
      PostgresRepository.getIdentity.mockResolvedValue(null);
      await expect(FabricRepository.submit('tx', [], 'user1')).rejects.toThrow('Identity user1 not found in database');
    });

    it('should throw error if organization not in CCP', async () => {
        PostgresRepository.getIdentity.mockResolvedValue({ msp_id: 'Unknown', certificate: 'cert', encrypted_private_key: 'key' });
        await expect(FabricRepository.submit('tx', [], 'user1')).rejects.toThrow('Organization Unknown not found in connection profile');
    });
  });

  describe('evaluate', () => {
    it('should evaluate transaction successfully', async () => {
      mockContract.evaluateTransaction.mockResolvedValue(Buffer.from('result'));
      const result = await FabricRepository.evaluate('testTx', ['arg1'], 'user1');
      expect(result).toBe('result');
      expect(mockContract.evaluateTransaction).toHaveBeenCalledWith('testTx', 'arg1');
    });
  });

  describe('domain methods', () => {
    it('should call createLC', async () => {
      mockContract.submitTransaction.mockResolvedValue(Buffer.from('lc-created'));
      await FabricRepository.createLC('id', 'imp', 'exp', 'bank1', 'bank2', '100', 'USD', '2023-12-31', 'terms', 'user1');
      expect(mockContract.submitTransaction).toHaveBeenCalledWith('createLC', 'id', 'imp', 'exp', 'bank1', 'bank2', '100', 'USD', '2023-12-31', 'terms');
    });

    it('should call issueLC', async () => {
      mockContract.submitTransaction.mockResolvedValue(Buffer.from('lc-issued'));
      await FabricRepository.issueLC('id', 'pricing', 'user1');
      expect(mockContract.submitTransaction).toHaveBeenCalledWith('issueLC', 'id', 'pricing');
    });

    it('should call queryLC', async () => {
      const lcData = { id: 'LC1', status: 'ISSUED' };
      mockContract.evaluateTransaction.mockResolvedValue(Buffer.from(JSON.stringify(lcData)));
      const result = await FabricRepository.queryLC('LC1', 'user1');
      expect(result).toEqual(lcData);
      expect(mockContract.evaluateTransaction).toHaveBeenCalledWith('queryLC', 'LC1');
    });

    it('should call getLCStatusHistory', async () => {
        const history = [{ status: 'CREATED' }];
        mockContract.evaluateTransaction.mockResolvedValue(Buffer.from(JSON.stringify(history)));
        const result = await FabricRepository.getLCStatusHistory('LC1', 'user1');
        expect(result).toEqual(history);
    });

    it('should call other submit methods', async () => {
        mockContract.submitTransaction.mockResolvedValue(Buffer.from('ok'));
        await FabricRepository.adviseLC('id', 'u1');
        await FabricRepository.confirmLC('id', 'u1');
        await FabricRepository.submitDocuments('id', 'hash', 'u1');
        await FabricRepository.verifyDocuments('id', 'u1');
        await FabricRepository.releasePayment('id', 'pay', 'u1');
        await FabricRepository.amendLC('id', 'note', 'u1');
        await FabricRepository.cancelLC('id', 'u1');

        expect(mockContract.submitTransaction).toHaveBeenCalledWith('adviseLC', 'id');
        expect(mockContract.submitTransaction).toHaveBeenCalledWith('confirmLC', 'id');
    });
  });
});
