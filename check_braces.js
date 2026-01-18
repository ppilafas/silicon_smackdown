
const fs = require('fs');

const content = fs.readFileSync('/Users/pilaforce/projects/ai-talk-show_-the-neural-forum/App.tsx', 'utf8');
const lines = content.split('\n');

let openBraces = 0;
let openParens = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') openBraces++;
    if (char === '}') openBraces--;
    if (char === '(') openParens++;
    if (char === ')') openParens--;
  }
  if (openBraces < 0) console.log(`Negative braces at line ${i + 1}`);
  if (openParens < 0) console.log(`Negative parens at line ${i + 1}`);
}

console.log(`Final braces: ${openBraces}`);
console.log(`Final parens: ${openParens}`);
