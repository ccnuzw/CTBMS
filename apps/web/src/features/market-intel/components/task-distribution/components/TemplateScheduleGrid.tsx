import React, { useMemo } from 'react';
import { Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { TaskCycleType } from '@packages/types';

const { Text } = Typography;

interface TemplateScheduleGridProps {
    template: any;
    weeks?: number;
}

const computeRunDates = (template: any, days = 28) => {
    const cycleType = template.cycleType as TaskCycleType;
    const runAtMinute = typeof template.runAtMinute === 'number' ? template.runAtMinute : 0;
    const runDayOfWeek = template.runDayOfWeek ?? 1;
    const runDayOfMonth = template.runDayOfMonth ?? 1;
    const activeFrom = template.activeFrom ? dayjs(template.activeFrom) : dayjs();

    const results: dayjs.Dayjs[] = [];
    let cursor = dayjs().isAfter(activeFrom) ? dayjs() : activeFrom;

    const nextRun = (base: dayjs.Dayjs) => {
        if (cycleType === TaskCycleType.ONE_TIME) {
            const once = activeFrom.startOf('day').add(runAtMinute, 'minute');
            return once.isAfter(base) ? once : null;
        }
        if (cycleType === TaskCycleType.DAILY) {
            let candidate = base.startOf('day').add(runAtMinute, 'minute');
            if (candidate.isBefore(base) || candidate.isSame(base)) {
                candidate = candidate.add(1, 'day');
            }
            return candidate;
        }
        if (cycleType === TaskCycleType.WEEKLY) {
            const baseStart = base.startOf('day');
            const weekday = baseStart.day() === 0 ? 7 : baseStart.day();
            const weekStart = baseStart.subtract(weekday - 1, 'day');
            let candidate = weekStart.add(runDayOfWeek - 1, 'day').add(runAtMinute, 'minute');
            if (candidate.isBefore(base) || candidate.isSame(base)) {
                candidate = candidate.add(7, 'day');
            }
            return candidate;
        }
        if (cycleType === TaskCycleType.MONTHLY) {
            const start = base.startOf('month');
            const lastDay = start.add(1, 'month').subtract(1, 'day').date();
            const day = runDayOfMonth === 0 || runDayOfMonth > lastDay ? lastDay : runDayOfMonth;
            let candidate = start.date(day).startOf('day').add(runAtMinute, 'minute');
            if (candidate.isBefore(base) || candidate.isSame(base)) {
                const nextMonth = start.add(1, 'month');
                const nextLast = nextMonth.add(1, 'month').subtract(1, 'day').date();
                const nextDay = runDayOfMonth === 0 || runDayOfMonth > nextLast ? nextLast : runDayOfMonth;
                candidate = nextMonth.date(nextDay).startOf('day').add(runAtMinute, 'minute');
            }
            return candidate;
        }
        return null;
    };

    while (results.length < days) {
        const next = nextRun(cursor);
        if (!next) break;
        results.push(next);
        cursor = next.add(1, 'minute');
        if (cycleType === TaskCycleType.ONE_TIME) break;
    }

    return results;
};

export const TemplateScheduleGrid: React.FC<TemplateScheduleGridProps> = ({ template, weeks = 4 }) => {
    const weekday = dayjs().day();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = dayjs().add(mondayOffset, 'day').startOf('day'); // Monday
    const days = weeks * 7;
    const runDates = useMemo(() => computeRunDates(template, days), [template, days]);
    const runSet = new Set(runDates.map(item => item.format('YYYY-MM-DD')));

    const data = Array.from({ length: days }, (_, idx) => {
        const date = start.add(idx, 'day');
        const key = date.format('YYYY-MM-DD');
        return {
            key,
            date,
            week: Math.floor(idx / 7) + 1,
            day: date.format('MM-DD'),
            label: date.format('ddd'),
            hasRun: runSet.has(key),
            time: runDates.find(item => item.format('YYYY-MM-DD') === key)?.format('HH:mm'),
        };
    });

    const weeksData = Array.from({ length: weeks }, (_, weekIndex) => {
        const startIndex = weekIndex * 7;
        const slice = data.slice(startIndex, startIndex + 7);
        return { week: weekIndex + 1, days: slice };
    });

    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, minmax(160px, 1fr))`, gap: 12 }}>
            {weeksData.map((week) => (
                <div
                    key={`week-${week.week}`}
                    style={{
                        border: '1px solid #f0f0f0',
                        borderRadius: 8,
                        padding: 10,
                        background: '#fafafa',
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>第 {week.week} 周</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                        {week.days.map(day => (
                            <div
                                key={day.key}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                }}
                            >
                                <div>
                                    <div>{day.day}</div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {day.label}
                                    </Text>
                                </div>
                                {day.hasRun ? (
                                    <Tag color="blue">{day.time || '计划'}</Tag>
                                ) : (
                                    <Text type="secondary">无</Text>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
