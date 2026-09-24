import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mediaUrl, formatCount } from '../../lib/format';
import { useSession } from '../../lib/session';
import { downloadTemplate } from '../../lib/download';
import { useToast } from '../Common/Toast';

/**
 * One template in a grid (spec §8): thumbnail, name, short description, category,
 * technologies, developer, download count and details / preview / download buttons.
 */
export default function TemplateCard({ template, onDownloaded }) {
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!template) return null;

  const handleDownload = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    if (!isAuthenticated) {
      toast.info('Please log in to download this template.');
      navigate('/login');
      return;
    }

    setBusy(true);
    try {
      await downloadTemplate(template);
      toast.success(`Downloading “${template.title}”`);
      onDownloaded?.(template);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const authorId = template.author?._id ?? template.author;

  return (
    <article className="ui-card ui-card--hover group flex flex-col overflow-hidden">
      <Link
        to={`/templates/${template.slug}`}
        className="relative block aspect-[16/10] overflow-hidden bg-ink-100"
        aria-label={`View ${template.title}`}
      >
        <img
          src={mediaUrl(template.thumbnail)}
          alt={`${template.title} preview`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-700 shadow-soft backdrop-blur">
          {template.category}
        </span>
        {(template.downloadCount || 0) > 0 && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink-900/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            ↓ {formatCount(template.downloadCount)}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link to={`/templates/${template.slug}`}>
          <h3 className="ui-title text-base leading-snug transition-colors group-hover:text-brand-700">
            {template.title}
          </h3>
        </Link>

        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-500">
          {template.description}
        </p>

        {template.technologies?.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {template.technologies.slice(0, 4).map((tech) => (
              <li
                key={tech}
                className="rounded-md border border-ink-100 bg-ink-50 px-2 py-0.5 text-[11px] font-semibold text-ink-700"
              >
                {tech}
              </li>
            ))}
            {template.technologies.length > 4 && (
              <li className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-ink-500">
                +{template.technologies.length - 4}
              </li>
            )}
          </ul>
        )}

        <div className="mt-4 flex items-center gap-3 border-t border-ink-100 pt-3.5">
          {authorId ? (
            <Link
              to={`/developers/${authorId}`}
              className="truncate text-xs font-semibold text-ink-500 transition-colors hover:text-brand-700"
            >
              {template.authorName}
            </Link>
          ) : (
            <span className="truncate text-xs font-semibold text-ink-500">{template.authorName}</span>
          )}

          <span className="ml-auto shrink-0 text-xs font-semibold text-ink-500">
            ↓ {formatCount(template.downloadCount)} download
            {(template.downloadCount || 0) === 1 ? '' : 's'}
          </span>
        </div>

        {/* Spec §8: details + preview + download, side by side and always reachable. */}
        <div className="mt-3 flex gap-2">
          <Link
            to={`/templates/${template.slug}`}
            className="ui-btn ui-btn--soft flex-1 !px-2 !py-1.5 !text-[11px]"
          >
            Details
          </Link>

          {template.previewUrl ? (
            <a
              href={template.previewUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="ui-btn ui-btn--ghost flex-1 !px-2 !py-1.5 !text-[11px]"
            >
              Preview
            </a>
          ) : (
            <Link
              to={`/templates/${template.slug}`}
              className="ui-btn ui-btn--ghost flex-1 !px-2 !py-1.5 !text-[11px]"
            >
              Preview
            </Link>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className="ui-btn ui-btn--primary flex-1 !px-2 !py-1.5 !text-[11px]"
          >
            {busy ? <span className="ui-spinner" aria-hidden /> : <span aria-hidden>↓</span>}
            {busy ? '…' : 'Download'}
          </button>
        </div>
      </div>
    </article>
  );
}
