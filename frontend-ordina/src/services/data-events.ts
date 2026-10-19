/**
 * "Phone data changed" signal. The task store fires it after every change; sync listens and
 * sends the change to the server when the user is signed in. Kept separate so neither module
 * imports the other.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onDataChanged(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyDataChanged() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A listener failing (e.g. sync) never affects saving.
    }
  }
}
