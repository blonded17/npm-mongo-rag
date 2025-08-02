const { MongoClient } = require("mongodb");
const axios = require("axios");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "logs";
const COLLECTION = "device_logs";
const OLLAMA_URL = "http://localhost:11434";
const MODEL = "nomic-embed-text";

// Format one log as a text chunk for embedding
function extractText(doc) {
  const parts = [
    `DeviceId: ${doc.DeviceId}`,
    `Org: ${doc.OrganizationId}`,
    doc.Timestamp,
    doc.LogSummary,
    doc?.LogData?.Description,
    doc?.LogData?.Model,
    doc?.LogData?.State,
    doc?.LogData?.TagDetail?.Message,
    doc?.LogData?.TagDetail?.AlertCode,
    doc.LogLevel,
    doc?.LogData?.DeviceType,
    doc?.LogData?.Ward,
    doc?.LogData?.LoggedEvent,
    doc?.LogData?.Tag,
  ];
  return parts.filter(Boolean).join(" | ");
}

// Get embedding from Ollama
async function generateEmbedding(text) {
  const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: MODEL,
    prompt: text,
  });
  if (!response.data.embedding) throw new Error("No embedding returned");
  return response.data.embedding;
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION);

    // Only fetch logs with no embedding vector yet
    const cursor = collection.find({ embedding: { $exists: false } });

    let count = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const text = extractText(doc);
      if (!text || !text.trim()) {
        console.log(`⚠️ Skipping empty doc: ${doc._id}`);
        continue;
      }

      try {
        const embedding = await generateEmbedding(text);
        await collection.updateOne(
          { _id: doc._id },
          { $set: { embedding } }
        );
        console.log(`✅ Embedded and updated: ${doc._id}`);
        count++;
      } catch (err) {
        console.error(`❌ Error embedding doc ${doc._id}:`, err.message);
      }
    }

    console.log(`🎉 Done. Total embedded: ${count}`);
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
  }
}

main();
