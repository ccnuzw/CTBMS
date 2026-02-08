import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    App,
    Button,
    Card,
    Collapse,
    DatePicker,
    Form,
    Input,
    InputNumber,
    Radio,
    Row,
    Col,
    Select,
    Space,
    Tag,
    Typography,
    Alert,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { type ShiftConfig } from '@packages/types';

const { Text } = Typography;
const { TextArea } = Input;

type ShiftConfigMode = 'DATES' | 'WEEKDAYS' | 'MONTH_DAYS' | 'INTERVAL';

type ShiftConfigEditorProps = {
    open: boolean;
    resetKey: string;
};

const modeOptions: Array<{ value: ShiftConfigMode; label: string; hint: string }> = [
    { value: 'DATES', label: '指定日期', hint: '仅在指定日期生成任务' },
    { value: 'WEEKDAYS', label: '按周', hint: '按周几重复生成任务' },
    { value: 'MONTH_DAYS', label: '按月', hint: '按每月日期生成任务' },
    { value: 'INTERVAL', label: '间隔天数', hint: '从起始日期起每 N 天生成' },
];

const weekdayOptions = [
    { value: 1, label: '周一' },
    { value: 2, label: '周二' },
    { value: 3, label: '周三' },
    { value: 4, label: '周四' },
    { value: 5, label: '周五' },
    { value: 6, label: '周六' },
    { value: 7, label: '周日' },
];

const monthDayOptions = [
    ...Array.from({ length: 31 }, (_, index) => ({
        value: index + 1,
        label: `${index + 1}日`,
    })),
    { value: 0, label: '月末' },
];

const inferMode = (cfg?: ShiftConfig | null): ShiftConfigMode => {
    if (cfg?.dates && cfg.dates.length > 0) return 'DATES';
    if (cfg?.weekdays && cfg.weekdays.length > 0) return 'WEEKDAYS';
    if (cfg?.monthDays && cfg.monthDays.length > 0) return 'MONTH_DAYS';
    if (cfg?.intervalDays && cfg?.startDate) return 'INTERVAL';
    return 'DATES';
};

const normalizeShiftConfig = (cfg?: ShiftConfig | null): ShiftConfig => {
    if (!cfg) return {};
    const cleaned: ShiftConfig = {};
    if (Array.isArray(cfg.dates) && cfg.dates.length > 0) {
        cleaned.dates = Array.from(new Set(cfg.dates.filter(Boolean))).sort();
    }
    if (Array.isArray(cfg.weekdays) && cfg.weekdays.length > 0) {
        cleaned.weekdays = cfg.weekdays.filter((d) => Number.isFinite(d));
    }
    if (Array.isArray(cfg.monthDays) && cfg.monthDays.length > 0) {
        cleaned.monthDays = cfg.monthDays.filter((d) => Number.isFinite(d));
    }
    if (cfg.intervalDays !== undefined && cfg.intervalDays !== null && cfg.intervalDays !== '') {
        const value = Number(cfg.intervalDays);
        if (Number.isFinite(value) && value > 0) {
            cleaned.intervalDays = value;
        }
    }
    if (cfg.startDate) {
        cleaned.startDate = cfg.startDate;
    }
    return cleaned;
};

const pickShiftConfigByMode = (cfg: ShiftConfig | null | undefined, mode: ShiftConfigMode): ShiftConfig => {
    const normalized = normalizeShiftConfig(cfg);
    if (mode === 'DATES') return normalized.dates ? { dates: normalized.dates } : {};
    if (mode === 'WEEKDAYS') return normalized.weekdays ? { weekdays: normalized.weekdays } : {};
    if (mode === 'MONTH_DAYS') return normalized.monthDays ? { monthDays: normalized.monthDays } : {};
    if (mode === 'INTERVAL') {
        const result: ShiftConfig = {};
        if (normalized.intervalDays) result.intervalDays = normalized.intervalDays;
        if (normalized.startDate) result.startDate = normalized.startDate;
        return result;
    }
    return {};
};

const hasRule = (cfg?: ShiftConfig | null): boolean => {
    if (!cfg) return false;
    if (Array.isArray(cfg.dates) && cfg.dates.length > 0) return true;
    if (Array.isArray(cfg.weekdays) && cfg.weekdays.length > 0) return true;
    if (Array.isArray(cfg.monthDays) && cfg.monthDays.length > 0) return true;
    if (cfg.intervalDays && cfg.startDate) return true;
    return false;
};

const getWeekday1 = (date: Dayjs) => {
    const day = date.day();
    return day === 0 ? 7 : day;
};

const getLastDayOfMonth = (date: Dayjs) => date.endOf('month').date();

