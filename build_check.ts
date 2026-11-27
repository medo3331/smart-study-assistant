import { execSync } from "child_process";

console.log("=== TypeScript Check ===");
try {
  const tscOutput = execSync('npx tsc --noEmit 2>&1', { encoding: 'utf-8', cwd: '/c/Desktop/smart-study-assistant' });
  const errorLines = tscOutput.split('\n').filter((l: string) => l.includes('error TS'));
  if (errorLines.length > 0) {
    console.log(`Total TS errors: ${errorLines.length}`);
    console.log("First 15 errors in new/modified paths:");
    errorLines.slice(0, 15).forEach((l: string) => console.log(l.trim()));
  } else {
    console.log("No TypeScript errors!");
  }
} catch (error: any) {
  const output = error.stdout || error.stderr || "No output";
  const errorLines = output.split('\n').filter((l: string) => l.includes('error TS'));
  console.log(`Total TS errors: ${errorLines.length}`);
  errorLines.slice(0, 15).forEach((l: string) => console.log(l.trim()));
}

console.log("\n=== Build Results ===");
try {
  const buildOutput = execSync('npm run build 2>&1', { encoding: 'utf-8', cwd: '/c/Desktop/smart-study-assistant', timeout: 600000 });
  const buildLines = buildOutput.split('\n');
  const errorLines = buildLines.filter((l: string) => l.includes('Error') || l.includes('●'));
  if (errorLines.length > 0) {
    console.log(`Build errors: ${errorLines.length}`);
    errorLines.slice(0, 20).forEach((l: string) => console.log(l.trim()));
  } else {
    console.log("Build succeeded!");
  }
} catch (error: any) {
  const output = error.stdout || error.stderr || "No output";
  const errorLines = output.split('\n').filter((l: string) => l.includes('error') || l.includes('Error') || l.includes('●'));
  console.log(`Build errors: ${errorLines.length}`);
  errorLines.slice(0, 20).forEach((l: string) => console.log(l.trim()));
}
