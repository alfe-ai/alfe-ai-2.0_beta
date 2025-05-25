import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import JobManager from './jobManager.js';

const app = express();
app.use(bodyParser.json());

const jobManager = new JobManager();
const uploadsDir = path.resolve('./uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const UPSCALE_SCRIPT_PATH = process.env.UPSCALE_SCRIPT_PATH || '/path/to/upscale.sh';
const PRINTIFY_SCRIPT_PATH = process.env.PRINTIFY_SCRIPT_PATH || '/path/to/printify.sh';

function runScript(scriptPath, file){
  const scriptCwd = path.dirname(scriptPath);
  const filePath = path.join(uploadsDir, file);
  if(!fs.existsSync(filePath)) throw new Error('File not found');
  if(!fs.existsSync(scriptPath)) throw new Error('Script not found');
  const job = jobManager.createJob(scriptPath, [filePath], { cwd: scriptCwd, file });
  return job.id;
}

app.post('/api/upscale', (req,res)=>{
  const { file } = req.body || {};
  if(!file) return res.status(400).json({ error: 'Missing file' });
  try {
    const jobId = runScript(UPSCALE_SCRIPT_PATH, file);
    res.json({ jobId });
  } catch(err){
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/printify', (req,res)=>{
  const { file } = req.body || {};
  if(!file) return res.status(400).json({ error: 'Missing file' });
  try {
    const jobId = runScript(PRINTIFY_SCRIPT_PATH, file);
    res.json({ jobId });
  } catch(err){
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/upscale/result', (req,res)=>{
  const file = req.query.file;
  if(!file) return res.status(400).json({ error: 'Missing file' });
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const candidates = [
    path.join(uploadsDir, `${base}_4096${ext}`),
    path.join(uploadsDir, `${base}-4096${ext}`),
    path.join(uploadsDir, `${base}_upscaled${ext}`),
    path.join(uploadsDir, `${base}-upscaled${ext}`)
  ];
  for(const p of candidates){
    if(fs.existsSync(p)) return res.json({ url: p });
  }
  const jobs = jobManager.listJobs();
  for(const j of jobs){
    if(j.file === file && j.resultPath && fs.existsSync(j.resultPath)){
      return res.json({ url: j.resultPath });
    }
  }
  res.json({ url: null });
});

app.get('/api/jobs', (req,res)=>{
  res.json(jobManager.listJobs());
});

app.get('/api/jobs/:id/log', (req,res)=>{
  const job = jobManager.getJob(req.params.id);
  if(!job) return res.status(404).json({ error: 'Job not found' });
  res.type('text/plain').send(job.log);
});

app.get('/api/jobs/:id/stream', (req,res)=>{
  const job = jobManager.getJob(req.params.id);
  if(!job) return res.status(404).end();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();
  res.write(`event: log\ndata:${JSON.stringify(job.log)}\n\n`);
  const logListener = (chunk)=>{ res.write(`event: log\ndata:${JSON.stringify(chunk)}\n\n`); };
  const doneListener = ()=>{ res.write(`event: done\ndata:done\n\n`); };
  jobManager.addListener(job, logListener);
  jobManager.addDoneListener(job, doneListener);
  req.on('close', ()=>{
    jobManager.removeListener(job, logListener);
    jobManager.removeDoneListener(job, doneListener);
  });
});

app.post('/api/jobs/:id/stop', (req,res)=>{
  const ok = jobManager.stopJob(req.params.id);
  if(!ok) return res.status(404).json({ error: 'Job not found' });
  res.json({ stopped: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, ()=>{
  console.log(`JobRunner listening on ${PORT}`);
});
