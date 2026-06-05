'use strict';

// ── Mocks must be declared before any require of the module under test ────────

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
  QueryCommand: jest.fn().mockImplementation(p => ({ ...p, _type: 'QueryCommand' })),
  PutCommand:   jest.fn().mockImplementation(p => ({ ...p, _type: 'PutCommand' })),
}));

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }));

const mockExtractTask = jest.fn();
jest.mock('../lambdas/capture/extractTask', () => ({ extractTask: mockExtractTask }));

// ── Shared profils fixture ────────────────────────────────────────────────────

const PROFIL_ACHAT = {
  userId: 'aka', profilId: 'achat_maison', type: 'financier',
  priorite: 1, actif: true,
  nonNegociables: ['Envoyer toutes les factures clients en attente'],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /tasks/capture', () => {
  const handler = require('../lambdas/capture/index');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DISCIPLINE_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ Items: [PROFIL_ACHAT] });
    mockExtractTask.mockResolvedValue({
      category: 'admin',
      deadline: '2026-06-13',
      profilLie: 'achat_maison',
      nonNegociableLie: 'Envoyer toutes les factures clients en attente',
    });
  });

  test('retourne 200 et les champs attendus pour une tâche liée à un profil', async () => {
    const event = {
      headers: { Authorization: 'Bearer test-key' },
      body: JSON.stringify({ userId: 'aka', content: 'Envoyer facture client Dupont avant vendredi' }),
    };

    const res  = await handler.handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.taskId).toBe('mock-uuid-1234');
    expect(body.category).toBe('admin');
    expect(body.profilLie).toBe('achat_maison');
    expect(body.nonNegociableLie).toBe('Envoyer toutes les factures clients en attente');
  });

  test('retourne 200 avec profilLie null pour une tâche sans lien de profil', async () => {
    mockExtractTask.mockResolvedValue({
      category: 'personnel', deadline: null, profilLie: null, nonNegociableLie: null,
    });

    const event = {
      headers: { Authorization: 'Bearer test-key' },
      body: JSON.stringify({ userId: 'aka', content: 'Acheter du lait' }),
    };

    const res  = await handler.handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.category).toBe('personnel');
    expect(body.profilLie).toBeNull();
    expect(body.nonNegociableLie).toBeNull();
  });

  test('retourne 401 avec une clé API invalide', async () => {
    const event = {
      headers: { Authorization: 'Bearer wrong-key' },
      body: JSON.stringify({ userId: 'aka', content: 'Test' }),
    };

    const res = await handler.handler(event);
    expect(res.statusCode).toBe(401);
  });

  test('retourne 400 si userId est absent', async () => {
    const event = {
      headers: { Authorization: 'Bearer test-key' },
      body: JSON.stringify({ content: 'Tâche sans userId' }),
    };

    const res = await handler.handler(event);
    expect(res.statusCode).toBe(400);
  });

  test('retourne 400 si content est absent', async () => {
    const event = {
      headers: { Authorization: 'Bearer test-key' },
      body: JSON.stringify({ userId: 'aka' }),
    };

    const res = await handler.handler(event);
    expect(res.statusCode).toBe(400);
  });

  test('retourne 400 si plus de 2 profils actifs', async () => {
    mockSend.mockResolvedValue({
      Items: [
        { ...PROFIL_ACHAT, profilId: 'p1' },
        { ...PROFIL_ACHAT, profilId: 'p2' },
        { ...PROFIL_ACHAT, profilId: 'p3' },
      ],
    });

    const event = {
      headers: { Authorization: 'Bearer test-key' },
      body: JSON.stringify({ userId: 'aka', content: 'Test' }),
    };

    const res  = await handler.handler(event);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(400);
    expect(body.error).toMatch(/Max 2 profils/);
  });

  test('sauvegarde la tâche dans DynamoDB avec les bons champs', async () => {
    const event = {
      headers: { Authorization: 'Bearer test-key' },
      body: JSON.stringify({ userId: 'aka', content: 'Envoyer facture' }),
    };

    await handler.handler(event);

    const putCall = mockSend.mock.calls.find(c => c[0]._type === 'PutCommand');
    expect(putCall).toBeDefined();
    const item = putCall[0].Item;
    expect(item.userId).toBe('aka');
    expect(item.status).toBe('active');
    expect(item.taskId).toBe('mock-uuid-1234');
    expect(item.createdAt).toBeDefined();
  });
});
