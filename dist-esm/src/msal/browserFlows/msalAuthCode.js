// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as msalBrowser from "@azure/msal-browser";
import { MsalBrowser } from "./msalBrowserCommon";
import { defaultLoggerCallback, msalToPublic, publicToMsal, getMSALLogLevel } from "../utils";
import { AuthenticationRequiredError } from "../../errors";
import { getLogLevel } from "@azure/logger";
// We keep a copy of the redirect hash.
const redirectHash = self.location.hash;
/**
 * Uses MSAL Browser 2.X for browser authentication,
 * which uses the [Auth Code Flow](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow).
 * @internal
 */
export class MSALAuthCode extends MsalBrowser {
    /**
     * Sets up an MSAL object based on the given parameters.
     * MSAL with Auth Code allows sending a previously obtained `authenticationRecord` through the optional parameters,
     * which is set to be the active account.
     * @param options - Parameters necessary and otherwise used to create the MSAL object.
     */
    constructor(options) {
        var _a;
        super(options);
        this.loginHint = options.loginHint;
        this.msalConfig.cache = {
            cacheLocation: "sessionStorage",
            storeAuthStateInCookie: true, // Set to true to improve the experience on IE11 and Edge.
        };
        this.msalConfig.system = {
            loggerOptions: {
                loggerCallback: defaultLoggerCallback(this.logger, "Browser"),
                logLevel: getMSALLogLevel(getLogLevel()),
                piiLoggingEnabled: (_a = options.loggingOptions) === null || _a === void 0 ? void 0 : _a.enableUnsafeSupportLogging,
            },
        };
        // Preparing the MSAL application.
        this.app = new msalBrowser.PublicClientApplication(this.msalConfig);
        if (this.account) {
            this.app.setActiveAccount(publicToMsal(this.account));
        }
    }
    /**
     * Loads the account based on the result of the authentication.
     * If no result was received, tries to load the account from the cache.
     * @param result - Result object received from MSAL.
     */
    async handleBrowserResult(result) {
        try {
            if (result && result.account) {
                this.logger.info(`MSAL Browser V2 authentication successful.`);
                this.app.setActiveAccount(result.account);
                return msalToPublic(this.clientId, result.account);
            }
            // If by this point we happen to have an active account, we should stop trying to parse this.
            const activeAccount = await this.app.getActiveAccount();
            if (activeAccount) {
                return msalToPublic(this.clientId, activeAccount);
            }
            // If we don't have an active account, we try to activate it from all the already loaded accounts.
            const accounts = this.app.getAllAccounts();
            if (accounts.length > 1) {
                // If there's more than one account in memory, we force the user to authenticate again.
                // At this point we can't identify which account should this credential work with,
                // since at this point the user won't have provided enough information.
                // We log a message in case that helps.
                this.logger.info(`More than one account was found authenticated for this Client ID and Tenant ID.
However, no "authenticationRecord" has been provided for this credential,
therefore we're unable to pick between these accounts.
A new login attempt will be requested, to ensure the correct account is picked.
To work with multiple accounts for the same Client ID and Tenant ID, please provide an "authenticationRecord" when initializing "InteractiveBrowserCredential".`);
                // To safely trigger a new login, we're also ensuring the local cache is cleared up for this MSAL object.
                // However, we want to avoid kicking the user out of their authentication on the Azure side.
                // We do this by calling to logout while specifying a `onRedirectNavigate` that returns false.
                await this.app.logout({
                    onRedirectNavigate: () => false,
                });
                return;
            }
            // If there's only one account for this MSAL object, we can safely activate it.
            if (accounts.length === 1) {
                const account = accounts[0];
                this.app.setActiveAccount(account);
                return msalToPublic(this.clientId, account);
            }
            this.logger.info(`No accounts were found through MSAL.`);
        }
        catch (e) {
            this.logger.info(`Failed to acquire token through MSAL. ${e.message}`);
        }
        return;
    }
    /**
     * Uses MSAL to handle the redirect.
     */
    async handleRedirect() {
        return this.handleBrowserResult((await this.app.handleRedirectPromise(redirectHash)) || undefined);
    }
    /**
     * Uses MSAL to trigger a redirect or a popup login.
     */
    async login(scopes = []) {
        const arrayScopes = Array.isArray(scopes) ? scopes : [scopes];
        const loginRequest = {
            scopes: arrayScopes,
            loginHint: this.loginHint,
        };
        switch (this.loginStyle) {
            case "redirect": {
                await this.app.loginRedirect(loginRequest);
                return;
            }
            case "popup":
                return this.handleBrowserResult(await this.app.loginPopup(loginRequest));
        }
    }
    /**
     * Uses MSAL to retrieve the active account.
     */
    async getActiveAccount() {
        const account = this.app.getActiveAccount();
        if (!account) {
            return;
        }
        return msalToPublic(this.clientId, account);
    }
    /**
     * Attempts to retrieve a token from cache.
     */
    async getTokenSilent(scopes, options) {
        const account = await this.getActiveAccount();
        if (!account) {
            throw new AuthenticationRequiredError({
                scopes,
                getTokenOptions: options,
                message: "Silent authentication failed. We couldn't retrieve an active account from the cache.",
            });
        }
        const parameters = {
            authority: (options === null || options === void 0 ? void 0 : options.authority) || this.msalConfig.auth.authority,
            correlationId: options === null || options === void 0 ? void 0 : options.correlationId,
            claims: options === null || options === void 0 ? void 0 : options.claims,
            account: publicToMsal(account),
            forceRefresh: false,
            scopes,
        };
        try {
            this.logger.info("Attempting to acquire token silently");
            const response = await this.app.acquireTokenSilent(parameters);
            return this.handleResult(scopes, this.clientId, response);
        }
        catch (err) {
            throw this.handleError(scopes, err, options);
        }
    }
    /**
     * Attempts to retrieve the token in the browser.
     */
    async doGetToken(scopes, options) {
        const account = await this.getActiveAccount();
        if (!account) {
            throw new AuthenticationRequiredError({
                scopes,
                getTokenOptions: options,
                message: "Silent authentication failed. We couldn't retrieve an active account from the cache.",
            });
        }
        const parameters = {
            authority: (options === null || options === void 0 ? void 0 : options.authority) || this.msalConfig.auth.authority,
            correlationId: options === null || options === void 0 ? void 0 : options.correlationId,
            claims: options === null || options === void 0 ? void 0 : options.claims,
            account: publicToMsal(account),
            loginHint: this.loginHint,
            scopes,
        };
        switch (this.loginStyle) {
            case "redirect":
                // This will go out of the page.
                // Once the InteractiveBrowserCredential is initialized again,
                // we'll load the MSAL account in the constructor.
                await this.app.acquireTokenRedirect(parameters);
                return { token: "", expiresOnTimestamp: 0 };
            case "popup":
                return this.handleResult(scopes, this.clientId, await this.app.acquireTokenPopup(parameters));
        }
    }
}
//# sourceMappingURL=msalAuthCode.js.map