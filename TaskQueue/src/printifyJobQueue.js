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
  }

  enqueue(file, type) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const job = {
      id,
      file,
      type,
      status: 'queued',
      jobId: null,
      resultPath: null
    };
    this.jobs.push(job);
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
      resultPath: j.resultPath || null
    }));
  }

  /**
   * Remove a job from the queue. If the job is currently running,
   * the underlying JobManager process will be stopped as well.
   * @param {string} id Job id
   * @returns {boolean} True if a job was removed, false otherwise
   */
  remove(id) {
    const idx = this.jobs.findIndex(j => j.id === id);
    if (idx === -1) return false;
    const job = this.jobs[idx];
    // Stop the running process if needed
    if (job.status === 'running' && job.jobId) {
      this.jobManager.stopJob(job.jobId);
    }
    // If removing the current job, clear and process next
    if (this.current && this.current.id === id) {
      this.current = null;
    }
    this.jobs.splice(idx, 1);
    this._processNext();
    return true;
  }

  _processNext() {
    if (this.current) return;
    const job = this.jobs.find(j => j.status === 'queued');
    if (!job) return;
    this.current = job;
    job.status = 'running';

    const filePath = path.join(this.uploadsDir, job.file);
    let script = '';
    if (job.type === 'upscale') {
      script = this.upscaleScript;
    } else if (job.type === 'printify') {
      script = this.printifyScript;
    } else {
      job.status = 'error';
      this.current = null;
      this._processNext();
      return;
    }

    if (!fs.existsSync(filePath) || !fs.existsSync(script)) {
      job.status = 'error';
      this.current = null;
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
      this._processNext();
    });
  }
}
