const fs = require('fs');
const path = require('path');

const filesToProcess = [
  'src/app/irrigacao/execucao/page.tsx',
  'src/app/irrigacao/diario-campo/page.tsx',
  'src/app/irrigacao/responsaveis/page.tsx',
  'src/app/admin/usuarios/page.tsx'
];

filesToProcess.forEach(file => {
  const filePath = path.resolve(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');

    content = content.replace(/className="([^"]*rounded-xl[^"]*shadow-(?:lg|xl)[^"]*)"/g, (match, classes) => {
      if (!classes.includes('hover:-translate-y-1')) {
        return `className="${classes} transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-900/10 dark:hover:shadow-blue-500/10"`;
      }
      return match;
    });

    content = content.replace(/hover:bg-slate-100 dark:hover:bg-\[\#111a30\] transition-colors group/g,
      `hover:bg-slate-100 dark:hover:bg-[#111a30] transition-all duration-200 group border-l-2 border-transparent hover:border-blue-500`);

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Enhanced ${file}`);
  }
});
