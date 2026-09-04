export function logInfo(msg) {
  console.log(`[info] ${msg}`);
}

export function logDebug(enabled, msg, payload) {
  if (!enabled) return;
  console.log(`\n[debug] ${msg}`);
  if (payload !== undefined) {
    console.log(JSON.stringify(payload, null, 2));
  }
}

export function logError(msg, payload) {
  console.error(`[error] ${msg}`);
  if (payload !== undefined) {
    console.error(JSON.stringify(payload, null, 2));
  }
}

export function logWarn(msg) {
  console.warn(`[warn] ${msg}`);
}
