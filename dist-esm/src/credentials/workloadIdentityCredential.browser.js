// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { credentialLogger, formatError } from "../util/logging";
const BrowserNotSupportedError = new Error("WorkloadIdentityCredential is not supported in the browser.");
const logger = credentialLogger("WorkloadIdentityCredential");
/**
 * WorkloadIdentityCredential supports Azure workload identity authentication on Kubernetes.
 * Refer to <a href="https://learn.microsoft.com/azure/aks/workload-identity-overview">Azure Active Directory Workload Identity</a>
 * for more information.
 */
export class WorkloadIdentityCredential {
    /**
     * Only available in Node.js
     */
    constructor() {
        logger.info(formatError("", BrowserNotSupportedError));
        throw BrowserNotSupportedError;
    }
    /**
     * Only available in Node.js
     */
    getToken() {
        logger.getToken.info(formatError("", BrowserNotSupportedError));
        throw BrowserNotSupportedError;
    }
}
//# sourceMappingURL=workloadIdentityCredential.browser.js.map