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
| `GITHUB_LABEL` | (Optional) Issue label to filter on, default `task`.  |

The script prints out all matching open issues and the current queue size.
