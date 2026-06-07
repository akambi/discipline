const Alexa  = require('ask-sdk-core');
const { DynamoDBClient }             = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const REGION          = process.env.DYNAMODB_REGION || 'us-east-1';
const TABLE_SIGNAUX   = process.env.TABLE_SIGNAUX   || 'discipline_signaux_soir';
const TIMEZONE_OFFSET = parseInt(process.env.TIMEZONE_OFFSET || '-4', 10);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const SIGNAL_LABELS = {
  critique:    'rouge',
  important:   'orange',
  opportunite: 'vert',
};

const ORDINALS = ['Premier', 'Deuxième', 'Troisième'];

function getLocalDate() {
  const local = new Date(Date.now() + TIMEZONE_OFFSET * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

const LireSignauxIntentHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'LireSignauxIntent';
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
          .speak("Je n'ai pas encore calculé tes signaux pour aujourd'hui. Ils seront prêts après 20 heures.")
          .getResponse();
      }

      const signaux = result.Item.signaux;
      let speech = 'Voici tes trois signaux. ';
      signaux.forEach((s, i) => {
        const num    = ORDINALS[i] || `Signal ${i + 1}`;
        const couleur = SIGNAL_LABELS[s.signal] || s.signal;
        speech += `${num} signal ${couleur} : ${s.content}. `;
      });

      return h.responseBuilder.speak(speech).getResponse();
    } catch (e) {
      console.error('LireSignauxIntent error:', e);
      return h.responseBuilder
        .speak("Je n'ai pas pu récupérer tes signaux. Réessaie dans quelques instants.")
        .getResponse();
    }
  },
};

module.exports = { LireSignauxIntentHandler };
