import { TaskCycleType } from '@packages/types';

type TemplateLike = {
    cycleType: TaskCycleType;
    cycleConfig?: any;
    runAtMinute?: number;
    runDayOfWeek?: number | null;
    runDayOfMonth?: number | null;
    dueAtMinute?: number;
    dueDayOfWeek?: number | null;
    dueDayOfMonth?: number | null;
    deadlineOffset?: number;
    activeFrom?: Date | null;
};

const MINUTES_IN_DAY = 24 * 60;

function clampMinute(value?: number, fallback = 0) {
    if (value == null || Number.isNaN(value)) return fallback;
    return Math.min(Math.max(0, value), MINUTES_IN_DAY - 1);
}

function startOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function setTimeFromMinute(date: Date, minute: number) {
    const d = new Date(date);
    const safeMinute = clampMinute(minute);
    const hours = Math.floor(safeMinute / 60);
    const mins = safeMinute % 60;
    d.setHours(hours, mins, 0, 0);
    return d;
}

function getWeekday1(date: Date) {
    const day = date.getDay(); // 0=Sun..6=Sat
    return day === 0 ? 7 : day; // 1=Mon..7=Sun
}

function startOfWeekMonday(date: Date) {
    const d = startOfDay(date);
    const weekday = getWeekday1(d);
    d.setDate(d.getDate() - (weekday - 1));
    return d;
}

function endOfWeekSunday(date: Date) {
    const d = endOfDay(date);
    const weekday = getWeekday1(d);
    d.setDate(d.getDate() + (7 - weekday));
    return d;
}

function startOfMonth(date: Date) {
    const d = startOfDay(date);
    d.setDate(1);
    return d;
}

function endOfMonth(date: Date) {
    const d = startOfDay(date);
    d.setMonth(d.getMonth() + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
}

function getLastDayOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatDateKey(date: Date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getIsoWeekNumber(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    return (
        1 +
        Math.round(
            ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
        )
    );
}

function formatWeekKey(date: Date) {
    const week = getIsoWeekNumber(date);
    const year = date.getFullYear();
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function formatMonthKey(date: Date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}

export function computePeriodInfo(template: TemplateLike, anchorDate: Date, overrideDueAt?: Date) {
    const cycleType = template.cycleType;
    const runAtMinute = clampMinute(template.runAtMinute ?? 0);
    const dueAtMinute = clampMinute(template.dueAtMinute ?? runAtMinute);
    const dueDayOfWeek = template.dueDayOfWeek ?? 7;
    const dueDayOfMonth = template.dueDayOfMonth ?? 0;

    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    let dueAt: Date | null = null;
    let periodKey: string | null = null;

    if (cycleType === TaskCycleType.DAILY) {
        periodStart = startOfDay(anchorDate);
        periodEnd = endOfDay(anchorDate);
        dueAt = setTimeFromMinute(periodStart, dueAtMinute);
        periodKey = formatDateKey(periodStart);
    } else if (cycleType === TaskCycleType.WEEKLY) {
        periodStart = startOfWeekMonday(anchorDate);
        periodEnd = endOfWeekSunday(anchorDate);
        const dueBase = new Date(periodStart);
        dueBase.setDate(dueBase.getDate() + Math.max(0, Math.min(6, dueDayOfWeek - 1)));
        dueAt = setTimeFromMinute(dueBase, dueAtMinute);
        periodKey = formatWeekKey(periodStart);
    } else if (cycleType === TaskCycleType.MONTHLY) {
        periodStart = startOfMonth(anchorDate);
        periodEnd = endOfMonth(anchorDate);
        const lastDay = getLastDayOfMonth(periodStart);
        const dueDay = dueDayOfMonth === 0 || dueDayOfMonth > lastDay ? lastDay : dueDayOfMonth;
        const dueBase = new Date(periodStart.getFullYear(), periodStart.getMonth(), dueDay);
        dueAt = setTimeFromMinute(dueBase, dueAtMinute);
        periodKey = formatMonthKey(periodStart);
    } else {
        // ONE_TIME
        periodStart = startOfDay(anchorDate);
        periodEnd = endOfDay(anchorDate);
        if (template.deadlineOffset) {
            const legacyDue = new Date(anchorDate);
            legacyDue.setHours(legacyDue.getHours() + template.deadlineOffset);
            dueAt = legacyDue;
        } else {
            dueAt = setTimeFromMinute(anchorDate, dueAtMinute);
        }
        periodKey = formatDateKey(periodStart);
    }

    if (overrideDueAt) {
        dueAt = overrideDueAt;
    }

    return { periodStart, periodEnd, dueAt, periodKey, runAtMinute };
}

export function computeNextRunAt(template: TemplateLike, fromDate: Date) {
    const cycleType = template.cycleType;
    const runAtMinute = clampMinute(template.runAtMinute ?? 0);
    const legacy = template.cycleConfig || {};

    let baseDate = new Date(fromDate);
    if (template.activeFrom && baseDate < template.activeFrom) {
        baseDate = new Date(template.activeFrom);
    }

    if (cycleType === TaskCycleType.DAILY) {
        const candidate = setTimeFromMinute(startOfDay(baseDate), runAtMinute);
        if (candidate <= baseDate) {
            candidate.setDate(candidate.getDate() + 1);
        }
        return candidate;
    }

    if (cycleType === TaskCycleType.WEEKLY) {
        const runDay = template.runDayOfWeek ?? legacy.weekDay ?? 1; // 1=Mon..7=Sun
        const start = startOfWeekMonday(baseDate);
        const candidate = new Date(start);
        candidate.setDate(candidate.getDate() + Math.max(0, Math.min(6, runDay - 1)));
        const scheduled = setTimeFromMinute(candidate, runAtMinute);
        if (scheduled <= baseDate) {
            scheduled.setDate(scheduled.getDate() + 7);
        }
        return scheduled;
    }

    if (cycleType === TaskCycleType.MONTHLY) {
        const runDay = template.runDayOfMonth ?? legacy.monthDay ?? 1;
        const start = startOfMonth(baseDate);
        const lastDay = getLastDayOfMonth(start);
        const day = runDay === 0 || runDay > lastDay ? lastDay : runDay;
        const candidate = setTimeFromMinute(new Date(start.getFullYear(), start.getMonth(), day), runAtMinute);
        if (candidate <= baseDate) {
            const nextMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1);
            const lastNext = getLastDayOfMonth(nextMonth);
            const nextDay = runDay === 0 || runDay > lastNext ? lastNext : runDay;
            return setTimeFromMinute(
                new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextDay),
                runAtMinute,
            );
        }
        return candidate;
    }

    // ONE_TIME
    if (template.activeFrom) {
        const candidate = setTimeFromMinute(startOfDay(template.activeFrom), runAtMinute);
        if (candidate <= baseDate) {
            return null;
        }
        return candidate;
    }

    return null;
}
