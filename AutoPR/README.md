# AutoPR

This simple Node.js project watches a git repository and prints any new remote branches that appear. It performs a `git fetch` periodically and compares the list of remote branches.

## Usage

1. Install dependencies (none are required, but this will generate a lock file):
   ```bash
   npm install
   ```
2. Run the watcher, passing the path to the repository. If no path is given, the current directory is used.
   ```bash
   node watchBranches.js /path/to/repo
   ```

The script checks for new branches every 10 seconds and logs them to the console.
