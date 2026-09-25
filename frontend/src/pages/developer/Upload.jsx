import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useCatalog } from '../../lib/catalog';
import { useToast } from '../../components/Common/Toast';
import { mediaUrl, formatBytes } from '../../lib/format';
import Footer from '../../components/Common/Footer';

const MAX_ZIP = 25 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_SHOTS = 5;
// Mirrors MAX_TAGS on the server (spec §2).
const MAX_TAGS = 8;
// Mirrors LICENSES on the server (spec §32). The leading '' is the empty
// option in the select and means "not specified" -- it is a real choice, not
// a placeholder the form should silently replace.
const LICENSES = ['', 'MIT', 'Apache 2.0', 'GPL', 'Personal Use', 'Other'];

/**
 * /developer/upload  and  /developer/upload/:id
 *
 * Create or edit a template (spec §6, §12, §13). The archive and images are
 * sent as multipart form data; the server stores the bytes on disk and keeps
 * only a reference in MongoDB.
 */
export default function UploadTemplate() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { categories, technologies, ready } = useCatalog();
  const fileInput = useRef(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    technologies: [],
    tags: [],
    previewUrl: '',
    githubUrl: '',
    // Spec §5 (version) and §32 (licence). Both optional; an empty licence
    // means "not specified" and is the only value the details page will
    // report as missing rather than inventing one.
    version: '1.0.0',
    license: '',
    changelogNotes: '',
  });
  const [archive, setArchive] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const [existingShots, setExistingShots] = useState([]);
  const [customTech, setCustomTech] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!isEdit) return undefined;
    let alive = true;

    api
      .get(`/api/templates/mine`)
      .then((res) => {
        if (!alive) return;
        const found = res.data.templates.find((t) => t._id === id);
        if (!found) {
          setError('Template not found in your submissions.');
          return;
        }
        setForm({
          title: found.title || '',
          description: found.description || '',
          category: found.category || '',
          technologies: found.technologies || [],
          tags: found.tags || [],
          previewUrl: found.previewUrl || '',
          githubUrl: found.githubUrl || '',
          version: found.version || '1.0.0',
          license: found.license || '',
          changelogNotes: '',
        });
        setThumbnailUrl(found.thumbnail || '');
        setExistingShots(found.screenshots || []);
      })
      .catch((err) => setError(getErrorMessage(err, 'Could not load this template')))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [id, isEdit]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const toggleTech = (tech) =>
    setForm((f) => ({
      ...f,
      technologies: f.technologies.includes(tech)
        ? f.technologies.filter((t) => t !== tech)
        : [...f.technologies, tech].slice(0, 10),
    }));

  const addCustomTech = () => {
    const value = customTech.trim();
    if (!value) return;
    if (!form.technologies.includes(value)) {
      setForm((f) => ({
        ...f,
        technologies: [...f.technologies, value.slice(0, 30)].slice(0, 10),
      }));
    }
    setCustomTech('');
  };

  // Spec §2: tags are typed rather than picked, because the list is whatever
  // developers have written -- there is no fixed set to render buttons for.
  // Commas split, so "one page, dark mode" lands as two tags in one keystroke.
  const addTag = () => {
    const parts = tagDraft
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;

    // Worked out before the update so anything the cap refuses to take can be
    // handed straight back: emptying the box would quietly eat those tags.
    const next = [...form.tags];
    const rejected = [];
    parts.forEach((part) => {
      const value = part.slice(0, 30);
      if (next.includes(value)) return;
      if (next.length >= MAX_TAGS) rejected.push(value);
      else next.push(value);
    });

    setForm((f) => ({ ...f, tags: next }));
    setTagDraft(rejected.join(', '));
  };

  const removeTag = (tag) =>
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));

  const errors = useMemo(() => {
    const out = {};
    if (touched) {
      if (!form.title.trim()) out.title = 'A title is required';
      else if (form.title.trim().length > 120) out.title = 'Keep the title under 120 characters';
      if (form.description.trim().length < 10)
        out.description = 'Write at least 10 characters so people know what they get';
      if (!form.category) out.category = 'Choose a category';
      if (form.technologies.length === 0) out.technologies = 'Pick at least one technology';
      if (!isEdit && !archive) out.archive = 'Upload the .zip file';
      // Spec §5 -- loose on purpose: nothing parses or diffs this string, so
      // "it looks like a version" is the only bar worth setting.
      if (!/^\d[\dA-Za-z.\-+]{0,19}$/.test(form.version.trim())) {
        out.version = 'Version should look like 1.0.0';
      }
    }
    return out;
  }, [form, touched, archive, isEdit]);

  const pickFile = (setter, maxSize, label) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > maxSize) {
      const msg = `${label} is too large (max ${Math.round(maxSize / 1024 / 1024)}MB)`;
      setError(msg);
      toast.error(msg);
      return;
    }
    setError('');
    setter(file);
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (saving) return;

    if (
      !form.title.trim() ||
      form.description.trim().length < 10 ||
      !form.category ||
      form.technologies.length === 0 ||
      (!isEdit && !archive)
    ) {
      setError('Please fix the highlighted fields before submitting.');
      return;
    }

    // Spec §5: checked here so the message is about *this* field rather than
    // a generic "fix the highlighted fields" with nothing visibly wrong.
    if (!/^\d[\dA-Za-z.\-+]{0,19}$/.test(form.version.trim())) {
      setError('Version should look like 1.0.0 (1.0, 2.1.4 and 1.1.0-beta are all fine).');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setError('');

    try {
      const body = new FormData();
      body.set('title', form.title.trim());
      body.set('description', form.description.trim());
      body.set('category', form.category);
      body.set('technologies', JSON.stringify(form.technologies));
      body.set('tags', JSON.stringify(form.tags));
      body.set('previewUrl', form.previewUrl.trim());
      body.set('githubUrl', form.githubUrl.trim());
      body.set('version', form.version.trim());
      body.set('license', form.license);
      // Spec §6: an optional note about what changed, only on an edit. An
      // empty box sends nothing, so no empty changelog entry is written.
      if (isEdit && form.changelogNotes.trim()) {
        body.set('changelogNotes', form.changelogNotes.trim());
      }

      if (archive) body.set('file', archive, archive.name);
      if (thumbnail) body.set('thumbnail', thumbnail, thumbnail.name);
      // append: FormData.set() replaces an existing key of the same name.
      screenshots.forEach((shot) => body.append('screenshots', shot, shot.name));

      const res = isEdit
        ? await api.put(`/api/templates/${id}`, body)
        : await api.post('/api/templates', body);

      const saved = res.data.template;
      toast.success(isEdit ? 'Template updated' : 'Template published');
      navigate(`/templates/${saved.slug}`, { replace: true });
    } catch (err) {
      const msg = getErrorMessage(
        err,
        isEdit ? 'Could not save changes' : 'Could not publish this template'
      );
      setError(msg);
      toast.error(msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-6">
        <div className="ui-skeleton h-6 w-56" />
        <div className="ui-skeleton mt-6 aspect-[16/10] !rounded-2xl" />
        <div className="ui-skeleton mt-4 h-40 !rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-10 sm:px-6">
        <header className="animate-fade-up">
          <span className="ui-eyebrow">Developer workspace</span>
          <h1 className="ui-title mt-2 text-3xl sm:text-4xl">
            {isEdit ? 'Edit template' : 'Upload a template'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            {isEdit
              ? 'Update the details below. Leave the file fields empty to keep what is already there.'
              : 'Package your project as a .zip, add a thumbnail, and it will be listed in the public library.'}
          </p>
        </header>

        {error && (
          <div className="ui-alert ui-alert--error mt-6" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-8 space-y-6" noValidate>
          {/* --------------------------------------------------- basics */}
          <section className="ui-card space-y-5 p-6">
            <h2 className="text-base font-bold text-ink-900">Basics</h2>

            <Field label="Title" error={errors.title} htmlFor="title">
              <input
                id="title"
                type="text"
                value={form.title}
                onChange={update('title')}
                maxLength={120}
                placeholder="Nordic Portfolio"
                className="ui-input"
                aria-invalid={Boolean(errors.title)}
              />
            </Field>

            <Field
              label="Description"
              error={errors.description}
              htmlFor="description"
              hint="What is it for, and what makes it useful?"
            >
              <textarea
                id="description"
                value={form.description}
                onChange={update('description')}
                rows={5}
                maxLength={4000}
                placeholder="A calm, editorial portfolio with large type, generous whitespace and a dark-mode toggle…"
                className="ui-input resize-y"
                aria-invalid={Boolean(errors.description)}
              />
            </Field>

            <Field label="Category" error={errors.category} htmlFor="category">
              <select
                id="category"
                value={form.category}
                onChange={update('category')}
                className="ui-input"
                aria-invalid={Boolean(errors.category)}
              >
                <option value="">Choose a category…</option>
                {(categories || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          {/* ---------------------------------------------- technologies */}
          <section className="ui-card space-y-4 p-6">
            <div>
              <h2 className="text-base font-bold text-ink-900">Technologies</h2>
              <p className="mt-1 text-xs text-ink-500">
                Pick the ones that apply, or add your own. Up to 10.
              </p>
            </div>

            {ready && technologies?.length > 0 && (
              <div className="stagger flex flex-wrap gap-2">
                {technologies.map((tech) => {
                  const active = form.technologies.includes(tech);
                  return (
                    <button
                      key={tech}
                      type="button"
                      onClick={() => toggleTech(tech)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${
                        active
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700'
                      }`}
                    >
                      {active ? '✓ ' : ''}
                      {tech}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={customTech}
                onChange={(e) => setCustomTech(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomTech();
                  }
                }}
                maxLength={30}
                placeholder="Add your own (e.g. TypeScript)"
                aria-label="Add a technology"
                className="ui-input"
              />
              <button type="button" onClick={addCustomTech} className="ui-btn ui-btn--soft shrink-0">
                Add
              </button>
            </div>

            {form.technologies.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {form.technologies.map((tech) => (
                  <li key={tech}>
                    <button
                      type="button"
                      onClick={() => toggleTech(tech)}
                      aria-label={`Remove ${tech}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      {tech} <span aria-hidden>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {errors.technologies && <FieldError message={errors.technologies} />}
          </section>

          {/* ------------------------------------------------------ tags */}
          <section className="ui-card space-y-4 p-6">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold text-ink-900">Tags</h2>
                {/* Live count, so the 8-tag cap is never a surprise (spec §2). */}
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    form.tags.length >= MAX_TAGS ? 'text-red-600' : 'text-ink-500'
                  }`}
                  aria-live="polite"
                >
                  {form.tags.length}/{MAX_TAGS}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                Optional keywords describing what the template is like — “one page”, “dark mode”,
                “animated”. They feed search and the tag filter. Up to 8.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                maxLength={64}
                placeholder="one page, dark mode, animated"
                aria-label="Add tags"
                className="ui-input"
              />
              <button type="button" onClick={addTag} className="ui-btn ui-btn--soft shrink-0">
                Add
              </button>
            </div>

            {form.tags.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {form.tags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      #{tag} <span aria-hidden>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------------------------------------------------- files */}
          <section className="ui-card space-y-5 p-6">
            <div>
              <h2 className="text-base font-bold text-ink-900">Files</h2>
              <p className="mt-1 text-xs text-ink-500">
                .zip up to 25MB · images up to 5MB · up to 5 screenshots
              </p>
            </div>

            <Field
              label="Template archive"
              error={errors.archive}
              hint={isEdit ? 'Leave empty to keep the current archive.' : undefined}
            >
              <div
                onClick={() => fileInput.current?.click()}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 transition-colors ${
                  archive
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-ink-200 bg-ink-50 hover:border-brand-300 hover:bg-brand-50/50'
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {archive ? '📦' : '📁'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">
                    {archive ? archive.name : 'Click to choose a .zip file'}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {archive ? formatBytes(archive.size) : 'Your project source, packaged as a zip'}
                  </span>
                </span>
                {archive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setArchive(null);
                    }}
                    aria-label="Remove selected archive"
                    className="ui-btn ui-btn--ghost !px-2.5 !py-1.5 !text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={pickFile(setArchive, MAX_ZIP, 'Archive')}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Thumbnail" hint="Optional — one is generated if you skip it.">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 p-3 transition-colors hover:border-brand-300">
                  {(thumbnail || thumbnailUrl) && (
                    <img
                      src={thumbnail ? URL.createObjectURL(thumbnail) : mediaUrl(thumbnailUrl)}
                      alt=""
                      className="h-14 w-20 rounded-lg object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <span className="min-w-0 flex-1 text-xs text-ink-500">
                    <span className="block truncate font-semibold text-ink-700">
                      {thumbnail
                        ? thumbnail.name
                        : thumbnailUrl
                          ? 'Current thumbnail'
                          : 'No thumbnail'}
                    </span>
                    <span className="mt-0.5 block">PNG / JPG / WebP · max 5MB</span>
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={pickFile(setThumbnail, MAX_IMAGE, 'Thumbnail')}
                  />
                </label>
              </Field>

              <Field
                label="Screenshots"
                hint={`${screenshots.length + existingShots.length} of ${MAX_SHOTS} used`}
              >
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 p-3 transition-colors hover:border-brand-300">
                  <span className="text-xl" aria-hidden>
                    🖼
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-ink-500">
                    <span className="block truncate font-semibold text-ink-700">
                      {screenshots.length ? `${screenshots.length} new selected` : 'Add screenshots'}
                    </span>
                    <span className="mt-0.5 block">Up to {MAX_SHOTS} images</span>
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const chosen = Array.from(e.target.files || []);
                      e.target.value = '';
                      const room = MAX_SHOTS - existingShots.length - screenshots.length;
                      const accepted = chosen
                        .filter((f) => f.size <= MAX_IMAGE)
                        .slice(0, Math.max(0, room));
                      if (accepted.length < chosen.length) {
                        toast.info(`Only ${accepted.length} screenshot(s) added — limit is ${MAX_SHOTS}.`);
                      }
                      if (accepted.length) setScreenshots((s) => [...s, ...accepted]);
                    }}
                  />
                </label>
              </Field>
            </div>

            {(screenshots.length > 0 || existingShots.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {existingShots.map((src) => (
                  <span key={src} className="relative">
                    <img
                      src={mediaUrl(src)}
                      alt=""
                      className="h-16 w-24 rounded-lg object-cover ring-1 ring-ink-100"
                    />
                    <span className="absolute right-1 top-1 rounded-md bg-ink-900/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      current
                    </span>
                  </span>
                ))}
                {screenshots.map((f, i) => (
                  <span key={f.name + i} className="relative">
                    <img
                      src={URL.createObjectURL(f)}
                      alt=""
                      className="h-16 w-24 rounded-lg object-cover ring-1 ring-brand-200"
                    />
                    <button
                      type="button"
                      onClick={() => setScreenshots((s) => s.filter((_, idx) => idx !== i))}
                      aria-label={`Remove screenshot ${i + 1}`}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-xs font-bold text-white shadow-soft hover:bg-red-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* ------------------------------------------------ links */}
          <section className="ui-card space-y-5 p-6">
            <h2 className="text-base font-bold text-ink-900">
              Links <span className="text-sm font-normal text-ink-500">(optional)</span>
            </h2>

            <Field label="Live demo" htmlFor="previewUrl" hint="A public URL where the template runs.">
              <input
                id="previewUrl"
                type="url"
                value={form.previewUrl}
                onChange={update('previewUrl')}
                placeholder="https://example.com"
                className="ui-input"
              />
            </Field>

            <Field label="GitHub repository" htmlFor="githubUrl">
              <input
                id="githubUrl"
                type="url"
                value={form.githubUrl}
                onChange={update('githubUrl')}
                placeholder="https://github.com/you/project"
                className="ui-input"
              />
            </Field>
          </section>

          {/* ------------------------------------------------ release info */}
          {/* Spec §5 (version), §32 (licence) and §6 (changelog note). All
              optional on purpose: a developer who does not track versions
              should not be blocked from publishing, and an empty licence has
              to stay "not specified" rather than be filled in for them. */}
          <section className="ui-card space-y-5 p-6">
            <h2 className="text-base font-bold text-ink-900">
              Release details <span className="text-sm font-normal text-ink-500">(optional)</span>
            </h2>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Version"
                htmlFor="version"
                hint="Shown on the template page."
                error={errors.version}
              >
                <input
                  id="version"
                  value={form.version}
                  onChange={update('version')}
                  placeholder="1.0.0"
                  className="ui-input"
                />
              </Field>

              <Field label="License" htmlFor="license" hint="Leave as “Not specified” if none applies.">
                <select
                  id="license"
                  value={form.license}
                  onChange={update('license')}
                  className="ui-input"
                >
                  <option value="">Not specified</option>
                  {LICENSES.filter(Boolean).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Only meaningful once there is a previous version to differ from. */}
            {isEdit && (
              <Field
                label="What changed in this version?"
                htmlFor="changelogNotes"
                hint="One point per line. Leave blank to record nothing."
              >
                <textarea
                  id="changelogNotes"
                  rows={4}
                  value={form.changelogNotes}
                  onChange={update('changelogNotes')}
                  className="ui-input"
                  placeholder={'Faster hero animation\nFixed the mobile navigation'}
                />
              </Field>
            )}
          </section>

          {/* ------------------------------------------------ submit */}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="ui-btn ui-btn--primary !px-7 !py-3">
              {saving ? (
                <>
                  <span className="ui-spinner" aria-hidden /> {isEdit ? 'Saving…' : 'Publishing…'}
                </>
              ) : isEdit ? (
                'Save changes'
              ) : (
                <>
                  <span aria-hidden>↑</span> Publish template
                </>
              )}
            </button>
            <Link
              to={isEdit ? '/developer/templates' : '/developer'}
              className="ui-btn ui-btn--soft !px-5 !py-3"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>

      <Footer />
    </div>
  );
}

function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="ui-label">
        {label} {hint && <span className="font-normal text-ink-500">— {hint}</span>}
      </label>
      {children}
      {error && <FieldError message={error} />}
    </div>
  );
}

function FieldError({ message }) {
  return (
    <p className="mt-2 text-xs font-semibold text-red-600" role="alert">
      {message}
    </p>
  );
}
