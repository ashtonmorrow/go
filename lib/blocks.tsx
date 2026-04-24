// Render Notion blocks as React-friendly content.
// Minimal coverage: paragraph, heading_1/2/3, bulleted_list_item, numbered_list_item, quote, image, code, divider, callout.

import React from 'react';

function renderRichText(parts: any[]): React.ReactNode {
  return parts.map((t, i) => {
    let el: React.ReactNode = t.plain_text;
    if (t.annotations?.code) el = <code key={i} className="px-1 py-0.5 bg-sand rounded text-[0.9em] font-mono">{el}</code>;
    if (t.annotations?.bold) el = <strong key={i}>{el}</strong>;
    if (t.annotations?.italic) el = <em key={i}>{el}</em>;
    if (t.annotations?.underline) el = <u key={i}>{el}</u>;
    if (t.annotations?.strikethrough) el = <s key={i}>{el}</s>;
    if (t.href) el = <a key={i} href={t.href} target="_blank" rel="noopener noreferrer">{el}</a>;
    return <React.Fragment key={i}>{el}</React.Fragment>;
  });
}

export function renderBlocks(blocks: any[]): React.ReactNode {
  // Collapse consecutive list items into <ul>/<ol>
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item') {
      const tag = b.type === 'bulleted_list_item' ? 'ul' : 'ol';
      const items: any[] = [];
      while (i < blocks.length && blocks[i].type === b.type) {
        items.push(blocks[i]);
        i++;
      }
      result.push(
        React.createElement(
          tag,
          {
            key: `list-${i}`,
            className: tag === 'ul' ? 'list-disc pl-6 space-y-1 my-4 text-ink' : 'list-decimal pl-6 space-y-1 my-4 text-ink',
          },
          items.map((item, idx) => (
            <li key={item.id || idx}>{renderRichText(item[item.type].rich_text)}</li>
          ))
        )
      );
      continue;
    }
    result.push(renderBlock(b, i));
    i++;
  }
  return result;
}

function renderBlock(b: any, key: any): React.ReactNode {
  switch (b.type) {
    case 'paragraph':
      return <p key={b.id || key} className="my-4 text-ink leading-relaxed">{renderRichText(b.paragraph.rich_text)}</p>;
    case 'heading_1':
      return <h2 key={b.id || key} className="text-h1 mt-10 mb-4 text-ink-deep">{renderRichText(b.heading_1.rich_text)}</h2>;
    case 'heading_2':
      return <h3 key={b.id || key} className="text-h2 mt-8 mb-3 text-ink-deep">{renderRichText(b.heading_2.rich_text)}</h3>;
    case 'heading_3':
      return <h4 key={b.id || key} className="text-h3 mt-6 mb-2 text-ink-deep">{renderRichText(b.heading_3.rich_text)}</h4>;
    case 'quote':
      return (
        <blockquote key={b.id || key} className="border-l-4 border-teal pl-4 my-6 text-slate italic">
          {renderRichText(b.quote.rich_text)}
        </blockquote>
      );
    case 'callout':
      return (
        <div key={b.id || key} className="my-6 p-4 rounded bg-cream-soft border border-sand flex gap-3">
          {b.callout.icon?.type === 'emoji' && <span className="text-xl">{b.callout.icon.emoji}</span>}
          <div>{renderRichText(b.callout.rich_text)}</div>
        </div>
      );
    case 'divider':
      return <hr key={b.id || key} className="my-8 border-sand" />;
    case 'code':
      return (
        <pre key={b.id || key} className="my-6 p-4 rounded bg-ink-deep text-cream-soft text-sm overflow-x-auto">
          <code>{b.code.rich_text.map((t: any) => t.plain_text).join('')}</code>
        </pre>
      );
    case 'image':
      const src = b.image.type === 'external' ? b.image.external.url : b.image.file.url;
      const caption = b.image.caption?.length ? b.image.caption.map((t: any) => t.plain_text).join('') : null;
      return (
        <figure key={b.id || key} className="my-6">
          <img src={src} alt={caption || ''} className="w-full rounded" />
          {caption && <figcaption className="mt-2 text-small text-muted text-center">{caption}</figcaption>}
        </figure>
      );
    default:
      return null;
  }
}
