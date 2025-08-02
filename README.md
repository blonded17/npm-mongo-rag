# NPM MongoDB RAG Chatbot

A terminal-based RAG (Retrieval-Augmented Generation) chatbot for querying medical device logs stored in MongoDB.

## Features

- **Natural Language Queries**: Ask questions about device logs in plain English
- **Direct MongoDB Queries**: Use commands like `list deviceid and model` for direct database queries
- **Vector Search**: Semantic search using embeddings for finding similar logs
- **Field Aliases**: Support for common field name variations and shortcuts
- **Interactive CLI**: Easy-to-use terminal interface

## Supported Commands

### Direct Queries
- `list deviceid and model` - Show specific fields
- `list unique deviceid` - Show unique values for a field
- `show logs` - Display all logs (limited to 50)
- `show logs for deviceid=123` - Filter logs by criteria

### Natural Language
- Ask questions like "What errors occurred yesterday?"
- "Show me logs for device ABC123"
- "What's the status of devices in Ward 5?"

### Special Commands
- `list deviceids` - Show all DeviceIds
- `deviceid "<id>"` - Direct lookup of specific device
- `exit` or `q` - Quit the assistant

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file with:
   ```
   MONGO_URI=your_mongodb_connection_string
   ```

3. **MongoDB Setup**
   - Ensure you have a MongoDB database named `logs`
   - Collection should be named `device_logs`
   - Vector index should be created on the `embedding` field

4. **Ollama Setup**
   - Install and run Ollama locally
   - Ensure models `nomic-embed-text` and `mistral` are available

## Usage

```bash
# Start the chatbot
node chatbot.js

# Ingest logs (if needed)
node ingest-logs.js
```

## Project Structure

- `chatbot.js` - Main interactive chatbot application
- `ingest-logs.js` - Script for ingesting logs into MongoDB
- `package.json` - Node.js dependencies and scripts

## Dependencies

- `mongodb` - MongoDB driver
- `axios` - HTTP client for Ollama API
- `readline-sync` - Interactive terminal input
- `dotenv` - Environment variable management
- `cli-table3` - Terminal table formatting (optional)

## Field Aliases

The system supports various field name aliases for easier querying:
- `deviceid` → `DeviceId`
- `model` → `LogData.Model`
- `ward` → `LogData.Ward`
- And many more...

## License

MIT License 