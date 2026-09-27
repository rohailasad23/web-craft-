import React from 'react';
import { PlatformContext, usePlatformState } from './platform';

/**
 * The switchboard provider (spec §3/§11/§12/§13).
 *
 * Split out of lib/platform.js on purpose: a file that exports a component
 * alongside plain helpers breaks fast-refresh, and the hook/helpers are what
 * most of the app imports. State and fetch logic stay in platform.js.
 */
export default function PlatformProvider({ children }) {
  const value = usePlatformState();
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}
