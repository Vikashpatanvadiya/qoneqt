import React, { createContext, useContext } from "react";
import { staticFile } from "remotion";

// Files come from the render's public folder, or from a URL base when the video is previewed in the browser editor.
// A name that is already a full URL (a freshly uploaded image) is used as is.
const AssetBase = createContext<string | undefined>(undefined);

export const AssetProvider: React.FC<{ base?: string; children: React.ReactNode }> = ({ base, children }) => <AssetBase.Provider value={base}>{children}</AssetBase.Provider>;

export function useAsset(): (name: string) => string {
  const base = useContext(AssetBase);
  return (name) => (/^https?:\/\//.test(name) ? name : base ? `${base}${name}` : staticFile(name));
}
