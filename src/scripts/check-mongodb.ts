import { closeMongoDb, ensureNcltIndexes, getMongoDb } from "../db/mongo";

async function main(): Promise<void> {
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    await ensureNcltIndexes();

    console.log(`Connected to MongoDB database: ${db.databaseName}`);
    console.log("NCLT collection indexes are ready.");
  } finally {
    await closeMongoDb();
  }
}

main().catch((error: unknown) => {
  console.error("MongoDB setup check failed:", error);
  process.exitCode = 1;
});
