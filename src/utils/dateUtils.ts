import { isWeekend, parseISO, startOfDay } from 'date-fns';

export function getHolidays(year: number): Date[] {
    const holidays: Date[] = [];
    
    // Feste Feiertage (Bund)
    holidays.push(new Date(year, 0, 1)); // Neujahr
    holidays.push(new Date(year, 4, 1)); // Tag der Arbeit
    holidays.push(new Date(year, 9, 3)); // Tag der Deutschen Einheit
    holidays.push(new Date(year, 11, 25)); // 1. Weihnachtstag
    holidays.push(new Date(year, 11, 26)); // 2. Weihnachtstag

    // Bewegliche Feiertage (Ostern als Basis)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    
    const easterSunday = new Date(year, month, day);

    const karfreitag = new Date(easterSunday);
    karfreitag.setDate(easterSunday.getDate() - 2);
    holidays.push(karfreitag);

    const ostermontag = new Date(easterSunday);
    ostermontag.setDate(easterSunday.getDate() + 1);
    holidays.push(ostermontag);

    const christiHimmelfahrt = new Date(easterSunday);
    christiHimmelfahrt.setDate(easterSunday.getDate() + 39);
    holidays.push(christiHimmelfahrt);

    const pfingstmontag = new Date(easterSunday);
    pfingstmontag.setDate(easterSunday.getDate() + 50);
    holidays.push(pfingstmontag);

    // NRW-spezifische Feiertage
    const fronleichnam = new Date(easterSunday);
    fronleichnam.setDate(easterSunday.getDate() + 60);
    holidays.push(fronleichnam);
    
    holidays.push(new Date(year, 10, 1)); // Allerheiligen (NRW)

    return holidays;
}

export function getHolidayName(date: Date): string | null {
    // ...existing logic
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    if (month === 0 && day === 1) return 'Neujahr';
    if (month === 4 && day === 1) return 'Tag der Arbeit';
    if (month === 9 && day === 3) return 'Tag der Deutschen Einheit';
    if (month === 11 && day === 25) return '1. Weihnachtstag';
    if (month === 11 && day === 26) return '2. Weihnachtstag';
    if (month === 10 && day === 1) return 'Allerheiligen';

    // Bewegliche Feiertage
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const easterMonth = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
    const easterSunday = new Date(year, easterMonth, easterDay);

    const karfreitag = new Date(easterSunday);
    karfreitag.setDate(easterSunday.getDate() - 2);
    if (month === karfreitag.getMonth() && day === karfreitag.getDate()) return 'Karfreitag';

    const ostermontag = new Date(easterSunday);
    ostermontag.setDate(easterSunday.getDate() + 1);
    if (month === ostermontag.getMonth() && day === ostermontag.getDate()) return 'Ostermontag';

    const christiHimmelfahrt = new Date(easterSunday);
    christiHimmelfahrt.setDate(easterSunday.getDate() + 39);
    if (month === christiHimmelfahrt.getMonth() && day === christiHimmelfahrt.getDate()) return 'Christi Himmelfahrt';

    const pfingstmontag = new Date(easterSunday);
    pfingstmontag.setDate(easterSunday.getDate() + 50);
    if (month === pfingstmontag.getMonth() && day === pfingstmontag.getDate()) return 'Pfingstmontag';

    const fronleichnam = new Date(easterSunday);
    fronleichnam.setDate(easterSunday.getDate() + 60);
    if (month === fronleichnam.getMonth() && day === fronleichnam.getDate()) return 'Fronleichnam';

    return null;
}

export function isNRWSchoolHoliday(date: Date): boolean {
    const holidays = [
        // 2024
        { start: new Date(2023, 11, 21), end: new Date(2024, 0, 5) }, // Weihnachten
        { start: new Date(2024, 2, 25), end: new Date(2024, 3, 6) }, // Ostern
        { start: new Date(2024, 4, 21), end: new Date(2024, 4, 21) }, // Pfingsten
        { start: new Date(2024, 6, 8), end: new Date(2024, 7, 20) }, // Sommer
        { start: new Date(2024, 9, 14), end: new Date(2024, 9, 26) }, // Herbst
        { start: new Date(2024, 11, 23), end: new Date(2025, 0, 6) }, // Weihnachten

        // 2025
        { start: new Date(2025, 3, 14), end: new Date(2025, 3, 26) }, // Ostern
        { start: new Date(2025, 5, 10), end: new Date(2025, 5, 10) }, // Pfingsten
        { start: new Date(2025, 6, 14), end: new Date(2025, 7, 26) }, // Sommer
        { start: new Date(2025, 9, 13), end: new Date(2025, 9, 25) }, // Herbst
        { start: new Date(2025, 11, 22), end: new Date(2026, 0, 6) }, // Weihnachten

        // 2026
        { start: new Date(2026, 2, 30), end: new Date(2026, 3, 11) }, // Ostern
        { start: new Date(2026, 4, 26), end: new Date(2026, 4, 26) }, // Pfingsten
        { start: new Date(2026, 6, 20), end: new Date(2026, 8, 1) }, // Sommer
        { start: new Date(2026, 9, 17), end: new Date(2026, 9, 31) }, // Herbst
        { start: new Date(2026, 11, 23), end: new Date(2027, 0, 6) }, // Weihnachten
    ];

    const d = startOfDay(date).getTime();
    return holidays.some(h => d >= startOfDay(h.start).getTime() && d <= startOfDay(h.end).getTime());
}

export function getVacationDaysToDeduct(
    startDate: Date, 
    endDate: Date, 
    profile?: { is_vocational_student?: boolean, vocational_school_days?: { dayOfWeek: number, type: 'full' | 'half' }[] }
): number {
    let count = 0;
    const start = startOfDay(startDate);
    const end = startOfDay(endDate);

    for (let d = start; d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
        if (isWeekend(d)) continue;
        
        const year = d.getFullYear();
        const holidays = getHolidays(year);
        const isHoliday = holidays.some(h => h.getTime() === d.getTime());
        
        if (isHoliday) continue;

        // Check for vocational school
        let dayDeduction = 1;

        if (profile?.is_vocational_student && profile.vocational_school_days) {
            const isSchoolHoliday = isNRWSchoolHoliday(d);
            
            if (!isSchoolHoliday) {
                // Not in school holidays, so we check if there's school today
                const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday
                const schoolDay = profile.vocational_school_days.find(s => s.dayOfWeek === dayOfWeek);

                if (schoolDay) {
                    if (schoolDay.type === 'full') {
                        dayDeduction = 0; // Can't take vacation on full school days
                    } else if (schoolDay.type === 'half') {
                        dayDeduction = 0.5; // Only half vacation day deducted
                    }
                }
            }
        }

        count += dayDeduction;
    }

    return count;
}

export function getWorkingDays(startDate: Date | string, endDate: Date | string): number {
    const start = startOfDay(typeof startDate === 'string' ? parseISO(startDate) : startDate);
    const end = startOfDay(typeof endDate === 'string' ? parseISO(endDate) : endDate);
    
    if (start > end) return 0;

    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    let holidays: Date[] = [];
    for (let y = startYear; y <= endYear; y++) {
        holidays = holidays.concat(getHolidays(y));
    }

    let count = 0;
    const current = new Date(start);

    while (current <= end) {
        const isWknd = isWeekend(current);
        const isHoliday = holidays.some(h => 
            h.getFullYear() === current.getFullYear() &&
            h.getMonth() === current.getMonth() &&
            h.getDate() === current.getDate()
        );

        if (!isWknd && !isHoliday) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }

    return count;
}
