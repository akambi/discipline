const { DynamoDBClient }                                        = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand }       = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 }                                             = require('uuid');
const { extractTask }                                            = require('./extractTask');

const REGION       = process.env.DYNAMODB_REGION  || 'ca-central-1';
const TABLE_PROFILS = process.env.TABLE_PROFILS   || 'discipline_profils';
const TABLE_TASKS   = process.env.TABLE_TASKS     || 'discipline_tasks';
const API_KEY       = process.env.DISCIPLINE_API_KEY;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function getProfilsActifs(userId) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_PROFILS,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'actif = :true',
    ExpressionAttributeValues: { ':uid': userId, ':true': true },
  }));
  return (res.Items || []).sort((a, b) => a.priorite - b.priorite);
}

exports.handler = async (event) => {
  const auth = event.headers?.Authorization || event.headers?.authorization || '';
  if (API_KEY && auth !== `Bearer ${API_KEY}`) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Corps JSON invalide' }) };
  }

  const { userId, content } = body;
  if (!userId || !content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId et content sont requis' }) };
  }

  const profilsActifs = await getProfilsActifs(userId);

  // Enforce max 2 active profiles
  if (profilsActifs.length > 2) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: `Max 2 profils actifs autorisés. ${profilsActifs.length} profils actifs détectés.`,
      }),
    };
  }

  const extracted = await extractTask(content, profilsActifs);

  const taskId = uuidv4();
  const task = {
    userId,
    taskId,
    content,
    category:         extracted.category         || 'personnel',
    deadline:         extracted.deadline         || null,
    profilLie:        extracted.profilLie        || null,
    nonNegociableLie: extracted.nonNegociableLie || null,
    status:           'active',
    createdAt:        new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_TASKS, Item: task }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      taskId,
      category:         task.category,
      profilLie:        task.profilLie,
      nonNegociableLie: task.nonNegociableLie,
    }),
  };
};
