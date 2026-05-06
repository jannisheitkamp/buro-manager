import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

self.onmessage = async (e: MessageEvent) => {
    try {
        const { fileBuffer, maxPages } = e.data;
        const doc = await pdfjs.getDocument({ data: fileBuffer }).promise;
        const pages = Math.min(doc.numPages || 0, maxPages);
        let text = '';

        for (let i = 1; i <= pages; i += 1) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            const rows = new Map<number, { y: number; parts: { x: number; str: string }[] }>();
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items: any[] = content.items || [];

            items.forEach(it => {
                const str = (it?.str || '').toString().trim();
                const tr = it?.transform;
                const x = Array.isArray(tr) ? Number(tr[4] || 0) : 0;
                const y = Array.isArray(tr) ? Number(tr[5] || 0) : 0;
                if (!str) return;

                const key = Math.round(y / 2) * 2;
                const row = rows.get(key) || { y, parts: [] };
                row.parts.push({ x, str });
                rows.set(key, row);
            });

            const lines = Array.from(rows.values())
                .sort((a, b) => b.y - a.y)
                .map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.str).join(' ').trim())
                .filter(Boolean);

            text += `\n${lines.join('\n')}\n`;
        }

        self.postMessage({ success: true, text: text.trim() });
    } catch (error: any) {
        console.error('PDF Worker internal error:', error);
        self.postMessage({ success: false, error: error?.message || String(error) });
    }
};