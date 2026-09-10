const fs = require('fs');
const path = require('path');

const filesToProcess = [
  'src/app/irrigacao/execucao/page.tsx',
  'src/app/irrigacao/diario-campo/page.tsx',
  'src/app/irrigacao/responsaveis/page.tsx',
  'src/app/admin/usuarios/page.tsx',
  'src/app/login/page.tsx',
  'src/app/convite/page.tsx'
];

const replacements = [
  { regex: /bg-\[\#070c18\]/g, replacement: 'bg-slate-50 dark:bg-[#070c18]' },
  { regex: /bg-\[\#0d1527\]/g, replacement: 'bg-white dark:bg-[#0d1527]' },
  { regex: /bg-\[\#0b1329\]/g, replacement: 'bg-slate-50 dark:bg-[#0b1329]' },
  { regex: /hover:bg-\[\#111a30\]/g, replacement: 'hover:bg-slate-100 dark:hover:bg-[#111a30]' },
  { regex: /bg-\[\#111a30\]/g, replacement: 'bg-slate-100 dark:bg-[#111a30]' },
  { regex: /hover:bg-\[\#1e293b\]/g, replacement: 'hover:bg-slate-200 dark:hover:bg-[#1e293b]' },
  { regex: /border-\[\#1e293b\]/g, replacement: 'border-slate-200 dark:border-[#1e293b]' },
  { regex: /divide-\[\#1e293b\]/g, replacement: 'divide-slate-200 dark:divide-[#1e293b]' },
  { regex: /text-slate-300/g, replacement: 'text-slate-600 dark:text-slate-300' },
  { regex: /text-slate-400/g, replacement: 'text-slate-500 dark:text-slate-400' },
  { regex: /text-white/g, replacement: 'text-slate-900 dark:text-white' },
  { regex: /bg-slate-800/g, replacement: 'bg-slate-200 dark:bg-slate-800' },
  { regex: /border-slate-700/g, replacement: 'border-slate-300 dark:border-slate-700' },
];

filesToProcess.forEach(file => {
  const filePath = path.resolve(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');

    if (!content.includes('ThemeToggle')) {
      content = content.replace(/(import.*lucide-react.*[\r\n]+)/, `$1import ThemeToggle from '@/components/ThemeToggle';\n`);
    }

    replacements.forEach(rule => {
      content = content.replace(rule.regex, rule.replacement);
    });

    content = content.replace(/<div className="flex flex-wrap items-center gap-3">/, `<div className="flex flex-wrap items-center gap-3">\n          <ThemeToggle />`);
    content = content.replace(/<div className="flex items-center gap-3 bg-white dark:bg-\[\#0d1527\]/, `<div className="flex items-center gap-3">\n          <ThemeToggle />\n          <div className="flex items-center gap-3 bg-white dark:bg-[#0d1527]`);
    content = content.replace(/<div className="flex items-center gap-2">/, `<div className="flex items-center gap-3">\n          <ThemeToggle />\n          <div className="flex items-center gap-2">`);
    if (file.includes('login') || file.includes('convite')) {
      content = content.replace(/<div className="absolute top-0 left-0/, `<div className="absolute top-4 right-4 z-50"><ThemeToggle /></div>\n      <div className="absolute top-0 left-0`);
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${file}`);
  }
});
