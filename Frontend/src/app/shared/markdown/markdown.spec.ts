import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('met en forme gras, italique, code et lien', () => {
    expect(renderMarkdown('**gras** et *italique* et `code`')).toBe(
      '<p><strong>gras</strong> et <em>italique</em> et <code>code</code></p>',
    );
    expect(renderMarkdown('[Angular](https://angular.dev)')).toBe(
      '<p><a href="https://angular.dev" target="_blank" rel="noopener noreferrer">Angular</a></p>',
    );
  });

  it('échappe tout HTML saisi', () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuse les liens qui ne sont pas en http(s)', () => {
    const html = renderMarkdown('[piège](javascript:alert(1))');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href');
  });

  it('gère les listes, les paragraphes et les sauts de ligne', () => {
    expect(renderMarkdown('- un\n- deux\n\nfin\nsuite')).toBe('<ul><li>un</li><li>deux</li></ul><p>fin<br>suite</p>');
  });

  it('conserve les blocs de code sans mise en forme', () => {
    expect(renderMarkdown('```\nconst a = **1**;\n```')).toBe('<pre><code>const a = **1**;</code></pre>');
  });

  it('referme un bloc de code resté ouvert', () => {
    expect(renderMarkdown('```\nligne')).toBe('<pre><code>ligne</code></pre>');
  });
});
