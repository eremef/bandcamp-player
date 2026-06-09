const { execSync } = require('child_process');

function run() {
    console.log('--- MemPalace Checkpoint ---');

    try {
        // 1. Mine the project
        console.log('Mining project changes...');
        execSync('mempalace mine .', { stdio: 'inherit' });

        // 2. Get latest commit message for diary
        const lastCommit = execSync('git log -1 --pretty=%B').toString().trim();
        const date = new Date().toISOString().split('T')[0];
        
        // Since the agent has the tool, it's better if the agent does the diary.
        // But we can record a 'milestone' fact in the KG.

        console.log('--- Checkpoint Complete ---');
    } catch (error) {
        console.error('Failed to run MemPalace checkpoint:', error.message);
    }
}

run();
