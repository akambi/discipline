const Alexa  = require('ask-sdk-core');
const { DynamoDBClient }             = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const REGION          = process.env.DYNAMODB_REGION || 'us-east-1';
const TABLE_SIGNAUX   = process.env.TABLE_SIGNAUX   || 'discipline_signaux_soir';
const TIMEZONE_OFFSET = parseInt(process.env.TIMEZONE_OFFSET || '-4', 10);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function getLocalDate() {
  const local = new Date(Date.now() + TIMEZONE_OFFSET * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

const AnnoncerSignalRougeIntentHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AnnoncerSignalRougeIntent';
  },

  async handle(h) {
    const userId = 'akambi'; // temporaire pour test
    const today  = getLocalDate();

    try {
      const result = await ddb.send(new GetCommand({
        TableName: TABLE_SIGNAUX,
        Key: { userId, date: today },
      }));

      if (!result.Item?.signaux?.length) {
        return h.responseBuilder
          .speak("Pas de signaux disponibles pour aujourd'hui.")
          .getResponse();
      }

      const signaux = result.Item.signaux;
      const rouge   = signaux.find(s => s.signal === 'critique') || signaux[0];

      const speech = `Ton signal rouge aujourd'hui : ${rouge.content}. C'est ta priorité absolue pour le bloc deep work.`;

      return h.responseBuilder.speak(speech).getResponse();
    } catch (e) {
      console.error('AnnoncerSignalRougeIntent error:', e);
      return h.responseBuilder
        .speak("Je n'ai pas pu récupérer le signal rouge. Réessaie dans quelques instants.")
        .getResponse();
    }
  },
};

module.exports = { AnnoncerSignalRougeIntentHandler };
