/**
 * Lightweight markdown slide parser
 * Parses Marp-style markdown (--- separated slides) into HTML
 * No external dependencies - keeps bundle small
 * Supports custom components via <!-- component: {...} --> syntax
 */

export interface ComponentData {
  type: string;
  props: Record<string, unknown>;
}

export interface Slide {
  html: string;
  components?: ComponentData[];
}

/**
 * Parse markdown slides separated by ---
 */
export function parseSlides(markdown: string): Slide[] {
  // Remove frontmatter (between first --- and second ---)
  const withoutFrontmatter = markdown.replace(/^---[\s\S]*?---\n/, '');

  // Split by slide separator
  const rawSlides = withoutFrontmatter
    .split(/\n---\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return rawSlides.map(content => {
    const { html, components } = parseSlideContent(content);
    return { html, components };
  });
}

/**
 * Parse a single slide's content, extracting components
 */
function parseSlideContent(content: string): { html: string; components: ComponentData[] } {
  const components: ComponentData[] = [];

  // Extract component declarations: <!-- component:type {"prop": "value"} -->
  // Note: [\w-]+ allows hyphens in component names like "unit-card"
  // Note: \{[\s\S]*?\} lazily matches JSON props (supports nested arrays/objects)
  const componentPattern = /<!--\s*component:([\w-]+)\s+(\{[\s\S]*?\})\s*-->/g;

  // Replace component declarations with placeholders
  // Use special markers for layout that won't be affected by markdown processing
  const htmlContent = content.replace(
    componentPattern,
    (_, type, propsStr) => {
      // Layout components use special markers (will be replaced after markdown processing)
      if (type === 'two-column-start') {
        return '%%%TWO_COL_START%%%';
      }
      if (type === 'column-break') {
        return '%%%COL_BREAK%%%';
      }
      if (type === 'two-column-end') {
        return '%%%TWO_COL_END%%%';
      }

      // React components get placeholders
      try {
        const props = JSON.parse(propsStr);
        components.push({ type, props });
      } catch {
        console.warn('Failed to parse component props:', propsStr);
      }
      return `<div class="component-placeholder" data-component="${type}" data-props='${propsStr}'></div>`;
    }
  );

  // Render markdown first
  let html = renderMarkdown(htmlContent);

  // Then replace layout markers with actual HTML
  html = html
    .replace(/%%%TWO_COL_START%%%/g, '<div class="slide-two-column"><div class="slide-column">')
    .replace(/%%%COL_BREAK%%%/g, '</div><div class="slide-column">')
    .replace(/%%%TWO_COL_END%%%/g, '</div></div>');

  return {
    html,
    components,
  };
}

/**
 * Minimal markdown to HTML renderer
 * Supports: headers, paragraphs, lists, code blocks, inline code, bold, italic, links, tables
 */
function renderMarkdown(md: string): string {
  let html = md;

  // Code blocks (must be first to protect content)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`;
  });

  // Ensure content ends with newline for consistent parsing
  html = html + '\n';

  // Tables - match rows that start and end with |, handle last row without trailing newline
  html = html.replace(/\n(\|.+\|\n)+/g, (match) => {
    const rows = match.trim().split('\n');
    let table = '<table class="slide-table">';

    rows.forEach((row, i) => {
      // Skip separator row (|---|---|)
      if (row.match(/^\|[\s-:|]+\|$/)) return;

      const cells = row.split('|').filter(c => c.trim());
      const tag = i === 0 ? 'th' : 'td';
      table += '<tr>';
      cells.forEach(cell => {
        table += `<${tag}>${cell.trim()}</${tag}>`;
      });
      table += '</tr>';
    });

    table += '</table>';
    return '\n' + table + '\n';
  });

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Lists (supports one level of nesting via indented sub-items)
  html = html.replace(/(^[ \t]*- .+\n?)+/gm, (block) => {
    let result = '<ul>';
    for (const line of block.split('\n')) {
      if (!line.trim()) continue;
      const match = line.match(/^([ \t]+)?- (.+)$/);
      if (!match) continue;
      const indent = match[1];
      const text = match[2];
      if (indent && indent.length > 0) {
        result += `<ul><li>${text}</li></ul>`;
      } else {
        result += `<li>${text}</li>`;
      }
    }
    result += '</ul>';
    return result;
  });

  // Inline code (after code blocks)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold and italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // HTML comments (remove)
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Paragraphs (lines not already wrapped)
  html = html
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<')) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
