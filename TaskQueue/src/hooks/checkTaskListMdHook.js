import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mdFilePath = path.join(__dirname, '../markdown_global.txt');

export function checkTaskListMdHook() {
  try {
    if (fs.existsSync(mdFilePath)) {
      return fs.readFileSync(mdFilePath, 'utf-8');
    }
    return '';
  } catch (err) {
    console.error('[Hook Error] checkTaskListMdHook =>', err);
    return '';
  }
}
