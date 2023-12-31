// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { processMultiTenantRequest, resolveAddionallyAllowedTenantIds, } from "../util/tenantIdUtils";
import { MsalOnBehalfOf } from "../msal/nodeFlows/msalOnBehalfOf";
import { credentialLogger } from "../util/logging";
import { ensureScopes } from "../util/scopeUtils";
import { tracingClient } from "../util/tracing";
const credentialName = "OnBehalfOfCredential";
const logger = credentialLogger(credentialName);
/**
 * Enables authentication to Azure Active Directory using the [On Behalf Of flow](https://docs.microsoft.com/azure/active-directory/develop/v2-oauth2-on-behalf-of-flow).
 */
export class OnBehalfOfCredential {
    constructor(options) {
        this.options = options;
        const { clientSecret } = options;
        const { certificatePath } = options;
        const { tenantId, clientId, userAssertionToken, additionallyAllowedTenants: additionallyAllowedTenantIds, } = options;
        if (!tenantId || !clientId || !(clientSecret || certificatePath) || !userAssertionToken) {
            throw new Error(`${credentialName}: tenantId, clientId, clientSecret (or certificatePath) and userAssertionToken are required parameters.`);
        }
        this.tenantId = tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(additionallyAllowedTenantIds);
        this.msalFlow = new MsalOnBehalfOf(Object.assign(Object.assign({}, this.options), { logger, tokenCredentialOptions: this.options }));
    }
    /**
     * Authenticates with Azure Active Directory and returns an access token if successful.
     * If authentication fails, a {@link CredentialUnavailableError} will be thrown with the details of the failure.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure the underlying network requests.
     */
    async getToken(scopes, options = {}) {
        return tracingClient.withSpan(`${credentialName}.getToken`, options, async (newOptions) => {
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger);
            const arrayScopes = ensureScopes(scopes);
            return this.msalFlow.getToken(arrayScopes, newOptions);
        });
    }
}
//# sourceMappingURL=onBehalfOfCredential.js.map