"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createApiClient } from "./api";

export type CommandStorage = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};
export type Bridge = ReturnType<typeof createApiClient> & {
  assetUrl: (id: string, recipe?: "normalized-raw") => string | undefined;
  navigate: (route: string) => void;
  commands: CommandStorage;
};
export const desktopBridge: Bridge = {
  ...createApiClient(),
  assetUrl: (id, recipe) =>
    recipe
      ? `/api/prepared-candidates/${id}/normalized-raw`
      : `/api/assets/${id}`,
  navigate: (route) => {
    window.location.assign(route);
  },
  commands: {
    get: async (key) => sessionStorage.getItem(key),
    set: async (key, value) => {
      sessionStorage.setItem(key, value);
    },
    remove: async (key) => {
      sessionStorage.removeItem(key);
    },
  },
};
const Context = createContext<Bridge>(desktopBridge);
export function BridgeProvider({
  value,
  children,
}: {
  value: Bridge;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useBridge = () => useContext(Context);
export function LocalLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const bridge = useBridge();
  return (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) bridge.navigate(href);
      }}
    >
      {children}
    </a>
  );
}
