// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { MsalNode } from "./msalNodeCommon";
import { formatError } from "../../util/logging";
import { parseCertificate } from "./msalClientCertificate";
/**
 * MSAL on behalf of flow. Calls to MSAL's confidential application's `acquireTokenOnBehalfOf` during `doGetToken`.
 * @internal
 */
export class MsalOnBehalfOf extends MsalNode {
    constructor(options) {
        super(options);
        this.logger.info("Initialized MSAL's On-Behalf-Of flow");
        this.requiresConfidential = true;
        this.userAssertionToken = options.userAssertionToken;
        this.certificatePath = options.certificatePath;
        this.sendCertificateChain = options.sendCertificateChain;
        this.clientSecret = options.clientSecret;
    }
    // Changing the MSAL configuration asynchronously
    async init(options) {
        if (this.certificatePath) {
            try {
                const parts = await parseCertificate({ certificatePath: this.certificatePath }, this.sendCertificateChain);
                this.msalConfig.auth.clientCertificate = {
                    thumbprint: parts.thumbprint,
                    privateKey: parts.certificateContents,
                    x5c: parts.x5c,
                };
            }
            catch (error) {
                this.logger.info(formatError("", error));
                throw error;
            }
        }
        else {
            this.msalConfig.auth.clientSecret = this.clientSecret;
        }
        return super.init(options);
    }
    async doGetToken(scopes, options = {}) {
        try {
            const result = await this.getApp("confidential", options.enableCae).acquireTokenOnBehalfOf({
                scopes,
                correlationId: options.correlationId,
                authority: options.authority,
                claims: options.claims,
                oboAssertion: this.userAssertionToken,
            });
            return this.handleResult(scopes, this.clientId, result || undefined);
        }
        catch (err) {
            throw this.handleError(scopes, err, options);
        }
    }
}
//# sourceMappingURL=msalOnBehalfOf.js.map