// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { processMultiTenantRequest, resolveAddionallyAllowedTenantIds, } from "../util/tenantIdUtils";
import { MsalClientCertificate } from "../msal/nodeFlows/msalClientCertificate";
import { credentialLogger } from "../util/logging";
import { tracingClient } from "../util/tracing";
const credentialName = "ClientCertificateCredential";
const logger = credentialLogger(credentialName);
/**
 * Enables authentication to Azure Active Directory using a PEM-encoded
 * certificate that is assigned to an App Registration. More information
 * on how to configure certificate authentication can be found here:
 *
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/active-directory-certificate-credentials#register-your-certificate-with-azure-ad
 *
 */
export class ClientCertificateCredential {
    constructor(tenantId, clientId, certificatePathOrConfiguration, options = {}) {
        if (!tenantId || !clientId) {
            throw new Error(`${credentialName}: tenantId and clientId are required parameters.`);
        }
        this.tenantId = tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        const configuration = Object.assign({}, (typeof certificatePathOrConfiguration === "string"
            ? {
                certificatePath: certificatePathOrConfiguration,
            }
            : certificatePathOrConfiguration));
        const certificate = configuration
            .certificate;
        const certificatePath = configuration.certificatePath;
        if (!configuration || !(certificate || certificatePath)) {
            throw new Error(`${credentialName}: Provide either a PEM certificate in string form, or the path to that certificate in the filesystem. To troubleshoot, visit https://aka.ms/azsdk/js/identity/serviceprincipalauthentication/troubleshoot.`);
        }
        if (certificate && certificatePath) {
            throw new Error(`${credentialName}: To avoid unexpected behaviors, providing both the contents of a PEM certificate and the path to a PEM certificate is forbidden. To troubleshoot, visit https://aka.ms/azsdk/js/identity/serviceprincipalauthentication/troubleshoot.`);
        }
        this.msalFlow = new MsalClientCertificate(Object.assign(Object.assign({}, options), { configuration,
            logger,
            clientId,
            tenantId, sendCertificateChain: options.sendCertificateChain, tokenCredentialOptions: options }));
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
        return tracingClient.withSpan(`${credentialName}.getToken`, options, async (newOptions) => {
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger);
            const arrayScopes = Array.isArray(scopes) ? scopes : [scopes];
            return this.msalFlow.getToken(arrayScopes, newOptions);
        });
    }
}
//# sourceMappingURL=clientCertificateCredential.js.map