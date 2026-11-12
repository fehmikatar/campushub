const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Mise en forme en ligne : code, gras, italique, liens http(s). Le texte est déjà échappé. */
function inline(escaped: string): string {
  return escaped
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/**
 * Markdown simplifié vers HTML pour les messages du forum : blocs de code, listes, paragraphes, gras, italique,
 * code et liens. Tout le texte est échappé avant la mise en forme : aucun HTML saisi n'est conservé.
 */
export function renderMarkdown(source: string): string {
  const lines = escapeHtml(source.replace(/\r\n?/g, '\n')).split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (code === null) {
        flushParagraph();
        flushList();
        code = [];
      } else {
        html.push(`<pre><code>${code.join('\n')}</code></pre>`);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      list.push(item[1]);
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  if (code !== null) {
    html.push(`<pre><code>${code.join('\n')}</code></pre>`);
  }
  flushParagraph();
  flushList();
  return html.join('');
}
