# Medical Device Log RAG Chatbot - Architecture Breakdown

## System Overview

Our Medical Device Log RAG Chatbot is a hybrid system that combines fast direct database queries with intelligent AI-powered semantic search. The architecture is designed to handle both structured queries and natural language questions efficiently.

---

## Architecture Breakdown

### Data Storage Layer
**MongoDB** stores all medical device logs in flexible JSON format with the following structure:
```javascript
{
  DeviceId: "ABC123",
  OrganizationId: "ORG001", 
  Timestamp: "2024-01-15T10:30:00Z",
  LogSummary: "Connection established",
  LogLevel: "INFO",
  LogData: {
    DeviceName: "Ventilator V1",
    Model: "VentMax-2000",
    State: "CONNECTED",
    Ward: "ICU",
    Description: "Device connected successfully"
  },
  embedding: [0.1, 0.2, 0.3, ...] // 768-dimensional vector
}
```

### Data Processing Pipeline
We built a preprocessing pipeline that:

1. **Pulls data from MongoDB** (via MongoDB Node.js driver)
2. **Extracts meaningful text** by combining key fields:
   ```javascript
   // Text extraction for embedding
   "DeviceId: ABC123 | Connection established | CONNECTED | ICU | VentMax-2000"
   ```
3. **Generates embeddings** using Nomic Embeddings (768 dimensions)
4. **Stores enriched data** with both original logs and vector representations

### Vector Search Layer
**MongoDB Atlas Vector Search** provides:
- **Cosine similarity search** for semantic matching
- **Hybrid queries** combining vector search with traditional filters
- **Real-time indexing** of new embeddings
- **Scalable performance** for millions of documents

### Query Processing Engine
Our context assembler module:

1. **Classifies user queries** using regex patterns:
   - Direct queries: `list deviceid and model`
   - Natural language: `What errors occurred yesterday?`
   - Special commands: `list unique deviceid`

2. **Routes to appropriate handler**:
   - **Direct Handler**: Fast MongoDB queries with projections
   - **RAG Handler**: AI-powered semantic search
   - **Special Handler**: Unique value extraction

3. **Assembles context** for AI responses:
   ```javascript
   // Context format for AI
   "# Log 1
   DeviceId: ABC123
   Summary: Connection error
   State: ERROR
   Model: VentMax-2000
   Ward: ICU
   Timestamp: 2024-01-15T10:30:00Z"
   ```

### AI Processing Layer
**Ollama** provides local AI capabilities:

1. **Embedding Generation** (Nomic Embeddings):
   - Converts text to 768-dimensional vectors
   - Enables semantic similarity search
   - Processes ~30 embeddings per second

2. **Response Generation** (Mistral 7B):
   - Generates natural language answers
   - Uses structured prompts for medical context
   - Provides 300-1000ms response times

### User Interface Layer
**Terminal CLI** provides:
- **Interactive chat interface** for queries
- **Tabular output** for structured data
- **Natural language responses** for AI queries
- **Error handling** with user-friendly messages

---

## Data Flow Architecture

### 1. Data Ingestion Flow
```
Raw Medical Device Logs
         ↓
   ingest-logs.js processes
         ↓
   Extract meaningful text
         ↓
   Generate embeddings (Nomic)
         ↓
   Store in MongoDB with vectors
```

### 2. Query Processing Flow
```
User Input
    ↓
Query Parser (classifies type)
    ↓
Query Router (decides approach)
    ↓
Either: Direct MongoDB Query
    OR: Vector Search + AI Response
    ↓
Format and Display Results
```

### 3. RAG Processing Flow
```
Natural Language Question
    ↓
Generate embedding (Nomic)
    ↓
Vector similarity search
    ↓
Retrieve top 15 similar logs
    ↓
Format context for AI
    ↓
Generate response (Mistral)
    ↓
Display natural language answer
```

---

## Technology Stack

### Core Technologies
- **Node.js**: Runtime environment for JavaScript
- **MongoDB**: Document database with vector search
- **Ollama**: Local AI inference engine
- **Nomic Embeddings**: Text embedding model
- **Mistral 7B**: Large language model

