<<<<<<< HEAD
import { spawn } from 'child_process';

class JobManager {
  constructor() {
    this.jobs = new Map();
    this.nextId = 1;
  }

  start(command, args = [], options = {}) {
    const id = String(this.nextId++);
    const child = spawn(command, args, options);
=======
import child_process from "child_process";

export default class JobManager {
  constructor() {
    this.jobs = new Map();
  }

  createJob(command, args = [], { cwd, file } = {}) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
>>>>>>> origin/codex/run-upscale-step-as-job,-add-jobs-list
    const job = {
      id,
      command,
      args,
<<<<<<< HEAD
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
=======
      cwd,
      file,
      status: "running",
      startTime: Date.now(),
      log: "",
      listeners: [],
      doneListeners: [],
    };

    const child = child_process.spawn(command, args, { cwd });
    job.child = child;

    child.stdout.on("data", (chunk) => {
      this._append(job, chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      this._append(job, chunk.toString());
    });

    child.on("error", (err) => {
      job.status = "error";
      this._append(job, `[error] ${err.toString()}`);
      this._notifyDone(job);
    });

    child.on("close", (code) => {
      job.status = "finished";
      this._append(job, `\n[process exited with code ${code}]`);
      this._notifyDone(job);
    });

    this.jobs.set(id, job);
    return job;
  }

  _append(job, chunk) {
    job.log += chunk;
    for (const l of job.listeners) l(chunk);
  }

  _notifyDone(job) {
    for (const l of job.doneListeners) l();
  }

  getJob(id) {
    return this.jobs.get(id);
  }

  listJobs() {
    return Array.from(this.jobs.values()).map((j) => ({
      id: j.id,
      file: j.file,
      status: j.status,
      startTime: j.startTime,
    }));
  }

  addListener(job, listener) {
    job.listeners.push(listener);
  }

  removeListener(job, listener) {
    job.listeners = job.listeners.filter((l) => l !== listener);
  }

  addDoneListener(job, listener) {
    job.doneListeners.push(listener);
  }

  removeDoneListener(job, listener) {
    job.doneListeners = job.doneListeners.filter((l) => l !== listener);
  }
}
>>>>>>> origin/codex/run-upscale-step-as-job,-add-jobs-list
