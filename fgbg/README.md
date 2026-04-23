# WYSIWYG 围栏代码块：可编辑高亮实现总结

> 目标：让 ````java` 这样的代码块**直接显示彩色高亮**，且**在高亮上原地编辑**，而不是"编辑时看源码、离开才看颜色"的两段式体验。类似 Typora / MarkText 的感觉。

---

## 一、思路演变（为什么最后选这条路）

走到最终方案前试过两个失败路线，这里记下来做反面教材：

### 失败 1：透明 textarea + 只读高亮层叠加

DOM 上放两个元素，上层是 `textarea`（透明字 + 可见 caret），下层是 `pre.hljs`（只读 HTML）。

问题：

- 两层字体 metrics / tab-size / `white-space` / 换行规则必须**逐像素**一致，稍有 CSS 继承污染光标就错位；
- IME 中文输入框定位会飘；
- 搜索高亮、`::selection` 等选区视觉反馈都要 hack；
- 外层容器如果没显式 `min-height`，而 textarea 又是 `position:absolute`，容器会**塌成 0 高度，整个代码块看不见**（这正是第一次提交后用户看到的"只显示一条细线"症状）。

核心判断：这条路等价于自己在浏览器里实现半个 Monaco，工程量不成比例。

### 失败 2：小"编辑器 island"容器

想做个独立小容器（有自己的 textarea + 高亮层），把 `pre>code` 藏起来只当数据源。

问题：和方案 1 其实是同一类，仍然是叠层；而且多加了一层包装，`getMarkdown` 时要小心不把 island DOM 泄露给 Lute。

### 最终方案：pre>code 自己就是可编辑高亮区（Typora 路线）

**让 `<code>` 自己 contenteditable，输入时节流重算 hljs，重写 innerHTML，再按字符偏移恢复光标。**

核心观察：

1. `contenteditable` 的 `<code>` 元素——字体 metrics、IME、选区、搜索、移动端——**所有细节都是浏览器原生实现的**，不需要我们做任何对齐工作。
2. 重写 innerHTML 会让 Range 失效，但我们可以先把光标换算成"相对 `code` 的 textContent 字符偏移"，再在新 DOM 上用 TreeWalker 按偏移落回 Text 节点 —— 这套在 MarkText/Typora 里也是同款做法。
3. Vditor 导出 Markdown 走 `lute.VditorDOM2Md`，Lute 对 `<pre><code>` 只读 textContent，hljs 加进来的 `<span>` 不会污染 markdown。
4. **唯一不变量：`code.textContent === 源码`**。只要守住它，上层任何渲染都可以随意重建。

---

## 二、架构图

```
用户敲键
   │
   ▼
<code contenteditable> 上监听 input / compositionend / paste
   │
   ▼  节流 80ms
┌─────────────────────────────────────────────────────────────┐
│  repaint(code):                                             │
│    text   = code.textContent                // 唯一真相      │
│    caret  = getCaretOffset(code)            // [start,end]   │
│    html   = hljs.highlight(text, lang)                       │
│    code.innerHTML = html                    // 重建 span    │
│    setCaretOffset(code, caret.start, end)   // 按偏移还原    │
└─────────────────────────────────────────────────────────────┘
   │
   ▼
如果此时用户触发了 Vditor 的顶层 input 链路：
   ├─ input.ts 里"spin 前清洗"：先把 code 里的 span 铲回纯文本
   │                               （wbr 用 \u0001WBR\u0001 占位保留）
   ├─ lute.SpinVditorDOM(editor.innerHTML)    // 得到标准化 DOM
   ├─ setRangeByWbr 恢复光标
   └─ refreshFencedCodeIn(editor, vditor)     // 再次 repaint 上色

getMarkdown 导出：
   lute.VditorDOM2Md(editor.innerHTML)
   //    └─ Lute 对 <pre><code> 只看 textContent，span 被自然忽略
