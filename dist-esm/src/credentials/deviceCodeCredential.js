// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { processMultiTenantRequest, resolveAddionallyAllowedTenantIds, } from "../util/tenantIdUtils";
import { MsalDeviceCode } from "../msal/nodeFlows/msalDeviceCode";
import { credentialLogger } from "../util/logging";
import { ensureScopes } from "../util/scopeUtils";
import { tracingClient } from "../util/tracing";
const logger = credentialLogger("DeviceCodeCredential");
/**
 * Method that logs the user code from the DeviceCodeCredential.
 * @param deviceCodeInfo - The device code.
 */
export function defaultDeviceCodePromptCallback(deviceCodeInfo) {
    console.log(deviceCodeInfo.message);
}
/**
 * Enables authentication to Azure Active Directory using a device code
 * that the user can enter into https://microsoft.com/devicelogin.
 */
export class DeviceCodeCredential {
    /**
     * Creates an instance of DeviceCodeCredential with the details needed
     * to initiate the device code authorization flow with Azure Active Directory.
     *
     * A message will be logged, giving users a code that they can use to authenticate once they go to https://microsoft.com/devicelogin
     *
     * Developers can configure how this message is shown by passing a custom `userPromptCallback`:
     *
     * ```js
     * const credential = new DeviceCodeCredential({
     *   tenantId: env.AZURE_TENANT_ID,
     *   clientId: env.AZURE_CLIENT_ID,
     *   userPromptCallback: (info) => {
     *     console.log("CUSTOMIZED PROMPT CALLBACK", info.message);
     *   }
     * });
     * ```
     *
     * @param options - Options for configuring the client which makes the authentication requests.
     */
    constructor(options) {
        this.tenantId = options === null || options === void 0 ? void 0 : options.tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        this.msalFlow = new MsalDeviceCode(Object.assign(Object.assign({}, options), { logger, userPromptCallback: (options === null || options === void 0 ? void 0 : options.userPromptCallback) || defaultDeviceCodePromptCallback, tokenCredentialOptions: options || {} }));
        this.disableAutomaticAuthentication = options === null || options === void 0 ? void 0 : options.disableAutomaticAuthentication;
    }
    /**
     * Authenticates with Azure Active Directory and returns an access token if successful.
     * If authentication fails, a {@link CredentialUnavailableError} will be thrown with the details of the failure.
     *
     * If the user provided the option `disableAutomaticAuthentication`,
     * once the token can't be retrieved silently,
     * this method won't attempt to request user interaction to retrieve the token.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure any requests this
     *                TokenCredential implementation might make.
     */
    async getToken(scopes, options = {}) {
        return tracingClient.withSpan(`${this.constructor.name}.getToken`, options, async (newOptions) => {
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger);
            const arrayScopes = ensureScopes(scopes);
            return this.msalFlow.getToken(arrayScopes, Object.assign(Object.assign({}, newOptions), { disableAutomaticAuthentication: this.disableAutomaticAuthentication }));
        });
    }
    /**
     * Authenticates with Azure Active Directory and returns an access token if successful.
     * If authentication fails, a {@link CredentialUnavailableError} will be thrown with the details of the failure.
     *
     * If the token can't be retrieved silently, this method will require user interaction to retrieve the token.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure any requests this
     *                  TokenCredential implementation might make.
     */
    async authenticate(scopes, options = {}) {
        return tracingClient.withSpan(`${this.constructor.name}.authenticate`, options, async (newOptions) => {
            const arrayScopes = Array.isArray(scopes) ? scopes : [scopes];
            await this.msalFlow.getToken(arrayScopes, newOptions);
            return this.msalFlow.getActiveAccount();
        });
    }
}
//# sourceMappingURL=deviceCodeCredential.js.map