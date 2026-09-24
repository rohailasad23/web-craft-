import { createContext, useContext } from 'react';

/**
 * Who is logged in right now.
 *
 * App.jsx owns the state (and the localStorage persistence); everything below
 * reads it through this context instead of threading `user`/`isAuthenticated`
 * through five levels of props.
 */
export const SessionContext = createContext({
  isAuthenticated: false,
  user: null,
  login: () => {},
  logout: () => {},
});

export const useSession = () => useContext(SessionContext);
