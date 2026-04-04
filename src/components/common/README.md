# Common Components

此目录包含所有基础UI组件，每个组件一个文件。

## 组件列表

### 表单控件
- **Button.tsx** - 基础按钮组件，支持多种变体
- **ImageButton.tsx** - 图标按钮组件
- **Switch.tsx** - 开关组件
- **Checkbox.tsx** - 复选框组件
- **Select.tsx** - 下拉选择组件
- **Slider.tsx** - 单滑块组件
- **DualSlider.tsx** - 双滑块组件
- **SettingSlider.tsx** - 带数值显示的设置滑块
- **ColorPicker.tsx** - 颜色选择器组件
- **SegmentedControl.tsx** - 分段选择器组件

### 布局组件
- **PanelSection.tsx** - 面板分组标题组件

## 使用方式

### 从统一入口导入
```tsx
import { Button, Switch, Slider } from './common';
```

### 从独立文件导入
```tsx
import { Button } from './common/Button';
```

### 所有组件都支持
- CSS类名（使用全局CAD样式系统）
- CSS变量（支持亮色/暗色模式）
- TypeScript类型导出

## 样式系统

所有组件使用全局CSS变量：
- `--bg-primary` - 主背景色
- `--bg-panel` - 面板背景色
- `--text-primary` - 主文本色
- `--text-secondary` - 次要文本色
- `--accent` - 强调色
- `--border-color` - 边框色

## 示例

```tsx
import { Button, Switch, Slider } from './common';

export const MyComponent = () => {
  return (
    <div>
      <Button variant="primary" onClick={() => console.log('click')}>
        点击我
      </Button>
      
      <Switch 
        checked={true}
        onChange={(checked) => console.log(checked)}
      />
      
      <Slider
        min={0}
        max={100}
        value={50}
        onChange={(value) => console.log(value)}
      />
    </div>
  );
};
```
