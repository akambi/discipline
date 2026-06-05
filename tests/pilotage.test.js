'use strict';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
  ScanCommand:   jest.fn().mockImplementation(p => ({ ...p, _type: 'ScanCommand' })),
  QueryCommand:  jest.fn().mockImplementation(p => ({ ...p, _type: 'QueryCommand' })),
  PutCommand:    jest.fn().mockImplementation(p => ({ ...p, _type: 'PutCommand' })),
}));

const mockComputeSignaux = jest.fn();
jest.mock('../lambdas/pilotage-soir/computeSignaux', () => ({ computeSignaux: mockComputeSignaux }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TASK_FACTURE = {
  userId: 'aka', taskId: 'task-1', content: 'Envoyer facture client Dupont',
  category: 'admin', status: 'active', profilLie: 'achat_maison',
  nonNegociableLie: 'Envoyer toutes les factures clients en attente',
  createdAt: '2026-06-05T10:00:00.000Z',
};

const TASK_YOUTUBE = {
  userId: 'aka', taskId: 'task-2', content: 'Monter la vidéo YouTube sur l\'immobilier',
  category: 'projet', status: 'active', profilLie: 'ca_reussir_etranger',
  nonNegociableLie: 'Publier ou préparer au moins 1 contenu YouTube cette semaine',
  createdAt: '2026-06-05T11:00:00.000Z',
};

const TASK_LAIT = {
  userId: 'aka', taskId: 'task-3', content: 'Acheter du lait',
  category: 'personnel', status: 'active', profilLie: null,
  nonNegociableLie: null, createdAt: '2026-06-05T12:00:00.000Z',
};

const PROFIL_DOMINANT = {
  userId: 'aka', profilId: 'achat_maison', type: 'financier',
  priorite: 1, actif: true,
  nonNegociables: ['Envoyer toutes les factures clients en attente'],
};

const PROFIL_SECONDAIRE = {
  userId: 'aka', profilId: 'ca_reussir_etranger', type: 'pro',
  priorite: 2, actif: true,
  nonNegociables: ['Publier ou préparer au moins 1 contenu YouTube cette semaine'],
};

const SIGNAUX_MOCK = [
  {
    taskId: 'task-1', content: 'Envoyer facture client Dupont',
    signal: 'critique', raison: 'Lié au non-négociable dominant achat_maison',
    profilLie: 'achat_maison', nonNegociableLie: 'Envoyer toutes les factures clients en attente',
  },
  {
    taskId: 'task-2', content: 'Monter la vidéo YouTube',
    signal: 'important', raison: 'Lié au non-négociable secondaire ca_reussir_etranger',
    profilLie: 'ca_reussir_etranger', nonNegociableLie: 'Publier ou préparer au moins 1 contenu YouTube cette semaine',
  },
  {
    taskId: 'task-3', content: 'Acheter du lait',
    signal: 'opportunite', raison: 'Tâche rapide sans lien direct avec les objectifs',
    profilLie: null, nonNegociableLie: null,
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('discipline-pilotage-soir', () => {
  const handler = require('../lambdas/pilotage-soir/index');

  beforeEach(() => {
    jest.clearAllMocks();
    mockComputeSignaux.mockResolvedValue(SIGNAUX_MOCK);
  });

  test('génère 3 signaux et les sauvegarde dans DynamoDB (invocation userId unique)', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'aka', timezoneOffset: -4 }] }) // scan TABLE_USERS
      .mockResolvedValueOnce({ Items: [TASK_FACTURE, TASK_YOUTUBE, TASK_LAIT] }) // QueryCommand tasks
      .mockResolvedValueOnce({ Items: [PROFIL_DOMINANT, PROFIL_SECONDAIRE] })    // QueryCommand profils
      .mockResolvedValueOnce({});                                                 // PutCommand signaux

    const result = await handler.handler({ userId: 'aka' });

    expect(result.signaux).toHaveLength(3);
    expect(result.signaux[0].signal).toBe('critique');
    expect(result.signaux[1].signal).toBe('important');
    expect(result.signaux[2].signal).toBe('opportunite');
  });

  test('au moins 1 signal est lié à achat_maison ou ca_reussir_etranger', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'aka', timezoneOffset: -4 }] })
      .mockResolvedValueOnce({ Items: [TASK_FACTURE, TASK_YOUTUBE, TASK_LAIT] })
      .mockResolvedValueOnce({ Items: [PROFIL_DOMINANT, PROFIL_SECONDAIRE] })
      .mockResolvedValueOnce({});

    const result = await handler.handler({ userId: 'aka' });
    const profils = result.signaux.map(s => s.profilLie);
    const hasProfileLink = profils.some(p => p === 'achat_maison' || p === 'ca_reussir_etranger');
    expect(hasProfileLink).toBe(true);
  });

  test('retourne null si aucune tâche active', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'aka', timezoneOffset: -4 }] })
      .mockResolvedValueOnce({ Items: [] })                                    // no tasks
      .mockResolvedValueOnce({ Items: [PROFIL_DOMINANT, PROFIL_SECONDAIRE] });

    const result = await handler.handler({ userId: 'aka' });
    expect(result.signaux).toEqual([]);
  });

  test('retourne null si aucun profil actif', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'aka', timezoneOffset: -4 }] })
      .mockResolvedValueOnce({ Items: [TASK_FACTURE] })
      .mockResolvedValueOnce({ Items: [] });                                   // no profils

    const result = await handler.handler({ userId: 'aka' });
    expect(result.signaux).toEqual([]);
  });

  test('sauvegarde dans discipline_signaux_soir avec userId + date', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: 'aka', timezoneOffset: -4 }] })
      .mockResolvedValueOnce({ Items: [TASK_FACTURE, TASK_YOUTUBE, TASK_LAIT] })
      .mockResolvedValueOnce({ Items: [PROFIL_DOMINANT, PROFIL_SECONDAIRE] })
      .mockResolvedValueOnce({});

    await handler.handler({ userId: 'aka' });

    const putCall = mockSend.mock.calls.find(c => c[0]._type === 'PutCommand');
    expect(putCall).toBeDefined();
    const item = putCall[0].Item;
    expect(item.userId).toBe('aka');
    expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(item.signaux).toHaveLength(3);
  });

  test('invocation cron traite tous les utilisateurs actifs', async () => {
    mockSend
      .mockResolvedValueOnce({                                                   // ScanCommand users
        Items: [
          { userId: 'aka', actif: true, timezoneOffset: -4 },
        ],
      })
      .mockResolvedValueOnce({ Items: [TASK_FACTURE, TASK_YOUTUBE] })           // tasks aka
      .mockResolvedValueOnce({ Items: [PROFIL_DOMINANT, PROFIL_SECONDAIRE] })   // profils aka
      .mockResolvedValueOnce({});                                                // put signaux

    const result = await handler.handler({});
    expect(result.processed).toBe(1);
    expect(result.results).toHaveLength(1);
  });
});
