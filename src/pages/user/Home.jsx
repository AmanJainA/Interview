import { useEffect, useState } from 'react';
import { db } from '../../supabaseClient';

const ALLOWED_TAGS = new Set(['P','BR','H1','H2','H3','B','STRONG','I','EM','U','UL','OL','LI','A']);
const ALLOWED_ATTRS = new Set(['href','target','rel']);

function sanitizeRichHtml(input) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(input || ''), 'text/html');

  function clean(node) {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        return;
      }
      const tag = child.tagName;
      if (!ALLOWED_TAGS.has(tag)) {
        if (tag === 'DIV' || tag === 'SPAN') {
          const parent = child.parentNode;
          while (child.firstChild) parent.insertBefore(child.firstChild, child);
          child.remove();
        } else {
          child.replaceWith(document.createTextNode(child.textContent || ''));
        }
        return;
      }
      [...child.attributes].forEach((attr) => {
        if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) child.removeAttribute(attr.name);
      });
      if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        const allowed = /^(https?:|mailto:|tel:)/i.test(href);
        if (!allowed) child.removeAttribute('href');
        else {
          if (!/^tel:/i.test(href)) child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer');
        }
      }
      clean(child);
    });
  }

  clean(doc.body);
  return doc.body.innerHTML;
}

function renderContent(value) {
  const raw = String(value || '');
  if (!/<\/?(h1|h2|h3|p|br|b|strong|i|em|u|ul|ol|li|a)\b/i.test(raw)) {
    const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const linked = escaped.replace(/(\+?\d[\d\s().-]{8,}\d)/g, '<a href="tel:$1">📞 $1</a>');
    return linked.replace(/\r?\n/g, '<br />');
  }
  return sanitizeRichHtml(raw);
}

export default function Home() {
  const [info, setInfo] = useState({ about: '', instructions: '' });

  useEffect(() => {
    db('company_info')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data }) => data && setInfo(data));
  }, []);

  return (
    <div className="row">
      <div className="col-md-6 mb-4">
        <div className="card h-100 shadow-sm">
          <div className="card-body">
            <h5 className="card-title">About the company</h5>
            <div className="company-rich-content" dangerouslySetInnerHTML={{ __html: renderContent(info.about) }} />
          </div>
        </div>
      </div>
      <div className="col-md-6 mb-4">
        <div className="card h-100 shadow-sm">
          <div className="card-body">
            <h5 className="card-title">Instructions</h5>
            <div className="company-rich-content" dangerouslySetInnerHTML={{ __html: renderContent(info.instructions) }} />
          </div>
        </div>
      </div>
    </div>
  );
}
