// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { MsalNode } from "./msalNodeCommon";
/**
 * MSAL device code client. Calls to the MSAL's public application's `acquireTokenByDeviceCode` during `doGetToken`.
 * @internal
 */
export class MsalDeviceCode extends MsalNode {
    constructor(options) {
        super(options);
        this.userPromptCallback = options.userPromptCallback;
    }
    async doGetToken(scopes, options) {
        try {
            const requestOptions = {
                deviceCodeCallback: this.userPromptCallback,
                scopes,
                cancel: false,
                correlationId: options === null || options === void 0 ? void 0 : options.correlationId,
                authority: options === null || options === void 0 ? void 0 : options.authority,
                claims: options === null || options === void 0 ? void 0 : options.claims,
            };
            const promise = this.getApp("public", options === null || options === void 0 ? void 0 : options.enableCae).acquireTokenByDeviceCode(requestOptions);
            const deviceResponse = await this.withCancellation(promise, options === null || options === void 0 ? void 0 : options.abortSignal, () => {
                requestOptions.cancel = true;
            });
            return this.handleResult(scopes, this.clientId, deviceResponse || undefined);
        }
        catch (error) {
            throw this.handleError(scopes, error, options);
        }
    }
}
//# sourceMappingURL=msalDeviceCode.js.map