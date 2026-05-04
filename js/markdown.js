/**
 * Minimal, safe Markdown renderer.
 * HTML is escaped first so user content cannot inject markup.
 */
export function md(text) {
  if (!text) return '';

  // Escape HTML
  let t = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Extract fenced code blocks before other processing
  const codeBlocks = [];
  t = t.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code);
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });

  // Headings
  t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  t = t.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  t = t.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Blockquotes (collapse consecutive lines)
  t = t.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  t = t.replace(/<\/blockquote>\n<blockquote>/g, '<br>');

  // Unordered lists
  t = t.replace(/(^|\n)((?:- .+(?:\n|$))+)/g, (_, pre, list) => {
    const items = list.trim().split('\n').map(l => '<li>' + l.replace(/^- /, '') + '</li>').join('');
    return pre + '<ul>' + items + '</ul>';
  });

  // Ordered lists
  t = t.replace(/(^|\n)((?:\d+\. .+(?:\n|$))+)/g, (_, pre, list) => {
    const items = list.trim().split('\n').map(l => '<li>' + l.replace(/^\d+\. /, '') + '</li>').join('');
    return pre + '<ol>' + items + '</ol>';
  });

  // Inline: bold, italic, code, links
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) return `[${label}](${url})`;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Paragraphs: split on double newlines, wrap non-block-level content
  t = t.split(/\n\n+/).map(p => {
    const tr = p.trim();
    if (!tr) return '';
    if (/^<(h[1-6]|ul|ol|blockquote|pre|\x00CODE)/.test(tr)) return tr;
    return '<p>' + tr.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  // Restore code blocks
  t = t.replace(/\x00CODE(\d+)\x00/g, (_, i) => `<pre><code>${codeBlocks[i]}</code></pre>`);

  return t;
}
