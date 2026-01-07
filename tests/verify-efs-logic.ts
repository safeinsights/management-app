import { listWorkspaceFilesAction } from '../src/server/actions/workspaces.actions';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Mock specific env var for testing if not already present
process.env.CODER_FILES = process.env.CODER_FILES || '/tmp/coder-sim';
const SIM_DIR = process.env.CODER_FILES;
const STUDY_ID = 'test-study-efs';

async function main() {
    console.log(`Setting up simulation at ${SIM_DIR}...`);
    
    // Cleanup previous run
    try {
        await fs.rm(SIM_DIR, { recursive: true, force: true });
    } catch {}
    
    // 1. Test missing study directory
    console.log('Test 1: Missing study directory...');
    const result1 = await listWorkspaceFilesAction({ studyId: STUDY_ID });
    if ('files' in result1 && result1.files.length === 0) {
        console.log('PASS: Returned empty list for missing directory.');
    } else {
        console.error('FAIL: Did not handle missing directory correctly.', result1);
        process.exit(1);
    }

    // 2. Test with files
    console.log('Test 2: With files...');
    const studyDir = path.join(SIM_DIR, STUDY_ID);
    await fs.mkdir(studyDir, { recursive: true });
    await fs.writeFile(path.join(studyDir, 'main.py'), 'print("hello")');
    await fs.writeFile(path.join(studyDir, 'README.md'), '# readme');
    
    const result2 = await listWorkspaceFilesAction({ studyId: STUDY_ID });
    if ('files' in result2 && result2.files.includes('main.py') && result2.files.includes('README.md')) {
        console.log('PASS: Correctly listed files.');
    } else {
        console.error('FAIL: Did not list files correctly.', result2);
        process.exit(1);
    }

    console.log('All backend verification tests passed!');
}

main().catch(console.error);
