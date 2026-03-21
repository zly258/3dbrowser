# React Component Patterns in 3DBrowser

This document outlines the standard React component patterns used throughout the 3DBrowser project.

## Component Structure

### Standard Component Template

```typescript
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

/**
 * Component description
 */
export interface ComponentNameProps {
  /** Prop description */
  propName: Type;
  /** Optional prop description */
  optionalProp?: Type;
  /** Event callback */
  onEvent?: (data: DataType) => void;
}

export const ComponentName: React.FC<ComponentNameProps> = ({
  propName,
  optionalProp,
  onEvent
}) => {
  // 1. State declarations
  const [state, setState] = useState<Type>(initialValue);
  
  // 2. Refs for non-rendering values
  const ref = useRef<RefType>(initialValue);
  
  // 3. Memoized computations
  const memoizedValue = useMemo(() => {
    return computeExpensiveValue(state, propName);
  }, [state, propName]);
  
  // 4. Event handlers (useCallback for stability)
  const handleClick = useCallback(() => {
    // Handle event
    onEvent?.(someData);
  }, [onEvent]);
  
  // 5. Effects
  useEffect(() => {
    // Setup
    return () => {
      // Cleanup
    };
  }, [dependencies]);
  
  // 6. Render helpers
  const renderSubComponent = () => {
    return <div>...</div>;
  };
  
  // 7. JSX return
  return (
    <div className="component-class">
      {renderSubComponent()}
    </div>
  );
};
```

## Common Patterns

### Pattern 1: Three.js Integration

Use this pattern when integrating Three.js with React:

```typescript
import * as THREE from 'three';
import { useEffect, useRef } from 'react';

interface ThreeSceneProps {
  width: number;
  height: number;
  onInit?: (scene: THREE.Scene) => void;
}

export const ThreeScene: React.FC<ThreeSceneProps> = ({ width, height, onInit }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Initialize Three.js scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);
    
    sceneRef.current = scene;
    onInit?.(scene);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
    
    // Cleanup
    return () => {
      renderer.dispose();
      scene.clear();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [width, height, onInit]);
  
  return <div ref={containerRef} style={{ width, height }} />;
};
```

### Pattern 2: Panel Component

Standard floating panel with header, content, and optional resizing:

```typescript
interface PanelProps {
  title: string;
  defaultWidth?: number;
  defaultHeight?: number;
  resizable?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  defaultWidth = 300,
  defaultHeight = 400,
  resizable = true,
  onClose,
  children
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const [position, setPosition] = useState({ x: 10, y: 10 });
  
  return (
    <div
      ref={panelRef}
      className="ui-panel"
      style={{
        width: size.width,
        height: size.height,
        left: position.x,
        top: position.y
      }}
    >
      <div className="ui-panel-header">
        <span className="ui-panel-title">{title}</span>
        {onClose && (
          <button className="ui-panel-close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <div className="ui-panel-content">
        {children}
      </div>
      {resizable && <div className="ui-panel-resize" />}
    </div>
  );
};
```

### Pattern 3: Tool Panel

Panel for a specific tool (measurement, clipping, etc.):

```typescript
interface ToolPanelProps {
  active: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
  children?: React.ReactNode;
}

export const ToolPanel: React.FC<ToolPanelProps> = ({
  active,
  onActivate,
  onDeactivate,
  children
}) => {
  return (
    <div className={`tool-panel ${active ? 'active' : ''}`}>
      <button 
        className={`ui-btn ${active ? 'active' : ''}`}
        onClick={active ? onDeactivate : onActivate}
      >
        {active ? 'Deactivate' : 'Activate'}
      </button>
      {active && <div className="tool-content">{children}</div>}
    </div>
  );
};
```

### Pattern 4: Data Grid/List

Reusable data display with search and filtering:

