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

    if (!content.includes('LogoutButton')) {
      content = content.replace(/import ThemeToggle from '@\/components\/ThemeToggle';/, `import ThemeToggle from '@/components/ThemeToggle';\nimport LogoutButton from '@/components/LogoutButton';`);
    }

    content = content.replace(/<ThemeToggle \/>/g, `<ThemeToggle />\n          <LogoutButton />`);

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Added LogoutButton to ${file}`);
  }
});
