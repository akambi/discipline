const Alexa                                                                  = require('ask-sdk-core');
const { DynamoDBClient }                                                     = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand }                                 = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand }                                        = require('@aws-sdk/client-lambda');

const REGION                  = process.env.DYNAMODB_REGION      || 'ca-central-1';
const TABLE_SIGNAUX           = process.env.TABLE_SIGNAUX        || 'discipline_signaux_soir';
const PILOTAGE_SOIR_FUNCTION  = process.env.PILOTAGE_SOIR_FUNCTION || 'discipline-pilotage-soir';
const TIMEZONE_OFFSET         = parseInt(process.env.TIMEZONE_OFFSET || '-4', 10);

const ddb    = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const lambda = new LambdaClient({ region: REGION });

const SIGNAL_LABELS = {
  critique:   'rouge, critique',
  important:  'orange, important',
  opportunite: 'vert, opportunité rapide',
};

const ORDINALS = ['Premier', 'Deuxième', 'Troisième'];

function getLocalDate() {
  const local = new Date(Date.now() + TIMEZONE_OFFSET * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

function buildSpeech(signaux, prenom) {
  const parts = ['Voici tes 3 signaux pour demain.'];
  signaux.forEach((s, i) => {
    const label = SIGNAL_LABELS[s.signal] || s.signal;
    parts.push(`${ORDINALS[i]} signal, ${label} : ${s.content}. ${s.raison}.`);
  });
  parts.push(`Bonne nuit ${prenom || 'Aka'}.`);
  return parts.join(' ');
}

async function getOrComputeSignaux(userId) {
  const date = getLocalDate();
  const res  = await ddb.send(new GetCommand({
    TableName: TABLE_SIGNAUX,
    Key: { userId, date },
  }));

  if (res.Item?.signaux?.length > 0) return res.Item.signaux;

  // Invoke pilotage-soir on the fly and wait
  const invokeRes = await lambda.send(new InvokeCommand({
    FunctionName:   PILOTAGE_SOIR_FUNCTION,
    InvocationType: 'RequestResponse',
    Payload:        Buffer.from(JSON.stringify({ userId })),
  }));

  const raw     = Buffer.from(invokeRes.Payload).toString();
  const payload = JSON.parse(raw);
  return payload?.signaux || [];
}

const LireSignauxIntentHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'LireSignauxIntent';
  },

  async handle(h) {
    const userId = h.requestEnvelope.session.user.userId;

    try {
      const signaux = await getOrComputeSignaux(userId);

      if (!signaux || signaux.length === 0) {
        return h.responseBuilder
          .speak('Aucun signal disponible pour ce soir. Capture d\'abord quelques tâches.')
          .getResponse();
      }

      const speech = buildSpeech(signaux, 'Aka');
      return h.responseBuilder.speak(speech).getResponse();
    } catch (e) {
      console.error('LireSignauxIntent error:', e);
      return h.responseBuilder
        .speak('Je n\'ai pas pu récupérer tes signaux. Réessaie dans quelques instants.')
        .getResponse();
    }
  },
};

module.exports = { LireSignauxIntentHandler };
