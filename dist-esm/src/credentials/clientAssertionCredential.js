// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { processMultiTenantRequest, resolveAddionallyAllowedTenantIds, } from "../util/tenantIdUtils";
import { MsalClientAssertion } from "../msal/nodeFlows/msalClientAssertion";
import { credentialLogger } from "../util/logging";
import { tracingClient } from "../util/tracing";
const logger = credentialLogger("ClientAssertionCredential");
/**
 * Authenticates a service principal with a JWT assertion.
 */
export class ClientAssertionCredential {
    /**
     * Creates an instance of the ClientAssertionCredential with the details
     * needed to authenticate against Azure Active Directory with a client
     * assertion provided by the developer through the `getAssertion` function parameter.
     *
     * @param tenantId - The Azure Active Directory tenant (directory) ID.
     * @param clientId - The client (application) ID of an App Registration in the tenant.
     * @param getAssertion - A function that retrieves the assertion for the credential to use.
     * @param options - Options for configuring the client which makes the authentication request.
     */
    constructor(tenantId, clientId, getAssertion, options = {}) {
        if (!tenantId || !clientId || !getAssertion) {
            throw new Error("ClientAssertionCredential: tenantId, clientId, and clientAssertion are required parameters.");
        }
        this.tenantId = tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        this.clientId = clientId;
        this.options = options;
        this.msalFlow = new MsalClientAssertion(Object.assign(Object.assign({}, options), { logger, clientId: this.clientId, tenantId: this.tenantId, tokenCredentialOptions: this.options, getAssertion }));
    }
    /**
     * Authenticates with Azure Active Directory and returns an access token if successful.
     * If authentication fails, a {@link CredentialUnavailableError} will be thrown with the details of the failure.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure any requests this
     *                TokenCredential implementation might make.
     */
    async getToken(scopes, options = {}) {
        return tracingClient.withSpan(`${this.constructor.name}.getToken`, options, async (newOptions) => {
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger);
            const arrayScopes = Array.isArray(scopes) ? scopes : [scopes];
            return this.msalFlow.getToken(arrayScopes, newOptions);
        });
    }
}
//# sourceMappingURL=clientAssertionCredential.js.map