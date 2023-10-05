// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { createHttpHeaders, createPipelineRequest, } from "@azure/core-rest-pipeline";
import { readFile } from "fs";
import { AuthenticationError } from "../../errors";
import { credentialLogger } from "../../util/logging";
import { mapScopesToResource } from "./utils";
import { azureArcAPIVersion } from "./constants";
const msiName = "ManagedIdentityCredential - Azure Arc MSI";
const logger = credentialLogger(msiName);
/**
 * Generates the options used on the request for an access token.
 */
function prepareRequestOptions(scopes, clientId, resourceId) {
    const resource = mapScopesToResource(scopes);
    if (!resource) {
        throw new Error(`${msiName}: Multiple scopes are not supported.`);
    }
    const queryParameters = {
        resource,
        "api-version": azureArcAPIVersion,
    };
    if (clientId) {
        queryParameters.client_id = clientId;
    }
    if (resourceId) {
        queryParameters.msi_res_id = resourceId;
    }
    // This error should not bubble up, since we verify that this environment variable is defined in the isAvailable() method defined below.
    if (!process.env.IDENTITY_ENDPOINT) {
        throw new Error(`${msiName}: Missing environment variable: IDENTITY_ENDPOINT`);
    }
    const query = new URLSearchParams(queryParameters);
    return createPipelineRequest({
        // Should be similar to: http://localhost:40342/metadata/identity/oauth2/token
        url: `${process.env.IDENTITY_ENDPOINT}?${query.toString()}`,
        method: "GET",
        headers: createHttpHeaders({
            Accept: "application/json",
            Metadata: "true",
        }),
    });
}
/**
 * Retrieves the file contents at the given path using promises.
 * Useful since `fs`'s readFileSync locks the thread, and to avoid extra dependencies.
 */
function readFileAsync(path, options) {
    return new Promise((resolve, reject) => readFile(path, options, (err, data) => {
        if (err) {
            reject(err);
        }
        resolve(data);
    }));
}
/**
 * Does a request to the authentication provider that results in a file path.
 */
async function filePathRequest(identityClient, requestPrepareOptions) {
    const response = await identityClient.sendRequest(createPipelineRequest(requestPrepareOptions));
    if (response.status !== 401) {
        let message = "";
        if (response.bodyAsText) {
            message = ` Response: ${response.bodyAsText}`;
        }
        throw new AuthenticationError(response.status, `${msiName}: To authenticate with Azure Arc MSI, status code 401 is expected on the first request. ${message}`);
    }
    const authHeader = response.headers.get("www-authenticate") || "";
    try {
        return authHeader.split("=").slice(1)[0];
    }
    catch (e) {
        throw Error(`Invalid www-authenticate header format: ${authHeader}`);
    }
}
/**
 * Defines how to determine whether the Azure Arc MSI is available, and also how to retrieve a token from the Azure Arc MSI.
 */
export const arcMsi = {
    name: "arc",
    async isAvailable({ scopes }) {
        const resource = mapScopesToResource(scopes);
        if (!resource) {
            logger.info(`${msiName}: Unavailable. Multiple scopes are not supported.`);
            return false;
        }
        const result = Boolean(process.env.IMDS_ENDPOINT && process.env.IDENTITY_ENDPOINT);
        if (!result) {
            logger.info(`${msiName}: The environment variables needed are: IMDS_ENDPOINT and IDENTITY_ENDPOINT`);
        }
        return result;
    },
    async getToken(configuration, getTokenOptions = {}) {
        var _a;
        const { identityClient, scopes, clientId, resourceId } = configuration;
        if (clientId) {
            logger.warning(`${msiName}: user-assigned identities not supported. The argument clientId might be ignored by the service.`);
        }
        if (resourceId) {
            logger.warning(`${msiName}: user defined managed Identity by resource Id is not supported. Argument resourceId will be ignored.`);
        }
        logger.info(`${msiName}: Authenticating.`);
        const requestOptions = Object.assign(Object.assign({ disableJsonStringifyOnBody: true, deserializationMapper: undefined, abortSignal: getTokenOptions.abortSignal }, prepareRequestOptions(scopes, clientId, resourceId)), { allowInsecureConnection: true });
        const filePath = await filePathRequest(identityClient, requestOptions);
        if (!filePath) {
            throw new Error(`${msiName}: Failed to find the token file.`);
        }
        const key = await readFileAsync(filePath, { encoding: "utf-8" });
        (_a = requestOptions.headers) === null || _a === void 0 ? void 0 : _a.set("Authorization", `Basic ${key}`);
        const request = createPipelineRequest(Object.assign(Object.assign({}, requestOptions), { 
            // Generally, MSI endpoints use the HTTP protocol, without transport layer security (TLS).
            allowInsecureConnection: true }));
        const tokenResponse = await identityClient.sendTokenRequest(request);
        return (tokenResponse && tokenResponse.accessToken) || null;
    },
};
//# sourceMappingURL=arcMsi.js.map