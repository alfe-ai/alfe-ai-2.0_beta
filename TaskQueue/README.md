# TaskQueue

Small Node.js utility that pulls open GitHub issues (labelled `task` by default) into an in-memory queue.

## Quick start
```bash
cd TaskQueue
cp .env.example .env   # add your GitHub details
npm install
npm start
```

### Environment variables

| Name           | Purpose                                               |
| -------------- | ----------------------------------------------------- |
| `GITHUB_TOKEN` | Personal access token (classic) with `repo` scope.    |
| `GITHUB_OWNER` | Repository owner or organisation.                     |
| `GITHUB_REPO`  | Repository name.                                      |
| `GITHUB_LABEL` | (Optional) Issue label to filter on. If omitted, **all** open issues are returned. |

The script prints matching open issues and the current queue size.

### Obtaining a GitHub token
1. Sign in to GitHub and open **Settings → Developer settings → Personal access tokens → Tokens (classic)**.  
2. Click **Generate new token**, give it a name/expiry and tick the **repo** scope (read-only is enough).  
3. Create the token, copy the value, and paste it into your `.env` file as `GITHUB_TOKEN=<your-token>`.

