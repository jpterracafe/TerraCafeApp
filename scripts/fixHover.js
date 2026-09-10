const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf-8');

      let newContent = content.replace(/dark:hover:bg-slate-100 dark:bg-\[\#111a30\]/g, 'dark:hover:bg-[#111a30]');

      if (newContent !== content) {
        fs.writeFileSync(fullPath, newContent, 'utf-8');
        console.log(`Fixed hover bug in ${fullPath}`);
      }
    }
  }
}

processDir(path.resolve(__dirname, '..', 'src/app'));
