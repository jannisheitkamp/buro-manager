import fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function test() {
  try {
    const data = new Uint8Array(fs.readFileSync('package.json')); // just any file to see the error
    const doc = await pdfjs.getDocument({ data }).promise;
    console.log('Success', doc.numPages);
  } catch (e) {
    console.error('Error:', e.message || e);
  }
}
test();
