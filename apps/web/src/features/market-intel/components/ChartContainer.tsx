import React, { useState, useEffect, useRef } from 'react';
import { Flex, Spin } from 'antd';
import { ResponsiveContainer } from 'recharts';

export const ChartContainer: React.FC<{ children: React.ReactNode; height: number | string; width?: number | string; minHeight?: number; minWidth?: number }> = ({
    children,
    height,
    width = '100%',
    minHeight = 1,
    minWidth = 1
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const observer = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) {
                requestAnimationFrame(() => {
                    setDimensions({ width, height });
                });
            } else {
                setDimensions(null);
            }
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (containerRef.current) {
            const { offsetWidth, offsetHeight } = containerRef.current;
            if (offsetWidth > 0 && offsetHeight > 0) {
                setDimensions({ width: offsetWidth, height: offsetHeight });
            }
        }
    }, []);

    const content = dimensions
        ? React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return child;
            if (child.type !== ResponsiveContainer) return child;
            if (child.props.initialDimension) return child;
            return React.cloneElement(child, { initialDimension: dimensions });
        })
        : null;

    return (
        <div ref={containerRef} style={{ height, width, minHeight, minWidth, position: 'relative' }}>
            {dimensions ? (
                content
            ) : (
                <Flex justify="center" align="center" style={{ height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                    <Spin />
                </Flex>
            )}
        </div>
    );
};
