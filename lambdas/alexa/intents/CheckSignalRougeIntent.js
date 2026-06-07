const Alexa  = require('ask-sdk-core');
const { DynamoDBClient }             = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const REGION          = process.env.DYNAMODB_REGION || 'us-east-1';
const TABLE_SIGNAUX   = process.env.TABLE_SIGNAUX   || 'discipline_signaux_soir';
const TABLE_PROFILS   = process.env.TABLE_PROFILS   || 'discipline_profils';
const TIMEZONE_OFFSET = parseInt(process.env.TIMEZONE_OFFSET || '-4', 10);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function getLocalDate() {
  const local = new Date(Date.now() + TIMEZONE_OFFSET * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

// Déclenché par la routine 9h30 — pose la question sur le signal rouge et attend oui/non
const CheckSignalRougeIntentHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'CheckSignalRougeIntent';
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
          .speak("Pas de signaux pour aujourd'hui.")
          .getResponse();
      }

      const rouge = result.Item.signaux.find(s => s.signal === 'critique')
        || result.Item.signaux[0];

      const sa = h.attributesManager.getSessionAttributes();
      sa.checkSignalRouge = {
        taskId:    rouge.taskId,
        content:   rouge.content,
        profilLie: rouge.profilLie,
      };
      h.attributesManager.setSessionAttributes(sa);

      const question = rouge.question
        || `Ton signal rouge : ${rouge.content}. C'est fait ?`;

      return h.responseBuilder
        .speak(question)
        .reprompt('Réponds par oui ou par non.')
        .getResponse();
    } catch (e) {
      console.error('CheckSignalRougeIntent error:', e);
      return h.responseBuilder
        .speak("Je n'ai pas pu récupérer le signal rouge. Réessaie dans quelques instants.")
        .getResponse();
    }
  },
};

// Répond "Bien. Continue." et efface le contexte de session
const CheckSignalRougeOuiHandler = {
  canHandle(h) {
    const sa = h.attributesManager.getSessionAttributes();
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.YesIntent'
      && !!sa.checkSignalRouge;
  },

  handle(h) {
    const sa = h.attributesManager.getSessionAttributes();
    sa.checkSignalRouge = null;
    h.attributesManager.setSessionAttributes(sa);

    return h.responseBuilder
      .speak('Bien. Continue.')
      .getResponse();
  },
};

// Lit l'objectif émotionnel du profil lié et relance l'utilisateur
const CheckSignalRougeNonHandler = {
  canHandle(h) {
    const sa = h.attributesManager.getSessionAttributes();
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.NoIntent'
      && !!sa.checkSignalRouge;
  },

  async handle(h) {
    const userId = h.requestEnvelope.session.user.userId;
    const sa     = h.attributesManager.getSessionAttributes();
    const { profilLie } = sa.checkSignalRouge;
    sa.checkSignalRouge = null;
    h.attributesManager.setSessionAttributes(sa);

    let objectif = 'ton objectif principal';
    if (profilLie) {
      try {
        const profilResult = await ddb.send(new GetCommand({
          TableName: TABLE_PROFILS,
          Key: { userId, profilId: profilLie },
        }));
        objectif = profilResult.Item?.objectifEmotionnel || objectif;
      } catch (e) {
        console.error('CheckSignalRougeNonHandler - profil fetch error:', e);
      }
    }

    return h.responseBuilder
      .speak(`Tu retardes ${objectif}. Fais-le maintenant, avant autre chose.`)
      .getResponse();
  },
};

module.exports = { CheckSignalRougeIntentHandler, CheckSignalRougeOuiHandler, CheckSignalRougeNonHandler };
