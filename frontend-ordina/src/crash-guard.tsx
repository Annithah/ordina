/**
 * Keeps the app open when something goes badly wrong, and shows the error instead.
 *
 * In a release build React Native closes the app on any uncaught JavaScript error
 * ("ORDINA AI keeps stopping"). This catches errors while the app loads, while it
 * renders, and later in async code, and shows them on screen so a tester can send a
 * screenshot. Uses only plain React Native so it works without fonts, themes or the router.
 */
import * as SplashScreen from 'expo-splash-screen';
import { Component, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

type Listener = (error: Error) => void;

let lastError: Error | null = null;
const listeners = new Set<Listener>();

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === 'object' && 'message' in value) return new Error(String((value as { message: unknown }).message));
  return new Error(String(value));
}

function report(value: unknown) {
  lastError = toError(value);
  listeners.forEach((listener) => listener(lastError!));
}

/** Replaces React Native's fatal handler (which closes the app) with the crash screen. */
export function installCrashGuard() {
  const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
  if (!errorUtils) return;
  const defaultHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (__DEV__) {
      defaultHandler(error, isFatal);
      return;
    }
    if (isFatal) report(error);
    else console.error(error);
  });
}

export function CrashScreen({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const details = (error.stack || '').split('\n').slice(0, 8).join('\n');
  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC', paddingTop: 64, paddingHorizontal: 20, paddingBottom: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#0F172A' }}>ORDINA AI hit a problem</Text>
      <Text style={{ marginTop: 8, fontSize: 15, color: '#475569' }}>
        Your tasks on this phone are safe. Please take a screenshot of this screen and send it to the developer.
      </Text>
      <ScrollView style={{ marginTop: 16, flex: 1, borderRadius: 12, backgroundColor: '#E2E8F0' }} contentContainerStyle={{ padding: 12 }}>
        <Text selectable style={{ fontSize: 15, fontWeight: '700', color: '#B91C1C' }}>
          {error.name}: {error.message}
        </Text>
        {details ? (
          <Text selectable style={{ marginTop: 8, fontSize: 12, color: '#334155' }}>
            {details}
          </Text>
        ) : null}
      </ScrollView>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={{ marginTop: 16, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5C4DF2' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

class RenderBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: toError(error) };
  }

  render() {
    if (this.state.error) {
      return <CrashScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

/** Wraps the whole app: render errors and fatal async errors both show the crash screen. */
export function withCrashGuard(App: ComponentType) {
  return function GuardedApp() {
    const [error, setError] = useState<Error | null>(lastError);
    useEffect(() => {
      listeners.add(setError);
      return () => {
        listeners.delete(setError);
      };
    }, []);
    if (error) {
      return (
        <CrashScreen
          error={error}
          onRetry={() => {
            lastError = null;
            setError(null);
          }}
        />
      );
    }
    return (
      <RenderBoundary>
        <App />
      </RenderBoundary>
    );
  };
}

/** Root used when the app's code fails while loading, before anything can render. */
export function crashRoot(error: unknown) {
  const loadError = toError(error);
  return function LoadFailed() {
    return <CrashScreen error={loadError} />;
  };
}
