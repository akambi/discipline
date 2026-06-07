const Alexa = require('ask-sdk-core');
const { DynamoDBClient }                                             = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand }          = require('@aws-sdk/lib-dynamodb');

const REGION          = process.env.DYNAMODB_REGION || 'us-east-1';
const TABLE_SIGNAUX   = process.env.TABLE_SIGNAUX   || 'discipline_signaux_soir';
const TABLE_TASKS     = process.env.TABLE_TASKS     || 'discipline_tasks';
const TIMEZONE_OFFSET = parseInt(process.env.TIMEZONE_OFFSET || '-4', 10);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function getLocalDate() {
  const local = new Date(Date.now() + TIMEZONE_OFFSET * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

const BilanSoirIntentHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'BilanSoirIntent';
  },
  async handle(h) {
    const userId = 'akambi';
    const today  = getLocalDate();

    const result = await ddb.send(new GetCommand({
      TableName: TABLE_SIGNAUX,
      Key: { userId, date: today },
    }));

    if (!result.Item?.signaux?.length) {
      return h.responseBuilder
        .speak("Pas de signaux pour aujourd'hui. Capture d'abord des tâches avec ton raccourci Signal.")
        .getResponse();
    }

    const signaux = result.Item.signaux.filter(s => s.taskId);

    if (signaux.length === 0) {
      return h.responseBuilder
        .speak("Aucune tâche à valider pour aujourd'hui.")
        .getResponse();
    }

    const sa = h.attributesManager.getSessionAttributes();
    sa.bilanSoir = { signaux, currentIndex: 0, reponses: [], userId };
    h.attributesManager.setSessionAttributes(sa);

    const premier  = signaux[0];
    const question = premier.question || `As-tu complété cette tâche : ${premier.content} ?`;

    return h.responseBuilder
      .speak(`Bilan de la journée. ${question}`)
      .reprompt('Réponds par oui ou par non.')
      .getResponse();
  },
};

const BilanSoirOuiHandler = {
  canHandle(h) {
    const sa = h.attributesManager.getSessionAttributes();
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.YesIntent'
      && !!sa.bilanSoir;
  },
  async handle(h) {
    return traiterReponseBilan(h, true);
  },
};

const BilanSoirNonHandler = {
  canHandle(h) {
    const sa = h.attributesManager.getSessionAttributes();
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.NoIntent'
      && !!sa.bilanSoir;
  },
  async handle(h) {
    return traiterReponseBilan(h, false);
  },
};

async function traiterReponseBilan(h, reponse) {
  const sa      = h.attributesManager.getSessionAttributes();
  const bilan   = sa.bilanSoir;
  const current = bilan.signaux[bilan.currentIndex];
  const userId  = bilan.userId;

  if (reponse) {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_TASKS,
      Key: { userId, taskId: current.taskId },
      UpdateExpression: 'SET #s = :done, completedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':done': 'done', ':now': new Date().toISOString() },
    }));
  } else {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_TASKS,
      Key: { userId, taskId: current.taskId },
      UpdateExpression: 'SET reconduire = :true, reconduitLe = :now',
      ExpressionAttributeValues: { ':true': true, ':now': new Date().toISOString() },
    }));
  }

  bilan.reponses.push({ taskId: current.taskId, fait: reponse });
  bilan.currentIndex++;

  if (bilan.currentIndex < bilan.signaux.length) {
    const next     = bilan.signaux[bilan.currentIndex];
    const question = next.question || `As-tu complété : ${next.content} ?`;
    sa.bilanSoir   = bilan;
    h.attributesManager.setSessionAttributes(sa);
    return h.responseBuilder
      .speak(question)
      .reprompt('Réponds par oui ou par non.')
      .getResponse();
  }

  sa.bilanSoir = null;
  h.attributesManager.setSessionAttributes(sa);

  const faites = bilan.reponses.filter(r => r.fait).length;
  const total  = bilan.reponses.length;

  let conclusion;
  if (faites === total) {
    conclusion = `Excellent. ${faites} tâche sur ${total} complétée. Bonne soirée Akambi.`;
  } else if (faites >= 1) {
    conclusion = `Bien. ${faites} tâche sur ${total} complétée. ${total - faites} seront reconduites en priorité demain.`;
  } else {
    conclusion = `Aucune tâche complétée aujourd'hui. Elles seront reconduites en rouge demain. Bonne soirée.`;
  }

  return h.responseBuilder.speak(conclusion).getResponse();
}

module.exports = { BilanSoirIntentHandler, BilanSoirOuiHandler, BilanSoirNonHandler };
