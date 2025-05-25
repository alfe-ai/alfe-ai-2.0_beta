import { spawn } from 'child_process';

class JobManager {
  constructor() {
    this.jobs = new Map();
    this.nextId = 1;
  }

  start(command, args = [], options = {}) {
    const id = String(this.nextId++);
    const child = spawn(command, args, options);
    const job = {
      id,
      command,
      args,
      status: 'running',
      startTime: Date.now(),
      exitCode: null,
      output: [],
      clients: new Set(),
      child
    };
    this.jobs.set(id, job);

    const onChunk = chunk => {
      const text = chunk.toString();
      job.output.push(text);
      for (const res of job.clients) {
        res.write(text);
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('close', code => {
      job.status = 'finished';
      job.exitCode = code;
      for (const res of job.clients) {
        res.end();
      }
      job.clients.clear();
    });
    child.on('error', err => {
      job.status = 'error';
      job.output.push(String(err));
      for (const res of job.clients) {
        res.write(String(err));
        res.end();
      }
      job.clients.clear();
    });

    return job;
  }

  list() {
    return Array.from(this.jobs.values()).map(j => ({
      id: j.id,
      command: j.command,
      status: j.status,
      startTime: j.startTime,
      exitCode: j.exitCode
    }));
  }

  get(id) {
    return this.jobs.get(id);
  }

  stream(id, res) {
    const job = this.jobs.get(id);
    if (!job) return false;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.write(job.output.join(''));
    job.clients.add(res);
    res.on('close', () => {
      job.clients.delete(res);
    });
    if (job.status === 'finished' || job.status === 'error') {
      res.end();
      job.clients.delete(res);
    }
    return true;
  }
}

const jobManager = new JobManager();
export default jobManager;
