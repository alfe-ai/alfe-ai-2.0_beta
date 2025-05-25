import fs from 'fs';
import path from 'path';

export default class PrintifyJobQueue {
  constructor(jobManager, options = {}) {
    this.jobManager = jobManager;
    this.jobs = [];
    this.current = null;
    this.uploadsDir = options.uploadsDir || '';
    this.upscaleScript = options.upscaleScript || '';
    this.printifyScript = options.printifyScript || '';
    this.persistencePath = options.persistencePath || null;

    this._loadJobs();
    this._processNext();
  }

  _loadJobs() {
    if (!this.persistencePath) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf8'));
      if (Array.isArray(data.jobs)) {
        this.jobs = data.jobs.map(j => {
          if (j.status === 'running') j.status = 'queued';
          return j;
        });
      }
    } catch (err) {
      // ignore if file doesn't exist or can't be read
    }
  }

  _saveJobs() {
    if (!this.persistencePath) return;
    try {
      fs.writeFileSync(
        this.persistencePath,
        JSON.stringify({ jobs: this.jobs }, null, 2)
      );
    } catch (err) {
      // ignore write errors
    }
  }

  enqueue(file, type, dbId = null) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const job = {
      id,
      file,
      type,
      status: 'queued',
      jobId: null,
      resultPath: null,
      dbId
    };
    this.jobs.push(job);
    this._saveJobs();
    this._processNext();
    return job;
  }

  list() {
    return this.jobs.map(j => ({
      id: j.id,
      file: j.file,
      type: j.type,
      status: j.status,
      jobId: j.jobId,
      resultPath: j.resultPath || null,
      dbId: j.dbId || null
    }));
  }

  _processNext() {
    if (this.current) return;
    const job = this.jobs.find(j => j.status === 'queued');
    if (!job) return;
    this.current = job;
    job.status = 'running';
    this._saveJobs();

    const filePath = path.join(this.uploadsDir, job.file);
    let script = '';
    if (job.type === 'upscale') {
      script = this.upscaleScript;
    } else if (job.type === 'printify') {
      script = this.printifyScript;
    } else {
      job.status = 'error';
      this.current = null;
      this._saveJobs();
      this._processNext();
      return;
    }

    if (!fs.existsSync(filePath) || !fs.existsSync(script)) {
      job.status = 'error';
      this.current = null;
      this._saveJobs();
      this._processNext();
      return;
    }

    const cwd = path.dirname(script);
    const jmJob = this.jobManager.createJob(script, [filePath], { cwd, file: job.file });
    job.jobId = jmJob.id;
    this.jobManager.addDoneListener(jmJob, () => {
      job.status = jmJob.status;
      job.resultPath = jmJob.resultPath;
      this.current = null;
      this._saveJobs();
      this._processNext();
    });
  }
}
