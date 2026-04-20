// 表格单元格换行持久化（参考 Typora 的思路）
//
// 背景：Lute 在 DOM <-> Markdown 转换时，会把表格 cell 中的 <br>/<br />
// 当作软换行吞掉，导致源码里无法保存换行，刷新后丢失。
//
// 方案：在进入 Lute 之前，把 cell 中的 <br> 统一替换成一个纯文本占位符，让
// Lute 作为普通文本原样透传；Lute 处理完后，再把占位符恢复为真正的 <br />
// （写进 Markdown 源码）或 <br> DOM 节点（用于 WYSIWYG 显示）。

export const TABLE_BR_PLACEHOLDER = "VDITOR-TABLE-BR-PLACEHOLDER-9C3F7D";

// 把 HTML 字符串中表格 cell 里的 <br> 替换为占位符文本，再返回新的 HTML。
export const encodeTableCellBrInHTML = (html: string): string => {
    if (!html || html.indexOf("<br") === -1) {
        return html;
    }
    const container = document.createElement("div");
    container.innerHTML = html;
    let changed = false;
    container.querySelectorAll("td, th").forEach((cell) => {
        cell.querySelectorAll("br").forEach((br) => {
            br.replaceWith(document.createTextNode(TABLE_BR_PLACEHOLDER));
            changed = true;
        });
    });
    return changed ? container.innerHTML : html;
};

// 把 Markdown 源码中的占位符还原成 <br />（真正写入源码）。
export const decodeTableCellBrInMarkdown = (markdown: string): string => {
    if (!markdown || markdown.indexOf(TABLE_BR_PLACEHOLDER) === -1) {
        return markdown;
    }
    return markdown.split(TABLE_BR_PLACEHOLDER).join("<br />");
};

// 把 HTML（或 DOM element）里表格 cell 内的占位符还原成真正的 <br> 节点。
export const decodeTableCellBrInHTML = (html: string): string => {
    if (!html || html.indexOf(TABLE_BR_PLACEHOLDER) === -1) {
        return html;
    }
    return html.split(TABLE_BR_PLACEHOLDER).join("<br>");
};

export const decodeTableCellBrInElement = (element: Element | null | undefined) => {
    if (!element) {
        return;
    }
    element.querySelectorAll("td, th").forEach((cell) => {
        if (cell.innerHTML.indexOf(TABLE_BR_PLACEHOLDER) !== -1) {
            cell.innerHTML = cell.innerHTML.split(TABLE_BR_PLACEHOLDER).join("<br>");
        }
    });
};

// 把 Markdown 源码里字面量的 <br />、<br/>、<br> 替换为占位符，便于 Lute 将其
// 当普通文本透传保留到表格 cell 中（随后再还原为 DOM 中的 <br> 节点）。
export const encodeTableCellBrInMarkdown = (md: string): string => {
    if (!md || md.indexOf("<br") === -1) {
        return md;
    }
    return md.replace(/<br\s*\/?\s*>/gi, TABLE_BR_PLACEHOLDER);
};

// SV 模式展示的是“源码文本”，因此占位符应还原为字面量 HTML 标签文本，而不是
// 真正的 <br> 节点；否则 textContent 会丢失该标签内容。
export const decodeTableCellBrInSVHTML = (html: string): string => {
    if (!html || html.indexOf(TABLE_BR_PLACEHOLDER) === -1) {
        return html;
    }
    return html.split(TABLE_BR_PLACEHOLDER).join("&lt;br /&gt;");
};