const isCustomDue = (date: Dayjs, cfg: ShiftConfig) => {
    const dateKey = date.format('YYYY-MM-DD');
    if (Array.isArray(cfg.dates) && cfg.dates.includes(dateKey)) return true;

    if (Array.isArray(cfg.weekdays) && cfg.weekdays.length > 0) {
        return cfg.weekdays.includes(getWeekday1(date));
    }

    if (Array.isArray(cfg.monthDays) && cfg.monthDays.length > 0) {
        const today = date.date();
        const lastDay = getLastDayOfMonth(date);
        if (cfg.monthDays.includes(today)) return true;
        if (cfg.monthDays.includes(0) && today === lastDay) return true;
        if (cfg.monthDays.some((d) => d > lastDay) && today === lastDay) return true;
        return false;
    }

    if (cfg.intervalDays && cfg.startDate) {
        const start = dayjs(cfg.startDate, 'YYYY-MM-DD', true);
        if (start.isValid()) {
            const diff = date.startOf('day').diff(start.startOf('day'), 'day');
            if (diff >= 0 && diff % Number(cfg.intervalDays) === 0) {
                return true;
            }
            return false;
        }
    }

    return true;
};

const getNextRuns = (cfg: ShiftConfig, dispatchTime?: Dayjs, count = 5) => {
    if (!hasRule(cfg)) return [];
    const results: Dayjs[] = [];
    const now = dayjs();
    const startDay = now.startOf('day');
    const minute = dispatchTime ? dispatchTime.hour() * 60 + dispatchTime.minute() : 540;
    const hour = Math.floor(minute / 60);
    const minuteInHour = minute % 60;

    for (let i = 0; i < 400 && results.length < count; i += 1) {
        const day = startDay.add(i, 'day');
        const runAt = day.hour(hour).minute(minuteInHour).second(0).millisecond(0);
        if (runAt.isBefore(now)) continue;
        if (isCustomDue(day, cfg)) {
            results.push(runAt);
        }
    }

    return results;
};

const DateTagInput: React.FC<{ value?: string[]; onChange?: (value: string[]) => void }> = ({
    value,
    onChange,
}) => {
    const [pickerValue, setPickerValue] = useState<Dayjs | null>(null);
    const list = Array.isArray(value) ? value : [];

    const addDate = () => {
        if (!pickerValue) return;
        const dateStr = pickerValue.format('YYYY-MM-DD');
        const next = Array.from(new Set([...list, dateStr])).sort();
        onChange?.(next);
    };

    const removeDate = (dateStr: string) => {
        onChange?.(list.filter((d) => d !== dateStr));
    };

    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
                <DatePicker value={pickerValue} onChange={setPickerValue} />
                <Button onClick={addDate}>添加日期</Button>
            </Space>
            {list.length > 0 ? (
                <Space wrap>
                    {list.map((d) => (
                        <Tag key={d} closable onClose={() => removeDate(d)}>
                            {d}
                        </Tag>
                    ))}
                </Space>
            ) : (
                <Text type="secondary">尚未选择日期</Text>
            )}
        </Space>
    );
};

