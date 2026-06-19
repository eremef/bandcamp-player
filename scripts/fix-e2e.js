const fs = require('fs');
const path = require('path');
const files = fs.readdirSync('e2e').filter(f => f.endsWith('.ts'));
files.forEach(f => {
  const p = path.join('e2e', f);
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(/name: 'Collection' \}/g, "name: 'Collection', exact: true }");
  c = c.replace(/name: 'Artists' \}/g, "name: 'Artists', exact: true }");
  fs.writeFileSync(p, c);
});
console.log('Fixed selectors');
