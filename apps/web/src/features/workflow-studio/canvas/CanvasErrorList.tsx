import React from 'react';
import { CanvasErrorListProps } from './canvas-error-list/types';
import { useCanvasErrorListViewModel } from './canvas-error-list/useCanvasErrorListViewModel';
import { CanvasErrorListChangeDrawer } from './canvas-error-list/CanvasErrorListChangeDrawer';
import { CanvasErrorListErrorPanel } from './canvas-error-list/CanvasErrorListErrorPanel';

export const CanvasErrorList: React.FC<CanvasErrorListProps> = (props) => {
    const { errors, onFocusNode, onFocusEdge } = props;

    const viewModel = useCanvasErrorListViewModel(errors, onFocusNode, onFocusEdge);

    if (errors.length === 0) return null;

    return (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 320 }}>
            <CanvasErrorListErrorPanel viewModel={viewModel} {...props} />
            <CanvasErrorListChangeDrawer viewModel={viewModel} onFocusNode={onFocusNode} onFocusEdge={onFocusEdge} />
        </div>
    );
};

export type { ValidationError } from './canvas-error-list/types';
export default CanvasErrorList;
