'use strict';

const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const ddbMock = mockClient(DynamoDBDocumentClient);

const mockExtractTask = jest.fn();
jest.mock('../lambdas/capture/extractTask', () => ({ extractTask: mockExtractTask }));

const PROFIL_ACHAT = {
  userId: 'aka', profilId: 'achat_maison', type: 'financier',
  priorite: 1, actif: true,
  nonNegociables: ['Envoyer toutes les factures clients en attente'],
};

describe('POST /tasks/capture', () => {
  let handler;

  beforeAll(() => {
    process.env.DISCIPLINE_API_KEY = 'test-key';
    process.env.DYNAMODB_REGION = 'us-east-1';
    jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }));
    handler = require('../lambdas/capture/index');
  });

  beforeEach(() => {
    ddbMock.reset();
    ddbMock.on(QueryCommand).resolves({ Items: [PROFIL_ACHAT] });
    ddbMock.on(PutCommand).resolves({});
    mockExtractTask.mockResolvedValue({
      category: 'admin',
      deadline: '2026-06-13',
      profilLie: 'achat_mais      profilLie: 'achat_mais      profilLie: 'achat_mais      profilLie: 'achat_mais      );

  test('retourne 200 et les champs attendus pour une t�  test('retourne 200 et les champ) => {
    const event = {
      headers: { Authorization: 'Bearer test-key' },
      body: JSON.stringify({ user      body: JSON.stringioyer facture client Dupont avant vendredi' }),
    };
    const res  = await handler.handler(event);
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.su    expect(body.su
    expect(body.category).toBe('admin');
    expect(body.profilLie).toBe('achat_maison');
    expect(body.nonNegociableLie).toBe('Envoyer toutes les factures cl    expect(body.nonNegociableLie).toBe('Envoyer tve    ofilLie null pour une tâche sans lien', async () => {
    mockExtractTask.mockResolvedValue({ category: 'perso    mockExtractTask.mockResolvedValue({ n    mockExtractTask.mockResolvedValue(ent = {
      headers: { Authorization: 'Bearer test-key'      headers: { Authorization: 'Bearer test-key'      headers: { Authorization: 'Bearer test-key'      headers: { Authndler(event);
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.profilLie).toBeNull();
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
    expect(res.statusCode).to    expect(res.statusCode).to    expect(res.statusCode).to    expect(res.statusCode).to    expect(res.statusCode).to    expect(res.statusCodeey    expect(res.statusCode).to    expect(res.statusCode).to    expect(res.statusCode).to    expect(res.statusCode).to    expect(res.statusCode).to    expect(res.statusCodeey    ex de 2 profils actifs', async () => {
    ddbMock.on(QueryCommand).resolves({
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

  test('sauvegarde la tâche dans DynamoDB avec les bons cha  test('sauvegarde la tâche dans DynamoDB a    test('sauvegarde la tâche dans DynamoDB avec les bons cha  test('sauvegarde la tâche dans DynamoDB a    test('sauvegarde la tâche dans DynamoDB avec les bons cha  test('sauvegarde la tâche dans DynamoDB a    test('sauvegarde la tâche dans DynamoDB avec les bons cha  test('sauvegarde la tâche dans DynamoDB a    test('sauvegarde la tâche dans DynamoDB avec les bons cha  t    expect(item.createdAt).toBeDefined();
  });
});
