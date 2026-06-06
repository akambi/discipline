'use strict';

const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const ddbMock = mockClient(DynamoDBDocumentClient);

const mockComputeSignaux = jest.fn();
jest.mock('../lambdas/pilotage-soir/computeSignaux', () => ({ computeSignaux: mockComputeSignaux }));

const PROFIL_DOMINANT   = { userId: 'aka', profilId: 'achat_maison',       priorite: 1, actif: true, nonNegociables: ['Action vers mise de fonds'] };
const PROFIL_SECONDAIRE = { userId: 'aka', profilId: 'ca_reussir_etranger', priorite: 2, actif: true, nonNegociables: ['Publier YouTube'] };

const TASKS = [
  { userId: 'aka', taskId: 't1', content: 'Envoyer facture',      status: 'active', profilLie: 'achat_maison' },
  { userId: 'aka', taskId: 't2', content: 'Préparer script YT',   status: 'active', profilLie: 'ca_reussir_etranger' },
  { userId: 'aka', taskId: 't3', content: 'Appeler le courtier',  status: 'active', profilLie: 'achat_maison' },
];

const Sconst Sconst Sconst Sconst S't1', content: 'Envoyer facconst Sconst Sconst Sconst Sconst S't1', content: 'Envoyer facconst Sconst Sconst Sconst Sconst S't1', co', content: 'Appeler le courtier', signal: 'important',  const Sconst Sconst Sconst SconsilLie:const Sconst Sconst Sconst Sconst S't1', content: 'Envoyer facconst Sconst Sconst Sconst Sconst S't: 'contenu YouTube', profilLie: 'ca_reussir_etranger' },
];

describe('discipline-pilotage-soir', () => {
  let handler;

  beforeAll(() => {
    process.env.DYNAMODB_REGION = 'us-east-1';
    handler = require('../lambdas/pilotage-soir/index');
  });

  beforeEach(() => {
    ddbMock.reset();
               Signaux.mockResolvedValue(SIGNAUX_MOCK);

    ddbMock.on(ScanCommand).resolves({ Items: [{ userId: 'aka', actif: tr    ddbMock.on(ScanCommand).resolves({ Items: [{ userId: 'aka', actif: tr    ddbMock.on(ScanCommand).resolves({ Items:ECO    ddbMock.on(ScanCommand).resolves({ Items: [{ userId: 'aka', actif: tr    ddbMock.on(ScanCommand).resolves({ocation userId unique)', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [{ userId: 'aka', timezoneOffset: -4 }] });
    ddbMock.on(QueryCommand)
      .onFirstCall().resolves({ Items: TASKS })
      .onSecondCall().resolves({ Items: [PROFIL_DOMINANT, PROFIL_SECONDAIRE] });

    const result = await handler.handler({ userId: 'aka' });
    expect(result.signaux).toHaveLength(3);
    expect(mockComputeSignaux).toHaveBeenCalledWith(PROFIL_DOMINANT, PROFIL_SECO    expect(mo);
  });

  test('au moins 1 signal lié à achat_maison ou ca_reussir_etranger', async () => {
    ddbMock.on(ScanCommand).resolves({    ddbMock.onrId: 'aka', timezoneOffset: -4 }] });
    ddbMock.on(QueryCommand)
      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCallli      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCall      .onFirstCa>       .onFirstCall      .ond).resolves({ Items: [{ userId: 'aka', timezoneOff      .onFirstCall      .onFirstCall      .onFirs .onFirstCall().resolves({ Items:      .onFirstCall      .onFirstCall      .onFirstCFIL_DOMINANT] });

    const result = await handler.handler({ userId: 'aka' });
    expect(result.signaux).toEqual([]);
  });

  test('retourne {signaux:[]}   test('retourne {signaux:[]}   test('retourne {signaux:[]}   test('retourne {signau[{  test('retourne {signaux:[]}   test('retourne {signaux:[]}   test('retourne {signaux:all(  test('retourne {signaux:[)
      .onSecondCall().resolves({ Items: [] });

    const result = await handler.handler({ userId: 'aka' });
    expect(result.signaux).toEqual([]);
  });

  test('sauvegarde dans discipline_signaux_soir avec userId + date', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [{ userId: 'aka', timezoneOffset: -4 }] });
    ddbMock.on(QueryCommand)
      .onFirstCall().resolves({ Items: TASKS })
      .onSecondCall().resolves({ Items: [PROFIL_DOMINANT, PROFIL_SECONDAIRE] });

    await handler.handler({ userId: 'aka' });
    const putCalls = ddbMock.commandCalls(PutCommand);
    expect(putCalls.length).toBe(1);
    const item = putCalls[0].args[0].input.Item;
    ex    ex    ex    ex    ex    ex    ex    ex    ex    ex    ch(/^\d{4}-\d{2}-\d{2}$/);
    expect(item.signaux    expect(item.signaux    expect(item.signaux    expect(item.signaux    expect(item.signaux    expect(item.signaux    expect(item.signaux    expect(item.signaux    expect(item.signaux    expect(item.signaux    expect(item.signaux   
                                    s: TASKS })
      .onSecondCall().resolves({ Items: [PROFIL_DOMINANT, PROF      .onSecondCall().resolves({ Items await handler.handler({});
    expect(result.processed).toBe(1);
  });
});
