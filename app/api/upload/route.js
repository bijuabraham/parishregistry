import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function POST(request) {
    try {
        const formData = await request.formData();
        
        const file1 = formData.get('exportFile');
        const file2 = formData.get('envelopeFile');
        const file3 = formData.get('groupsFile');
        
        if (!file1 || !file2 || !file3) {
            return NextResponse.json({ error: 'All three files (ExportFile, Envelope, GroupsH) are required.' }, { status: 400 });
        }

        const workspaceDir = process.cwd();
        
        // Save the files, overwriting existing ones in the workspace
        const buffer1 = Buffer.from(await file1.arrayBuffer());
        await writeFile(path.join(workspaceDir, 'ExportFile.xls'), buffer1);
        
        const buffer2 = Buffer.from(await file2.arrayBuffer());
        await writeFile(path.join(workspaceDir, 'Envelope.xls'), buffer2);
        
        const buffer3 = Buffer.from(await file3.arrayBuffer());
        await writeFile(path.join(workspaceDir, 'GroupsH.xls'), buffer3);
        
        // Execute the python parser script
        const pythonPath = path.join(workspaceDir, '.venv', 'bin', 'python3');
        const scriptPath = path.join(workspaceDir, 'parse_data.py');
        
        console.log(`Executing parser: "${pythonPath}" "${scriptPath}"`);
        const { stdout, stderr } = await execPromise(`"${pythonPath}" "${scriptPath}"`);
        console.log('Parser output stdout:', stdout);
        
        if (stderr) {
            console.error('Parser output stderr:', stderr);
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Files uploaded and database rebuilt successfully.',
            parserOutput: stdout
        });
    } catch (error) {
        console.error('Upload API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during file upload and processing.' }, { status: 500 });
    }
}
