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
    this.db = options.db || null;
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

  remove(id) {
    const idx = this.jobs.findIndex(j => j.id === id);
    if (idx === -1) return false;
    const job = this.jobs[idx];
    if (job.status === 'running' && job.jobId) {
      this.jobManager.stopJob(job.jobId);
    }
    this.jobs.splice(idx, 1);
    if (this.current && this.current.id === id) {
      this.current = null;
    }
    this._saveJobs();
    this._processNext();
    return true;
  }

  _processNext() {
    if (this.current) return;
    const job = this.jobs.find(j => j.status === 'queued');
    if (!job) return;
    this.current = job;
    job.status = 'running';
    this._saveJobs();

    let filePath = path.join(this.uploadsDir, job.file);
    let script = '';
    if (job.type === 'upscale') {
      script = this.upscaleScript;
    } else if (job.type === 'printify') {
      script = this.printifyScript;
      // Prefer 4096 background-removed variant if available
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const candidates = [
        // DB-based naming
        ...(job.dbId ? [path.join(this.uploadsDir, `${job.dbId}_nobg${ext}`)] : []),
        // Common naming patterns
        path.join(this.uploadsDir, `${base}_4096_nobg${ext}`),
        path.join(this.uploadsDir, `${base}-4096-nobg${ext}`),
        path.join(this.uploadsDir, `${base}_upscaled_nobg${ext}`),
        path.join(this.uploadsDir, `${base}-upscaled-nobg${ext}`),
        // Alternate "no_bg"/"no-bg" variants
        path.join(this.uploadsDir, `${base}_4096_no_bg${ext}`),
        path.join(this.uploadsDir, `${base}-4096-no_bg${ext}`),
        path.join(this.uploadsDir, `${base}_4096-no-bg${ext}`),
        path.join(this.uploadsDir, `${base}-4096-no-bg${ext}`),
        path.join(this.uploadsDir, `${base}_upscaled_no_bg${ext}`),
        path.join(this.uploadsDir, `${base}-upscaled-no_bg${ext}`),
        path.join(this.uploadsDir, `${base}_upscaled-no-bg${ext}`),
        path.join(this.uploadsDir, `${base}-upscaled-no-bg${ext}`)
      ];
      let found = null;
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          found = p;
          break;
        }
      }
      if (!found && this.db) {
        const fromDb = this.db.getUpscaledImage(`/uploads/${job.file}-nobg`);
        if (fromDb && fs.existsSync(fromDb)) {
          found = fromDb;
        }
      }
      if (found) {
        filePath = found;
      }
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
      if (job.type === 'upscale') {
        const m = jmJob.log.match(/Final output saved to:\s*(.+)/i);
        if (m) {
          job.resultPath = m[1].trim();
          if (this.db) {
            const originalUrl = `/uploads/${job.file}`;
            this.db.setUpscaledImage(originalUrl, job.resultPath);
            this.db.setImageStatus(originalUrl, 'Upscaled');
          }
        }
      }
      this.current = null;
      this._saveJobs();
      this._processNext();
    });
  }
}
