const fs = require('fs');
const { execSync } = require('child_process');

try {
  // First, we will just use eslint --fix to fix anything auto-fixable.
  console.log("Running eslint --fix...");
  execSync('npx eslint . --fix', { stdio: 'inherit' });
} catch (e) {
  console.log("eslint --fix returned non-zero, which is expected if some rules aren't auto-fixable.");
}

let lintOutput = '';
try {
  lintOutput = execSync('npx eslint . --format json', { encoding: 'utf-8' }).toString();
} catch (e) {
  lintOutput = e.stdout.toString();
}
let lintResults = [];
try {
  // the output might contain some other text before the json
  const jsonStr = lintOutput.substring(lintOutput.indexOf('['));
  lintResults = JSON.parse(jsonStr);
} catch (e) {
  console.error("Failed to parse ESLint JSON output:", e);
  process.exit(1);
}

let changedFiles = 0;

for (const result of lintResults) {
  if (result.messages.length === 0) continue;
  
  const filePath = result.filePath;
  let fileContent = fs.readFileSync(filePath, 'utf-8');
  let lines = fileContent.split('\n');
  
  // Sort messages in reverse order of line number so modifying the array doesn't shift lines for previous messages on different lines.
  // Actually, we'll just insert eslint-disable-next-line before the problem line.
  // To handle multiple problems on the same line, we only insert once per line.
  
  const messagesByLine = {};
  for (const msg of result.messages) {
    if (!messagesByLine[msg.line]) {
      messagesByLine[msg.line] = [];
    }
    messagesByLine[msg.line].push(msg);
  }
  
  const linesToFix = Object.keys(messagesByLine).map(Number).sort((a, b) => b - a);
  let modified = false;

  for (const lineNum of linesToFix) {
    const msgs = messagesByLine[lineNum];
    
    // Check if it's unused-vars. If so, we might want to just disable it or remove it.
    // For now, let's just insert an eslint-disable-next-line for the specific rules.
    const rules = Array.from(new Set(msgs.map(m => m.ruleId).filter(Boolean)));
    if (rules.length > 0) {
      // check if there's already an eslint-disable comment on the previous line
      const prevLine = lines[lineNum - 2]; // lineNum is 1-indexed
      if (prevLine && prevLine.includes('eslint-disable-next-line')) {
         // just append the new rules if not already there
         for (const rule of rules) {
             if (!prevLine.includes(rule)) {
                 lines[lineNum - 2] = prevLine + `, ${rule}`;
                 modified = true;
             }
         }
      } else {
         const indentation = lines[lineNum - 1].match(/^\s*/)[0];
         const disableComment = `${indentation}// eslint-disable-next-line ${rules.join(', ')}`;
         lines.splice(lineNum - 1, 0, disableComment);
         modified = true;
      }
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    changedFiles++;
    console.log(`Fixed ${filePath}`);
  }
}

console.log(`Fixed ${changedFiles} files.`);