```

---

## 三、关键文件与职责


| 文件                                          | 角色                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/ts/util/processCode.ts`                | **语言决策**：`normalizeCodeLang` 归一、`isNonCodeRenderLanguage` 识别 mermaid/math/echarts 等渲染型语言、`isIslandCodeBlockLanguage` 判断是否走可编辑高亮 |
| `src/ts/wysiwyg/fencedCodeEdit.ts`          | **可编辑高亮的核心**：`refreshFencedCode` / `refreshFencedCodeIn` 对外入口；内部实现 caret 保存/恢复、hljs 调用、防抖重绘、事件绑定                                |
| `src/ts/wysiwyg/renderDomByMd.ts`           | 整体渲染后 → `refreshFencedCodeIn`                                                                                                   |
| `src/ts/wysiwyg/input.ts`                   | spin 前把 code 铲平 + spin 后 `refreshFencedCodeIn`                                                                                  |
| `src/ts/hint/index.ts`                      | 代码块语言 hint 选完后刷新该块                                                                                                              |
| `src/ts/wysiwyg/highlightToolbarWYSIWYG.ts` | toolbar 语言输入框改语言后刷新；**并在全局"藏 pre"循环里跳过可编辑代码块**（bug 修复点之一）                                                                       |
| `src/ts/wysiwyg/processKeydown.ts`          | Esc 分支**跳过可编辑代码块**（bug 修复点）                                                                                                     |
| `src/ts/util/fixBrowserBehavior.ts`         | listIndent / listOutdent 的收尾循环**跳过可编辑代码块**（bug 修复点）                                                                             |
| `src/assets/less/_wysiwyg.less`             | `pre>code` 作为 hljs 容器的视觉样式（背景、padding、等宽、`white-space: pre`、`outline:none`、`caret-color`）                                       |


---

## 四、开发过程中遇到的两个坑

### 坑 1：hljs 的 `<span>` 被 Lute 序列化进了 markdown

现象：打字时彩色显示正常，但一旦触发 Vditor 的 `input` 链路（随便敲个字母），markdown 里的代码块就被塞满了 hljs 的 `<span class="hljs-keyword">public</span>` 之类垃圾。

原因：`input.ts` 会把 `blockElement.outerHTML` 丢给 `lute.SpinVditorDOM`。Lute 对普通内容会保留 inline HTML，看到 span 不会主动丢弃。

修复：**在 spin 之前**遍历所有 `[data-type=code-block] > pre > code`，把它们铲平为纯 Text 节点；同时保留 `<wbr>` 这个光标锚点（用不可见控制字符 `\u0001WBR\u0001` 先占位，拿到 textContent 再切分重建）。

### 坑 2：鼠标移出代码块后，代码块消失

现象：输入时彩色显示正常，点一下外面，代码块整个空白。

原因：`highlightToolbarWYSIWYG.ts` 里有一段历史逻辑 —— 每次光标变化都遍历所有 `.vditor-wysiwyg__preview`，只要当前光标不在某个 `*block` 里面，就把那个块的 `pre` 强制 `display: none`。这套是为 mermaid 的"预览 vs 源码"设计的，对可编辑高亮代码块完全错 —— 把 pre 藏了就等于把代码块藏了。

修复：给可编辑代码块的 DOM 打一个标记 `data-vditor-code-edit="1"`，在所有"遍历到非当前块就藏 pre"的地方先判 `isEditableCodeBlock(block)`，是的就 skip。一共改了三个地方：

- `highlightToolbarWYSIWYG.ts` 的 preview forEach；
- `processKeydown.ts` 的 Esc 分支；
- `fixBrowserBehavior.ts` 的 listIndent/listOutdent 收尾 forEach。

---

## 五、光标如何跨重绘保持

这是整个方案最"玄"的地方，单独讲清楚：

### 保存

```ts
// 伪代码
const pre = range.cloneRange();
pre.selectNodeContents(code);                        // 从 code 开头
pre.setEnd(range.startContainer, range.startOffset); // 到原光标起点
const start = pre.toString().length;                 // 字符偏移
const end   = start + range.toString().length;
```

思路：构造一个"从 code 开头到原光标位置"的子 Range，它的 `toString().length` 就是起点的 textContent offset。终点偏移 = 起点 + 选区长度。这个计算**只依赖 textContent，不依赖 DOM 结构**，所以重建 innerHTML 后还能继续用。

