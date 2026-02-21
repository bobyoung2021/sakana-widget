# Sakana Widget - Flutter WebView 集成文档

## 概述

本项目是一个基于 React + TypeScript 的 Sakana Widget 实现，设计用于嵌入 Flutter 应用的 WebView 中。通过 JavaScript 注入机制，实现 Flutter 与 Web 页面的双向通信。

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      Flutter App                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    WebView                            │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              React Application                  │  │  │
│  │  │  ┌─────────────────────────────────────────┐    │  │  │
│  │  │  │          Sakana Widget                  │    │  │  │
│  │  │  │  - 动画渲染                             │    │  │  │
│  │  │  │  - 物理模拟                             │    │  │  │
│  │  │  │  - 拖拽交互                             │    │  │  │
│  │  │  └─────────────────────────────────────────┘    │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 通信接口

### 1. 图片传递

#### 方式一：URL 参数（初始化时）

Flutter 加载 WebView 时通过 URL 参数传递初始图片：

```dart
// Flutter 端
final webView = WebViewWidget(
  controller: WebViewController()
    ..loadRequest(Uri.parse('https://your-domain.com/?image=$imageUrl')),
);
```

```typescript
// Web 端接收
const urlParams = new URLSearchParams(window.location.search)
const imageUrl = urlParams.get('image') || ''
```

#### 方式二：JavaScript 注入（运行时）

Flutter 通过 `runJavaScript` 调用全局函数动态更新图片：

```dart
// Flutter 端
await webViewController.runJavaScript(
  'window.setImageUrl("https://example.com/avatar.png")'
);
```

```typescript
// Web 端接口定义
window.setImageUrl = (url: string) => void
```

### 2. 摇晃交互

Flutter 监听设备传感器，将摇晃数据传递给 Web 端：

```dart
// Flutter 端
await webViewController.runJavaScript(
  'window.applyShake($x, $y, $z)'
);
```

```typescript
// Web 端接口定义
window.applyShake = (x: number, y: number, z: number) => void
```

| 参数 | 类型 | 描述 |
|------|------|------|
| `x` | number | X轴加速度（左右晃动）→ 小幅度效果 |
| `y` | number | Y轴加速度（前后晃动）→ 大幅度效果 |
| `z` | number | Z轴加速度（上下晃动）→ 计算总强度 |

## 全局接口定义

```typescript
declare global {
  interface Window {
    /**
     * 应用摇晃效果
     * @param x X轴加速度
     * @param y Y轴加速度
     * @param z Z轴加速度
     */
    applyShake: (x: number, y: number, z: number) => void
    
    /**
     * 动态设置角色图片
     * @param url 图片URL地址
     */
    setImageUrl: (url: string) => void
  }
}
```

## Flutter 端集成示例

```dart
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:sensors_plus/sensors_plus.dart';

class SakanaWebView extends StatefulWidget {
  final String? imageUrl;
  
  const SakanaWebView({super.key, this.imageUrl});

  @override
  State<SakanaWebView> createState() => _SakanaWebViewState();
}

class _SakanaWebViewState extends State<SakanaWebView> {
  late final WebViewController _controller;
  
  @override
  void initState() {
    super.initState();
    _initWebView();
    _initShakeSensor();
  }

  void _initWebView() {
    final baseUrl = 'https://your-sakana-widget.com';
    final url = widget.imageUrl != null 
        ? '$baseUrl/?image=${Uri.encodeComponent(widget.imageUrl!)}'
        : baseUrl;
    
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse(url));
  }

  void _initShakeSensor() {
    accelerometerEvents.listen((event) {
      _controller.runJavaScript(
        'window.applyShake(${event.x}, ${event.y}, ${event.z})'
      );
    });
  }

  /// 动态更新图片
  Future<void> updateImage(String url) async {
    await _controller.runJavaScript('window.setImageUrl("$url")');
  }

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: _controller);
  }
}
```

## 摇晃效果计算逻辑

```typescript
// 计算总速度
const totalVelocity = Math.sqrt(x * x + y * y + z * z)

// 忽略小幅度抖动（阈值 1.5）
if (totalVelocity < 1.5) return

// 计算力度系数（上限 15）
const baseMultiplier = Math.min(totalVelocity * 3, 15)

// 映射到 Widget 状态
const forceT = x * baseMultiplier * 0.3  // 旋转力度（较小）
const forceW = y * baseMultiplier * 2.5  // 摆动力度（较大）
```

## Widget 配置参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `character` | string | 'custom' | 角色标识 |
| `autoFit` | boolean | true | 自动适应容器 |
| `controls` | boolean | false | 显示控制按钮 |
| `draggable` | boolean | true | 允许拖拽 |
| `rod` | boolean | true | 显示连接杆 |
| `size` | number | 280 | Widget 尺寸 |
| `stroke.color` | string | '#b0b0b0' | 连接杆颜色 |
| `stroke.width` | number | 8 | 连接杆宽度 |

## 调试日志

Web 端会输出以下日志信息：

| 日志 | 触发时机 |
|------|----------|
| `✅ Sakana Widget 已就绪，等待摇晃数据...` | Widget 初始化完成 |
| `🔄 摇晃: X=..., Y=..., Z=..., 强度=...` | 每次接收到有效摇晃数据 |
| `🖼️ 图片已更新: [url]` | 图片 URL 更新成功 |
| `❌ widget 对象不存在！` | Widget 未初始化时调用接口 |

## 注意事项

1. **跨域问题**：确保图片 URL 允许跨域访问，或配置适当的 CORS 策略
2. **HTTPS**：生产环境建议使用 HTTPS，避免混合内容警告
3. **性能优化**：摇晃数据频率较高，Web 端已内置阈值过滤（< 1.5 忽略）
4. **WebView 配置**：确保 Flutter WebView 启用了 JavaScript 执行权限

## 文件结构

```
sakana/
├── src/
│   ├── App.tsx          # 主组件，包含所有交互逻辑
│   ├── App.css          # 样式文件
│   └── main.tsx         # 入口文件
├── docs/
│   └── FLUTTER_WEBVIEW_INTEGRATION.md  # 本文档
└── package.json
```
