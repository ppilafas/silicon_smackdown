
import fs from 'fs';

const content = fs.readFileSync('/Users/pilaforce/projects/ai-talk-show_-the-neural-forum/App.tsx', 'utf8');
const lines = content.split('\n');

const stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') stack.push({ char, line: i + 1 });
    if (char === '(') stack.push({ char, line: i + 1 });
    if (char === '[') stack.push({ char, line: i + 1 });
    
    if (char === '}') {
      const last = stack.pop();
      if (!last || last.char !== '{') {
        console.log(`Error: Unexpected } at line ${i + 1}. Last open: ${JSON.stringify(last)}`);
      }
    }
    if (char === ')') {
      const last = stack.pop();
      if (!last || last.char !== '(') {
        console.log(`Error: Unexpected ) at line ${i + 1}. Last open: ${JSON.stringify(last)}`);
      }
    }
    if (char === ']') {
      const last = stack.pop();
      if (!last || last.char !== '[') {
        console.log(`Error: Unexpected ] at line ${i + 1}. Last open: ${JSON.stringify(last)}`);
      }
    }
  }
}

if (stack.length > 0) {
  console.log('Unclosed items:');
  stack.forEach(item => console.log(`- ${item.char} at line ${item.line}`));
} else {
  console.log('All balanced!');
}

