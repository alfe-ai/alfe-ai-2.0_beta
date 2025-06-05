const { execSync } = require('child_process');
const path = require('path');

const repoPath = process.argv[2] || process.env.REPO_PATH || '.';
const checkInterval = 10000; // 10 seconds

let knownBranches = new Set();

function fetchBranches() {
  try {
    execSync('git fetch', { cwd: repoPath, stdio: 'ignore' });
    const result = execSync('git branch -r', { cwd: repoPath });
    const branches = result.toString().split('\n').map(b => b.trim()).filter(b => b);
    const newBranches = branches.filter(b => !knownBranches.has(b));
    if (newBranches.length > 0) {
      console.log('New branches found:');
      newBranches.forEach(b => {
        console.log('  ' + b);
        knownBranches.add(b);
      });
    }
  } catch (err) {
    console.error('Error fetching branches:', err.message);
  }
}

function init() {
  try {
    const result = execSync('git branch -r', { cwd: repoPath });
    result.toString().split('\n').map(b => b.trim()).filter(b => b).forEach(b => knownBranches.add(b));
  } catch (err) {
    console.error('Failed to read initial branches:', err.message);
    process.exit(1);
  }
  console.log(`Watching repository ${path.resolve(repoPath)} for new remote branches...`);
  setInterval(fetchBranches, checkInterval);
}

init();
