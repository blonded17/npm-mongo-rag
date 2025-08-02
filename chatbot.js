const readline = require("readline-sync");
const axios = require("axios");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "logs";
const COLLECTION = "device_logs";
const OLLAMA_URL = "http://localhost:11434";
const EMBEDDING_MODEL = "nomic-embed-text";
const CHAT_MODEL = "mistral";

// --- FIELD ALIASES (expand as needed) ---
const FIELD_ALIASES = {
  deviceid: "DeviceId",
  organizationid: "OrganizationId",
  organisationid: "OrganizationId", // common typo
  userid: "UserId",
  tagid: "TagId",
  timestamp: "Timestamp",
  date: "Date",
  hour: "Hour",
  month: "Month",
  year: "Year",
  index: "Index",
  appname: "AppName",
  loglevel: "LogLevel",
  loglabel: "LogLabel",
  logsummary: "LogSummary",
  createdat: "CreatedAt",
  devicename: "LogData.DeviceName",
  devicetype: "LogData.DeviceType",
  model: "LogData.Model",
  loggedevent: "LogData.LoggedEvent",
  messagetype: "LogData.MessageType",
  state: "LogData.State",
  statecode: "LogData.StateCode",
  tag: "LogData.Tag",
  description: "LogData.Description",
  ward: "LogData.Ward",
  epochcount: "LogData.EpochCount",
  executionduration: "LogData.ExecutionDuration",
  timezone: "LogData.Timezone",
  requestid: "LogData.RequestId",
  alertcode: "LogData.TagDetail.AlertCode",
  alertlevel: "LogData.TagDetail.AlertLevel",
  headertime: "LogData.TagDetail.HeaderTime",
  key: "LogData.TagDetail.Key",
  tagdetailmessage: "LogData.TagDetail.Message",
  tagdetailrequestid: "LogData.TagDetail.RequestId"
};

