# TaskQueue

Small Node.js utility that pulls open GitHub issues (labelled `task` by default) into an in-memory queue.

## Quick start
```bash
cd TaskQueue
cp sample.env .env   # add your API keys
npm install
npm start
```

### Environment variables

| Name             | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `GITHUB_TOKEN`   | Personal access token (classic) with `repo` scope.    |
| `GITHUB_OWNER`   | Repository owner or organisation.                     |
| `GITHUB_REPO`    | Repository name.                                      |
| `GITHUB_LABEL`   | (Optional) Issue label to filter on. If omitted, **all** open issues are returned. |
| `OPENAI_API_KEY` | OpenAI API key for AI features ([get here](https://platform.openai.com/api-keys)) |
| `OPENAI_MODEL`   | (Optional) Model ID for completions (default: gpt-4)  |

### Obtaining API Keys
1. **GitHub Token**:  
   - Go to **Settings → Developer settings → Personal access tokens → Tokens (classic)**  
   - Create token with `repo` scope

2. **OpenAI API Key**:  
   - Visit [OpenAI API Keys](https://platform.openai.com/api-keys)  
   - Create new secret key and paste into `.env`

The script prints matching open issues and the current queue size.


