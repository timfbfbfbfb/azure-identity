// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as msalNode from "@azure/msal-node";
import { getLogLevel } from "@azure/logger";
import { MsalBaseUtilities, defaultLoggerCallback, getAuthority, getKnownAuthorities, msalToPublic, publicToMsal, getMSALLogLevel, } from "../utils";
import { processMultiTenantRequest, resolveAddionallyAllowedTenantIds, resolveTenantId, } from "../../util/tenantIdUtils";
import { AuthenticationRequiredError } from "../../errors";
import { CACHE_CAE_SUFFIX, CACHE_NON_CAE_SUFFIX, DeveloperSignOnClientId } from "../../constants";
import { IdentityClient } from "../../client/identityClient";
import { RegionalAuthority } from "../../regionalAuthority";
/**
 * The current persistence provider, undefined by default.
 * @internal
 */
let persistenceProvider = undefined;
/**
 * An object that allows setting the persistence provider.
 * @internal
 */
export const msalNodeFlowCacheControl = {
    setPersistence(pluginProvider) {
        persistenceProvider = pluginProvider;
    },
};
/**
 * MSAL partial base client for Node.js.
 *
 * It completes the input configuration with some default values.
 * It also provides with utility protected methods that can be used from any of the clients,
 * which includes handlers for successful responses and errors.
 *
 * @internal
 */
