const fs = require('fs');
const path = require('path');

// الملفات والمسارات المطلوب فحصها
const targetPaths = [
  'app/dashboard/page.tsx',
  'components/dashboard/secondary',
  'lib/education/experience.ts',
  'lib/education/context.ts',
  'lib/personal-assistant/secondary.ts',
  'lib/supabase'
];

// الأنماط (Patterns) اللي ندور عليها
const queryPatterns = [
  { regex: /\.from\s*\(\s*['"]([^'"]+)['"]\s*\)/, type: 'FROM_TABLE' },
  { regex: /\.rpc\s*\(\s*['"]([^'"]+)['"]\s*\)/, type: 'RPC_CALL' },
  { regex: /\.select\s*\(/, type: 'SELECT' },
  { regex: /\.insert\s*\(/, type: 'INSERT' },
  { regex: /\.update\s*\(/, type: 'UPDATE' },
  { regex: /\.delete\s*\(/, type: 'DELETE' },
  { regex: /\.upsert\s*\(/, type: 'UPSERT' },
  { regex: /\.eq\s*\(\s*['"]([^'"]+)['"]\s*,/, type: 'FILTER_EQ' }
];

const results = [];

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      queryPatterns.forEach(pattern => {
        const match = line.match(pattern.regex);
        if (match) {
          results.push({
            file: filePath,
            line: index + 1,
            type: pattern.type,
            value: match[1] ? match[1] : 'N/A',
            code: line.trim()
          });
        }
      });
    });
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err.message}`);
  }
}

function walkDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        scanFile(fullPath);
      }
    });
  } catch (err) {
    // مسار مش موجود أو مش مجلد، يتم تجاهله بهدوء
  }
}

// بدء الفحص
const cwd = process.cwd();
targetPaths.forEach(p => {
  const fullPath = path.resolve(p);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else {
      scanFile(fullPath);
    }
  } else {
    console.log(`[SKIP] Path not found: ${p}`);
  }
});

// طباعة النتائج
console.log("\n--- SUPABASE QUERY TRACE RESULTS ---\n");
if (results.length === 0) {
  console.log("No queries found.");
} else {
  results.forEach((r, i) => {
    console.log(`[${i + 1}] ${r.type}`);
    console.log(`    File: ${r.file} (Line ${r.line})`);
    console.log(`    Value: ${r.value}`);
    console.log(`    Code: ${r.code}`);
    console.log('-----------------------------------');
  });
}
console.log(`\nTotal queries/patterns found: ${results.length}\n`);