export const ShiftConfigEditor: React.FC<ShiftConfigEditorProps> = ({ open, resetKey }) => {
    const form = Form.useFormInstance();
    const { message } = App.useApp();
    const shiftConfig = Form.useWatch('shiftConfig', form) as ShiftConfig | undefined;
    const dispatchTime = Form.useWatch('dispatchTime', form) as Dayjs | undefined;

    const [mode, setMode] = useState<ShiftConfigMode>('DATES');
    const userTouchedRef = useRef(false);
    const modeCacheRef = useRef<Record<ShiftConfigMode, ShiftConfig>>({
        DATES: {},
        WEEKDAYS: {},
        MONTH_DAYS: {},
        INTERVAL: {},
    });

    const normalizedConfig = useMemo(() => normalizeShiftConfig(shiftConfig), [shiftConfig]);
    const previewRuns = useMemo(
        () => getNextRuns(normalizedConfig, dispatchTime, 5),
        [normalizedConfig, dispatchTime]
    );

    const [jsonDraft, setJsonDraft] = useState('');
    const jsonDirtyRef = useRef(false);

    useEffect(() => {
        if (!open) return;
        userTouchedRef.current = false;
        jsonDirtyRef.current = false;
    }, [open, resetKey]);

    useEffect(() => {
        if (!open || userTouchedRef.current) return;
        setMode(inferMode(shiftConfig));
    }, [open, shiftConfig, resetKey]);

    useEffect(() => {
        modeCacheRef.current[mode] = pickShiftConfigByMode(shiftConfig, mode);
    }, [mode, shiftConfig]);

    useEffect(() => {
        if (!open || jsonDirtyRef.current) return;
        setJsonDraft(JSON.stringify(normalizeShiftConfig(shiftConfig), null, 2));
    }, [open, shiftConfig]);

    const handleModeChange = (nextMode: ShiftConfigMode) => {
        userTouchedRef.current = true;
        const cached = modeCacheRef.current[nextMode] || {};
        form.setFieldValue('shiftConfig', cached);
        setMode(nextMode);
    };

    const applyJson = () => {
        try {
            const parsed = JSON.parse(jsonDraft) as ShiftConfig;
            const nextMode = inferMode(parsed);
            form.setFieldValue('shiftConfig', pickShiftConfigByMode(parsed, nextMode));
            setMode(nextMode);
            jsonDirtyRef.current = false;
            message.success('已应用 JSON 规则');
        } catch {
            message.error('JSON 解析失败，请检查格式');
        }
    };

    const syncJson = () => {
        setJsonDraft(JSON.stringify(normalizeShiftConfig(shiftConfig), null, 2));
        jsonDirtyRef.current = false;
    };

    return (
        <Card size="small" title="自定义排期规则" style={{ marginTop: 8 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Form.Item label="规则类型">
                    <Radio.Group value={mode} onChange={(e) => handleModeChange(e.target.value)}>
                        <Space wrap>
                            {modeOptions.map((option) => (
                                <Radio key={option.value} value={option.value}>
                                    {option.label}
                                </Radio>
                            ))}
                        </Space>
                    </Radio.Group>
                    <div>
                        <Text type="secondary">
                            {modeOptions.find((item) => item.value === mode)?.hint}
                        </Text>
                    </div>
                </Form.Item>

                {mode === 'DATES' && (
                    <Form.Item
                        name={['shiftConfig', 'dates']}
                        label="指定日期"
                        rules={[
                            {
                                validator: async (_, value) => {
                                    if (Array.isArray(value) && value.length > 0) return Promise.resolve();
                                    return Promise.reject(new Error('请至少添加一个日期'));
                                },
                            },
                        ]}
                    >
                        <DateTagInput />
                    </Form.Item>
                )}

                {mode === 'WEEKDAYS' && (
                    <Form.Item
                        name={['shiftConfig', 'weekdays']}
                        label="每周"
                        rules={[
                            {
                                validator: async (_, value) => {
                                    if (Array.isArray(value) && value.length > 0) return Promise.resolve();
                                    return Promise.reject(new Error('请选择至少一个工作日'));
                                },
                            },
                        ]}
                    >
                        <Select mode="multiple" placeholder="选择周几" options={weekdayOptions} />
                    </Form.Item>
                )}

                {mode === 'MONTH_DAYS' && (
                    <Form.Item
                        name={['shiftConfig', 'monthDays']}
                        label="每月"
                        rules={[
                            {
                                validator: async (_, value) => {
                                    if (Array.isArray(value) && value.length > 0) return Promise.resolve();
                                    return Promise.reject(new Error('请选择至少一个日期'));
                                },
                            },
                        ]}
                    >
                        <Select mode="multiple" placeholder="选择日期" options={monthDayOptions} />
                    </Form.Item>
                )}

                {mode === 'INTERVAL' && (
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name={['shiftConfig', 'intervalDays']}
                                label="间隔天数"
                                rules={[{ required: true, message: '请输入间隔天数' }]}
                            >
                                <InputNumber style={{ width: '100%' }} min={1} placeholder="如 7" />
                            </Form.Item>
                        </Col>
                        <Col span={16}>
                            <Form.Item
                                name={['shiftConfig', 'startDate']}
                                label="起始日期"
                                rules={[{ required: true, message: '请选择起始日期' }]}
                                getValueProps={(value) => ({
                                    value: value ? dayjs(value) : null,
                                })}
                                getValueFromEvent={(value) => value?.format('YYYY-MM-DD')}
                            >
                                <DatePicker style={{ width: '100%' }} placeholder="选择起始日期" />
                            </Form.Item>
                        </Col>
                    </Row>
                )}

                {!hasRule(normalizedConfig) && (
                    <Alert type="warning" message="尚未设置规则，任务不会自动生成" showIcon />
                )}

                <Card size="small" title="预览（未来 5 次）">
                    {previewRuns.length > 0 ? (
                        <Space wrap>
                            {previewRuns.map((item) => (
                                <Tag key={item.toISOString()}>{item.format('YYYY-MM-DD HH:mm')}</Tag>
                            ))}
                        </Space>
                    ) : (
                        <Text type="secondary">请先完善规则配置</Text>
                    )}
                </Card>

                <Collapse
                    items={[
                        {
                            key: 'advanced-json',
                            label: '高级（JSON）',
                            children: (
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    <Text type="secondary">
                                        仅在需要时使用，修改后点击“应用 JSON”以更新规则。
                                    </Text>
                                    <TextArea
                                        rows={4}
                                        value={jsonDraft}
                                        onChange={(event) => {
                                            jsonDirtyRef.current = true;
                                            setJsonDraft(event.target.value);
                                        }}
                                    />
                                    <Space>
                                        <Button onClick={applyJson}>应用 JSON</Button>
                                        <Button type="link" onClick={syncJson}>
                                            从当前规则生成
                                        </Button>
                                    </Space>
                                </Space>
                            ),
                        },
                    ]}
                />
            </Space>
        </Card>
    );
};

export default ShiftConfigEditor;