```typescript
interface DataListProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  searchable?: boolean;
  filterFn?: (item: T, query: string) => boolean;
}

export function DataList<T>({
  data,
  keyExtractor,
  renderItem,
  searchable = false,
  filterFn
}: DataListProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredData = useMemo(() => {
    if (!searchQuery || !filterFn) return data;
    return data.filter(item => filterFn(item, searchQuery));
  }, [data, searchQuery, filterFn]);
  
  return (
    <div className="data-list">
      {searchable && (
        <input
          type="text"
          className="ui-input"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      )}
      <div className="data-list-content">
        {filteredData.map(item => (
          <div key={keyExtractor(item)}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Pattern 5: Form Input Group

Standard form input with label and validation:

```typescript
interface InputGroupProps {
  label: string;
  value: string | number;
  type?: 'text' | 'number' | 'email' | 'password';
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

export const InputGroup: React.FC<InputGroupProps> = ({
  label,
  value,
  type = 'text',
  onChange,
  placeholder,
  disabled = false,
  error
}) => {
  return (
    <div className="input-group">
      <label className="input-label">{label}</label>
      <input
        type={type}
        className={`ui-input ${error ? 'error' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {error && <span className="input-error">{error}</span>}
    </div>
  );
};
```

### Pattern 6: Toggle/Switch

Standard toggle switch component:

```typescript
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false
}) => {
  return (
    <div className="switch-container">
      <button
        className={`ui-switch ${checked ? 'active' : ''}`}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <div className="ui-switch-thumb" />
      </button>
      {label && <span className="switch-label">{label}</span>}
    </div>
  );
};
```

### Pattern 7: Slider with Value Display

Range slider with live value display:

```typescript
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue = (v) => v.toString()
}) => {
  return (
    <div className="slider-row">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        className="ui-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-value">{formatValue(value)}</span>
    </div>
  );
};
```

### Pattern 8: Dropdown/Select

Standard dropdown selection:

```typescript
interface SelectProps<T> {
  label?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false
}: SelectProps<T>) {
  return (
    <div className="select-group">
      {label && <label className="select-label">{label}</label>}
      <select
        className="ui-input"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        disabled={disabled}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### Pattern 9: Tree View

Recursive tree view component:

```typescript
interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  expanded?: boolean;
  visible?: boolean;
}

interface TreeViewProps {
  data: TreeNode[];
  selectedId?: string;
  onNodeSelect?: (nodeId: string) => void;
  onNodeToggle?: (nodeId: string) => void;
}

export const TreeView: React.FC<TreeViewProps> = ({
  data,
  selectedId,
  onNodeSelect,
  onNodeToggle
}) => {
  const renderNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    
    return (
      <div key={node.id} className="tree-node-container">
        <div
          className={`tree-node ${selectedId === node.id ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 20}px` }}
          onClick={() => onNodeSelect?.(node.id)}
        >
          {hasChildren && (
            <span
              className="tree-expander"
              onClick={(e) => {
                e.stopPropagation();
                onNodeToggle?.(node.id);
              }}
            >
              {node.expanded ? '▼' : '▶'}
            </span>
          )}
          <span className="tree-label">{node.name}</span>
        </div>
        {hasChildren && node.expanded && (
          <div className="tree-children">
            {node.children!.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="tree-view">
      {data.map(node => renderNode(node))}
    </div>
  );
};
```

### Pattern 10: Loading Overlay

Overlay component for async operations:

```typescript
interface LoadingOverlayProps {
  visible: boolean;
  progress?: number; // 0-100
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  progress,
  message
}) => {
  if (!visible) return null;
  
  return (
    <div className="loading-overlay">
      <div className="loading-box">
        <div className="loading-spinner" />
        {message && <div className="loading-message">{message}</div>}
        {progress !== undefined && (
          <div className="loading-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
};
```

## Custom Hooks Patterns

### useSceneManager

Hook to access SceneManager:

```typescript
function useSceneManager() {
  const [manager, setManager] = useState<SceneManager | null>(null);
  
  const setManagerRef = useCallback((m: SceneManager | null) => {
    setManager(m);
  }, []);
  
  return { manager, setManager: setManagerRef };
}
```

### useMeasurements

Hook for measurement tool state:

```typescript
function useMeasurements() {
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([]);
  const [currentType, setCurrentType] = useState<MeasureType>('none');
  
  const addMeasurement = useCallback((record: MeasurementRecord) => {
    setMeasurements(prev => [...prev, record]);
  }, []);
  
  const clearMeasurements = useCallback(() => {
    setMeasurements([]);
  }, []);
  
  return {
    measurements,
    currentType,
    setCurrentType,
    addMeasurement,
    clearMeasurements
  };
}
```

### useLocalization

Hook for i18n:

```typescript
function useLocalization(lang: Lang = 'zh') {
  const t = useCallback((key: string): string => {
    return getTranslation(lang, key);
  }, [lang]);
  
  return { t, lang };
}
```

### useDebounce

Hook for debounced values:

```typescript
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
}
```

### useWindowSize

Hook for window size:

```typescript
function useWindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return size;
}
```

## Context Patterns

### ThemeContext

Provide theme and language context:

```typescript
interface AppContextType {
  theme: 'dark' | 'light';
  lang: Lang;
  setTheme: (theme: 'dark' | 'light') => void;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const AppContext = React.createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [lang, setLang] = useState<Lang>('zh');
  
  const t = useCallback((key: string) => getTranslation(lang, key), [lang]);
  
  const value = useMemo(() => ({
    theme,
    lang,
    setTheme,
    setLang,
    t
  }), [theme, lang, t]);
  
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
```

## Performance Patterns

### Virtual Scrolling

For large lists, implement virtual scrolling:

```typescript
interface VirtualListProps {
  items: any[];
  itemHeight: number;
  visibleCount: number;
  renderItem: (item: any, index: number) => React.ReactNode;
}

export function VirtualList({
  items,
  itemHeight,
  visibleCount,
  renderItem
}: VirtualListProps) {
  const [scrollTop, setScrollTop] = useState(0);
  
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(startIndex + visibleCount, items.length);
  const visibleItems = items.slice(startIndex, endIndex);
  
  return (
    <div
      className="virtual-list"
      style={{ height: visibleCount * itemHeight, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => (
          <div
            key={startIndex + i}
            style={{
              position: 'absolute',
              top: (startIndex + i) * itemHeight,
              height: itemHeight
            }}
          >
            {renderItem(item, startIndex + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Testing Patterns

### Component Test Template

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName propName="value" />);
    expect(screen.getByText('expected text')).toBeInTheDocument();
  });
  
  it('handles user interaction', () => {
    const handleClick = jest.fn();
    render(<ComponentName onClick={handleClick} />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });
  
  it('updates state correctly', () => {
    const { rerender } = render(<ComponentName value="initial" />);
    expect(screen.getByText('initial')).toBeInTheDocument();
    
    rerender(<ComponentName value="updated" />);
    expect(screen.getByText('updated')).toBeInTheDocument();
  });
});
```

## Best Practices

1. **Always export Props interfaces** for external consumers
2. **Use useCallback** for event handlers passed to children
3. **Use useMemo** for expensive computations
4. **Clean up side effects** in useEffect cleanup functions
5. **Avoid inline functions** in JSX (use useCallback)
6. **Use TypeScript strictly** - avoid `any`
7. **Keep components small** - single responsibility principle
8. **Extract reusable logic** into custom hooks
9. **Use proper key props** for lists
10. **Test components** with React Testing Library
