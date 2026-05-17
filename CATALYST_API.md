# Catalyst API Reference

**Version**: 1.2  
**Last Updated**: 2026-01-17  
**Status**: Active

> **Single Source of Truth**: This document is the authoritative reference for the Catalyst REST and WebSocket APIs. All tenant-specific examples (pi.law, catalyst-widget, personal) are provided as illustrations; the API is tenant-agnostic.

---

## Table of Contents

1. [Overview](#overview)
2. [Environments](#environments)
3. [Authentication & Authorization](#authentication--authorization)
4. [REST API Reference](#rest-api-reference)
5. [Billing Endpoints](#billing-endpoints)
6. [WebSocket API Reference](#websocket-api-reference)
7. [Voice Capabilities](#voice-capabilities)
8. [Code Examples](#code-examples)
9. [Error Handling](#error-handling)
10. [Testing Guide](#testing-guide)
11. [Integration Patterns](#integration-patterns)
12. [Cost Optimization & Caching](#cost-optimization--caching)

---

## Overview

Catalyst provides a multi-tenant AI assistant platform with:
- **REST API** for chat, RAG, embeddings, billing, and admin operations
- **WebSocket API** for real-time streaming and proactive notifications
- **Hard tenant isolation** with API key-based authentication
- **Per-tenant LLM routing** (server-side model selection)
- **Multi-provider support**: OpenAI, Anthropic, Google Gemini, HuggingFace
- **RAG support** with pgvector and OpenAI file_search
- **Session management** with automatic summarization
- **Credit-based billing** with usage tracking and pricing rules
- **Structured extraction** for automation workflows

### Key Principles

1. **Tenant-Agnostic Design**: The API is designed for any tenant. Examples use `pi.law`, `catalyst-widget`, and `personal` as illustrations.
2. **Server-Side Routing**: Model/provider selection is configured server-side per tenant. Clients should NOT send `model` or `provider` parameters.
3. **Server-Managed Prompts**: System prompts are managed server-side. Clients must NOT send system prompts in requests.
4. **Session Continuity**: Use `session_id` for conversation continuity. Sessions are managed server-side with automatic summarization.
5. **Namespace Scoping**: Use `namespace` for sub-scoping within a tenant (e.g., `case_id`, `matter_id`). Namespace is NOT a security boundary.

---

## Environments

### Production (Fly.io)

- **REST Base URL**: `https://catalyst-service.fly.dev/v1`
- **WebSocket**: `wss://catalyst-service.fly.dev:8765` (TLS, same API key auth)
- **Status**: Fully operational with pgvector, tenant isolation, and encryption
- **Database**: Fly.io Managed PostgreSQL with pgvector extension

### Local Development

- **REST Base URL**: `http://localhost:8001/v1` (or `http://localhost:$REST_PORT/v1` if `REST_PORT` is set)
- **WebSocket**: `ws://localhost:8765`
- **Setup**: Use `bootstrap.sh` to start REST + WebSocket; the script can also start the Next.js dashboard (FastAPI BFF + frontend). Streamlit is deprecated.
- **CORS**: Allow `http://localhost:3000` (Next.js dashboard/chat-app) for local dev

### Environment Configuration

**Recommended approach**: Use environment variables in your application:

```python
import os

CATALYST_BASE_URL = os.getenv(
    "CATALYST_API_URL",
    "https://catalyst-service.fly.dev/v1"  # Production default
)

# For local development, set:
# CATALYST_API_URL=http://localhost:8001/v1
```

**Provider API Keys** (server-side configuration):

| Provider | Environment Variable |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GOOGLE_API_KEY` |
| HuggingFace | `HUGGINGFACE_API_KEY` |

Provider keys are managed via the Admin Dashboard (`/admin/env-vars`) or Fly.io secrets.

---

## Authentication & Authorization

### API Keys

All requests require an API key bound to a specific tenant:

- **Header**: `Authorization: Bearer <API_KEY>`
- **Tenant Header**: `X-Tenant-Id: <tenant_id>` (must match API key's tenant)
- **Optional Headers**:
  - `X-User-Id: <user_id>` - User identifier for audit logging
  - `X-Request-Id: <uuid>` - Request correlation ID (recommended)

### API Key Structure

- **`api_key`**: Secret token (returned once on creation)
- **`key_id`**: Public identifier
- **`tenant_id`**: Tenant bound to the key
- **`scopes`**: Permissions (admin, read, write, chat, rag, extract)
- **`rate_limits`**: Per-tenant rate limits
- **`created_at`**, **`revoked_at`**: Lifecycle timestamps

### Standard Response Format

All successful API responses follow a standard format:

```json
{
  "request_id": "uuid-here",
  "data": {
    // Actual response data
  }
}
```

**Important for Frontend Clients**: Always access response data via `response.data` rather than directly from the response object. For example:
- `response.data.files` (not `response.files`)
- `response.data.stats` (not `response.stats`)
- `response.data.configs` (not `response.configs`)

This applies to all endpoints including admin, RAG, and status endpoints.

### Tenant Enforcement

- API key maps to a single tenant
- If `X-Tenant-Id` is present and does NOT match the key's tenant, Catalyst returns `403 tenant_mismatch`
- Always send `X-Tenant-Id` matching your API key's tenant

### Rate Limits

- **Per-tenant buckets** applied at API layer
- **Default limits** (configurable per tenant):
  - Chat/chat_stream: ~2 requests per second
  - RAG/copilot/extract: ~1 request per second
- **Rate limit responses**: `429` or `4408` with `retry_after` header when available

### Scopes

API keys can have the following scopes:
- `chat` - Chat completion endpoints
- `rag` - RAG operations (ingest, query, files)
- `extract` - Structured extraction
- `billing` - Billing operations (balance, transactions, usage)
- `admin` - Administrative endpoints (API key management, tenant configs, model discovery)

---

## REST API Reference

### Base URL

- **Production**: `https://catalyst-service.fly.dev/v1`
- **Local Dev**: `http://localhost:8001/v1`

### Common Headers

All requests require:
```
Authorization: Bearer <API_KEY>
X-Tenant-Id: <tenant_id>
Content-Type: application/json
```

Optional:
```
X-User-Id: <user_id>
X-Request-Id: <uuid>
```

### Health & Status

#### `GET /v1/health`

Liveness/readiness check. No authentication required.

**Response**:
```json
{
  "status": "healthy"
}
```

#### `GET /v1/status`

Tenant-specific status. Requires authentication.

**Headers**: `Authorization`, `X-Tenant-Id`

**Response**:
```json
{
  "tenant_id": "pilaw",
  "store": {
    "type": "pgvector",
    "table": "rag_chunks",
    "dsn": "postgresql://***:***@localhost:5432/catalyst_pilaw"
  },
  "encryption": {
    "enabled": true,
    "key_scope": "per-tenant"
  },
  "llm": {
    "embedding_model": "text-embedding-3-large",
    "chat_model": "gpt-5-mini"
  },
  "logging": {
    "redact_bodies": true
  }
}
```

#### `GET /v1/metrics`

Prometheus-style metrics. Requires authentication.

**Response**: Text format (Prometheus)

---

### Chat Endpoints

#### `POST /v1/chat`

Non-streaming chat completion.

**Request**:
```json
{
  "messages": [
    {"role": "user", "content": "Summarize the latest docket notes for case 123."}
  ],
  "temperature": 0.2,
  "max_tokens": 512,
  "session_id": "abc123",
  "instructions": "You are a legal assistant specializing in civil litigation."
}
```

**Notes**:
- `session_id` is optional; Catalyst manages state if provided
- **DO NOT** include `model` or `provider` - server selects per tenant/profile (unless using Direct Model mode)
- **DO NOT** include system prompts in `messages` - server prepends service + tenant prompts
- `messages` can be just the new user message if `session_id` is provided (server maintains history)
- `instructions` (optional): Session-level instructions that are:
  - Persisted on first call and reused for entire session
  - **No need to resend** in subsequent turns - Catalyst stores them
  - Can be updated by sending again in a later call
  - Cached by OpenAI for cost efficiency (50%+ input token savings)

#### Direct Model Mode (Admin/Testing)

For direct model testing (bypassing service label routing), superusers can specify:

```json
{
  "messages": [{"role": "user", "content": "Hello"}],
  "direct_provider": "anthropic",
  "direct_model": "claude-sonnet-4-20250514",
  "session_id": "test_session"
}
```

**Direct Mode Parameters**:
- `direct_provider`: Provider name (`openai`, `anthropic`, `gemini`, `huggingface`)
- `direct_model`: Exact model identifier (e.g., `claude-opus-4-5-20251101`, `gpt-4o`)

**Notes**:
- Both `direct_provider` AND `direct_model` must be provided to activate direct mode
- Billing is still enforced based on inferred model tier
- Available in both `/v1/chat` and `/v1/chat/stream` endpoints
- Primarily for Playground testing; production clients should use service labels

**Response**:
```json
{
  "request_id": "req_abc123",
  "data": {
    "content": "Here is the summary...",
    "text": "Here is the summary...",
    "model": "gpt-5-mini",
    "session_id": "abc123",
    "tool_calls": [
      {
        "type": "function",
        "id": "call_1",
        "function": {
          "name": "search_rag",
          "arguments": {
            "query": "docket notes",
            "namespace": "case_123"
          }
        }
      }
    ]
  }
}
```

**Alternative Request Format** (simplified):
```json
{
  "content": "What is per4ex?",
  "session_id": "widget_session_123"
}
```

#### `POST /v1/chat/stream`

Streaming chat completion (Server-Sent Events).

**Request**: Same as `/v1/chat`

**Response Format** (SSE):
```
event: meta
data: {"session_id": "widget_session_123", "tenant_id": "catalyst-widget", "request_id": "req_abc123"}

event: reasoning
data: {"type": "reasoning", "data": {"steps": [{"step": 1, "thought": "...", "conclusion": null}], "summary": "...", "source": "provider", "model": "gpt-4o"}}

data: {"content": "Per4ex", "text": "Per4ex"}
data: {"content": " is", "text": " is"}
data: {"content": " a platform...", "text": " a platform..."}

event: reasoning
data: {"type": "reasoning", "data": {"steps": [...], "source": "provider", "model": "deepseek-ai/DeepSeek-V3.2"}}

event: end
data: {}
```

**Reasoning Events**:
For models that support reasoning (e.g., OpenAI o1/o3/o4, DeepSeek via HuggingFace), reasoning steps are sent as separate events:
```
event: reasoning
data: {"type": "reasoning", "data": {
  "steps": [
    {"step": 1, "thought": "First step of reasoning...", "conclusion": null},
    {"step": 2, "thought": "Second step...", "conclusion": null}
  ],
  "source": "provider",
  "model": "deepseek-ai/DeepSeek-V3.2",
  "summary": null
}}
```

For DeepSeek models via HuggingFace, reasoning content is automatically extracted from `<think>...</think>` tags in the model response. The tags are removed from the answer text, and the reasoning content is converted to structured steps for display.

**Error Events**:
```
event: error
data: {"message": "Rate limit exceeded", "code": "rate_limit_exceeded", "retry_after": 2}
```

**Parsing SSE Response**:

**JavaScript**:
```javascript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let fullText = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        const chunk = data.text || data.content;
        if (chunk) fullText += chunk;
      } catch (e) {}
    } else if (line.startsWith('event: end')) {
      return fullText;
    }
  }
}
```

**Python**:
```python
import requests
import json

response = requests.post('http://localhost:8001/v1/chat/stream', ...)
full_text = ''

for line in response.iter_lines():
    if line.startswith(b'data: '):
        try:
            data = json.loads(line[6:])
            chunk = data.get('text') or data.get('content')
            if chunk:
                full_text += chunk
        except:
            pass

print(full_text)
```

#### Session Instructions

The `instructions` parameter allows tenants to provide session-level system instructions that persist across the conversation:

**First Call (sets instructions)**:
```json
{
  "session_id": "session_abc123",
  "instructions": "You are a legal assistant for pi.law. Focus on civil litigation matters. Cite case law when relevant.",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

**Subsequent Calls (instructions not needed)**:
```json
{
  "session_id": "session_abc123",
  "messages": [{"role": "user", "content": "What is a tort?"}]
}
```

**Benefits**:
- **Reduced payload size**: Instructions are sent once, not every turn
- **Automatic caching**: OpenAI caches the static prefix (50%+ input token savings)
- **Simpler client code**: No need to track and resend instructions

**Layering** (in order of application):
1. **Platform Instructions** - Catalyst identity (always applied)
2. **Tenant Base Prompt** - From tenant configuration (DB)
3. **Session Instructions** - From `instructions` parameter (persisted)
4. **Overlay Instructions** - From `config.overlay_instructions` (per-turn ephemeral)

**Override behavior**:
- Sending `instructions` again in a later call will update the session instructions
- Use `config.overlay_instructions` for per-turn ephemeral overrides that don't persist

---

### RAG Endpoints

#### `POST /v1/rag/sources`

Ingest text into RAG store.

**Request**:
```json
{
  "text": "Document content ...",
  "filename": "docket_notes.txt",
  "namespace": "case_123",
  "metadata": {"source": "pi.law", "case_id": "123"}
}
```

**Response**:
```json
{
  "ids": ["doc_1"],
  "namespace": "case_123",
  "store_type": "pgvector"
}
```

**Notes**:
- Max size: ~100MB
- MIME allowlist: pdf, txt, doc, docx (extendable)
- Tenant-scoped with namespace support

**Troubleshooting**: If text is ingested but no chunks are created, see the [Troubleshooting section in Vector Store Management API](./VECTOR_STORES.md#troubleshooting) for detailed debugging steps using chunk creation logs.

#### `POST /v1/rag/files`

Upload file (PDF/DOCX/TXT) for server-side extraction and indexing.

**Headers**: `Authorization`, `X-Tenant-Id`, `Content-Type: multipart/form-data`

**Form Data**:
- `file`: Uploaded file (PDF/DOCX/TXT)
- `namespace`: Case/matter ID (recommended)
- `metadata`: Optional JSON string

**Behavior**:
- **If store is `pgvector`**: 
  - Server extracts text (PyPDF2 for PDF, python-docx for DOCX) and ingests into pgvector
  - **If file storage is enabled**: Original file is encrypted and stored in PostgreSQL large objects for later retrieval
  - File storage can be enabled via `FILE_STORAGE_ENABLED=1` environment variable or `"file_storage": {"enabled": true}` in vector store config
- **If store is `openai_file_search`**: Server uploads raw file to OpenAI and attaches to tenant's vector store

**File Encryption**:
- When file storage is enabled, files are encrypted using AES-256-GCM
- Encryption keys are managed per-tenant via AWS KMS (production) or local key manager (development)
- Files are stored in PostgreSQL large objects with tenant isolation
- Set `KMS_TYPE=aws` and `AWS_KMS_KEY_ID` for production-grade encryption

**Example (curl)**:
```bash
curl -X POST "https://catalyst-service.fly.dev/v1/rag/files" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Tenant-Id: pilaw" \
  -F "namespace=case_123" \
  -F 'metadata={"source":"pi.law","case_id":"123"}' \
  -F "file=@/path/to/docket.pdf"
```

**Response**:
```json
{
  "ids": ["file_..."],
  "doc_id": "doc_abc123",
  "namespace": "case_123",
  "store_type": "pgvector",
  "filename": "docket.pdf"
}
```

**Note**: The `doc_id` in the response can be used to download the original file later via `GET /v1/rag/files/{doc_id}/download`.

**Troubleshooting**: If files are uploaded but no chunks are created, see the [Troubleshooting section in Vector Store Management API](./VECTOR_STORES.md#troubleshooting) for detailed debugging steps using chunk creation logs.

#### `POST /v1/rag/query`

Query RAG store.

**Request**:
```json
{
  "query": "latest docket updates",
  "namespace": "case_123",
  "top_k": 5,
  "grounded": true
}
```

**Response**:
```json
{
  "hits": [
    {
      "id": "doc_1",
      "score": 0.12,
      "content": "Note snippet...",
      "metadata": {"case_id": "123"}
    }
  ],
  "grounded_answer": {
    "text": "Here are the latest updates...",
    "citations": [
      {"id": "doc_1", "snippet": "Note snippet..."}
    ]
  },
  "store_type": "pgvector"
}
```

#### `GET /v1/rag/files/{doc_id}/download`

Download the original encrypted file (if file storage is enabled).

**Headers**: `Authorization`, `X-Tenant-Id`

**Query Parameters**:
- `namespace` (optional): Namespace filter

**Response**: 
- Content-Type: `application/octet-stream` (or original file content type)
- Content-Disposition: `attachment; filename="{filename}"`
- Body: Decrypted file bytes

**Example (curl)**:
```bash
curl -X GET "https://catalyst-service.fly.dev/v1/rag/files/doc_abc123/download?namespace=case_123" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Tenant-Id: pilaw" \
  --output downloaded_file.pdf
```

**Notes**:
- Only available for pgvector stores with file storage enabled
- File is automatically decrypted using tenant's encryption key
- Returns 404 if file is not found or not stored

#### `GET /v1/admin/vector-stores/files/{doc_id}/metadata`

Get file metadata without downloading the file (admin scope required).

**Headers**: `Authorization` (admin scope)

**Query Parameters**:
- `namespace` (optional): Namespace filter

**Response**:
```json
{
  "file_id": 123,
  "doc_id": "doc_abc123",
  "filename": "contract.pdf",
  "namespace": "default",
  "tenant_id": "pilaw",
  "content_type": "application/pdf",
  "file_size": 2456789,
  "is_stored": true,
  "is_encrypted": true,
  "created_at": "2025-12-25T08:00:00Z",
  "updated_at": "2025-12-25T08:00:00Z",
  "metadata": {"source": "pi.law"}
}
```

#### `POST /v1/rag/delete`

Delete RAG chunks and optionally the stored file.

**Headers**: `Authorization`, `X-Tenant-Id`, `Content-Type: application/json`

**Request** (delete by chunk IDs):
```json
{
  "ids": ["123", "124"],
  "namespace": "case_123"
}
```

Or delete by namespace (removes all chunks in namespace):
```json
{
  "namespace": "case_123"
}
```

Or delete by doc_id (removes all chunks and stored file):
```json
{
  "doc_id": "doc_abc123",
  "namespace": "case_123"
}
```

Or delete all for tenant (pgvector only):
```json
{}
```

**Example (curl)**:
```bash
# Delete by doc_id (recommended for file deletion)
curl -X POST "https://catalyst-service.fly.dev/v1/rag/delete" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Tenant-Id: pilaw" \
  -H "Content-Type: application/json" \
  -d '{
    "doc_id": "doc_abc123",
    "namespace": "case_123"
  }'
```

**Response**:
```json
{
  "request_id": "req_abc123",
  "data": {
    "deleted_ids": "all",
    "namespace": "case_123",
    "tenant_id": "pilaw"
  }
}
```

**Notes**: 
- OpenAI file_search delete is not supported
- When deleting by `doc_id`, both chunks and stored encrypted file (if any) are removed
- `namespace` is optional but recommended for scoped deletion
- Request body must be JSON (not query parameters)

---

### Copilot Endpoints

#### `POST /v1/copilot/analyze-file`

One-shot file analysis: upload → index → retrieve → grounded answer.

**Headers**: `Authorization`, `X-Tenant-Id`, `Content-Type: multipart/form-data`

**Form Data**:
- `file`: Uploaded file (PDF/DOCX/TXT)
- `query`: Required analysis instruction (e.g., "Summarize the key allegations")
- `namespace`: Optional case/matter ID (recommended)
- `metadata`: Optional JSON string
- `top_k`: Optional integer (default 5)

**Example (curl)**:
```bash
curl -X POST "https://catalyst-service.fly.dev/v1/copilot/analyze-file" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Tenant-Id: pilaw" \
  -F "namespace=case_123" \
  -F "query=Summarize key dates, parties, and deadlines from this PDF. Use citations." \
  -F "top_k=5" \
  -F "file=@/path/to/docket.pdf"
```

**Response**:
```json
{
  "answer": {
    "text": "The document contains... [1] [2]",
    "citations": [
      {"id": "doc_1", "snippet": "...", "page": 1}
    ]
  }
}
```

**Notes**:
- `answer.text` cites snippet numbers like `[1]`, `[2]`
- `answer.citations` includes snippet objects with `page` when available for PDFs

---

### Extraction Endpoints

#### `POST /v1/extract`

Structured extraction for automation (badges, deadlines → tasks).

**Supported Types**:
- `legal_document_metadata`
- `deadlines`

**Option 1: Multipart File**

**Headers**: `Authorization`, `X-Tenant-Id`, `Content-Type: multipart/form-data`

**Form Data**:
- `file`: PDF/DOCX/TXT
- `extract_type`: `deadlines` or `legal_document_metadata`
- `namespace`: Optional
- `top_k`: Optional integer (default 8)

**Example (curl)**:
```bash
curl -X POST "https://catalyst-service.fly.dev/v1/extract" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Tenant-Id: pilaw" \
  -F "namespace=case_123" \
  -F "extract_type=deadlines" \
  -F "top_k=8" \
  -F "file=@/path/to/docket.pdf"
```

**Option 2: JSON Text Payload**

**Request**:
```json
{
  "text": "The hearing is set for Jan 5, 2025...",
  "namespace": "case_123",
  "extract_type": "deadlines",
  "top_k": 8,
  "mode": "auto"
}
```

**Notes**:
- `mode`: `auto|text|vision` (current implementation is text-first; vision is reserved)
- Defaults to `auto`
- Response includes `doc.mime_type` and `mode_used` (currently `text`)

---

### Embeddings Endpoint

#### `POST /v1/embeddings`

Generate embeddings for text.

**Request**:
```json
{
  "texts": ["text1", "text2"],
  "model": "text-embedding-3-small"
}
```

**Response**:
```json
{
  "embeddings": [
    {"text": "text1", "vector": [0.1, 0.2, ...]},
    {"text": "text2", "vector": [0.3, 0.4, ...]}
  ],
  "model": "text-embedding-3-small"
}
```

---

### Tools Endpoint

#### `GET /v1/tools`

List available tools for tenant.

**Response**:
```json
{
  "tools": [
    {
      "name": "search_rag",
      "description": "Search RAG store",
      "parameters": {...}
    }
  ]
}
```

**Notes**: Tool schemas are sanitized (no additionalProperties; bytes encoded base64).

---

### Admin Endpoints

#### `GET /v1/admin/api-keys`

List API keys (admin scope required).

**Response**:
```json
{
  "keys": [
    {
      "key_id": "c32856c0f6eee035",
      "tenant_id": "pilaw",
      "scopes": ["chat", "rag"],
      "created_at": "2025-12-20T00:00:00Z"
    }
  ]
}
```

#### `POST /v1/admin/api-keys`

Create API key (admin scope required).

**Request**:
```json
{
  "tenant_id": "pilaw",
  "scopes": ["chat", "rag"],
  "rate_limits": {
    "chat": 2,
    "rag": 1
  }
}
```

**Response**:
```json
{
  "key_id": "c32856c0f6eee035",
  "api_key": "Isr_V2wOEMrZJ8Ib_FhYsTsymsMnmHEU63P8lhzntcc",
  "tenant_id": "pilaw",
  "scopes": ["chat", "rag"]
}
```

**Note**: The `api_key` is returned only once. Store it securely.

#### `DELETE /v1/admin/api-keys/{key_id}`

Revoke API key (admin scope required).

#### `GET /v1/admin/rag-store-configs`

List RAG store configurations (admin scope required).

**Query Parameters**:
- `tenant_id` (optional): Filter by tenant ID
- `store_id` (optional): Get specific store by UUID

**Response**:
```json
{
  "configs": [
    {
      "store_id": "550e8400-e29b-41d4-a716-446655440000",
      "tenant_id": "pilaw",
      "store_name": "default",
      "store_type": "pgvector",
      "default_namespace": "default",
      "config_json": {
        "dsn": "postgresql://user:pass@localhost:5432/db",
        "table": "rag_chunks",
        "embedding_model": "text-embedding-3-small"
      }
    }
  ]
}
```

**Note**: Multiple vector stores per tenant are supported. Each store has a unique `store_id` (UUID) and is identified by `(tenant_id, store_name)` pair.

#### `POST /v1/admin/rag-store-configs`

Create/update RAG store configuration (admin scope required).

**Request**:
```json
{
  "tenant_id": "pilaw",
  "store_id": "550e8400-e29b-41d4-a716-446655440000",
  "store_name": "default",
  "store_type": "pgvector",
  "default_namespace": "default",
  "config": {
    "dsn": "postgresql://user:pass@localhost:5432/db",
    "table": "rag_chunks",
    "embedding_model": "text-embedding-3-small"
  }
}
```

**Fields**:
- `tenant_id` (required): Tenant identifier
- `store_id` (optional): UUID for updates. Omitted for new stores (generated automatically)
- `store_name` (optional): Store name, defaults to "default". Must be unique per tenant
- `store_type` (required): "pgvector" or "openai_file_search"
- `default_namespace` (optional): Default namespace for queries
- `config` (required): Store-specific configuration object

**Response**:
```json
{
  "store_id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "pilaw",
  "store_name": "default",
  "store_type": "pgvector",
  "config": {...},
  "default_namespace": "default"
}
```

#### `PUT /v1/admin/rag-store-configs`

Update RAG store configuration (admin scope required). Same request format as POST.

#### `DELETE /v1/admin/rag-store-configs`

Delete RAG store configuration (admin scope required).

**Query Parameters**:
- `store_id` (preferred): UUID of store to delete
- `tenant_id` + `store_name` (alternative): Delete by tenant and store name

**Example**:
```
DELETE /v1/admin/rag-store-configs?store_id=550e8400-e29b-41d4-a716-446655440000
```

#### `GET /v1/admin/vector-stores/stats`

Get statistics for all vector stores (admin scope required).

**Response**:
```json
{
  "stats": {
    "pilaw": {
      "tenant_id": "pilaw",
      "total_chunks": 1500,
      "total_files": 25,
      "namespaces": {
        "default": 1000,
        "legal": 500
      },
      "embedding_models": {
        "text-embedding-3-small": 1500
      }
    }
  }
}
```

**Fields**:
- `total_chunks`: Total number of chunks indexed
- `total_files`: Total number of distinct files (documents) indexed
- `namespaces`: Object mapping namespace names to chunk counts
- `embedding_models`: Object mapping embedding model names to chunk counts

#### `GET /v1/admin/vector-stores/{tenant_id}/chunks`

List indexed files/chunks for a specific tenant (admin scope required).

**Query Parameters**:
- `namespace` (optional): Filter by namespace
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 50)
- `search` (optional): Search in filename or content

**Response**:
```json
{
  "files": [
    {
      "doc_id": "doc_abc123",
      "filename": "contract.pdf",
      "namespace": "default",
      "tenant_id": "pilaw",
      "chunk_count": 42,
      "first_indexed": "2025-12-24T10:00:00Z",
      "last_indexed": "2025-12-24T10:00:00Z",
      "embedding_models": ["text-embedding-3-small"]
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 50,
  "tenant_id": "pilaw"
}
```

#### `POST /v1/admin/vector-stores/wizard/create`

Quick setup wizard to create a vector store with optimal settings (admin scope required).

**Request**:
```json
{
  "tenant_id": "pilaw",
  "store_name": "default",
  "store_type": "pgvector",
  "default_namespace": "default",
  "embedding_model": "text-embedding-3-small",
  "auto_index": true,
  "files": [
    {
      "filename": "document.pdf",
      "content": "base64-encoded-content"
    }
  ]
}
```

**Response**:
```json
{
  "store_id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "pilaw",
  "store_name": "default",
  "store_type": "pgvector",
  "config": {...},
  "default_namespace": "default",
  "files_indexed": 1,
  "files_failed": 0,
  "ingestion_results": [...]
}
```

#### `GET /v1/admin/vector-stores/default-dsn`

Get the default PostgreSQL DSN from environment configuration (admin scope required).

**Response**:
```json
{
  "dsn": "postgresql://user:pass@localhost:5432/db",
  "available": true
}
```

#### `POST /v1/admin/purge-tenant`

Purge tenant RAG content (admin scope required).

**Request**:
```json
{
  "tenant_id": "pilaw"
}
```

**Note**: Deletes tenant RAG content (pgvector). Logs follow retention; log purge is not automated.

**See Also**: [Vector Store Management API](./VECTOR_STORES.md) for detailed documentation on vector store configuration, statistics, and multiple stores per tenant.

---

### Routing Observability Endpoints

#### `GET /v1/admin/routing-logs`

List LLM routing logs with filtering (admin scope required).

**Query Parameters**:
- `tenant_id` (optional): Filter by tenant ID (superusers can omit to see all tenants)
- `limit` (optional): Max results (default: 100)
- `offset` (optional): Pagination offset (default: 0)
- `start_time` (optional): ISO timestamp filter (inclusive)
- `end_time` (optional): ISO timestamp filter (inclusive)
- `profile` (optional): Filter by routing profile (e.g., `chat_realtime`)
- `provider` (optional): Filter by provider (e.g., `openai`, `anthropic`)
- `status` (optional): Filter by HTTP status code
- `session_id` (optional): Filter by session ID

**Response**:
```json
{
  "logs": [
    {
      "id": 123,
      "request_id": "req_abc123",
      "tenant_id": "pilaw",
      "session_id": "session_456",
      "profile": "chat_realtime",
      "provider": "openai",
      "model": "gpt-4o",
      "status": 200,
      "latency_ms": 1250,
      "input_tokens": 500,
      "output_tokens": 150,
      "created_at": "2026-01-17T08:00:00Z"
    }
  ],
  "total": 1500
}
```

**Notes**:
- Non-superusers can only see logs for tenants they have access to
- Superusers can view all tenant logs when `tenant_id` is omitted

#### `GET /v1/admin/routing-logs/stats`

Get aggregated routing statistics (admin scope required).

**Query Parameters**:
- `tenant_id` (optional): Filter by tenant ID
- `start_time` (optional): ISO timestamp filter
- `end_time` (optional): ISO timestamp filter

**Response**:
```json
{
  "total_requests": 15000,
  "success_rate": 98.5,
  "avg_latency_ms": 850,
  "error_rate": 1.5,
  "by_provider": {
    "openai": 10000,
    "anthropic": 5000
  },
  "by_model": {
    "gpt-4o": 8000,
    "claude-sonnet-4-20250514": 5000,
    "gpt-4o-mini": 2000
  }
}
```

#### `GET /v1/admin/routing-logs/{request_id}`

Get a specific routing log entry by request ID (admin scope required).

**Response**:
```json
{
  "id": 123,
  "request_id": "req_abc123",
  "tenant_id": "pilaw",
  "session_id": "session_456",
  "profile": "chat_realtime",
  "provider": "openai",
  "model": "gpt-4o",
  "status": 200,
  "latency_ms": 1250,
  "input_tokens": 500,
  "output_tokens": 150,
  "error_code": null,
  "error_message": null,
  "created_at": "2026-01-17T08:00:00Z"
}
```

#### `GET /v1/admin/routing-logs/stream`

Stream routing logs in real-time via Server-Sent Events (admin scope required).

**Query Parameters**:
- `tenant_id` (optional): Filter by tenant ID
- `after_id` (optional): Only return logs after this ID (for resuming)

**Response Format** (SSE):
```
event: log
data: {"id": 124, "request_id": "req_def456", "tenant_id": "pilaw", ...}

event: log
data: {"id": 125, "request_id": "req_ghi789", "tenant_id": "pilaw", ...}
```

---

### Widget Configuration Endpoints

#### `GET /v1/admin/tenants/{tenant_id}/widget`

Get widget configuration for a tenant (admin scope required).

**Response**:
```json
{
  "tenant_id": "pilaw",
  "widget": {
    "widget_enabled": true,
    "widget_allowed_origins": ["https://example.com", "https://app.example.com"],
    "widget_title": "Support Assistant",
    "widget_welcome_message": "Hi! How can I help you today?",
    "widget_primary_color": "#3B82F6",
    "widget_position": "bottom-right",
    "widget_button_size": "medium",
    "widget_prompt_override": "You are a helpful support assistant...",
    "widget_contact_email_enabled": true,
    "widget_contact_email_to": "support@example.com"
  }
}
```

#### `PUT /v1/admin/tenants/{tenant_id}/widget`

Update widget configuration for a tenant (admin scope required).

**Request**:
```json
{
  "widget_enabled": true,
  "widget_allowed_origins": ["https://example.com"],
  "widget_title": "Help Bot",
  "widget_welcome_message": "Hello! Ask me anything.",
  "widget_primary_color": "#10B981",
  "widget_position": "bottom-left",
  "widget_button_size": "large",
  "widget_prompt_override": "You are a friendly assistant for Example Corp...",
  "widget_contact_email_enabled": false
}
```

**Widget Settings**:
| Field | Type | Description |
|-------|------|-------------|
| `widget_enabled` | boolean | Enable/disable widget for tenant |
| `widget_allowed_origins` | string[] | Allowed origins for CORS (required for embed) |
| `widget_title` | string | Header title shown in widget |
| `widget_welcome_message` | string | Greeting shown when chat is empty |
| `widget_primary_color` | string | Hex color for branding (e.g., `#3B82F6`) |
| `widget_position` | string | `bottom-right` or `bottom-left` |
| `widget_button_size` | string | `small`, `medium`, or `large` |
| `widget_prompt_override` | string | Custom system prompt for widget chat |
| `widget_contact_email_enabled` | boolean | Enable email contact form |
| `widget_contact_email_to` | string | Email address for contact form |

**Response**: Updated widget configuration (same format as GET)

**Notes**:
- All fields must be prefixed with `widget_`
- `widget_allowed_origins` must be valid HTTP/HTTPS URLs
- `widget_contact_email_to` is required if `widget_contact_email_enabled` is true

---

### LLM Routing Endpoints

#### `GET /v1/admin/tenants/{tenant_id}/llm-routing`

Get LLM routing profiles for a tenant (admin scope required).

**Response**:
```json
{
  "tenant_id": "pilaw",
  "profiles": {
    "chat_realtime": {
      "provider": "openai",
      "model": "gpt-4o",
      "temperature": 0.7,
      "max_tokens": 4096
    },
    "chat_realtime_fast": {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "temperature": 0.5
    },
    "reasoning": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "temperature": 0.3
    }
  }
}
```

#### `PUT /v1/admin/tenants/{tenant_id}/llm-routing`

Update LLM routing profiles for a tenant (admin scope required).

**Request**:
```json
{
  "profiles": {
    "chat_realtime": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "temperature": 0.7,
      "max_tokens": 8192
    }
  }
}
```

**Valid Profile Names**:
- `chat_realtime` - Default chat profile
- `chat_realtime_fast` - Fast/cheap chat
- `chat_realtime_thinking` - Extended thinking mode
- `chat_realtime_pro` - Premium/high-quality
- `chat_batch` - Batch processing
- `rag_answer` - RAG grounded answers
- `summarization` - Summarization tasks
- `proactive_jobs` - Background jobs
- `embeddings` - Embedding generation
- `reasoning` - Complex reasoning tasks

**Response**:
```json
{
  "updated": "pilaw",
  "profiles": {...},
  "warnings": {}
}
```

**Notes**:
- Profiles are validated before saving
- Invalid provider/model combinations return `400` with `validation_errors`

#### `GET /v1/admin/llm-routing`

Get global/default LLM routing profiles (admin scope required).

**Response**:
```json
{
  "scope": "global",
  "profiles": {
    "chat_realtime": {...},
    "reasoning": {...}
  }
}
```

#### `PUT /v1/admin/llm-routing`

Update global/default LLM routing profiles (admin scope required). Same format as tenant-specific endpoint.

#### `POST /v1/admin/llm-routing/validate`

Validate a routing profile configuration without saving (admin scope required).

**Request**:
```json
{
  "profile_name": "chat_realtime",
  "profile_config": {
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.7
  },
  "tenant_id": "pilaw"
}
```

**Response**:
```json
{
  "valid": true,
  "errors": [],
  "warnings": ["Model gpt-4o has high token costs"]
}
```

---

### Tenant Management Endpoints

#### `POST /v1/admin/tenants/{tenant_id}/clone`

Clone a tenant's configuration to a new tenant (admin scope required).

**Request**:
```json
{
  "new_tenant_id": "pilaw-staging",
  "include_rag_stores": true,
  "include_llm_routing": true,
  "include_widget_config": true
}
```

**Response**:
```json
{
  "source_tenant_id": "pilaw",
  "new_tenant_id": "pilaw-staging",
  "cloned": {
    "settings": true,
    "rag_stores": 2,
    "llm_routing": true,
    "widget_config": true
  }
}
```

---

### Cache & Metrics Endpoints

#### `GET /v1/admin/cache/metrics`

Get cache performance metrics (admin scope required).

**Response**:
```json
{
  "rag_config_cache": {
    "hits": 1500,
    "misses": 50,
    "hit_rate": 0.97,
    "size": 25
  },
  "routing_profile_cache": {
    "hits": 3000,
    "misses": 100,
    "hit_rate": 0.97,
    "size": 15
  }
}
```

---

### Public Widget Endpoints

These endpoints are **PUBLIC** (no API key required) but protected by:
- Origin validation against `widget_allowed_origins`
- Rate limiting (30 requests/minute per IP per tenant)
- Widget must be enabled for the tenant

#### `GET /v1/widget/{tenant_id}/config`

Get widget configuration for embedding. Returns theme and settings.

**Response**:
```json
{
  "tenant_id": "ltbr-fishing-gear-pro",
  "enabled": true,
  "title": "Support Assistant",
  "welcome_message": "Hi! How can I help you today?",
  "primary_color": "#3B82F6",
  "position": "bottom-right",
  "button_size": "medium",
  "contact_email_enabled": true
}
```

**Errors**:
- `403` - Origin not in `widget_allowed_origins`
- `404` - Widget not enabled for tenant

#### `POST /v1/widget/{tenant_id}/chat`

Send a chat message from the embedded widget.

**Request**:
```json
{
  "message": "What are your business hours?",
  "session_id": "optional-session-id"
}
```

**Response**:
```json
{
  "session_id": "sess_abc123",
  "message": "Our business hours are Monday-Friday, 9am-5pm EST.",
  "model": "gpt-4o"
}
```

**Notes**:
- `session_id` is optional; if omitted, a new session is created
- Message length limited to 2000 characters
- Uses tenant's configured LLM routing profile
- System prompt from `widget_prompt_override` or tenant default

#### `POST /v1/widget/{tenant_id}/contact`

Submit contact form from widget (if enabled).

**Request**:
```json
{
  "email": "visitor@example.com",
  "name": "John Doe",
  "message": "I'd like to learn more about your services."
}
```

**Response**:
```json
{
  "success": true,
  "message": "Your message has been sent"
}
```

**Notes**:
- Requires `widget_contact_email_enabled: true` in tenant settings
- Sends to `widget_contact_email_to` address

---

### LTBR Self-Service Endpoints

Public endpoints for LTBR (Let There Be RAG) self-service signup and management.

#### `POST /v1/ltbr/signup`

Create a new LTBR customer account. **No authentication required.**

**Request**:
```json
{
  "email": "bob@fishinggearpro.com",
  "password": "securepassword123",
  "business_name": "Fishing Gear Pro",
  "website_url": "https://fishinggearpro.com"
}
```

**Response**:
```json
{
  "success": true,
  "tenant_id": "ltbr-fishing-gear-pro-a1b2c3d4",
  "user_id": "usr_xyz789",
  "email": "bob@fishinggearpro.com",
  "business_name": "Fishing Gear Pro",
  "email_verified": false,
  "widget_enabled": false,
  "embed_snippet": "<script src=\"https://ltbr.app/widget.js\" data-tenant=\"ltbr-fishing-gear-pro-a1b2c3d4\"></script>",
  "next_steps": [
    "Check your email to verify your account",
    "Once verified, your widget will be enabled",
    "Add the embed snippet to your website",
    "Upload documents to train your assistant"
  ],
  "dashboard_url": "https://ltbr.app/dashboard/ltbr-fishing-gear-pro-a1b2c3d4"
}
```

**Rate Limiting**: 5 signups per IP per hour

#### `POST /v1/ltbr/verify-email`

Verify email address and enable widget. **No authentication required.**

**Request**:
```json
{
  "token": "verification-token-from-email",
  "tenant_id": "ltbr-fishing-gear-pro-a1b2c3d4"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Email verified successfully",
  "widget_enabled": true,
  "tenant_id": "ltbr-fishing-gear-pro-a1b2c3d4"
}
```

#### `POST /v1/ltbr/resend-verification`

Resend verification email. **No authentication required.**

**Request**:
```json
{
  "email": "bob@fishinggearpro.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Verification email sent"
}
```

#### `GET /v1/ltbr/{tenant_id}/onboarding`

Get onboarding status and next steps. **Requires authentication.**

**Response**:
```json
{
  "tenant_id": "ltbr-fishing-gear-pro-a1b2c3d4",
  "business_name": "Fishing Gear Pro",
  "email_verified": true,
  "widget_enabled": true,
  "onboarding_complete": false,
  "progress": "2/2",
  "steps": [
    {"id": "email_verified", "title": "Verify your email", "completed": true, "required": true},
    {"id": "widget_configured", "title": "Configure your widget", "completed": true, "required": true},
    {"id": "documents_uploaded", "title": "Upload knowledge base documents", "completed": false, "required": false},
    {"id": "widget_embedded", "title": "Add widget to your website", "completed": false, "required": false}
  ],
  "embed_snippet": "<script src=\"https://ltbr.app/widget.js\" data-tenant=\"ltbr-fishing-gear-pro-a1b2c3d4\"></script>"
}
```

---

### Model Discovery Endpoints

#### `GET /v1/admin/models/oasis`

Discover available models from LLM providers (admin scope required).

**Query Parameters**:
- `provider` (optional): Filter by provider (`openai`, `anthropic`, `gemini`, `huggingface`)
- `limit` (optional): Max results (default: 100)
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "models": [
    {
      "model_id": "claude-opus-4-5-20251101",
      "provider": "anthropic",
      "display_name": "Claude Opus 4.5",
      "description": "Most capable Claude model",
      "context_window": 200000,
      "max_output_tokens": 32000,
      "capabilities": ["chat", "vision", "extended_thinking"],
      "is_enabled": true,
      "created_at": "2026-01-13T00:00:00Z"
    }
  ],
  "total": 50,
  "providers": ["openai", "anthropic", "gemini", "huggingface"]
}
```

**Notes**:
- Models are fetched from provider APIs when available
- Results are cached for performance
- `is_enabled` indicates if model is available for routing

#### `POST /v1/admin/models/oasis/import`

Import/refresh models from a provider (admin scope required).

**Request**:
```json
{
  "provider": "anthropic",
  "refresh": true
}
```

**Response**:
```json
{
  "imported": 12,
  "updated": 3,
  "provider": "anthropic"
}
```

#### `POST /v1/admin/models/oasis/toggle`

Enable/disable a model for routing (admin scope required).

**Request**:
```json
{
  "model_id": "claude-opus-4-5-20251101",
  "is_enabled": true
}
```

**Response**:
```json
{
  "model_id": "claude-opus-4-5-20251101",
  "is_enabled": true,
  "updated_at": "2026-01-13T10:00:00Z"
}
```

---

### User Management Endpoints

#### `GET /v1/admin/users`

List users with optional filters (admin scope required).

**Query Parameters**:
- `org_id` (optional): Filter by organization ID
- `tenant_id` (optional): Filter by tenant access
- `role` (optional): Filter by role (org_admin, member, viewer, tenant_admin, superuser)
- `is_active` (optional): Filter by active status (true/false)
- `is_superuser` (optional): Filter by superuser status (true/false)
- `search` (optional): Search by email or full name
- `limit` (optional): Maximum number of results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response**:
```json
{
  "users": [
    {
      "user_id": "abc123",
      "email": "user@example.com",
      "full_name": "John Doe",
      "org_id": "org_123",
      "role": "member",
      "is_active": true,
      "is_superuser": false,
      "tenants": [
        {
          "tenant_id": "test",
          "role": "member",
          "granted_at": "2025-12-23T00:00:00Z"
        }
      ],
      "created_at": "2025-12-20T00:00:00Z",
      "last_login_at": "2025-12-23T00:00:00Z"
    }
  ],
  "total": 1
}
```

#### `GET /v1/admin/users/{user_id}`

Get user details (admin scope required, or users can view their own).

**Response**:
```json
{
  "user_id": "abc123",
  "email": "user@example.com",
  "full_name": "John Doe",
  "org_id": "org_123",
  "role": "member",
  "is_active": true,
  "is_superuser": false,
  "tenants": [
    {
      "tenant_id": "test",
      "role": "member",
      "granted_at": "2025-12-23T00:00:00Z"
    }
  ],
  "created_at": "2025-12-20T00:00:00Z",
  "last_login_at": "2025-12-23T00:00:00Z"
}
```

#### `POST /v1/admin/users`

Create new user (admin scope required).

**Request**:
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "full_name": "John Doe",
  "org_id": "org_123",
  "role": "member",
  "is_superuser": false
}
```

**Response**:
```json
{
  "user_id": "abc123",
  "email": "user@example.com",
  "full_name": "John Doe",
  "org_id": "org_123",
  "role": "member",
  "is_active": true,
  "is_superuser": false,
  "created_at": "2025-12-23T00:00:00Z"
}
```

#### `PUT /v1/admin/users/{user_id}`

Update user (admin scope required).

**Request**:
```json
{
  "email": "newemail@example.com",
  "full_name": "Jane Doe",
  "role": "org_admin",
  "is_active": true,
  "is_superuser": false
}
```

**Response**: Updated user object

#### `DELETE /v1/admin/users/{user_id}`

Delete user (admin scope required, cannot delete yourself).

**Response**:
```json
{
  "status": "success",
  "message": "User deleted successfully"
}
```

#### `POST /v1/admin/users/{user_id}/tenant-access`

Grant tenant access to user (admin scope required).

**Request**:
```json
{
  "tenant_id": "test",
  "role": "member"
}
```

**Response**: Updated user object with new tenant access

#### `DELETE /v1/admin/users/{user_id}/tenant-access/{tenant_id}`

Revoke tenant access from user (admin scope required).

**Response**: Updated user object

#### `POST /v1/admin/users/{user_id}/activate`

Activate user account (admin scope required).

**Response**: Updated user object with `is_active: true`

#### `POST /v1/admin/users/{user_id}/deactivate`

Deactivate user account (admin scope required).

**Response**: Updated user object with `is_active: false`

#### `POST /v1/admin/users/bulk-activate`

Bulk activate users (admin scope required).

**Request**:
```json
{
  "user_ids": ["user1", "user2", "user3"]
}
```

**Response**:
```json
{
  "activated": 3,
  "failed": 0
}
```

#### `POST /v1/admin/users/bulk-deactivate`

Bulk deactivate users (admin scope required).

**Request**:
```json
{
  "user_ids": ["user1", "user2", "user3"]
}
```

**Response**:
```json
{
  "deactivated": 3,
  "failed": 0
}
```

#### `POST /v1/admin/users/bulk-grant-access`

Bulk grant tenant access (admin scope required).

**Request**:
```json
{
  "user_ids": ["user1", "user2"],
  "tenant_id": "test",
  "role": "member"
}
```

**Response**:
```json
{
  "granted": 2,
  "failed": 0
}
```

#### `POST /v1/admin/users/bulk-revoke-access`

Bulk revoke tenant access (admin scope required).

**Request**:
```json
{
  "user_ids": ["user1", "user2"],
  "tenant_id": "test"
}
```

**Response**:
```json
{
  "revoked": 2,
  "failed": 0
}
```

---

### Token Allowance Management Endpoints

Token allowances control LLM token usage for test users. These endpoints allow administrators to manage per-user token limits and track usage.

#### `GET /v1/admin/users/{user_id}/token-allowance`

Get user's token allowance (admin scope required, or users can view their own).

**Response**:
```json
{
  "total_allowance": 100000,
  "tokens_used": 5000,
  "tokens_remaining": 95000,
  "allowance_reset_at": "2026-01-23T00:00:00Z",
  "reset_period": "monthly"
}
```

**Fields**:
- `total_allowance`: Maximum tokens allowed for this user
- `tokens_used`: Cumulative tokens consumed
- `tokens_remaining`: Remaining tokens available
- `allowance_reset_at`: ISO timestamp when allowance resets (null if `reset_period` is "none")
- `reset_period`: Reset frequency ("none" or "monthly")

#### `PUT /v1/admin/users/{user_id}/token-allowance`

Update user's token allowance (admin scope required).

**Request**:
```json
{
  "total_allowance": 200000,
  "reset_period": "monthly"
}
```

**Response**: Updated token allowance object

**Note**: `reset_period` must be "none" or "monthly". If "monthly", `allowance_reset_at` is automatically set to 30 days from now.

#### `POST /v1/admin/users/{user_id}/token-allowance/reset`

Reset user's token usage counter (admin scope required).

**Request** (optional):
```json
{
  "total_allowance": 150000
}
```

**Response**: Updated token allowance object with `tokens_used` reset to 0

**Note**: If `total_allowance` is provided, it updates the allowance before resetting usage. Otherwise, resets usage while keeping current allowance.

#### `GET /v1/admin/users/{user_id}/token-usage`

Get user's token usage history (admin scope required, or users can view their own).

**Query Parameters**:
- `limit` (optional): Maximum number of records (default: 100, max: 1000)

**Response**:
```json
{
  "usage": [
    {
      "id": 1,
      "session_id": "session_123",
      "tenant_id": "test",
      "input_tokens": 100,
      "output_tokens": 200,
      "total_tokens": 300,
      "model_name": "gpt-4",
      "route": "chat",
      "created_at": "2025-12-23T10:00:00Z"
    }
  ]
}
```

#### `GET /v1/admin/platform/token-allowance-settings`

Get global default token allowance settings (superuser only).

**Response**:
```json
{
  "total_allowance": 100000,
  "reset_period": "monthly"
}
```

**Note**: These defaults are applied to new test users when they receive test access.

#### `PUT /v1/admin/platform/token-allowance-settings`

Update global default token allowance settings (superuser only).

**Request**:
```json
{
  "total_allowance": 150000,
  "reset_period": "monthly"
}
```

**Response**: Updated settings object

**Note**: Changes to global defaults only affect new test users. Existing users retain their current allowances.

#### `GET /v1/admin/platform/global-instructions`

Get global platform instructions (superuser only).

**Response**:
```json
{
  "instructions": "=== CATALYST PLATFORM IDENTITY ===\n\n...",
  "length": 934
}
```

**Note**: Global platform instructions apply to ALL tenants and define the Catalyst AI 6.0 identity that overrides any conflicting statements in tenant-specific prompts.

#### `PUT /v1/admin/platform/global-instructions`

Update global platform instructions (superuser only).

**Request**:
```json
{
  "instructions": "=== CATALYST PLATFORM IDENTITY ===\n\n..."
}
```

**Response**:
```json
{
  "instructions": "...",
  "length": 934,
  "message": "Global platform instructions updated successfully"
}
```

**Note**: These instructions are prepended to all system prompts and ensure all models identify as "Catalyst AI 6.0" regardless of the underlying LLM provider.

---

## Billing Endpoints

Catalyst includes a credit-based billing system for tracking and controlling LLM usage.

### User Billing Endpoints

#### `GET /v1/billing/balance`

Get current user's credit balance.

**Headers**: `Authorization`

**Response**:
```json
{
  "balance": 95000,
  "lifetime_purchased": 100000,
  "lifetime_consumed": 5000,
  "balance_usd": "$9.50",
  "updated_at": "2026-01-13T10:00:00Z"
}
```

#### `GET /v1/billing/transactions`

Get current user's transaction history.

**Query Parameters**:
- `limit` (optional): Max results (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `type` (optional): Filter by transaction type

**Response**:
```json
{
  "data": [
    {
      "id": "txn_abc123",
      "transaction_type": "consumption",
      "amount": -150,
      "balance_after": 95000,
      "description": "Chat with gpt-4o",
      "model_name": "gpt-4o",
      "service_label": "default-chat",
      "created_at": "2026-01-13T09:30:00Z"
    }
  ],
  "pagination": {"limit": 50, "offset": 0, "count": 1}
}
```

**Transaction Types**: `purchase`, `consumption`, `adjustment`, `promotional`, `refund`, `transfer_in`, `transfer_out`

#### `GET /v1/billing/usage`

Get current user's usage summary.

**Query Parameters**:
- `days` (optional): Number of days to summarize (default: 30, max: 365)

**Response**:
```json
{
  "period_days": 30,
  "total_consumed": 5000,
  "by_service_label": {
    "default-chat": 3000,
    "fast": 2000
  },
  "by_model": {
    "gpt-4o": 4000,
    "gpt-4o-mini": 1000
  },
  "transaction_count": 25
}
```

#### `GET /v1/billing/packages`

Get available credit packages for purchase.

**Response**:
```json
{
  "packages": [
    {
      "package_id": "pkg_starter",
      "name": "Starter Pack",
      "description": "10,000 credits for testing",
      "credits": 10000,
      "price_usd_cents": 1000,
      "is_featured": false
    }
  ]
}
```

#### `GET /v1/billing/estimate`

Estimate cost for a chat operation.

**Query Parameters**:
- `input_tokens` (optional): Estimated input tokens (default: 1000)
- `output_tokens` (optional): Estimated output tokens (default: 500)
- `service_label` (optional): Service label for pricing (default: "default-chat")

**Response**:
```json
{
  "estimated_credits": 150,
  "input_credits": 100,
  "output_credits": 50,
  "service_label": "default-chat",
  "pricing_rule": "default"
}
```

### Admin Billing Endpoints

#### `GET /v1/admin/billing/users`

List all users with credit balances (superuser only).

**Query Parameters**:
- `limit` (optional): Max results (default: 50)
- `offset` (optional): Pagination offset
- `search` (optional): Search by email or name

**Response**:
```json
{
  "data": [
    {
      "user_id": "abc123",
      "email": "user@example.com",
      "full_name": "John Doe",
      "balance": 95000,
      "lifetime_purchased": 100000,
      "lifetime_consumed": 5000,
      "updated_at": "2026-01-13T10:00:00Z"
    }
  ],
  "pagination": {"limit": 50, "offset": 0, "total": 1}
}
```

#### `GET /v1/admin/billing/stats`

Get platform-wide billing statistics (superuser only).

**Response**:
```json
{
  "total_users": 100,
  "total_balance": 5000000,
  "total_purchased": 6000000,
  "total_consumed": 1000000,
  "active_users_30d": 45
}
```

#### `POST /v1/admin/billing/adjust`

Adjust user's credit balance (superuser only).

**Request**:
```json
{
  "user_id": "abc123",
  "amount": 10000,
  "type": "promotional",
  "reason": "Welcome bonus"
}
```

**Notes**:
- `amount`: Positive to add credits, negative to deduct
- `type`: One of `promotional`, `adjustment`, `refund`, `deduction`, `correction`, `chargeback`

**Response**:
```json
{
  "user_id": "abc123",
  "new_balance": 105000,
  "adjustment": 10000,
  "type": "promotional"
}
```

#### `GET /v1/admin/billing/pricing`

Get pricing rules (superuser only).

**Response**:
```json
{
  "rules": [
    {
      "rule_id": "rule_abc",
      "action_type": "chat",
      "service_label": "default-chat",
      "credits_per_1k_input_tokens": 10,
      "credits_per_1k_output_tokens": 30,
      "priority": 0,
      "is_active": true
    }
  ]
}
```

---

## WebSocket API Reference

### Connection

**URL**: `ws://localhost:8765` (local dev only; production uses REST streaming)

**Handshake**:
- Query params: `api_key=<API_KEY>&version={v?}`
- Legacy auth params accepted
- If no version, legacy-compatible mode

**Optional Hello Message**:
```json
{
  "type": "hello",
  "protocol_version": "1.0",
  "capabilities": ["thought_signature", "tool_calls"]
}
```

**Server Response**:
```json
{
  "type": "hello_ack",
  "protocol_version": "1.0",
  "capabilities": ["thought_signature", "tool_calls"]
}
```

### Message Types

#### Client → Server

**Chat Request**:
```json
{
  "type": "chat",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "session_id": "abc123"
}
```

**Pong** (response to ping):
```json
{
  "type": "pong"
}
```

#### Server → Client

**Response Start**:
```json
{
  "type": "response_start",
  "request_id": "req_abc123",
  "session_id": "abc123",
  "model": "gpt-5-mini",
  "profile": "chat_realtime",
  "tools_used": ["search_rag"]
}
```

**Response Chunk**:
```json
{
  "type": "response_chunk",
  "request_id": "req_abc123",
  "content": "Hello"
}
```

**Response Complete**:
```json
{
  "type": "response_complete",
  "request_id": "req_abc123",
  "content": "Hello, how can I help?",
  "length": 20,
  "chunks_sent": 3,
  "tools_used": []
}
```

**Response Error**:
```json
{
  "type": "response_error",
  "request_id": "req_abc123",
  "code": "rate_limit_exceeded",
  "message": "Too many requests",
  "provider": "openai",
  "details": {},
  "retry_after": 2
}
```

**Tool Call**:
```json
{
  "type": "tool_call",
  "request_id": "req_abc123",
  "calls": [
    {
      "name": "search_rag",
      "args": {"query": "docket notes", "namespace": "case_123"},
      "thought": "Need recent notes",
      "thought_signature": "sig123"
    }
  ]
}
```

**Tool Result**:
```json
{
  "type": "tool_result",
  "request_id": "req_abc123",
  "name": "search_rag",
  "content": "...",
  "truncated": false
}
```

**Ping** (heartbeat):
```json
{
  "type": "ping"
}
```

**Proactive Message**:
```json
{
  "type": "proactive_message",
  "content": "I noticed you haven't checked in today...",
  "timestamp": "2025-12-21T10:00:00Z"
}
```

**Background Data Updated**:
```json
{
  "type": "background_data_updated",
  "source": "gmail",
  "timestamp": "2025-12-21T10:00:00Z"
}
```

### Compatibility

**Legacy Mode**:
- Trigger: No `version` in query/header and no `hello` message
- Auth: Accept legacy auth header/query; prefer `api_key` when supplied
- Events: Preserve legacy envelopes/names
- Fields: New fields (e.g., `tool_calls`, `thought_signature`) omitted unless client advertises support

**Versioned Mode**:
- Client sends `protocol_version` and `capabilities` in `hello` message
- Server responds with accepted version and enabled capabilities
- New optional fields may appear without breaking legacy clients

### Heartbeat & Backpressure

**Heartbeat**:
- Server sends `ping` at interval
- Client must respond with `pong`
- Idle timeout closes connection

**Backpressure**:
- Server monitors outbound queue
- On threshold: send warning, then close if not relieved
- Clients should back off and reconnect
- May receive close code indicating backpressure

### Reconnect Guidance

- Clients may reuse `session_id` when reconnecting
- If reconnect fails, start fresh and re-send pending requests
- Server assigns new `session_id` if not provided

### Limits

- Enforce max message size per tenant
- Truncate large tool results (`truncated=true`)
- Per-tenant connection limits may apply
- Refuse extra connections with clear error

---

## Voice Capabilities

Catalyst provides advanced real-time voice interaction capabilities with multiple AI providers, offering ultra-low latency conversations and flexible voice modes.

### Overview

**Voice Architecture**:
- **Real-time Voice**: Direct WebSocket connections to AI providers for ultra-low latency
- **Chained Pipeline**: Traditional STT → LLM → TTS for maximum flexibility and control
- **Multi-Provider Support**: OpenAI, ElevenLabs, Google Gemini
- **Voice Modes**: Voice Activity Detection (VAD) and Push-to-Talk (PTT)

### Voice Providers

#### OpenAI Realtime API

**Provider**: `openai`  
**Type**: Native real-time voice with integrated STT, LLM, and TTS

**Features**:
- **Ultra-low latency**: ~200-300ms end-to-end
- **Native interruption**: Interrupt the AI mid-sentence naturally
- **Function calling**: Full tool support during voice conversations
- **Streaming audio**: Real-time audio generation as the AI speaks
- **Voice options**: Multiple voice personalities (alloy, echo, shimmer, etc.)

**Configuration**:
```json
{
  "realtime_provider": "openai",
  "voice_profile": {
    "voice": "alloy",
    "model": "gpt-4o-realtime-preview",
    "temperature": 0.8,
    "max_response_output_tokens": 4096
  }
}
```

**Supported Models**:
- `gpt-4o-realtime-preview` - Latest real-time model
- `gpt-4o-realtime-preview-2024-12-17` - Specific version

**Use Cases**:
- Natural conversations with minimal latency
- Interactive voice assistants
- Real-time customer support
- Voice-controlled applications

#### ElevenLabs Realtime

**Provider**: `elevenlabs`  
**Type**: Hybrid architecture with ElevenLabs STT/TTS + Catalyst LLM routing

**Features**:
- **Best-in-class voice quality**: Industry-leading natural voice synthesis
- **Ultra-low latency STT**: Scribe v2 WebSocket streaming (~150ms)
- **Ultra-low latency TTS**: Multi-Context WebSocket with eleven_flash_v2_5 (~200ms)
- **Full Catalyst integration**: Access to all Catalyst tools, memory, and persona
- **Custom voices**: Use any ElevenLabs voice ID
- **Flexible LLM routing**: Choose any LLM provider for reasoning

**Architecture**:
1. **STT**: ElevenLabs Scribe v2 Realtime WebSocket
2. **LLM**: Catalyst's LLM routing (OpenAI, Anthropic, Google, etc.)
3. **TTS**: ElevenLabs Multi-Context WebSocket

**Configuration**:
```json
{
  "realtime_provider": "elevenlabs",
  "voice_profile": {
    "voice_id": "21m00Tcm4TlvDq8ikWAM",
    "tts_model": "eleven_flash_v2_5",
    "llm_profile": "chat_realtime"
  }
}
```

**Voice IDs** (examples):
- `21m00Tcm4TlvDq8ikWAM` - Rachel (default, warm and friendly)
- `EXAVITQu4vr4xnSDxMaL` - Bella (soft and pleasant)
- `pNInz6obpgDQGcFmaJgB` - Adam (deep and authoritative)
- Custom voice IDs from your ElevenLabs account

**TTS Models**:
- `eleven_flash_v2_5` - Ultra-low latency (recommended for real-time)
- `eleven_turbo_v2_5` - Balanced quality and speed
- `eleven_multilingual_v2` - Multi-language support

**Use Cases**:
- Premium voice quality for customer-facing applications
- Multi-language voice assistants
- Custom branded voice experiences
- Applications requiring specific voice characteristics

#### Google Gemini Live

**Provider**: `google`  
**Type**: Native real-time voice with Gemini 2.0

**Features**:
- **Multimodal understanding**: Voice + vision + text in one model
- **Low latency**: Optimized for real-time conversations
- **Advanced reasoning**: Gemini 2.0 Flash reasoning capabilities
- **Native integration**: Direct WebSocket to Google AI

**Configuration**:
```json
{
  "realtime_provider": "google",
  "voice_profile": {
    "model": "models/gemini-2.0-flash-exp",
    "voice": "Puck"
  }
}
```

**Supported Models**:
- `models/gemini-2.0-flash-exp` - Gemini 2.0 Flash (experimental)

**Use Cases**:
- Multimodal applications requiring vision + voice
- Advanced reasoning during voice conversations
- Google ecosystem integrations

### Voice Modes

#### Voice Activity Detection (VAD)

**Description**: Automatic speech detection - just start talking, and the AI responds when you pause.

**Features**:
- **Hands-free operation**: No button pressing required
- **Natural flow**: Conversations feel more natural
- **Adaptive thresholds**: Automatically adjusts to ambient noise
- **Smart silence detection**: Distinguishes pauses from end-of-speech

**Configuration**:
```json
{
  "voice_mode": "vad",
  "vad_settings": {
    "threshold": 0.5,
    "silence_duration_ms": 1500
  }
}
```

**Best For**:
- Continuous conversations
- Hands-free environments
- Natural dialogue flow
- Accessibility applications

#### Push-to-Talk (PTT)

**Description**: Press and hold to speak, release to send.

**Features**:
- **Precise control**: Speak exactly when you want
- **No false triggers**: Won't activate on background noise
- **Privacy**: Only records when button is pressed
- **Ideal for noisy environments**: Works reliably in any setting

**Configuration**:
```json
{
  "voice_mode": "ptt"
}
```

**Best For**:
- Noisy environments
- Privacy-sensitive applications
- Precise command input
- Professional/enterprise settings

### WebSocket Voice Protocol

**Connection**: Voice interactions use the standard Catalyst WebSocket connection (`wss://catalyst-service.fly.dev:8765`)

#### Client → Server Messages

**Start Voice Session**:
```json
{
  "type": "voice_mode_start",
  "mode": "vad",
  "provider": "elevenlabs",
  "config": {
    "voice_id": "21m00Tcm4TlvDq8ikWAM",
    "llm_profile": "chat_realtime"
  }
}
```

**Send Audio Chunk** (binary or base64):
```json
{
  "type": "audio_chunk",
  "audio": "<base64_encoded_audio>",
  "format": "pcm16",
  "sample_rate": 16000
}
```

**Commit Audio** (PTT mode):
```json
{
  "type": "audio_commit"
}
```

**Interrupt AI**:
```json
{
  "type": "voice_interrupt"
}
```

**Stop Voice Session**:
```json
{
  "type": "voice_mode_stop"
}
```

#### Server → Client Messages

**Session Started**:
```json
{
  "type": "session.created",
  "provider": "elevenlabs",
  "voice_id": "21m00Tcm4TlvDq8ikWAM",
  "model": "eleven_flash_v2_5"
}
```

**Transcript** (partial or final):
```json
{
  "type": "transcript",
  "text": "Hello, how can I help you?",
  "is_final": true
}
```

**Audio Response**:
```json
{
  "type": "audio",
  "audio": "<base64_encoded_audio>",
  "format": "mp3"
}
```

**Audio Stream Control**:
```json
{
  "type": "audio_stream_start"
}
```

```json
{
  "type": "audio_stream_end"
}
```

**Voice Error**:
```json
{
  "type": "voice_error",
  "error": "Connection failed",
  "code": "connection_error"
}
```

### Audio Formats

**Input Audio** (Client → Server):
- **Format**: PCM16 (16-bit linear PCM)
- **Sample Rate**: 16000 Hz (16 kHz)
- **Channels**: Mono (1 channel)
- **Encoding**: Base64 for JSON transport, or raw binary

**Output Audio** (Server → Client):
- **OpenAI**: PCM16, 24000 Hz
- **ElevenLabs**: MP3, 44100 Hz (or configured sample rate)
- **Google Gemini**: PCM16, 24000 Hz

### Voice Configuration Examples

#### Example 1: ElevenLabs with Custom Voice
```json
{
  "realtime_provider": "elevenlabs",
  "voice_profile": {
    "voice_id": "pNInz6obpgDQGcFmaJgB",
    "tts_model": "eleven_flash_v2_5",
    "llm_profile": "chat_realtime_pro"
  },
  "voice_mode": "vad"
}
```

#### Example 2: OpenAI Realtime with Tools
```json
{
  "realtime_provider": "openai",
  "voice_profile": {
    "voice": "shimmer",
    "model": "gpt-4o-realtime-preview",
    "temperature": 0.7,
    "tools": ["search_rag", "search_web"]
  },
  "voice_mode": "ptt"
}
```

#### Example 3: Google Gemini Multimodal
```json
{
  "realtime_provider": "google",
  "voice_profile": {
    "model": "models/gemini-2.0-flash-exp",
    "voice": "Puck"
  },
  "voice_mode": "vad"
}
```

### Performance Metrics

**Typical Latencies**:

| Provider | STT Latency | LLM Latency | TTS Latency | Total (End-to-End) |
|----------|-------------|-------------|-------------|-------------------|
| OpenAI Realtime | N/A (integrated) | N/A (integrated) | N/A (integrated) | ~200-300ms |
| ElevenLabs | ~150ms | ~500-1000ms | ~200ms | ~850-1350ms |
| Google Gemini | N/A (integrated) | N/A (integrated) | N/A (integrated) | ~300-400ms |

**Note**: Latencies vary based on network conditions, audio length, and LLM complexity.

### Voice Provider Selection Guide

**Choose OpenAI Realtime when**:
- You need the absolute lowest latency
- Native interruption is critical
- You want integrated function calling
- Standard voice quality is sufficient

**Choose ElevenLabs when**:
- Voice quality is paramount
- You need custom or branded voices
- You want to use specific LLM providers (Anthropic, etc.)
- Multi-language support is required
- You need full control over the conversation pipeline

**Choose Google Gemini when**:
- You need multimodal capabilities (voice + vision)
- Advanced reasoning during conversations is important
- You're building on Google Cloud infrastructure
- You want the latest Gemini models

### Rate Limits & Costs

**Voice API Rate Limits**:
- Per-tenant connection limits apply
- Concurrent voice sessions may be limited based on plan
- Audio chunk size limits: ~1MB per message

**Billing**:
- Voice interactions are billed based on:
  - Audio duration (STT/TTS)
  - LLM tokens used
  - Provider-specific pricing
- See `/v1/billing/balance` for current usage

### Best Practices

1. **Connection Management**:
   - Reuse WebSocket connections when possible
   - Implement reconnection logic with exponential backoff
   - Handle connection errors gracefully

2. **Audio Quality**:
   - Use recommended sample rates (16kHz input, provider-specific output)
   - Minimize background noise for better STT accuracy
   - Test with various audio sources (microphone quality matters)

3. **Latency Optimization**:
   - Choose the right provider for your latency requirements
   - Use connection pooling for ElevenLabs provider
   - Consider geographic proximity to API servers

4. **Error Handling**:
   - Implement fallback to text chat on voice errors
   - Handle provider-specific error codes
   - Monitor voice session health

5. **User Experience**:
   - Provide visual feedback during voice interactions
   - Show transcripts for transparency
   - Allow easy switching between voice and text modes
   - Implement clear interrupt mechanisms

---

## Code Examples

### Python Client

```python
import requests
import os
from typing import Optional, Dict, Any

class CatalystClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        tenant_id: str = "pilaw"
    ):
        self.base_url = base_url or os.getenv(
            "CATALYST_API_URL",
            "https://catalyst-service.fly.dev/v1"
        )
        self.api_key = api_key or os.getenv("CATALYST_API_KEY")
        self.tenant_id = tenant_id
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "X-Tenant-Id": self.tenant_id,
            "Content-Type": "application/json"
        }
    
    def chat(self, messages: list, session_id: Optional[str] = None, **kwargs):
        """Send chat request"""
        payload = {"messages": messages, **kwargs}
        if session_id:
            payload["session_id"] = session_id
        
        response = requests.post(
            f"{self.base_url}/chat",
            headers=self.headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()
    
    def chat_stream(self, messages: list, session_id: Optional[str] = None, **kwargs):
        """Send streaming chat request (SSE)"""
        payload = {"messages": messages, **kwargs}
        if session_id:
            payload["session_id"] = session_id
        
        response = requests.post(
            f"{self.base_url}/chat/stream",
            headers=self.headers,
            json=payload,
            stream=True
        )
        response.raise_for_status()
        return response
    
    def rag_ingest(self, text: str, namespace: str, filename: Optional[str] = None, metadata: Optional[Dict] = None):
        """Ingest text into RAG"""
        payload = {
            "text": text,
            "namespace": namespace
        }
        if filename:
            payload["filename"] = filename
        if metadata:
            payload["metadata"] = metadata
        
        response = requests.post(
            f"{self.base_url}/rag/sources",
            headers=self.headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()
    
    def rag_query(self, query: str, namespace: str, top_k: int = 5, grounded: bool = True):
        """Query RAG"""
        payload = {
            "query": query,
            "namespace": namespace,
            "top_k": top_k,
            "grounded": grounded
        }
        
        response = requests.post(
            f"{self.base_url}/rag/query",
            headers=self.headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()
    
    def analyze_file(self, file_path: str, query: str, namespace: Optional[str] = None):
        """One-shot file analysis"""
        with open(file_path, "rb") as f:
            files = {"file": f}
            data = {"query": query}
            if namespace:
                data["namespace"] = namespace
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "X-Tenant-Id": self.tenant_id
            }
            
            response = requests.post(
                f"{self.base_url}/copilot/analyze-file",
                headers=headers,
                files=files,
                data=data
            )
            response.raise_for_status()
            return response.json()

# Usage
client = CatalystClient(tenant_id="pilaw")
result = client.chat(
    messages=[{"role": "user", "content": "Summarize case 123"}],
    session_id="case_123_chat"
)
print(result["data"]["content"])
```

### JavaScript Client

```javascript
class CatalystClient {
  constructor(apiKey, baseUrl = 'http://localhost:8001', tenantId = 'catalyst-widget') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.tenantId = tenantId;
  }

  async chat(message, sessionId = null) {
    const response = await fetch(`${this.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Tenant-Id': this.tenantId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: message }],
        session_id: sessionId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Chat request failed');
    }

    const json = await response.json();
    return json.data.content;  // Extract text
  }

  async *streamChat(message, sessionId = null) {
    const response = await fetch(`${this.baseUrl}/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Tenant-Id': this.tenantId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: message }],
        session_id: sessionId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Stream request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              yield data.content;
            }
          } catch (e) {}
        } else if (line.startsWith('event: end')) {
          return;
        }
      }
    }
  }
}

// Usage
const client = new CatalystClient('YOUR_API_KEY', 'http://localhost:8001', 'catalyst-widget');
const sessionId = 'widget_session_123';

// Non-streaming
const response = await client.chat('What is per4ex?', sessionId);
console.log(response);

// Streaming
let fullText = '';
for await (const chunk of client.streamChat('What is per4ex?', sessionId)) {
  fullText += chunk;
  process.stdout.write(chunk);
}
console.log('\nFull text:', fullText);
```

### Retry Logic

```python
import time
from requests.exceptions import HTTPError

def chat_with_retry(client, messages, max_retries=3):
    for attempt in range(max_retries):
        try:
            return client.chat(messages)
        except HTTPError as e:
            if e.response.status_code == 429:
                retry_after = int(e.response.headers.get("retry_after", 1))
                time.sleep(retry_after)
                continue
            raise
    raise Exception("Max retries exceeded")
```

---

## Error Handling

### Error Response Format

```json
{
  "request_id": "req_abc123",
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests",
    "provider": "openai",
    "details": {},
    "retry_after": 2
  }
}
```

### Error Codes

- **`401` / `4401`**: Authentication required
- **`403` / `tenant_mismatch`**: API key tenant does not match `X-Tenant-Id` header
- **`429` / `4408`**: Rate limit exceeded (includes `retry_after` when available)
- **`413`**: Payload too large
- **`500`**: Internal server error
- **`timeout`**: Request timeout
- **`provider_error`**: LLM provider error

### SSE Error Events

```
event: error
data: {"message": "Rate limit exceeded", "code": "rate_limit_exceeded", "retry_after": 2}
```

### Retry Semantics

- **Rate limits**: Retry after `retry_after` seconds
- **Transient errors**: Exponential backoff
- **Permanent errors**: Do not retry

---

## Testing Guide

### Test API Key

For local development, you can use:
- **Test key**: `Isr_V2wOEMrZJ8Ib_FhYsTsymsMnmHEU63P8lhzntcc` (ID: `c32856c0f6eee035`)
- **Scopes**: `chat`, `rag`
- **Tenant**: `pilaw`

### Health Check

```bash
# Production
curl https://catalyst-service.fly.dev/v1/health

# Local Dev
curl http://localhost:8001/v1/health
```

### Test Chat

```bash
# Production
curl -X POST "https://catalyst-service.fly.dev/v1/chat" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Tenant-Id: pilaw" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "session_id": "test_session"
  }'

# Local Dev
curl -X POST "http://localhost:8001/v1/chat" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Tenant-Id: pilaw" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "session_id": "test_session"
  }'
```

### Test RAG

```bash
# Ingest
curl -X POST "http://localhost:8001/v1/rag/sources" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Tenant-Id: pilaw" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello pgvector",
    "filename": "test.txt",
    "namespace": "case_123"
  }'

# Query
curl -X POST "http://localhost:8001/v1/rag/query" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Tenant-Id: pilaw" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Hello",
    "namespace": "case_123",
    "top_k": 3
  }'
```

### Tenant-Specific Testing

**For `catalyst-widget` tenant**:
- Ensure only RAG tools are enabled (no SQL, Gmail, Calendar, etc.)
- Verify namespace scoping works correctly
- Test with `namespace: "per4ex-kb"` for knowledge base queries

**For `pilaw` tenant**:
- Test with `namespace: "case_123"` for case-scoped documents
- Verify encryption is enabled (if configured)
- Test structured extraction (`deadlines`, `legal_document_metadata`)

**For `personal` tenant**:
- Test with full tool access (SQL, Gmail, Calendar, RAG)
- Verify persona integration
- Test session continuity with long conversations

---

## Integration Patterns

### Multi-Tenant Integration

**Tenancy Model**:
- **Tenant** = Firm/org boundary (e.g., `pilaw`, `catalyst-widget`, `personal`)
- **Namespace** = Matter/case boundary (e.g., `case_123`, `matter_abc`)
- **Namespace is NOT a security boundary** - it's a sub-scope inside the tenant

**Session Model**:
- Create and persist `session_id` per conversation thread
- Send `session_id` on every `/v1/chat` or `/v1/chat/stream` call
- Catalyst maintains continuity automatically

**RAG Model**:
- Ingest matter documents/notes via `POST /v1/rag/sources` with `namespace=<case_id>`
- Query via `POST /v1/rag/query` with the same namespace
- Catalyst exposes unified tool `search_rag` for in-chat retrieval

**Store Selection**:
- **`pgvector`** (recommended): Catalyst-owned retrieval
- **`openai_file_search`** (optional): OpenAI-managed vector store
- Configured server-side per tenant (admin store config)
- **Multiple stores per tenant**: Each tenant can have multiple vector store configurations identified by `store_id` (UUID) and `store_name`. See [Vector Store Management API](./VECTOR_STORES.md) for details.

### Privacy & Security

**Tenant Mismatch Protection**:
- Catalyst rejects cross-tenant header overrides (403 `tenant_mismatch`)

**At-Rest Encryption**:
- Optional AES-256-GCM for pgvector content (per-tenant keys)
- Enable via `RAG_ENCRYPT_AT_REST=1` or tenant policy

**Logging Redaction**:
- Per-tenant policy for request/response body redaction
- Only metadata logged for sensitive tenants
- Log retention operator-controlled (default 30d)

**Rate Limits**:
- Per-tenant buckets at API layer
- Configurable per tenant

### System Prompts

**Layering** (lowest to highest priority):
0. **Global Platform Instructions** - Platform-wide Catalyst AI 6.0 identity (applies to ALL tenants)
1. **Service prompt**: Core rules/tools (owned by Catalyst)
2. **Tenant prompt**: Style/domain (managed server-side)
3. **Persona**: Evolved personality (for `personal` tenant)
4. **Reminder**: Final identity reinforcement
5. **Overlay**: Client-provided instructions (final layer, additive)

**Platform Identity**:
- All models MUST identify as "Catalyst AI 6.0" when asked about their identity
- This identity overrides any conflicting statements in tenant-specific prompts
- The underlying LLM provider (OpenAI, Gemini, etc.) is an implementation detail

**Key Points**:
- Clients must NOT send system prompts
- Server prepends global instructions + service + tenant prompts automatically
- Overlay is additive, not replacement

### LLM Routing

**Supported Providers**:
- **OpenAI** - GPT-4o, GPT-4o-mini, o1, o3, o4-mini, etc.
- **Anthropic** - Claude Opus 4.5, Claude Sonnet 4, Claude Haiku, etc.
- **Google Gemini** - Gemini 2.0 Flash, Gemini 1.5 Pro, etc.
- **HuggingFace** - DeepSeek, Mistral, Llama, and other open models

**Per-Tenant Profiles**:
- `chat_realtime` - Real-time chat
- `chat_realtime_fast` - Fast chat (service label: "fast")
- `chat_realtime_thinking` - Thinking chat (service label: "thinking")
- `chat_realtime_pro` - Pro chat (service label: "pro")
- `chat_batch` - Batch chat processing
- `rag_answer` - RAG answer generation
- `summarization` - Conversation summaries (background jobs)
- `proactive_jobs` - Proactive messages (background jobs)

**Profile Priority** (highest to lowest):
1. **Tenant-specific profiles** - Configured per tenant (e.g., `llm_routing_profile_{tenant_id}_{profile_name}`)
2. **Global profiles** - Shared across all tenants (e.g., `llm_routing_profile_{profile_name}`)
3. **Default profiles** - Hardcoded fallback in code

**Configuration**:
- Server-side per tenant (control-plane or UI)
- Clients should NOT override model/provider (use service labels instead)
- Tenant-specific profiles override global profiles
- Global profiles override defaults
- Service labels (e.g., "fast", "thinking", "pro") map to specific profiles per tenant

**Direct Model Testing**:
- Superusers can bypass routing via `direct_provider` + `direct_model` parameters
- Used for Playground testing of specific models
- Billing is still enforced based on inferred model tier

**Reasoning Support**:
- **Provider-native reasoning**: OpenAI o1/o3/o4 models expose reasoning via Responses API
- **Anthropic extended thinking**: Claude models with extended thinking enabled
- **DeepSeek reasoning**: DeepSeek models via HuggingFace provider embed reasoning in `<think>...</think>` tags
- Reasoning is automatically extracted and converted to structured format
- Reasoning tags are filtered from answer content (only reasoning content is extracted, tags don't appear in answer text)
- Short reasoning blocks (< 50 chars) are ignored to avoid prompt echo artifacts

**Routing Logs**:
- All routing decisions are logged to `routing_log` table
- Logs include: `profile_name`, `actual_profile`, `provider`, `model`, `tenant_id`, `service_label`
- `profile_name` shows the actual profile used (e.g., `chat_realtime_fast`), not the base profile
- `actual_profile` matches `profile_name` for consistency

---

## Cost Optimization & Caching

Catalyst leverages automatic prompt caching from LLM providers to reduce costs by 50-90%. Follow these best practices to maximize cache hits.

### How Prompt Caching Works

LLM providers (OpenAI, Gemini) automatically cache **prompt prefixes**:

| Provider | Automatic Caching | Discount | Minimum Tokens |
|----------|-------------------|----------|----------------|
| OpenAI | ✅ Yes | 50-90% | 1,024 |
| Gemini | ✅ Yes | 75% | ~1,000 |
| HuggingFace | ❌ No | N/A | N/A |

**Key insight**: Cache hits only occur for **exact prefix matches**. Place static content at the beginning, dynamic content at the end.

### Optimal Prompt Structure

```
┌─────────────────────────────────────────────────────────────┐
│  STATIC PREFIX (Cached - 50-90% discount)                   │
│  ├── Platform instructions (Catalyst)                       │
│  ├── Tenant base prompt (from config)                       │
│  ├── Session instructions (from 'instructions' parameter)   │
│  ├── Tool definitions                                        │
│  ├── Examples / few-shot prompts                             │
│  └── Reference data / domain knowledge                       │
├─────────────────────────────────────────────────────────────┤
│  DYNAMIC SUFFIX (Not cached - full price)                   │
│  ├── Conversation history                                    │
│  ├── User-specific context (name, preferences)              │
│  ├── Timestamps / dates                                      │
│  └── New user message                                        │
└─────────────────────────────────────────────────────────────┘
```

### Best Practices

#### 1. Use Session Instructions (Recommended)

Send `instructions` once on first call - Catalyst persists them:

```json
// First call - set instructions
{
  "session_id": "session_abc",
  "instructions": "You are a legal assistant for pi.law. Focus on civil litigation. Cite case law when relevant.",
  "messages": [{"role": "user", "content": "Hello"}]
}

// Subsequent calls - no need to resend
{
  "session_id": "session_abc",
  "messages": [{"role": "user", "content": "What is a tort?"}]
}
```

**Benefits**:
- Instructions cached across all turns (50%+ savings)
- Smaller payloads per request
- Simpler client code

#### 2. Avoid Dynamic Content at Prompt Start

❌ **Bad** (breaks caching):
```json
{
  "messages": [
    {"role": "user", "content": "Today is January 11, 2026. User John asks: What's your return policy?"}
  ]
}
```

✅ **Good** (maximizes caching):
```json
{
  "instructions": "You are a customer service agent for Acme Corp. Here are our policies: [reference data]",
  "messages": [
    {"role": "user", "content": "What's your return policy?"}
  ],
  "config": {
    "user_context": {"name": "John", "date": "2026-01-11"}
  }
}
```

#### 3. Use Consistent Tool Definitions

Tools are part of the cached prefix. Keep tool definitions identical across requests:

```json
// Same tools = cache hit
{"tools": ["search_rag", "web_search"]}

// Different tools = cache miss
{"tools": ["search_rag", "code_interpreter"]}
```

#### 4. Leverage Conversation Summarization

Catalyst automatically summarizes long conversations to reduce context size. Sessions with `session_id` benefit from:
- Automatic summarization after N turns
- Summary replaces old messages (reduces tokens)
- Summary is static = better caching

### Monitoring Cache Efficiency

Check cache metrics in the Service Health dashboard (`/admin/service-health`):

```json
{
  "caches": {
    "provider_cache": {
      "openai_cached_tokens": 1250000,
      "gemini_cached_tokens": 450000
    }
  }
}
```

**Metrics to watch**:
- `openai_cached_tokens`: Total tokens served from OpenAI's cache
- `gemini_cached_tokens`: Total tokens served from Gemini's cache
- High numbers = good cache utilization

### Cost Savings Example

| Scenario | Input Tokens | Cached | Cost (gpt-5-mini) |
|----------|--------------|--------|-------------------|
| No caching | 10,000 | 0 | $0.015 |
| 50% cached | 10,000 | 5,000 | $0.011 |
| 80% cached | 10,000 | 8,000 | $0.009 |

**Per-session savings**: With proper structure, expect 50-80% input token cost reduction.

### Provider-Specific Notes

**OpenAI**:
- Extended caching available (24h retention) for gpt-5.1+ models
- Cache retained 5-10 min (in-memory) or up to 24h (extended)
- Response includes `usage.cached_tokens` for monitoring

**Gemini**:
- Implicit caching is automatic
- 75% discount on cached tokens
- Also supports explicit caching (manual cache creation)

**HuggingFace**:
- No built-in prompt caching
- Use Catalyst-side caching strategies (session instructions, summarization)

---

## See Also

- **[SESSION_LAUNCH.md](../SESSION_LAUNCH.md)** - AI agent onboarding guide
- **[QUICK_REFERENCE.md](../QUICK_REFERENCE.md)** - One-page cheat sheet
- **[WEBSOCKET_ARCHITECTURE.md](../architecture/WEBSOCKET_ARCHITECTURE.md)** - WebSocket architecture details
- **[Backend README](../../backend/README.md)** - Backend service architecture

---

**Last Updated**: 2026-01-13  
**Version**: 1.1  
**Status**: Active

### Changelog (v1.1)

- Added **Anthropic provider** support (Claude Opus 4.5, Sonnet 4, Haiku)
- Added **Direct Model Mode** for Playground testing (`direct_provider`, `direct_model`)
- Added **Billing Endpoints** section with credit balance, transactions, usage, and admin APIs
- Added **Model Discovery (Oasis)** endpoints for provider model management
- Updated LLM Routing section with multi-provider support
- Updated provider list to include all supported backends
