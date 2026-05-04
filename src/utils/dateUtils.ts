import { isWeekend, parseISO, startOfDay } from 'date-fns';

export function getHolidays(year: number): Date[] {
    const holidays: Date[] = [];
    
    holidays.push(new Date(year, 0, 1));
    holidays.push(new Date(year, 4, 1));
    holidays.push(new Date(year, 9, 3));
    holidays.push(new Date(year, 11, 25));
    holidays.push(new Date(year, 11, 26));

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

    const fronleichnam = new Date(easterSunday);
    fronleichnam.setDate(easterSunday.getDate() + 60);
    holidays.push(fronleichnam);
    
    holidays.push(new Date(year, 10, 1)); 

    return holidays;
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