export class MsalNode extends MsalBaseUtilities {
    constructor(options) {
        var _a, _b, _c, _d;
        super(options);
        // protected publicApp: msalNode.PublicClientApplication | undefined;
        // protected publicAppCae: msalNode.PublicClientApplication | undefined;
        // protected confidentialApp: msalNode.ConfidentialClientApplication | undefined;
        // protected confidentialAppCae: msalNode.ConfidentialClientApplication | undefined;
        this.app = {};
        this.caeApp = {};
        this.requiresConfidential = false;
        this.msalConfig = this.defaultNodeMsalConfig(options);
        this.tenantId = resolveTenantId(options.logger, options.tenantId, options.clientId);
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds((_a = options === null || options === void 0 ? void 0 : options.tokenCredentialOptions) === null || _a === void 0 ? void 0 : _a.additionallyAllowedTenants);
        this.clientId = this.msalConfig.auth.clientId;
        if (options === null || options === void 0 ? void 0 : options.getAssertion) {
            this.getAssertion = options.getAssertion;
        }
        // If persistence has been configured
        if (persistenceProvider !== undefined && ((_b = options.tokenCachePersistenceOptions) === null || _b === void 0 ? void 0 : _b.enabled)) {
            const nonCaeOptions = Object.assign({ name: `${options.tokenCachePersistenceOptions.name}.${CACHE_NON_CAE_SUFFIX}` }, options.tokenCachePersistenceOptions);
            const caeOptions = Object.assign({ name: `${options.tokenCachePersistenceOptions.name}.${CACHE_CAE_SUFFIX}` }, options.tokenCachePersistenceOptions);
            this.createCachePlugin = () => persistenceProvider(nonCaeOptions);
            this.createCachePluginCae = () => persistenceProvider(caeOptions);
        }
        else if ((_c = options.tokenCachePersistenceOptions) === null || _c === void 0 ? void 0 : _c.enabled) {
            throw new Error([
                "Persistent token caching was requested, but no persistence provider was configured.",
                "You must install the identity-cache-persistence plugin package (`npm install --save @azure/identity-cache-persistence`)",
                "and enable it by importing `useIdentityPlugin` from `@azure/identity` and calling",
                "`useIdentityPlugin(cachePersistencePlugin)` before using `tokenCachePersistenceOptions`.",
            ].join(" "));
        }
        this.azureRegion = (_d = options.regionalAuthority) !== null && _d !== void 0 ? _d : process.env.AZURE_REGIONAL_AUTHORITY_NAME;
        if (this.azureRegion === RegionalAuthority.AutoDiscoverRegion) {
            this.azureRegion = "AUTO_DISCOVER";
        }
    }
    /**
     * Generates a MSAL configuration that generally works for Node.js
     */
    defaultNodeMsalConfig(options) {
        var _a;
        const clientId = options.clientId || DeveloperSignOnClientId;
        const tenantId = resolveTenantId(options.logger, options.tenantId, options.clientId);
        this.authorityHost = options.authorityHost || process.env.AZURE_AUTHORITY_HOST;
        const authority = getAuthority(tenantId, this.authorityHost);
        this.identityClient = new IdentityClient(Object.assign(Object.assign({}, options.tokenCredentialOptions), { authorityHost: authority, loggingOptions: options.loggingOptions }));
        const clientCapabilities = [];
        return {
            auth: {
                clientId,
                authority,
                knownAuthorities: getKnownAuthorities(tenantId, authority, options.disableInstanceDiscovery),
                clientCapabilities,
            },
            // Cache is defined in this.prepare();
            system: {
                networkClient: this.identityClient,
                loggerOptions: {
                    loggerCallback: defaultLoggerCallback(options.logger),
                    logLevel: getMSALLogLevel(getLogLevel()),
                    piiLoggingEnabled: (_a = options.loggingOptions) === null || _a === void 0 ? void 0 : _a.enableUnsafeSupportLogging,
                },
            },
        };
    }
    getApp(appType, enableCae) {
        const app = enableCae ? this.caeApp : this.app;
        if (appType === "publicFirst") {
            return (app.public || app.confidential);
        }
        else if (appType === "confidentialFirst") {
            return (app.confidential || app.public);
        }
        else if (appType === "confidential") {
            return app.confidential;
        }
        else {
            return app.public;
        }
    }
    /**
     * Prepares the MSAL applications.
     */
    async init(options) {
        if (options === null || options === void 0 ? void 0 : options.abortSignal) {
            options.abortSignal.addEventListener("abort", () => {
                // This will abort any pending request in the IdentityClient,
                // based on the received or generated correlationId
                this.identityClient.abortRequests(options.correlationId);
            });
        }
        const app = (options === null || options === void 0 ? void 0 : options.enableCae) ? this.caeApp : this.app;
        if (options === null || options === void 0 ? void 0 : options.enableCae) {
            this.msalConfig.auth.clientCapabilities = ["cp1"];
        }
        if (app.public || app.confidential) {
            return;
        }
        if ((options === null || options === void 0 ? void 0 : options.enableCae) && this.createCachePluginCae !== undefined) {
            this.msalConfig.cache = {
                cachePlugin: await this.createCachePluginCae(),
            };
        }
        if (this.createCachePlugin !== undefined) {
            this.msalConfig.cache = {
                cachePlugin: await this.createCachePlugin(),
            };
        }
        if (options === null || options === void 0 ? void 0 : options.enableCae) {
            this.caeApp.public = new msalNode.PublicClientApplication(this.msalConfig);
        }
        else {
            this.app.public = new msalNode.PublicClientApplication(this.msalConfig);
        }
        if (this.getAssertion) {
            this.msalConfig.auth.clientAssertion = await this.getAssertion();
        }
        // The confidential client requires either a secret, assertion or certificate.
        if (this.msalConfig.auth.clientSecret ||
            this.msalConfig.auth.clientAssertion ||
            this.msalConfig.auth.clientCertificate) {
            if (options === null || options === void 0 ? void 0 : options.enableCae) {
                this.caeApp.confidential = new msalNode.ConfidentialClientApplication(this.msalConfig);
            }
            else {
                this.app.confidential = new msalNode.ConfidentialClientApplication(this.msalConfig);
            }
        }
        else {
            if (this.requiresConfidential) {
                throw new Error("Unable to generate the MSAL confidential client. Missing either the client's secret, certificate or assertion.");
            }
        }
    }
    /**
     * Allows the cancellation of a MSAL request.
     */
    withCancellation(promise, abortSignal, onCancel) {
        return new Promise((resolve, reject) => {
            promise
                .then((msalToken) => {
                return resolve(msalToken);
            })
                .catch(reject);
            if (abortSignal) {
                abortSignal.addEventListener("abort", () => {
                    onCancel === null || onCancel === void 0 ? void 0 : onCancel();
                });
            }
        });
    }
    /**
     * Returns the existing account, attempts to load the account from MSAL.
     */
    async getActiveAccount(enableCae = false) {
        if (this.account) {
            return this.account;
        }
        const cache = this.getApp("confidentialFirst", enableCae).getTokenCache();
        const accountsByTenant = await (cache === null || cache === void 0 ? void 0 : cache.getAllAccounts());
        if (!accountsByTenant) {
            return;
        }
        if (accountsByTenant.length === 1) {
            this.account = msalToPublic(this.clientId, accountsByTenant[0]);
        }
        else {
            this.logger
                .info(`More than one account was found authenticated for this Client ID and Tenant ID.
However, no "authenticationRecord" has been provided for this credential,
therefore we're unable to pick between these accounts.
A new login attempt will be requested, to ensure the correct account is picked.
To work with multiple accounts for the same Client ID and Tenant ID, please provide an "authenticationRecord" when initializing a credential to prevent this from happening.`);
            return;
        }
        return this.account;
    }
    /**
     * Attempts to retrieve a token from cache.
     */
    async getTokenSilent(scopes, options) {
        var _a, _b, _c;
        await this.getActiveAccount(options === null || options === void 0 ? void 0 : options.enableCae);
        if (!this.account) {
            throw new AuthenticationRequiredError({
                scopes,
                getTokenOptions: options,
                message: "Silent authentication failed. We couldn't retrieve an active account from the cache.",
            });
        }
        const silentRequest = {
            // To be able to re-use the account, the Token Cache must also have been provided.
            account: publicToMsal(this.account),
            correlationId: options === null || options === void 0 ? void 0 : options.correlationId,
            scopes,
            authority: options === null || options === void 0 ? void 0 : options.authority,
            claims: options === null || options === void 0 ? void 0 : options.claims,
        };
        try {
            this.logger.info("Attempting to acquire token silently");
            /**
             * The following code to retrieve all accounts is done as a workaround in an attempt to force the
             * refresh of the token cache with the token and the account passed in through the
             * `authenticationRecord` parameter. See issue - https://github.com/Azure/azure-sdk-for-js/issues/24349#issuecomment-1496715651
             * This workaround serves as a workaround for silent authentication not happening when authenticationRecord is passed.
             */
            await ((_a = this.getApp("publicFirst", options === null || options === void 0 ? void 0 : options.enableCae)) === null || _a === void 0 ? void 0 : _a.getTokenCache().getAllAccounts());
            const response = (_c = (await ((_b = this.getApp("confidential", options === null || options === void 0 ? void 0 : options.enableCae)) === null || _b === void 0 ? void 0 : _b.acquireTokenSilent(silentRequest)))) !== null && _c !== void 0 ? _c : (await this.getApp("public", options === null || options === void 0 ? void 0 : options.enableCae).acquireTokenSilent(silentRequest));
            return this.handleResult(scopes, this.clientId, response || undefined);
        }
        catch (err) {
            throw this.handleError(scopes, err, options);
        }
    }
    /**
     * Wrapper around each MSAL flow get token operation: doGetToken.
     * If disableAutomaticAuthentication is sent through the constructor, it will prevent MSAL from requesting the user input.
     */
    async getToken(scopes, options = {}) {
        const tenantId = processMultiTenantRequest(this.tenantId, options, this.additionallyAllowedTenantIds) ||
            this.tenantId;
        options.authority = getAuthority(tenantId, this.authorityHost);
        options.correlationId = (options === null || options === void 0 ? void 0 : options.correlationId) || this.generateUuid();
        await this.init(options);
        try {
            // MSAL now caches tokens based on their claims,
            // so now one has to keep track fo claims in order to retrieve the newer tokens from acquireTokenSilent
            // This update happened on PR: https://github.com/AzureAD/microsoft-authentication-library-for-js/pull/4533
            const optionsClaims = options.claims;
            if (optionsClaims) {
                this.cachedClaims = optionsClaims;
            }
            if (this.cachedClaims && !optionsClaims) {
                options.claims = this.cachedClaims;
            }
            // We don't return the promise since we want to catch errors right here.
            return await this.getTokenSilent(scopes, options);
        }
        catch (err) {
            if (err.name !== "AuthenticationRequiredError") {
                throw err;
            }
            if (options === null || options === void 0 ? void 0 : options.disableAutomaticAuthentication) {
                throw new AuthenticationRequiredError({
                    scopes,
                    getTokenOptions: options,
                    message: "Automatic authentication has been disabled. You may call the authentication() method.",
                });
            }
            this.logger.info(`Silent authentication failed, falling back to interactive method.`);
            return this.doGetToken(scopes, options);
        }
    }
}
//# sourceMappingURL=msalNodeCommon.js.map