### Key Dependencies
- **mongodb**: Database driver
- **axios**: HTTP client for Ollama API
- **dotenv**: Environment variable management
- **readline-sync**: Terminal input handling

---

## System Components

### 1. Query Classification Engine
```javascript
// Pattern matching for query types
/^(list|show|find)\b/i  // Direct queries
/^list\s+unique\s+(.+)$/i  // Unique values
/^show\s+(all\s+)?logs\b/i  // Show logs
// Everything else → RAG processing
```

### 2. Field Alias System
```javascript
// User-friendly field mappings
const FIELD_ALIASES = {
  deviceid: "DeviceId",
  model: "LogData.Model", 
  ward: "LogData.Ward",
  state: "LogData.State"
  // ... 30+ mappings
};
```

### 3. Vector Search Configuration
```javascript
// MongoDB Atlas vector search
{
  $vectorSearch: {
    index: "vector_index",
    path: "embedding",
    queryVector: embedding,
    numCandidates: 100,
    similarity: "cosine",
    limit: 15
  }
}
```

### 4. AI Prompt Template
```javascript
// Structured prompt for medical context
`You are an assistant helping debug medical device logs.
Use the context to answer the user's question.

Context:
${context}

Question: ${question}

Answer:`
```


---

## Key Architectural Decisions

### 1. Hybrid Search Approach
**Decision**: Combine fast direct queries with AI-powered semantic search
**Rationale**: Optimize user experience for different query types
**Benefit**: Best of both worlds - speed and intelligence

### 2. Local AI Deployment
**Decision**: Use Ollama instead of cloud AI services
**Rationale**: Privacy, cost control, reliability
**Benefit**: No per-query charges, data stays on-premises

### 3. Vector Search Integration
**Decision**: Use MongoDB Atlas vector search
**Rationale**: Native integration, no additional infrastructure
**Benefit**: Simplified architecture, better performance

### 4. Field Alias System
**Decision**: Create user-friendly shortcuts for complex field names
**Rationale**: Improve usability for non-technical users
**Benefit**: Faster adoption, reduced training time

---

## Error Handling Strategy

### Graceful Degradation
```javascript
// If AI service fails, fall back to direct search
if (aiServiceUnavailable) {
  return performDirectSearch(query);
}

// If database fails, show helpful error
if (databaseError) {
  return "❌ Error: Cannot connect to database";
}
```

### User-Friendly Messages
- **No results**: "🤖 No matching logs found."
- **Invalid query**: "🤖 Please specify fields to list"
- **Service errors**: Clear, actionable error messages

---

## Security & Privacy

### Data Protection
- **Local deployment**: All data stays on-premises
- **No external APIs**: No data sent to third parties
- **Environment variables**: Secure configuration management
- **Input sanitization**: Protection against injection attacks

### Access Control
- **Database authentication**: Secure MongoDB connections
- **Query validation**: Sanitize user inputs
- **Error logging**: Audit trail for security events

---

## Deployment Architecture

### Current Deployment
```
┌─────────────────┐
│   Terminal CLI  │
│   (User Input)  │
└─────────────────┘
         ↓
┌─────────────────┐
│  Node.js App    │
│  (chatbot.js)   │
└─────────────────┘
         ↓
┌─────────────────┐    ┌─────────────────┐
│   MongoDB       │    │   Ollama        │
│   (Database)    │    │   (AI Engine)   │
└─────────────────┘    └─────────────────┘
```

---

## Summary

Our Medical Device Log RAG Chatbot architecture provides:

- **Hybrid Search**: Fast direct queries + intelligent AI search
- **Local AI**: Privacy and cost benefits with Ollama
- **Scalable Database**: MongoDB with vector search capabilities
- **User-Friendly**: Field aliases and intuitive interface
- **Error Resilient**: Graceful degradation and helpful error messages
- **Future-Ready**: Architecture supports planned enhancements

The system is designed to be both powerful and accessible, providing the right tool for each type of user query while maintaining simplicity and reliability. 
