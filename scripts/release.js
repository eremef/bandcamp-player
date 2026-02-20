const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const newVersion = args.find(arg => !arg.startsWith('--'));
const ignoreErrors = args.includes('--ignore-errors');
const forceTag = args.includes('--force-tag');

if (!newVersion) {
    console.error('Usage: node scripts/release.js <newVersion> [--ignore-errors] [--force-tag]');
    process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const mobileDir = path.join(rootDir, 'mobile');

function log(message) {
    console.log(`\x1b[36m[Release]\x1b[0m ${message}`);
}

function run(command, cwd = rootDir, options = {}) {
    const { canFail = false } = options;
    log(`Running: ${command} in ${cwd}`);
    try {
        execSync(command, { cwd, stdio: 'inherit' });
    } catch (error) {
        if (canFail || ignoreErrors) {
            log(`Warn: Command failed but continuing (canFail=${canFail} ignoreErrors=${ignoreErrors}): ${command}`);
            return;
        }
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

// 1. Update Versions
log('Step 1: Updating version numbers...');
updateJson(path.join(rootDir, 'package.json'), (json) => { json.version = newVersion; });
updateJson(path.join(mobileDir, 'package.json'), (json) => { json.version = newVersion; });
updateJson(path.join(mobileDir, 'app.json'), (json) => { json.expo.version = newVersion; });

// 2. Ensure app is closed
log('Step 2: Ensuring app is closed (skipped in agent mode)...');
// run('taskkill /F /IM node.exe');
// run('taskkill /F /IM electron.exe');

// 3. Install Dependencies
log('Step 3: Installing dependencies...');
run('npm install');
run('npm install', mobileDir);

// 4. Remote Config and Assets
log('Step 4: Syncing Remote Config and Assets...');
run('node scripts/generate-config-hash.js');
run('node scripts/copy-assets.js');
run('node scripts/validate-config.js');

// 5. Run Tests
log('Step 5: Running tests...');
run('npm test');
run('npm test', mobileDir);
run('npm run typecheck');
run('npm run typecheck', mobileDir);
run('npm run lint');
run('npm run lint', mobileDir);

// 6. Git Operations
log('Step 6: Git operations (commit, tag, push)...');
run('git add .');
run(`git commit -m "chore: release v${newVersion}"`, rootDir, { canFail: true });
run('git push');

if (forceTag) {
    log(`Force tag enabled. Deleting existing tag v${newVersion}...`);
    run(`git tag -d v${newVersion}`, rootDir, { canFail: true });
    run(`git push origin --delete v${newVersion}`, rootDir, { canFail: true });
}

run(`git tag v${newVersion}`);
run(`git push origin v${newVersion}`);

log(`\x1b[32mSuccessfully released v${newVersion}!\x1b[0m`);
