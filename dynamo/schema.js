const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

const REGION = process.env.DYNAMODB_REGION || 'ca-central-1';

const tables = [
  {
    TableName: 'discipline_profils',
    KeySchema: [
      { AttributeName: 'userId',   KeyType: 'HASH' },
      { AttributeName: 'profilId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId',   AttributeType: 'S' },
      { AttributeName: 'profilId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'discipline_tasks',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'taskId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'taskId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'discipline_signaux_soir',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'date',   KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'date',   AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
];

async function createTables() {
  const client = new DynamoDBClient({ region: REGION });
  const listRes = await client.send(new ListTablesCommand({}));
  const existing = listRes.TableNames || [];

  for (const def of tables) {
    if (existing.includes(def.TableName)) {
      console.log(`Table ${def.TableName} already exists — skipping`);
      continue;
    }
    await client.send(new CreateTableCommand(def));
    console.log(`Created table ${def.TableName}`);
  }
}

if (require.main === module) {
  createTables().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { tables, createTables };
