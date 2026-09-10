const fs = require('fs');
const path = require('path');

const filesToProcess = [
  'src/app/irrigacao/execucao/page.tsx',
  'src/app/irrigacao/responsaveis/page.tsx',
  'src/app/admin/usuarios/page.tsx'
];

filesToProcess.forEach(file => {
  const filePath = path.resolve(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');

    content = content.replace(/bg-white dark:bg-\[\#0d1527\] h-full/g, `bg-white/95 dark:bg-[#0d1527]/95 backdrop-blur-2xl h-full`);
    content = content.replace(/bg-white dark:bg-\[\#0d1527\] border border-slate-200 dark:border-\[\#1e293b\] rounded-xl shadow-2xl/g,
      `bg-white/95 dark:bg-[#0d1527]/95 backdrop-blur-2xl border border-slate-200 dark:border-[#1e293b] rounded-xl shadow-2xl`);

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Glassmorphism applied to ${file}`);
  }
});
