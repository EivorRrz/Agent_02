# Q&A Agent - Pure Agentic LangGraph Implementation

## ✅ Fully Agentic Q&A System

The Q&A agent is now a **pure agentic system** using LangGraph with:
- ✅ **Automatic Retry Logic** with exponential backoff
- ✅ **Rate Limit Handling** (429 errors) with 60s delays
- ✅ **Decision-Making Nodes** for error handling
- ✅ **Conversational Memory** across questions
- ✅ **State Management** for retries and errors

---

## 🏗️ LangGraph Workflow

```
┌─────────────┐
│ Initialize  │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Generate Answer │
└──────┬──────────┘
       │
       ├─── Success ────► Update Memory ────► END
       │
       ├─── Error ────► Decision Node
       │                    │
       │                    ├─── Retryable + Retries Left ────► Wait ────► Retry Generate Answer
       │                    │
       │                    └─── Max Retries or Non-Retryable ────► Handle Error ────► END
       │
```

---

## 🎯 Agentic Features

### 1. **Decision-Making Node**
The agent decides whether to:
- **Continue** → Update memory and return answer
- **Retry** → Wait and retry (for rate limits)
- **Fail** → Handle error gracefully

### 2. **Automatic Retry Logic**
- Detects 429 rate limit errors
- Waits 60 seconds (or Retry-After header value)
- Retries up to 3 times automatically
- Shows progress to user during wait

### 3. **State Management**
Tracks:
- `retryCount` - Number of retry attempts
- `error` - Error details and type
- `shouldRetry` - Whether to retry
- `lastErrorTime` - When error occurred
- `conversationHistory` - Full conversation memory

### 4. **Memory Management**
- Maintains conversation history across questions
- Uses last 6 messages for context
- Updates memory only on successful answers
- Preserves context for follow-up questions

---

## 🔄 Retry Strategy

### Rate Limit Errors (429)
- **Delay**: 60 seconds (or Retry-After header)
- **Max Retries**: 3 attempts
- **User Feedback**: Shows wait progress

### Other Retryable Errors
- **Delay**: Exponential backoff (1s, 2s, 4s, max 30s)
- **Max Retries**: 3 attempts

### Non-Retryable Errors
- **Action**: Return user-friendly error message
- **No Retry**: Fails immediately

---

## 📊 State Schema

```javascript
{
    question: string,              // Current question
    context: object,                // Lineage, impact, insights, metadata
    conversationHistory: array,    // Previous Q&A pairs
    answer: string,                // Generated answer
    error: object | null,          // Error details if any
    retryCount: number,            // Current retry attempt
    shouldRetry: boolean,          // Whether to retry
    currentStep: string,           // Current workflow step
    lastErrorTime: number | null   // Timestamp of last error
}
```

---

## 🚀 Usage

```bash
cd Phase-2
node cli-qa.js 1771794549649
```

### Example Questions:
- "Tell me everything about sec_master table"
- "What are all the relationships?"
- "Show me the dependency graph"
- "What are the risks?"
- "Compare tables in Security domain"
- "Tell me everything"

---

## 🎯 Benefits

### Before (Basic):
- ❌ No retry logic
- ❌ Fails on rate limits
- ❌ No error handling
- ❌ Basic memory

### After (Pure Agentic):
- ✅ Automatic retries with backoff
- ✅ Handles rate limits gracefully
- ✅ Decision-making nodes
- ✅ Comprehensive error handling
- ✅ Enhanced memory management
- ✅ User-friendly error messages
- ✅ Progress feedback

---

## 🔧 Technical Details

### Error Detection
```javascript
function isRetryableError(error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || 
           msg.includes('rate limit') || 
           msg.includes('exceeded');
}
```

### Retry Delay Calculation
```javascript
function getRetryDelay(error, retryCount) {
    if (isRetryableError(error)) {
        return 60000; // 60s for rate limits
    }
    return Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff
}
```

### Decision Logic
```javascript
function shouldRetryDecision(state) {
    if (!error) return "updateMemory";
    if (isRetryableError(error) && retryCount < 3) return "wait";
    return "handleError";
}
```

---

## ✅ Result

**Pure Agentic Q&A System** with:
- ✅ LangGraph workflow
- ✅ Automatic retry logic
- ✅ Rate limit handling
- ✅ Decision-making
- ✅ Memory management
- ✅ Error recovery
- ✅ User feedback

**The agent remembers, retries, and handles errors autonomously!**