function isShowLogsQuery(q) {
  return /^show\s+(all\s+)?logs\b/i.test(q.trim());
}
function extractFiltersOnly(query) {
  const filters = {};
  const filterMatch = query.match(/(?:for|with|where|having)\s+(.*)/i);
  if (filterMatch) {
    filterMatch[1].split(/and|,/).forEach((cond) => {
      const [k, v] = cond.split("=").map((s) => s.trim().replace(/['"]/g, ""));
      if (k && v) {
        const key = FIELD_ALIASES[k.toLowerCase()] || k;
        if (["DeviceId", "OrganizationId", "UserId", "TagId"].includes(key)) {
          filters[key] = v;
        } else {
          filters[key] = { $regex: `^${v}$`, $options: "i" };
        }
      }
    });
  }
  return filters;
}

function extractFieldsAndFilters(query) {
  const fields = [];
  const filters = {};
  const re = /^(?:list|show|find)\s+(.+?)(?:\s+(?:where|with|having|for)\s+(.+))?$/i;
  const match = query.match(re);

  if (match) {
    const rawFields = match[1];
    rawFields.split(/,|and/).forEach(f => {
      const cleaned = f.trim().replace(/[^a-z0-9_.]/gi, "");
      if (cleaned) {
        fields.push(FIELD_ALIASES[cleaned.toLowerCase()] || cleaned);
      }
    });

    const rawFilter = match[2];
    if (rawFilter) {
      const tokens = rawFilter.split(/and|,/);
      tokens.forEach(token => {
        const [key, value] = token.includes("=")
          ? token.split("=").map(t => t.trim().replace(/['"]/g, ""))
          : (() => {
              const parts = token.trim().split(/\s+/);
              return [parts[0], parts.slice(1).join(" ")];
            })();

        if (key && value) {
          const resolvedKey = FIELD_ALIASES[key.toLowerCase()] || key;
          if (["DeviceId", "OrganizationId", "UserId", "TagId"].includes(resolvedKey)) {
            filters[resolvedKey] = value;
          } else {
            filters[resolvedKey] = { $regex: value, $options: "i" };
          }
        }
      });
    }
  }

  return { fields, filters };
}

async function queryMongo(fields, filters) {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const collection = client.db(DB_NAME).collection(COLLECTION);

  const projection = {};
  fields.forEach((f) => (projection[f] = 1));

  const cleanFilters = {};
  Object.keys(filters || {}).forEach((k) => {
    if (filters[k]) cleanFilters[k] = filters[k];
  });

  console.log("🔍 MongoDB filters:", JSON.stringify(cleanFilters, null, 2));
  console.log("🧾 Projecting fields:", fields);

  const results = await collection.find(cleanFilters, { projection }).limit(100).toArray();
  await client.close();
  return results;
}

async function generateEmbedding(text) {
  const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: EMBEDDING_MODEL,
    prompt: text,
  });
  return res.data.embedding;
}

async function searchSimilarLogs(embedding, filters = {}) {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const collection = client.db(DB_NAME).collection(COLLECTION);

  const vectorSearchStage = {
    $vectorSearch: {
      index: "vector_index",
      path: "embedding",
      queryVector: embedding,
      numCandidates: 100,
      similarity: "cosine",
      limit: 15,
    },
  };

  if (filters && Object.keys(filters).length > 0) {
    vectorSearchStage.$vectorSearch.filter = filters;
  }

  const results = await collection.aggregate([vectorSearchStage]).toArray();

  await client.close();
  return results;
}

async function askMistral(context, question) {
  const prompt = `You are an assistant helping debug medical device logs. Use the context to answer the user's question.\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;
  const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: CHAT_MODEL,
    prompt,
    stream: false,
  });
  return res.data.response;
}

function formatContext(docs) {
  return docs
    .map((doc, i) => {
      return `# Log ${i + 1}\nDeviceId: ${doc.DeviceId}\nSummary: ${doc.LogSummary}\nState: ${doc?.LogData?.State}\nModel: ${doc?.LogData?.Model}\nWard: ${doc?.LogData?.Ward}\nTimestamp: ${doc.Timestamp}`;
    })
    .join("\n\n");
}

function printTable(rows, fields) {
  try {
    const Table = require('cli-table3');
    const table = new Table({ head: fields });
    rows.forEach(row => table.push(row));
    console.log(table.toString());
  } catch {
    rows.forEach(row => {
      console.log(row.join(" | "));
    });
  }
}

async function main() {
  console.log("💬 Terminal RAG Chatbot (type 'exit' or 'q' to quit)\n");

  while (true) {
    const question = readline.question("🧠 You: ");
    const q = question.trim().toLowerCase();
    if (q === "exit" || q === "q") break;

    try {
      // --- Special: show logs full dump ---
      if (isShowLogsQuery(question)) {
        const filters = extractFiltersOnly(question);
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        const collection = client.db(DB_NAME).collection(COLLECTION);
        const docs = await collection.find(filters).limit(50).toArray();
        await client.close();
        if (docs.length === 0) {
          console.log("🤖 No matching logs found.\n");
        } else {
          docs.forEach((doc, i) => {
            const { embedding, ...docWithoutEmbedding } = doc;
            console.log(`\n🔹 Log ${i + 1}:`);
            console.log(JSON.stringify(docWithoutEmbedding, null, 2));
          });
        }
        continue;
      }

      // ✅ Handle: list unique <field>
      const uniqueMatch = question.match(/^list\s+unique\s+(.+)$/i);
      if (uniqueMatch) {
        const rawField = uniqueMatch[1].trim().replace(/[^a-z0-9_.]/gi, "");
        const field = FIELD_ALIASES[rawField.toLowerCase()] || rawField;

        const client = new MongoClient(MONGO_URI);
        await client.connect();
        const collection = client.db(DB_NAME).collection(COLLECTION);
        const uniqueValues = await collection.distinct(field);
        await client.close();

        if (uniqueValues.length === 0) {
          console.log(`🤖 No unique values found for '${field}'.\n`);
        } else {
          console.log(`📌 Unique values for '${field}':`);
          uniqueValues.forEach((val, i) => console.log(`- ${val}`));
        }
        continue;
      }

      // 🗃️ Direct field query
      if (/^(list|show|find)\b/i.test(question.trim())) {
        const { fields, filters } = extractFieldsAndFilters(question);

        if (fields.length === 0) {
          console.log("🤖 Please specify fields to list (e.g. 'list deviceid and model').\n");
          continue;
        }

        const results = await queryMongo(fields, filters);

        if (results.length === 0) {
          console.log("🤖 No matching logs found.\n");
        } else {
          const rows = results.map(res => fields.map(f => {
            if (f.includes(".")) {
              const parts = f.split(".");
              let val = res;
              for (const p of parts) val = val && val[p];
              return val ?? "";
            } else {
              return res[f] ?? "";
            }
          }));
          printTable(rows, fields);
        }
        continue;
      }

      // 🤖 RAG fallback
      const embedding = await generateEmbedding(question);
      const docs = await searchSimilarLogs(embedding);
      const context = formatContext(docs);
      const answer = await askMistral(context, question);

      console.log(`🤖 GPT: ${answer}\n`);
    } catch (err) {
      console.error("❌ Error:", err.message);
    }
  }
}

main();
