import { decodeWaveConfig, encodeWaveConfig } from "@ruverse/waves";

// Keep compact-config semantics owned by @ruverse/waves. Focus Tab only
// provides a narrow boundary that both settings surfaces and the renderer use.
export function decodeWaveConfigStrict(candidate) {
  return decodeWaveConfig(candidate);
}

export function canonicalizeWaveConfig(candidate) {
  return encodeWaveConfig(decodeWaveConfigStrict(candidate));
}

export function parseWaveConfig(candidate) {
  const config = decodeWaveConfigStrict(candidate);
  return {
    config,
    canonical: encodeWaveConfig(config)
  };
}
