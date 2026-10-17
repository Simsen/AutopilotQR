// Public client configuration. There are no secrets in this app.
export const CLIENT_ID: string = import.meta.env.VITE_CLIENT_ID ?? "";
export const REDIRECT_URI: string = import.meta.env.VITE_REDIRECT_URI ?? `${window.location.origin}${import.meta.env.BASE_URL}`;

/** Delegated Microsoft Graph scopes. Kept minimal; see the "Why these permissions" section in the README. */
export const GRAPH_SCOPES = [
  "https://graph.microsoft.com/DeviceManagementServiceConfig.ReadWrite.All", // import + read association records
  "https://graph.microsoft.com/DeviceManagementConfiguration.Read.All", // list Device Preparation policies
  "https://graph.microsoft.com/User.Read", // signed-in user + tenant name
];

export const GRAPH_BASE = "https://graph.microsoft.com/beta";

/** Device Preparation policy template (settings catalog). */
export const APDP_TEMPLATE_ID = "70d256b3-6120-4f88-9e00-0972ec64fc83_1";

export const isConfigured = (): boolean => /^[0-9a-f-]{36}$/i.test(CLIENT_ID) && !/^0{8}-/.test(CLIENT_ID);
