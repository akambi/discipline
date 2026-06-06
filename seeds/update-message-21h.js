'use strict';

const { DynamoDBClient }    = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

async function run() {
  await ddb.send(new UpdateCommand({
    TableName: 'coaching-immo-discipline-messages',
    Key: { mode: 'pilotage', type: 'message_21h' },
    UpdateExpression: 'SET contenu = :msg',
    ExpressionAttributeValues: {
      ':msg': "Il est 21 heures. La journée est terminée. Arrête ce que tu fais et va te coucher. Ton énergie dépend de ta discipline ce soir. Une heure de sommeil vaut mieux qu'une heure perdue. Voici tes trois signaux pour demain.",
    },
  }));
  console.log('Message 21h mis à jour.');
}

run().catch(err => { console.error(err); process.exit(1); });
