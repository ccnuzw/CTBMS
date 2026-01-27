import React, { useState, useEffect, useCallback } from 'react';
import { Button, Tooltip, theme, ButtonProps } from 'antd';
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import screenfull from 'screenfull';

export const FullScreenButton: React.FC<ButtonProps> = (props) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const { token } = theme.useToken();

    const handleChange = useCallback(() => {
        setIsFullscreen(screenfull.isFullscreen);
    }, []);

    useEffect(() => {
        if (screenfull.isEnabled) {
            screenfull.on('change', handleChange);
        }
        return () => {
            if (screenfull.isEnabled) {
                screenfull.off('change', handleChange);
            }
        };
    }, [handleChange]);

    const toggleFullscreen = () => {
        if (screenfull.isEnabled) {
            screenfull.toggle();
        }
    };

    if (!screenfull.isEnabled) {
        return null;
    }

    return (
        <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
            <Button
                type="text"
                shape="circle"
                {...props}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...props.style,
                }}
                onClick={(e) => {
                    toggleFullscreen();
                    props.onClick?.(e);
                }}
                icon={
                    isFullscreen ? (
                        <FullscreenExitOutlined style={{ fontSize: 20, color: token.colorTextSecondary }} />
                    ) : (
                        <FullscreenOutlined style={{ fontSize: 20, color: token.colorTextSecondary }} />
                    )
                }
            />
        </Tooltip>
    );
};
