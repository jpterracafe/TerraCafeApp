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

    if (!content.includes('BackButton')) {
      content = content.replace(/import LogoutButton from '@\/components\/LogoutButton';/, `import LogoutButton from '@/components/LogoutButton';\nimport BackButton from '@/components/BackButton';`);
    }

    content = content.replace(/<nav className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400 mb-2">\n            <span>/g, `<nav className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400 mb-2">\n            <BackButton />\n            <span>`);

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Added BackButton to ${file}`);
  }
});
