import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as out } from 'node:process';

export function silentPrompt(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const stdin = input;
    if (!stdin.isTTY) {
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => (buf += chunk));
      stdin.once('end', () => resolve(buf.replace(/\r?\n$/, '')));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (ch === '\n' || ch === '\r') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (code === 3) {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          return reject(new Error('cancelled'));
        }
        if (code === 127 || code === 8) {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      }
    };
    stdin.on('data', onData);
  });
}

export async function visiblePrompt(question: string): Promise<string> {
  const rl = createInterface({ input, output: out });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
