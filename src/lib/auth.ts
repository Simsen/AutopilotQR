import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
import { CLIENT_ID, GRAPH_SCOPES, REDIRECT_URI } from "../config";

// Authorization code + PKCE, multitenant ("organizations"). Redirect flow — popups are unreliable on mobile.
export const msal = new PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: "https://login.microsoftonline.com/organizations",
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: REDIRECT_URI,
  },
  cache: { cacheLocation: "localStorage" },
});

let ready: Promise<AccountInfo | null> | null = null;

/** Initialise MSAL and complete any pending redirect. Resolves the active account, if any. */
export function initAuth(): Promise<AccountInfo | null> {
  ready ??= (async () => {
    await msal.initialize();
    const result = await msal.handleRedirectPromise();
    if (result?.account) msal.setActiveAccount(result.account);
    const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
    if (account) msal.setActiveAccount(account);
    return account;
  })();
  return ready;
}

/** Sign in. `selectAccount` forces the account picker (switch tenant/account). */
export async function signIn(selectAccount = false): Promise<void> {
  await msal.loginRedirect({
    scopes: GRAPH_SCOPES,
    prompt: selectAccount ? "select_account" : undefined,
  });
}

export async function signOut(): Promise<void> {
  const account = msal.getActiveAccount();
  await msal.logoutRedirect({ account: account ?? undefined });
}

/** Access token for Graph. Falls back to an interactive redirect when consent/MFA/CA requires it. */
export async function getToken(): Promise<string> {
  const account = msal.getActiveAccount();
  if (!account) throw new Error("Not signed in.");
  try {
    const r = await msal.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await msal.acquireTokenRedirect({ scopes: GRAPH_SCOPES, account });
      // Navigation happens; this promise never resolves meaningfully.
      return new Promise(() => {});
    }
    throw e;
  }
}
