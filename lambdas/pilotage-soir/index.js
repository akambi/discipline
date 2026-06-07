const { DynamoDBClient }                                                    = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand }      = require('@aws-sdk/lib-dynamodb');
const { computeSignaux }                                                      = require('./computeSignaux');

const REGION         = process.env.DYNAMODB_REGION || 'ca-central-1';
const TABLE_PROFILS  = process.env.TABLE_PROFILS   || 'discipline_profils';
const TABLE_TASKS    = process.env.TABLE_TASKS     || 'discipline_tasks';
const TABLE_SIGNAUX  = process.env.TABLE_SIGNAUX   || 'discipline_signaux_soir';
const TABLE_USERS    = process.env.TABLE_USERS     || 'coaching-immo-users';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function getLocalDate(timezoneOffset = 0) {
  const local = new Date(Date.now() + timezoneOffset * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

async function getActiveTasks(userId) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_TASKS,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: '#s = :active OR reconduire = :true',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':uid': userId, ':active': 'active', ':true': true },
  }));
  return res.Items || [];
}

async function getProfilsActifs(userId) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE_PROFILS,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'actif = :true',
    ExpressionAttributeValues: { ':uid': userId, ':true': true },
  }));
  return (res.Items || []).sort((a, b) => a.priorite - b.priorite);
}

async function processUser(userId, timezoneOffset = 0) {
  const [tasks, profils] = await Promise.all([
    getActiveTasks(userId),
    getProfilsActifs(userId),
  ]);

  if (tasks.length === 0 || profils.length === 0) {
    console.log(`Skipping ${userId}: ${tasks.length} tasks, ${profils.length} profils`);
    return null;
  }

  const dominant   = profils.find(p => p.priorite === 1) || profils[0];
  const secondaire = profils.find(p => p.priorite === 2) || null;

  const signaux = await computeSignaux(dominant, secondaire, tasks);
  const date    = getLocalDate(timezoneOffset);

  await ddb.send(new PutCommand({
    TableName: TABLE_SIGNAUX,
    Item: { userId, date, signaux, createdAt: new Date().toISOString() },
  }));

  console.log(`Signaux sauvegardés pour ${userId} — date ${date}`);
  return { userId, date, signaux };
}

exports.handler = async (event = {}) => {
  // Single-user invocation (Alexa fallback or --dry-run CLI)
  if (event.userId) {
    const usersRes = await ddb.send(new ScanCommand({
      TableName: TABLE_USERS,
      FilterExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': event.userId },
    }));
    const user   = (usersRes.Items || [])[0];
    const offset = user?.timezoneOffset ?? -4;
    const result = await processUser(event.userId, offset);
    return result || { userId: event.userId, signaux: [] };
  }

  // EventBridge cron — process all active users
  const usersRes = await ddb.send(new ScanCommand({
    TableName: TABLE_USERS,
    FilterExpression: 'actif = :true',
    ExpressionAttributeValues: { ':true': true },
  }));

  const users   = usersRes.Items || [];
  const results = [];

  for (const user of users) {
    try {
      const offset = user.timezoneOffset ?? -4;
      const result = await processUser(user.userId, offset);
      if (result) results.push(result);
    } catch (e) {
      console.error(`Erreur pour ${user.userId}:`, e);
    }
  }

  return { processed: results.length, results };
};

// CLI: node index.js --userId=aka --dry-run
if (require.main === module) {
  const args       = process.argv.slice(2);
  const userIdArg  = args.find(a => a.startsWith('--userId='));
  const userId     = userIdArg ? userIdArg.split('=')[1] : null;
  const dryRun     = args.includes('--dry-run');

  if (!userId) { console.error('Usage: node index.js --userId=<id> [--dry-run]'); process.exit(1); }

  exports.handler({ userId, dryRun })
    .then(r => { console.log(JSON.stringify(r, null, 2)); })
    .catch(e => { console.error(e); process.exit(1); });
}
