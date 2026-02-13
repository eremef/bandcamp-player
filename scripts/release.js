const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Usage: node scripts/release.js <newVersion>');
    process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const mobileDir = path.join(rootDir, 'mobile');

function log(message) {
    console.log(`\x1b[36m[Release]\x1b[0m ${message}`);
}

function run(command, cwd = rootDir) {
    log(`Running: ${command} in ${cwd}`);
    try {
        execSync(command, { cwd, stdio: 'inherit' });
    } catch (error) {
        console.error(`\x1b[31mError executing command:\x1b[0m ${command}`);
        process.exit(1);
    }
}

function updateJson(filePath, updateFn) {
    log(`Updating ${filePath}...`);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    updateFn(content);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
}

// 1. Install Dependencies
log('Step 1: Installing dependencies...');
run('npm install');
run('npm install', mobileDir);

// 2. Update Versions
log('Step 2: Updating version numbers...');
updateJson(path.join(rootDir, 'package.json'), (json) => { json.version = newVersion; });
updateJson(path.join(mobileDir, 'package.json'), (json) => { json.version = newVersion; });
updateJson(path.join(mobileDir, 'app.json'), (json) => { json.expo.version = newVersion; });

// 3. Update Docs
log('Step 3: Documentation update (placeholder - manual check recommended)...');
// Note: Automatic doc update is complex, but we can remind the user or run a simple sync if needed.

// 4. Run Tests
log('Step 4: Running tests...');
run('npm test');
run('npm test', mobileDir);

// 5. Git Operations
log('Step 5: Git operations (commit, tag, push)...');
run('git add .');
run(`git commit -m "chore: release ${newVersion}"`);
run('git push');
run(`git tag ${newVersion}`);
run(`git push origin ${newVersion}`);

log(`\x1b[32mSuccessfully released ${newVersion}!\x1b[0m`);
