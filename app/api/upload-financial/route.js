import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function POST(request) {
    try {
        const formData = await request.formData();

        const file = formData.get('fundFile');
        const year = formData.get('year');

        if (!file) {
            return NextResponse.json({ error: 'FundActivitySpreadsheet file is required.' }, { status: 400 });
        }

        const workspaceDir = process.cwd();

        // Determine filename based on year
        let filename = 'FundActivitySpreadsheet.xls';
        if (year) {
            filename = `FundActivitySpreadsheet_${year}.xls`;
        }

        // Save the file with year-specific name
        const buffer = Buffer.from(await file.arrayBuffer());
        const filePath = path.join(workspaceDir, filename);
        await writeFile(filePath, buffer);

        console.log(`Saved file: ${filePath}`);

        // Execute the python parser script with year parameter
        const pythonPath = path.join(workspaceDir, '.venv', 'bin', 'python3');
        const scriptPath = path.join(workspaceDir, 'parse_financial.py');

        // Pass year as argument, or filename if year is not specified
        const arg = year ? year : filename;
        console.log(`Executing financial parser: "${pythonPath}" "${scriptPath}" ${arg}`);
        const { stdout, stderr } = await execPromise(`"${pythonPath}" "${scriptPath}" ${arg}`);
        console.log('Financial parser output stdout:', stdout);

        if (stderr) {
            console.error('Financial parser output stderr:', stderr);
        }

        return NextResponse.json({
            success: true,
            message: year ? `Financial data for ${year} imported successfully.` : 'Financial data imported successfully.',
            parserOutput: stdout,
            year: year
        });
    } catch (error) {
        console.error('Financial Upload API Error:', error);
        return NextResponse.json({ error: error.message || 'An error occurred during file upload and processing.' }, { status: 500 });
    }
}
