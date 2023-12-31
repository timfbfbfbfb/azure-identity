// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { MsalNode } from "./msalNodeCommon";
import { isError } from "@azure/core-util";
/**
 * MSAL client assertion client. Calls to MSAL's confidential application's `acquireTokenByClientCredential` during `doGetToken`.
 * @internal
 */
export class MsalClientAssertion extends MsalNode {
    constructor(options) {
        super(options);
        this.requiresConfidential = true;
        this.getAssertion = options.getAssertion;
    }
    async doGetToken(scopes, options = {}) {
        try {
            const assertion = await this.getAssertion();
            const result = await this.getApp("confidential", options.enableCae).acquireTokenByClientCredential({
                scopes,
                correlationId: options.correlationId,
                azureRegion: this.azureRegion,
                authority: options.authority,
                claims: options.claims,
                clientAssertion: assertion,
            });
            // The Client Credential flow does not return an account,
            // so each time getToken gets called, we will have to acquire a new token through the service.
            return this.handleResult(scopes, this.clientId, result || undefined);
        }
        catch (err) {
            let err2 = err;
            if (err === null || err === undefined) {
                err2 = new Error(JSON.stringify(err));
            }
            else {
                err2 = isError(err) ? err : new Error(String(err));
            }
            throw this.handleError(scopes, err2, options);
        }
    }
}
//# sourceMappingURL=msalClientAssertion.js.map