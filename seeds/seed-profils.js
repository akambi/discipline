const { DynamoDBClient }                                        = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand }       = require('@aws-sdk/lib-dynamodb');

const REGION        = process.env.DYNAMODB_REGION || 'ca-central-1';
const TABLE_PROFILS = process.env.TABLE_PROFILS   || 'discipline_profils';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const PROFILS_AKA = [
  {
    userId:              'aka',
    profilId:            'achat_maison',
    type:                'financier',
    objectifEmotionnel:  'Acheter une maison cette année',
    cashCible:           75000,
    deadline:            '2026-12-31',
    priorite:            1,
    actif:               true,
    nonNegociables: [
      'Générer au moins une action concrète vers la mise de fonds cette semaine',
      'Envoyer toutes les factures clients en attente',
      'Vérifier l\'avancement des revenus Prospalliance / YouTube / Grossyield',
    ],
    createdAt: new Date().toISOString(),
  },
  {
    userId:              'aka',
    profilId:            'ca_reussir_etranger',
    type:                'pro',
    objectifEmotionnel:  'Développer Réussir à l\'Étranger comme source de revenu principale',
    deadline:            '2026-12-31',
    priorite:            2,
    actif:               true,
    nonNegociables: [
      'Publier ou préparer au moins 1 contenu YouTube cette semaine',
      'Faire au moins 1 action de prospection ou suivi coaching',
    ],
    createdAt: new Date().toISOString(),
  },
];

async function seed(userId = 'aka') {
  const profilsToSeed = PROFILS_AKA.filter(p => p.userId === userId);

  if (profilsToSeed.length === 0) {
    throw new Error(`Aucun profil défini pour userId "${userId}"`);
  }

  // Check existing active profiles
  const existing = await ddb.send(new QueryCommand({
    TableName: TABLE_PROFILS,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'actif = :true',
    ExpressionAttributeValues: { ':uid': userId, ':true': true },
  }));

  const existingCount = (existing.Items || []).length;
  const newActiveCount = profilsToSeed.filter(p => p.actif).length;

  if (existingCount + newActiveCount > 2) {
    throw new Error(
      `Max 2 profils actifs autorisés. ${existingCount} profil(s) actif(s) déjà présent(s). Désactivez-en avant de relancer le seed.`
    );
  }

  for (const profil of profilsToSeed) {
    await ddb.send(new PutCommand({ TableName: TABLE_PROFILS, Item: profil }));
    console.log(`  ✓ Profil "${profil.profilId}" (priorité ${profil.priorite}) créé`);
  }

  console.log(`\n${profilsToSeed.length} profils créés pour ${userId}`);
  return profilsToSeed.length;
}

if (require.main === module) {
  const args        = process.argv.slice(2);
  const userIdArg   = args.find(a => a.startsWith('--userId='));
  const userId      = userIdArg ? userIdArg.split('=')[1] : 'aka';

  seed(userId).catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
}

module.exports = { seed };