### 恢复

```ts
const walker = doc.createTreeWalker(code, NodeFilter.SHOW_TEXT);
let acc = 0;
let n = walker.nextNode();
while (n) {
    const len = (n as Text).data.length;
    if (start <= acc + len) { /* 起点落在这个 Text 里 */ }
    if (end   <= acc + len) { /* 终点落在这个 Text 里，break */ }
    acc += len;
    n = walker.nextNode();
}
```

TreeWalker 按文档顺序只走 Text 节点；累加 `data.length` 直到覆盖目标偏移，就把 Range 锚在该 Text 上。这样无论 hljs 把 DOM 嵌成几层 span，定位总是线性的、精确的。

越界兜底：如果偏移超过新文本长度（用户删到很短），就 `collapse(false)` 落在末尾，不抛异常。

---

## 六、性能

- 重绘节流 **80ms**：单次按键察觉不到延迟，连击时把多次 input 合成一次 repaint。
- 重绘只对**单个 code 元素**重写 innerHTML，不触碰整个编辑器。
- hljs 本身是增量的，几百行以内的代码块在桌面浏览器上完全感知不到成本。
- 长代码块（上万行）才会开始慢，和 Typora / VSCode 的朴素实现量级一致。有需要时再上 token diff 优化，MVP 不做。

---

## 七、撤销策略（已知限制）

`contenteditable` 的浏览器 undo 栈，在我们重写 innerHTML 的瞬间会被**截断**。也就是说：

- 块内连续打几个字 → 浏览器会把它们合并成一条 undo record；
- 但触发一次 repaint 后，之前的 undo record 就不能再回到更早的状态了。

MarkText / Typora 的朴素实现也有同样问题，都是通过"自己维护 undo 栈"来解决。MVP 暂不做，接受这个限制。后续如果要做，可以在每次 repaint 前把 `{text, caret}` 推进自定义栈。

---

## 八、未来可能的优化


| 方向        | 说明                                                |
| --------- | ------------------------------------------------- |
| 自研 undo 栈 | 解决 repaint 截断浏览器 undo 的问题                         |
| 行号        | 在 `code::before` 上用 CSS counter 轻量实现              |
| 语法错误下划线   | 对 `ignoreIllegals: true` 返回的 result.illegal 段落加装饰 |
| 代码折叠      | 需要更重的 DOM 结构，超出 MVP                               |
| 虚拟滚动      | 超长代码块场景，重写 innerHTML 会慢，可做"可视区域 + 缓存区"渲染          |


---

## 九、验证清单

- `java` / `json` / `python` / `rust` 等打字实时上色；
- 鼠标移出代码块后仍保持高亮显示（不再消失）；
- `mermaid` / `math` 未受影响，仍走渲染预览；
- 从编程语言切到 mermaid 再切回来，显隐状态正确；
- 粘贴带 HTML 的代码片段，只保留纯文本（不污染 `code.textContent`）；
- 导出 Markdown 不包含 hljs span；
- 中文输入（IME）能正常上屏与触发重绘；
- `npx tsc --noEmit` 0 错，`npx webpack` 仅 size warning。

---

## 十、文件清单速查

**新增**：

- `src/ts/wysiwyg/fencedCodeEdit.ts`

**修改**：

- `src/ts/util/processCode.ts`（+ 语言决策工具）
- `src/ts/wysiwyg/renderDomByMd.ts`（+ refreshFencedCodeIn）
- `src/ts/wysiwyg/input.ts`（+ spin 前清洗 / spin 后 refresh）
- `src/ts/hint/index.ts`（+ 选语言后 refresh）
- `src/ts/wysiwyg/highlightToolbarWYSIWYG.ts`（+ toolbar 改语言后 refresh、+ forEach 跳过可编辑块）
- `src/ts/wysiwyg/processKeydown.ts`（Esc 跳过可编辑块）
- `src/ts/util/fixBrowserBehavior.ts`（listIndent/Outdent 跳过可编辑块）
- `src/assets/less/_wysiwyg.less`（可编辑代码块视觉样式）

