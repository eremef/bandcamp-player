const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // Added crypto for hash generation

const args = process.argv.slice(2);
const newVersion = args.find(arg => !arg.startsWith('--'));
const ignoreErrors = args.includes('--ignore-errors');
const forceTag = args.includes('--force-tag');
const fastTrack = args.includes('--fast-track');

if (!newVersion) {
    console.error('Usage: node scripts/release.js <newVersion> [--ignore-errors] [--force-tag] [--fast-track]');
    process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const mobileDir = path.join(rootDir, 'mobile');

const licenseSrc = path.join(__dirname, '../LICENSE.txt');
const licenseDest = path.join(__dirname, '../mobile/assets/license.txt');

const configSrc = path.join(__dirname, '../remote-config.json');
const configDest = path.join(__dirname, '../mobile/assets/remote-config.json');
const hashSrc = path.join(__dirname, '../remote-config.json.hash');
const hashDest = path.join(__dirname, '../mobile/assets/remote-config.json.hash');

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

// Helper function to copy and normalize text files
function copyAndNormalizeTextFile(srcPath, destPath) {
    if (fs.existsSync(srcPath)) {
        log(`Copying and normalizing ${srcPath} to ${destPath}`);
        const content = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n'); // Normalize line endings to LF
        fs.writeFileSync(destPath, content, 'utf8');
    } else {
        log(`Warn: Source file not found: ${srcPath}`);
    }
}

// 1. Update Versions
log('Step 1: Updating version numbers...');
updateJson(path.join(rootDir, 'package.json'), (json) => { json.version = newVersion; });

const appConfigPath = path.join(mobileDir, 'app.config.js');
log(`Updating ${appConfigPath}...`);
const appConfigContent = fs.readFileSync(appConfigPath, 'utf8');
const updatedAppConfig = appConfigContent.replace(/version: '[^']*'/, `version: '${newVersion}'`);
fs.writeFileSync(appConfigPath, updatedAppConfig, 'utf8');

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

// Copy and normalize remote-config.json and its hash
copyAndNormalizeTextFile(configSrc, configDest);
copyAndNormalizeTextFile(hashSrc, hashDest);

// Copy license file
copyAndNormalizeTextFile(licenseSrc, licenseDest);

run('node scripts/copy-assets.js');
run('node scripts/validate-config.js');

// 5. Run Quality Checks (Tests, Typecheck, Lint)
if (!fastTrack) {
    log('Step 5: Running quality checks...');
    run('npm test');
    run('npm test', mobileDir);
    run('npm run typecheck');
    run('npm run typecheck', mobileDir);
    run('npm run lint');
    run('npm run lint', mobileDir);
}

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
