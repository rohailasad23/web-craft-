import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import Canvas from './Canvas';
import Toolbar from './Toolbar';
import api, { getErrorMessage } from '../../lib/api';

const SAVE_DEBOUNCE_MS = 600;

/** Apply an edit to local state immediately, without waiting for the server. */
function applyOptimistic(page, sectionId, updates) {
  if (!page?.currentState?.sections) return page;
  return {
    ...page,
    currentState: {
      ...page.currentState,
      sections: page.currentState.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              content: { ...section.content, ...(updates.content || {}) },
              styling: { ...section.styling, ...(updates.styling || {}) },
            }
          : section
      ),
    },
  };
}

/** Apply a colour change locally, including on sections that carry it. */
function applyOptimisticColor(page, color) {
  if (!page) return page;
  return {
    ...page,
    colorScheme: color,
    currentState: {
      ...page.currentState,
      sections: (page.currentState?.sections || []).map((section) =>
        section.styling?.backgroundColor
          ? { ...section, styling: { ...section.styling, backgroundColor: color } }
          : section
      ),
    },
  };
}

export default function MainEditor() {
  const { id } = useParams();
  const [lpData, setLpData] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');

  // Edits pending per section, so keystrokes coalesce instead of each firing
  // its own PUT (previously one request per keystroke, which made typing lag).
  const queueRef = useRef({});
  const timersRef = useRef({});
  const inFlightRef = useRef(0);
  const mountedRef = useRef(true);
  // Always points at the latest flush; the unmount cleanup reads it through
  // this indirection so it never closes over stale state.
  const flushRef = useRef(async () => {});

  const fetchLandingPage = useCallback(
    async ({ showLoading = false } = {}) => {
      if (showLoading) setLoading(true);
      try {
        const res = await api.get(`/api/editor/${id}`);
        if (!mountedRef.current) return;
        setLpData(res.data);
        setError('');
        setSelectedSection(null);
        setLoading(false);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(getErrorMessage(err, 'Failed to load landing page'));
        setLoading(false);
      }
    },
    [id]
  );

  const flushSection = useCallback(
    async (sectionId) => {
      const updates = queueRef.current[sectionId];
      if (!updates) return;

      delete queueRef.current[sectionId];
      if (timersRef.current[sectionId]) {
        clearTimeout(timersRef.current[sectionId]);
        delete timersRef.current[sectionId];
      }

      inFlightRef.current += 1;
      setSaving(true);
      try {
        const res = await api.put(`/api/editor/${id}/sections`, { sectionId, updates });
        // Reconcile with the server only when nothing newer is still queued --
        // otherwise the response would clobber edits made while in flight.
        if (mountedRef.current && Object.keys(queueRef.current).length === 0) {
          setLpData(res.data);
          setSaveError('');
        }
      } catch (err) {
        if (mountedRef.current) {
          setSaveError(getErrorMessage(err, 'Could not save your changes'));
        }
      } finally {
        inFlightRef.current -= 1;
        if (inFlightRef.current === 0 && mountedRef.current) setSaving(false);
      }
    },
    [id]
  );

  const updateSection = useCallback((sectionId, updates) => {
    // 1. Optimistic: reflect the keystroke instantly.
    setLpData((prev) => applyOptimistic(prev, sectionId, updates));

    // 2. Merge into the pending queue for this section.
    const existing = queueRef.current[sectionId] || {};
    const merged = { content: { ...existing.content, ...(updates.content || {}) } };
    if (existing.styling || updates.styling) {
      merged.styling = { ...existing.styling, ...(updates.styling || {}) };
    }
    queueRef.current[sectionId] = merged;

    // 3. Debounce the network call.
    if (timersRef.current[sectionId]) clearTimeout(timersRef.current[sectionId]);
    timersRef.current[sectionId] = setTimeout(() => flushRef.current(sectionId), SAVE_DEBOUNCE_MS);
  }, []);

  const updateColors = useCallback(
    async (newColor) => {
      // Optimistic: the swatch should respond instantly.
      setLpData((prev) => applyOptimisticColor(prev, newColor));
      try {
        const res = await api.put(`/api/editor/${id}/colors`, { colors: newColor });
        if (mountedRef.current) setLpData(res.data);
      } catch (err) {
        if (mountedRef.current) setSaveError(getErrorMessage(err, 'Could not save the colour'));
      }
    },
    [id]
  );

  // Publish the current flush implementation to the ref (never during render).
  useEffect(() => {
    flushRef.current = flushSection;
  }, [flushSection]);

  // Unmount safety net: flush anything still inside its debounce window so
  // the user's last edits are not silently discarded.
  useEffect(() => {
    const timers = timersRef.current;
    const queue = queueRef.current;
    const flush = (sectionId) => flushRef.current(sectionId);

    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(timers).forEach(clearTimeout);
      timersRef.current = {};
      Object.keys(queue).forEach(flush);
    };
  }, []);

  // Initial load.
  useEffect(() => {
    // Data fetch on mount: every setState runs after `await`, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    fetchLandingPage();
  }, [fetchLandingPage]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading editor…</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center px-4">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => fetchLandingPage({ showLoading: true })}
          className="text-blue-600 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!lpData) return null;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Toolbar lpData={lpData} updateColors={updateColors} saving={saving} />

      {saveError && (
        <div className="bg-red-50 text-red-700 text-sm px-6 py-2 flex items-center justify-between">
          <span>⚠️ {saveError}</span>
          <button
            type="button"
            className="underline ml-4"
            onClick={() => {
              Object.keys(queueRef.current).forEach((sectionId) => flushRef.current(sectionId));
              setSaveError('');
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          lpData={lpData}
          selectedSection={selectedSection}
          setSelectedSection={setSelectedSection}
        />
        <Canvas lpData={lpData} selectedSection={selectedSection} updateSection={updateSection} />
      </div>
    </div>
  );
}
