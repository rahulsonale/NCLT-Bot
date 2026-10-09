import { Db, MongoClient } from "mongodb";

let client: MongoClient | undefined;
let connectionPromise: Promise<MongoClient> | undefined;

export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("Set the MONGODB_URI environment variable.");
  }

  if (!connectionPromise) {
    client = new MongoClient(uri);

    connectionPromise = client.connect().catch((error: unknown) => {
      client = undefined;
      connectionPromise = undefined;
      throw error;
    });
  }

  const connectedClient = await connectionPromise;
  const databaseName = process.env.MONGODB_DB?.trim() || "nclt_bot";

  return connectedClient.db(databaseName);
}

export async function ensureNcltIndexes(): Promise<void> {
  const db = await getMongoDb();

  await db
    .collection("ncltCases")
    .createIndex({ caseKey: 1 }, { unique: true });

  await db
    .collection("ncltOrders")
    .createIndex({ caseKey: 1, sourceUrl: 1 }, { unique: true });

  await db.collection("ncltOrders").createIndex(
    { caseKey: 1, sha256: 1 },
    {
      unique: true,
      partialFilterExpression: {
        sha256: { $type: "string" },
      },
    },
  );
}

export async function closeMongoDb(): Promise<void> {
  const currentClient = client;

  client = undefined;
  connectionPromise = undefined;

  await currentClient?.close();
}
