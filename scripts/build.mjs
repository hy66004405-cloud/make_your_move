import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
rmSync('dist', {recursive:true, force:true});
mkdirSync('dist');
for (const name of readdirSync('.')) {
  if (name.endsWith('.js') || ['index.html', 'style.css', 'assets', 'vendor'].includes(name)) {
    cpSync(name, `dist/${name}`, {recursive:true});
  }
}
