export const parseContractFromText = (raw: string) => {
    const lines = raw
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
    const text = lines.join(' ').replace(/\s+/g, ' ').trim();
    const lower = text.toLowerCase();

    const result: {
        customer_name?: string;
        customer_firstname?: string;
        policy_number?: string;
        start_date?: string;
        category?: string;
        sub_category?: string;
        net_premium?: number;
        payment_method?: string;
    } = {};

    const isLikelyStreet = (v: string) => {
        const s = v.toLowerCase();
        if (/\d/.test(s)) return true;
        return (
            s.includes('strasse') ||
            s.includes('straße') ||
            /\bstr\.\b/.test(s) ||
            s.includes('weg') ||
            s.includes('allee') ||
            s.includes('gasse') ||
            s.includes('platz') ||
            s.includes('ring') ||
            s.includes('damm')
        );
    };

    const cleanNameToken = (v: string) => {
        const s = v.trim().replace(/\s+/g, ' ');
        if (!s) return null;
        const first = s.split(' ')[0].trim();
        if (!first) return null;
        if (isLikelyStreet(first)) return null;
        if (!/^[A-Za-zÄÖÜäöüß-]{2,30}$/.test(first)) return null;
        return first;
    };

    const findValue = (label: RegExp) => {
        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            const m = line.match(label);
            if (m?.[1]) return m[1].trim();
            if (label.test(line) && (line.replace(label, '').trim() === '' || line.trim().length <= 12)) {
                const next = lines[i + 1];
                if (next) return next.trim();
            }
        }
        return null;
    };

    const toIsoDate = (d: string) => {
        const m = d.match(/(\d{1,2})(?:\.|-|\/)(\d{1,2})(?:\.|-|\/)(\d{2,4})/);
        if (!m) return null;
        const day = m[1].padStart(2, '0');
        const month = m[2].padStart(2, '0');
        const year = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${year}-${month}-${day}`;
    };

    const policyMatch =
        text.match(/(?:Versicherungs-?schein(?:nummer)?|Police(?:n)?(?:nummer)?|Schein-?Nr\.?)\s*[:#]?\s*([A-Z0-9/.-]{5,})/i) ||
        text.match(/\bVN[- ]?Nr\.?\s*[:#]?\s*([A-Z0-9/.-]{5,})/i);
    if (policyMatch?.[1]) result.policy_number = policyMatch[1].trim();

    const directFirst = findValue(/\bVorname\b\s*[:#]?\s*(.+)$/i);
    const directLast = findValue(/\b(?:Nachname|Familienname|Name)\b\s*[:#]?\s*(.+)$/i);
    const firstToken = directFirst ? cleanNameToken(directFirst) : null;
    const lastToken = directLast ? cleanNameToken(directLast) : null;

    if (firstToken) result.customer_firstname = firstToken;
    if (lastToken) result.customer_name = lastToken;

    const vnBlock =
        findValue(/Versicherungsnehmer(?:in)?\s*[:#]?\s*(.+)$/i) ||
        findValue(/Antragsteller(?:in)?\s*[:#]?\s*(.+)$/i) ||
        findValue(/\bVN\b\s*[:#]?\s*(.+)$/i) ||
        '';

    const vnTokens = vnBlock
        .replace(/\s{2,}/g, ' ')
        .replace(/(geb\\.|geboren|geburtsdatum).*/i, '')
        .trim();

    const lastFirstMatch =
        vnTokens.match(/^([A-Za-zÄÖÜäöüß-]{2,})\s+([A-Za-zÄÖÜäöüß-]{2,})(?:\s|$)/) ||
        null;

    const labelMatch =
        text.match(/\bVorname\s*[:#]?\s*([A-Za-zÄÖÜäöüß -]{2,40})\s+(?:Nachname|Name)\s*[:#]?\s*([A-Za-zÄÖÜäöüß -]{2,60})/i) ||
        text.match(/\bNachname\s*[:#]?\s*([A-Za-zÄÖÜäöüß -]{2,60})\s+Vorname\s*[:#]?\s*([A-Za-zÄÖÜäöüß -]{2,40})/i) ||
        null;

    if (!result.customer_firstname || !result.customer_name) {
        if (labelMatch?.[1] && labelMatch?.[2]) {
            const full = labelMatch[0].toLowerCase();
            const isVornameFirst =
                full.indexOf('vorname') !== -1 &&
                full.indexOf('nachname') !== -1 &&
                full.indexOf('vorname') < full.indexOf('nachname');
            const rawFirst = isVornameFirst ? labelMatch[1] : labelMatch[2];
            const rawLast = isVornameFirst ? labelMatch[2] : labelMatch[1];

            const first = cleanNameToken(rawFirst);
            const last = cleanNameToken(rawLast);

            if (first && !result.customer_firstname) result.customer_firstname = first;
            if (last && !result.customer_name) result.customer_name = last;
        } else if (lastFirstMatch?.[1] && lastFirstMatch?.[2]) {
            const token1 = cleanNameToken(lastFirstMatch[1]);
            const token2 = cleanNameToken(lastFirstMatch[2]);
            if (token1 && token2) {
                if (!result.customer_firstname) result.customer_firstname = token1;
                if (!result.customer_name) result.customer_name = token2;
            }
        }
    }

    const startMatch =
        text.match(/(?:Versicherungsbeginn|Vertragsbeginn|Beginn(?:\s+des\s+Versicherungsschutzes)?)\s*[:#]?\s*(\d{1,2}(?:\.|-|\/)\d{1,2}(?:\.|-|\/)\d{2,4})/i) ||
        null;
    if (startMatch?.[1]) {
        const iso = toIsoDate(startMatch[1]);
        if (iso) result.start_date = iso;
    }

    const premiumMatch =
        text.match(/(?:Monatsbeitrag|Jahresbeitrag|Gesamtbeitrag|Beitrag)\s*[:#]?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)\s*(?:€|EUR)/i) ||
        text.match(/([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)\s*(?:€|EUR)\s*(?:monatlich|jaehrlich|vierteljaehrlich|halbjaehrlich)/i);
    if (premiumMatch?.[1]) {
        const v = premiumMatch[1].replace(/\./g, '').replace(',', '.');
        const n = Number(v);
        if (!Number.isNaN(n)) result.net_premium = n;
    }

    if (lower.includes('monatlich')) result.payment_method = 'monthly';
    else if (lower.includes('vierteljaehrlich') || lower.includes('vierteljährlich')) result.payment_method = 'quarterly';
    else if (lower.includes('halbjaehrlich') || lower.includes('halbjährlich')) result.payment_method = 'half_yearly';
    else if (lower.includes('jaehrlich') || lower.includes('jährlich')) result.payment_method = 'yearly';
    else if (lower.includes('einmalig') || lower.includes('einmalzahlung')) result.payment_method = 'one_time';

    if (lower.includes('tierhalter') || lower.includes('pferdehaftpflicht') || lower.includes('hundehaftpflicht')) {
        result.category = 'property';
        result.sub_category = 'Sach'; // Oder PHV, je nachdem was im Buro Manager Standard ist
    } else if (/\bkfz\b/i.test(text) || lower.includes('kraftfahrt') || lower.includes('autoversicherung')) {
        result.category = 'car';
        result.sub_category = 'KFZ';
    } else if (lower.includes('hausrat')) {
        result.category = 'property';
        result.sub_category = 'HR';
    } else if (lower.includes('privathaftpflicht') || /\bphv\b/i.test(text)) {
        result.category = 'property';
        result.sub_category = 'PHV';
    } else if (lower.includes('unfallversicherung') || /\bunf\b/i.test(text)) {
        result.category = 'property';
        result.sub_category = 'UNF';
    } else if (lower.includes('berufsunfaehigkeit') || lower.includes('berufsunfähigkeit') || /\bbu\b/i.test(text)) {
        result.category = 'life';
        result.sub_category = 'BU';
    } else if (lower.includes('lebensversicherung') || /\bleben\b/i.test(text)) {
        result.category = 'life';
        result.sub_category = 'Leben';
    } else if (lower.includes('rechtsschutz')) {
        result.category = 'legal';
        result.sub_category = 'Rechtsschutz';
    } else if (lower.includes('krankenversicherung') || /\bkv\b/i.test(text)) {
        result.category = 'health';
    } else if (lower.includes('sachversicherung')) {
        result.category = 'property';
        result.sub_category = 'Sach';
    }

    return result;
};