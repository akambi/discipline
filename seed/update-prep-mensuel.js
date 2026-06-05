// Met à jour uniquement le message prep_mensuel dans DynamoDB
// pour utiliser les placeholders dynamiques {{joursAvantBilan}} et {{bilanJourNom}}
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const TABLE  = process.env.DYNAMO_MESSAGES_TABLE || 'coaching-immo-discipline-messages';
const ddb    = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }));

async function update() {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      mode:  'global',
      type:  'prep_mensuel',
      texte: `Bonjour {{prenom}}. {{joursAvantBilan}}, c'est ton bilan mensuel. Avant ce {{bilanJourNom}}, prépare ces 6 chiffres et garde-les à côté d'Alexa : ton solde d'épargne, tes dépenses épicerie et restaurants, tes abonnements, vêtements et divertissement, le montant utilisé sur toutes tes cartes et marges, et ton score de crédit. À vendredi.`,
    },
  }));
  console.log('✅ prep_mensuel mis à jour');
}
update().catch(console.error);
