'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var msalNode = require('@azure/msal-node');
var logger$o = require('@azure/logger');
var msalCommon = require('@azure/msal-common');
var abortController = require('@azure/abort-controller');
var coreUtil = require('@azure/core-util');
var uuid = require('uuid');
var coreClient = require('@azure/core-client');
var coreRestPipeline = require('@azure/core-rest-pipeline');
var coreTracing = require('@azure/core-tracing');
var fs = require('fs');
var os = require('os');
var path = require('path');
var promises = require('fs/promises');
var https = require('https');
var child_process = require('child_process');
var crypto = require('crypto');
var util = require('util');
var http = require('http');
var open = require('open');
var stoppable = require('stoppable');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n["default"] = e;
    return Object.freeze(n);
}

var msalNode__namespace = /*#__PURE__*/_interopNamespace(msalNode);
var msalCommon__namespace = /*#__PURE__*/_interopNamespace(msalCommon);
var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
var os__default = /*#__PURE__*/_interopDefaultLegacy(os);
var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var https__default = /*#__PURE__*/_interopDefaultLegacy(https);
var child_process__default = /*#__PURE__*/_interopDefaultLegacy(child_process);
var child_process__namespace = /*#__PURE__*/_interopNamespace(child_process);
var http__default = /*#__PURE__*/_interopDefaultLegacy(http);
var open__default = /*#__PURE__*/_interopDefaultLegacy(open);
var stoppable__default = /*#__PURE__*/_interopDefaultLegacy(stoppable);

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
function isErrorResponse(errorResponse) {
    return (errorResponse &&
        typeof errorResponse.error === "string" &&
        typeof errorResponse.error_description === "string");
}
/**
 * The Error.name value of an CredentialUnavailable
 */
const CredentialUnavailableErrorName = "CredentialUnavailableError";
/**
 * This signifies that the credential that was tried in a chained credential
 * was not available to be used as the credential. Rather than treating this as
 * an error that should halt the chain, it's caught and the chain continues
 */
class CredentialUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = CredentialUnavailableErrorName;
    }
}
/**
 * The Error.name value of an AuthenticationError
 */
const AuthenticationErrorName = "AuthenticationError";
/**
 * Provides details about a failure to authenticate with Azure Active
 * Directory.  The `errorResponse` field contains more details about
 * the specific failure.
 */
class AuthenticationError extends Error {
    // eslint-disable-next-line @typescript-eslint/ban-types
    constructor(statusCode, errorBody) {
        let errorResponse = {
            error: "unknown",
            errorDescription: "An unknown error occurred and no additional details are available.",
        };
        if (isErrorResponse(errorBody)) {
            errorResponse = convertOAuthErrorResponseToErrorResponse(errorBody);
        }
        else if (typeof errorBody === "string") {
            try {
                // Most error responses will contain JSON-formatted error details
                // in the response body
                const oauthErrorResponse = JSON.parse(errorBody);
                errorResponse = convertOAuthErrorResponseToErrorResponse(oauthErrorResponse);
            }
            catch (e) {
                if (statusCode === 400) {
                    errorResponse = {
                        error: "authority_not_found",
                        errorDescription: "The specified authority URL was not found.",
                    };
                }
                else {
                    errorResponse = {
                        error: "unknown_error",
                        errorDescription: `An unknown error has occurred. Response body:\n\n${errorBody}`,
                    };
                }
            }
        }
        else {
            errorResponse = {
                error: "unknown_error",
                errorDescription: "An unknown error occurred and no additional details are available.",
            };
        }
        super(`${errorResponse.error} Status code: ${statusCode}\nMore details:\n${errorResponse.errorDescription}`);
        this.statusCode = statusCode;
        this.errorResponse = errorResponse;
        // Ensure that this type reports the correct name
        this.name = AuthenticationErrorName;
    }
}
/**
 * The Error.name value of an AggregateAuthenticationError
 */
const AggregateAuthenticationErrorName = "AggregateAuthenticationError";
/**
 * Provides an `errors` array containing {@link AuthenticationError} instance
 * for authentication failures from credentials in a {@link ChainedTokenCredential}.
 */
class AggregateAuthenticationError extends Error {
    constructor(errors, errorMessage) {
        const errorDetail = errors.join("\n");
        super(`${errorMessage}\n${errorDetail}`);
        this.errors = errors;
        // Ensure that this type reports the correct name
        this.name = AggregateAuthenticationErrorName;
    }
}
function convertOAuthErrorResponseToErrorResponse(errorBody) {
    return {
        error: errorBody.error,
        errorDescription: errorBody.error_description,
        correlationId: errorBody.correlation_id,
        errorCodes: errorBody.error_codes,
        timestamp: errorBody.timestamp,
        traceId: errorBody.trace_id,
    };
}
/**
 * Error used to enforce authentication after trying to retrieve a token silently.
 */
class AuthenticationRequiredError extends Error {
    constructor(
    /**
     * Optional parameters. A message can be specified. The {@link GetTokenOptions} of the request can also be specified to more easily associate the error with the received parameters.
     */
    options) {
        super(options.message);
        this.scopes = options.scopes;
        this.getTokenOptions = options.getTokenOptions;
        this.name = "AuthenticationRequiredError";
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * The AzureLogger used for all clients within the identity package
 */
const logger$n = logger$o.createClientLogger("identity");
/**
 * Separates a list of environment variable names into a plain object with two arrays: an array of missing environment variables and another array with assigned environment variables.
 * @param supportedEnvVars - List of environment variable names
 */
function processEnvVars(supportedEnvVars) {
    return supportedEnvVars.reduce((acc, envVariable) => {
        if (process.env[envVariable]) {
            acc.assigned.push(envVariable);
        }
        else {
            acc.missing.push(envVariable);
        }
        return acc;
    }, { missing: [], assigned: [] });
}
/**
 * Formatting the success event on the credentials
 */
function formatSuccess(scope) {
    return `SUCCESS. Scopes: ${Array.isArray(scope) ? scope.join(", ") : scope}.`;
}
/**
 * Formatting the success event on the credentials
 */
function formatError(scope, error) {
    let message = "ERROR.";
    if (scope === null || scope === void 0 ? void 0 : scope.length) {
        message += ` Scopes: ${Array.isArray(scope) ? scope.join(", ") : scope}.`;
    }
    return `${message} Error message: ${typeof error === "string" ? error : error.message}.`;
}
/**
 * Generates a CredentialLoggerInstance.
 *
 * It logs with the format:
 *
 *   `[title] => [message]`
 *
 */
function credentialLoggerInstance(title, parent, log = logger$n) {
    const fullTitle = parent ? `${parent.fullTitle} ${title}` : title;
    function info(message) {
        log.info(`${fullTitle} =>`, message);
    }
    function warning(message) {
        log.warning(`${fullTitle} =>`, message);
    }
    function verbose(message) {
        log.verbose(`${fullTitle} =>`, message);
    }
    return {
        title,
        fullTitle,
        info,
        warning,
        verbose,
    };
}
/**
 * Generates a CredentialLogger, which is a logger declared at the credential's constructor, and used at any point in the credential.
 * It has all the properties of a CredentialLoggerInstance, plus other logger instances, one per method.
 *
 * It logs with the format:
 *
 *   `[title] => [message]`
 *   `[title] => getToken() => [message]`
 *
 */
function credentialLogger(title, log = logger$n) {
    const credLogger = credentialLoggerInstance(title, undefined, log);
    return Object.assign(Object.assign({}, credLogger), { parent: log, getToken: credentialLoggerInstance("=> getToken()", credLogger, log) });
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Current version of the `@azure/identity` package.
 */
const SDK_VERSION = `3.3.0`;
/**
 * The default client ID for authentication
 * @internal
 */
// TODO: temporary - this is the Azure CLI clientID - we'll replace it when
// Developer Sign On application is available
// https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/identity/Azure.Identity/src/Constants.cs#L9
const DeveloperSignOnClientId = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
/**
 * The default tenant for authentication
 * @internal
 */
const DefaultTenantId = "common";
/**
 * A list of known Azure authority hosts
 */
exports.AzureAuthorityHosts = void 0;
(function (AzureAuthorityHosts) {
    /**
     * China-based Azure Authority Host
     */
    AzureAuthorityHosts["AzureChina"] = "https://login.chinacloudapi.cn";
    /**
     * Germany-based Azure Authority Host
     */
    AzureAuthorityHosts["AzureGermany"] = "https://login.microsoftonline.de";
    /**
     * US Government Azure Authority Host
     */
    AzureAuthorityHosts["AzureGovernment"] = "https://login.microsoftonline.us";
    /**
     * Public Cloud Azure Authority Host
     */
    AzureAuthorityHosts["AzurePublicCloud"] = "https://login.microsoftonline.com";
})(exports.AzureAuthorityHosts || (exports.AzureAuthorityHosts = {}));
/**
 * The default authority host.
 */
const DefaultAuthorityHost = exports.AzureAuthorityHosts.AzurePublicCloud;
/**
 * Allow acquiring tokens for any tenant for multi-tentant auth.
 */
const ALL_TENANTS = ["*"];
const CACHE_CAE_SUFFIX = ".cae";
const CACHE_NON_CAE_SUFFIX = ".nocae";

// Copyright (c) Microsoft Corporation.
/**
 * Latest AuthenticationRecord version
 * @internal
 */
const LatestAuthenticationRecordVersion = "1.0";
/**
 * Ensures the validity of the MSAL token
 * @internal
 */
function ensureValidMsalToken(scopes, logger, msalToken, getTokenOptions) {
    const error = (message) => {
        logger.getToken.info(message);
        return new AuthenticationRequiredError({
            scopes: Array.isArray(scopes) ? scopes : [scopes],
            getTokenOptions,
            message,
        });
    };
    if (!msalToken) {
        throw error("No response");
    }
    if (!msalToken.expiresOn) {
        throw error(`Response had no "expiresOn" property.`);
    }
    if (!msalToken.accessToken) {
        throw error(`Response had no "accessToken" property.`);
    }
}
/**
 * Generates a valid authority by combining a host with a tenantId.
 * @internal
 */
function getAuthority(tenantId, host) {
    if (!host) {
        host = DefaultAuthorityHost;
    }
    if (new RegExp(`${tenantId}/?$`).test(host)) {
        return host;
    }
    if (host.endsWith("/")) {
        return host + tenantId;
    }
    else {
        return `${host}/${tenantId}`;
    }
}
/**
 * Generates the known authorities.
 * If the Tenant Id is `adfs`, the authority can't be validated since the format won't match the expected one.
 * For that reason, we have to force MSAL to disable validating the authority
 * by sending it within the known authorities in the MSAL configuration.
 * @internal
 */
function getKnownAuthorities(tenantId, authorityHost, disableInstanceDiscovery) {
    if ((tenantId === "adfs" && authorityHost) || disableInstanceDiscovery) {
        return [authorityHost];
    }
    return [];
}
/**
 * Generates a logger that can be passed to the MSAL clients.
 * @param logger - The logger of the credential.
 * @internal
 */
const defaultLoggerCallback = (logger, platform = coreUtil.isNode ? "Node" : "Browser") => (level, message, containsPii) => {
    if (containsPii) {
        return;
    }
    switch (level) {
        case msalCommon__namespace.LogLevel.Error:
            logger.info(`MSAL ${platform} V2 error: ${message}`);
            return;
        case msalCommon__namespace.LogLevel.Info:
            logger.info(`MSAL ${platform} V2 info message: ${message}`);
            return;
        case msalCommon__namespace.LogLevel.Verbose:
            logger.info(`MSAL ${platform} V2 verbose message: ${message}`);
            return;
        case msalCommon__namespace.LogLevel.Warning:
            logger.info(`MSAL ${platform} V2 warning: ${message}`);
            return;
    }
};
/**
 * @internal
 */
function getMSALLogLevel(logLevel) {
    switch (logLevel) {
        case "error":
            return msalCommon__namespace.LogLevel.Error;
        case "info":
            return msalCommon__namespace.LogLevel.Info;
        case "verbose":
            return msalCommon__namespace.LogLevel.Verbose;
        case "warning":
            return msalCommon__namespace.LogLevel.Warning;
        default:
            // default msal logging level should be Info
            return msalCommon__namespace.LogLevel.Info;
    }
}
/**
 * The common utility functions for the MSAL clients.
 * Defined as a class so that the classes extending this one can have access to its methods and protected properties.
 *
 * It keeps track of a logger and an in-memory copy of the AuthenticationRecord.
 *
 * @internal
 */
class MsalBaseUtilities {
    constructor(options) {
        this.logger = options.logger;
        this.account = options.authenticationRecord;
    }
    /**
     * Generates a UUID
     */
    generateUuid() {
        return uuid.v4();
    }
    /**
     * Handles the MSAL authentication result.
     * If the result has an account, we update the local account reference.
     * If the token received is invalid, an error will be thrown depending on what's missing.
     */
    handleResult(scopes, clientId, result, getTokenOptions) {
        if (result === null || result === void 0 ? void 0 : result.account) {
            this.account = msalToPublic(clientId, result.account);
        }
        ensureValidMsalToken(scopes, this.logger, result, getTokenOptions);
        this.logger.getToken.info(formatSuccess(scopes));
        return {
            token: result.accessToken,
            expiresOnTimestamp: result.expiresOn.getTime(),
        };
    }
    /**
     * Handles MSAL errors.
     */
    handleError(scopes, error, getTokenOptions) {
        if (error.name === "AuthError" ||
            error.name === "ClientAuthError" ||
            error.name === "BrowserAuthError") {
            const msalError = error;
            switch (msalError.errorCode) {
                case "endpoints_resolution_error":
                    this.logger.info(formatError(scopes, error.message));
                    return new CredentialUnavailableError(error.message);
                case "device_code_polling_cancelled":
                    return new abortController.AbortError("The authentication has been aborted by the caller.");
                case "consent_required":
                case "interaction_required":
                case "login_required":
                    this.logger.info(formatError(scopes, `Authentication returned errorCode ${msalError.errorCode}`));
                    break;
                default:
                    this.logger.info(formatError(scopes, `Failed to acquire token: ${error.message}`));
                    break;
            }
        }
        if (error.name === "ClientConfigurationError" ||
            error.name === "BrowserConfigurationAuthError" ||
            error.name === "AbortError") {
            return error;
        }
        return new AuthenticationRequiredError({ scopes, getTokenOptions, message: error.message });
    }
}
// transformations.ts
function publicToMsal(account) {
    const [environment] = account.authority.match(/([a-z]*\.[a-z]*\.[a-z]*)/) || [""];
    return Object.assign(Object.assign({}, account), { localAccountId: account.homeAccountId, environment });
}
function msalToPublic(clientId, account) {
    const record = {
        authority: getAuthority(account.tenantId, account.environment),
        homeAccountId: account.homeAccountId,
        tenantId: account.tenantId || DefaultTenantId,
        username: account.username,
        clientId,
        version: LatestAuthenticationRecordVersion,
    };
    return record;
}
/**
 * Serializes an `AuthenticationRecord` into a string.
 *
 * The output of a serialized authentication record will contain the following properties:
 *
 * - "authority"
 * - "homeAccountId"
 * - "clientId"
 * - "tenantId"
 * - "username"
 * - "version"
 *
 * To later convert this string to a serialized `AuthenticationRecord`, please use the exported function `deserializeAuthenticationRecord()`.
 */
function serializeAuthenticationRecord(record) {
    return JSON.stringify(record);
}
/**
 * Deserializes a previously serialized authentication record from a string into an object.
 *
 * The input string must contain the following properties:
 *
 * - "authority"
 * - "homeAccountId"
 * - "clientId"
 * - "tenantId"
 * - "username"
 * - "version"
 *
 * If the version we receive is unsupported, an error will be thrown.
 *
 * At the moment, the only available version is: "1.0", which is always set when the authentication record is serialized.
 *
 * @param serializedRecord - Authentication record previously serialized into string.
 * @returns AuthenticationRecord.
 */
function deserializeAuthenticationRecord(serializedRecord) {
    const parsed = JSON.parse(serializedRecord);
    if (parsed.version && parsed.version !== LatestAuthenticationRecordVersion) {
        throw Error("Unsupported AuthenticationRecord version");
    }
    return parsed;
}

// Copyright (c) Microsoft Corporation.
function createConfigurationErrorMessage(tenantId) {
    return `The current credential is not configured to acquire tokens for tenant ${tenantId}. To enable acquiring tokens for this tenant add it to the AdditionallyAllowedTenants on the credential options, or add "*" to AdditionallyAllowedTenants to allow acquiring tokens for any tenant.`;
}
/**
 * Of getToken contains a tenantId, this functions allows picking this tenantId as the appropriate for authentication,
 * unless multitenant authentication has been disabled through the AZURE_IDENTITY_DISABLE_MULTITENANTAUTH (on Node.js),
 * or unless the original tenant Id is `adfs`.
 * @internal
 */
function processMultiTenantRequest(tenantId, getTokenOptions, additionallyAllowedTenantIds = [], logger) {
    var _a;
    let resolvedTenantId;
    if (process.env.AZURE_IDENTITY_DISABLE_MULTITENANTAUTH) {
        resolvedTenantId = tenantId;
    }
    else if (tenantId === "adfs") {
        resolvedTenantId = tenantId;
    }
    else {
        resolvedTenantId = (_a = getTokenOptions === null || getTokenOptions === void 0 ? void 0 : getTokenOptions.tenantId) !== null && _a !== void 0 ? _a : tenantId;
    }
    if (tenantId &&
        resolvedTenantId !== tenantId &&
        !additionallyAllowedTenantIds.includes("*") &&
        !additionallyAllowedTenantIds.some((t) => t.localeCompare(resolvedTenantId) === 0)) {
        const message = createConfigurationErrorMessage(tenantId);
        logger === null || logger === void 0 ? void 0 : logger.info(message);
        throw new CredentialUnavailableError(message);
    }
    return resolvedTenantId;
}

// Copyright (c) Microsoft Corporation.
/**
 * @internal
 */
function checkTenantId(logger, tenantId) {
    if (!tenantId.match(/^[0-9a-zA-Z-.:/]+$/)) {
        const error = new Error("Invalid tenant id provided. You can locate your tenant id by following the instructions listed here: https://docs.microsoft.com/partner-center/find-ids-and-domain-names.");
        logger.info(formatError("", error));
        throw error;
    }
}
/**
 * @internal
 */
function resolveTenantId(logger, tenantId, clientId) {
    if (tenantId) {
        checkTenantId(logger, tenantId);
        return tenantId;
    }
    if (!clientId) {
        clientId = DeveloperSignOnClientId;
    }
    if (clientId !== DeveloperSignOnClientId) {
        return "common";
    }
    return "organizations";
}
/**
 * @internal
 */
function resolveAddionallyAllowedTenantIds(additionallyAllowedTenants) {
    if (!additionallyAllowedTenants || additionallyAllowedTenants.length === 0) {
        return [];
    }
    if (additionallyAllowedTenants.includes("*")) {
        return ALL_TENANTS;
    }
    return additionallyAllowedTenants;
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
function getIdentityTokenEndpointSuffix(tenantId) {
    if (tenantId === "adfs") {
        return "oauth2/token";
    }
    else {
        return "oauth2/v2.0/token";
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * Creates a span using the global tracer.
 * @internal
 */
const tracingClient = coreTracing.createTracingClient({
    namespace: "Microsoft.AAD",
    packageName: "@azure/identity",
    packageVersion: SDK_VERSION,
});

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const DefaultScopeSuffix = "/.default";
const imdsHost = "http://169.254.169.254";
const imdsEndpointPath = "/metadata/identity/oauth2/token";
const imdsApiVersion = "2018-02-01";
const azureArcAPIVersion = "2019-11-01";
const azureFabricVersion = "2019-07-01-preview";

// Copyright (c) Microsoft Corporation.
/**
 * Most MSIs send requests to the IMDS endpoint, or a similar endpoint.
 * These are GET requests that require sending a `resource` parameter on the query.
 * This resource can be derived from the scopes received through the getToken call, as long as only one scope is received.
 * Multiple scopes assume that the resulting token will have access to multiple resources, which won't be the case.
 *
 * For that reason, when we encounter multiple scopes, we return undefined.
 * It's up to the individual MSI implementations to throw the errors (which helps us provide less generic errors).
 */
function mapScopesToResource(scopes) {
    let scope = "";
    if (Array.isArray(scopes)) {
        if (scopes.length !== 1) {
            return;
        }
        scope = scopes[0];
    }
    else if (typeof scopes === "string") {
        scope = scopes;
    }
    if (!scope.endsWith(DefaultScopeSuffix)) {
        return scope;
    }
    return scope.substr(0, scope.lastIndexOf(DefaultScopeSuffix));
}
/**
 * Given a token response, return the expiration timestamp as the number of milliseconds from the Unix epoch.
 * @param body - A parsed response body from the authentication endpoint.
 */
function parseExpirationTimestamp(body) {
    if (typeof body.expires_on === "number") {
        return body.expires_on * 1000;
    }
    if (typeof body.expires_on === "string") {
        const asNumber = +body.expires_on;
        if (!isNaN(asNumber)) {
            return asNumber * 1000;
        }
        const asDate = Date.parse(body.expires_on);
        if (!isNaN(asDate)) {
            return asDate;
        }
    }
    if (typeof body.expires_in === "number") {
        return Date.now() + body.expires_in * 1000;
    }
    throw new Error(`Failed to parse token expiration from body. expires_in="${body.expires_in}", expires_on="${body.expires_on}"`);
}

// Copyright (c) Microsoft Corporation.
const noCorrelationId = "noCorrelationId";
/**
 * @internal
 */
function getIdentityClientAuthorityHost(options) {
    // The authorityHost can come from options or from the AZURE_AUTHORITY_HOST environment variable.
    let authorityHost = options === null || options === void 0 ? void 0 : options.authorityHost;
    // The AZURE_AUTHORITY_HOST environment variable can only be provided in Node.js.
    if (coreUtil.isNode) {
        authorityHost = authorityHost !== null && authorityHost !== void 0 ? authorityHost : process.env.AZURE_AUTHORITY_HOST;
    }
    // If the authorityHost is not provided, we use the default one from the public cloud: https://login.microsoftonline.com
    return authorityHost !== null && authorityHost !== void 0 ? authorityHost : DefaultAuthorityHost;
}
/**
 * The network module used by the Identity credentials.
 *
 * It allows for credentials to abort any pending request independently of the MSAL flow,
 * by calling to the `abortRequests()` method.
 *
 */
class IdentityClient extends coreClient.ServiceClient {
    constructor(options) {
        var _a, _b;
        const packageDetails = `azsdk-js-identity/${SDK_VERSION}`;
        const userAgentPrefix = ((_a = options === null || options === void 0 ? void 0 : options.userAgentOptions) === null || _a === void 0 ? void 0 : _a.userAgentPrefix)
            ? `${options.userAgentOptions.userAgentPrefix} ${packageDetails}`
            : `${packageDetails}`;
        const baseUri = getIdentityClientAuthorityHost(options);
        if (!baseUri.startsWith("https:")) {
            throw new Error("The authorityHost address must use the 'https' protocol.");
        }
        super(Object.assign(Object.assign({ requestContentType: "application/json; charset=utf-8", retryOptions: {
                maxRetries: 3,
            } }, options), { userAgentOptions: {
                userAgentPrefix,
            }, baseUri }));
        this.authorityHost = baseUri;
        this.abortControllers = new Map();
        this.allowLoggingAccountIdentifiers = (_b = options === null || options === void 0 ? void 0 : options.loggingOptions) === null || _b === void 0 ? void 0 : _b.allowLoggingAccountIdentifiers;
        // used for WorkloadIdentity
        this.tokenCredentialOptions = Object.assign({}, options);
    }
    async sendTokenRequest(request) {
        logger$n.info(`IdentityClient: sending token request to [${request.url}]`);
        const response = await this.sendRequest(request);
        if (response.bodyAsText && (response.status === 200 || response.status === 201)) {
            const parsedBody = JSON.parse(response.bodyAsText);
            if (!parsedBody.access_token) {
                return null;
            }
            this.logIdentifiers(response);
            const token = {
                accessToken: {
                    token: parsedBody.access_token,
                    expiresOnTimestamp: parseExpirationTimestamp(parsedBody),
                },
                refreshToken: parsedBody.refresh_token,
            };
            logger$n.info(`IdentityClient: [${request.url}] token acquired, expires on ${token.accessToken.expiresOnTimestamp}`);
            return token;
        }
        else {
            const error = new AuthenticationError(response.status, response.bodyAsText);
            logger$n.warning(`IdentityClient: authentication error. HTTP status: ${response.status}, ${error.errorResponse.errorDescription}`);
            throw error;
        }
    }
    async refreshAccessToken(tenantId, clientId, scopes, refreshToken, clientSecret, options = {}) {
        if (refreshToken === undefined) {
            return null;
        }
        logger$n.info(`IdentityClient: refreshing access token with client ID: ${clientId}, scopes: ${scopes} started`);
        const refreshParams = {
            grant_type: "refresh_token",
            client_id: clientId,
            refresh_token: refreshToken,
            scope: scopes,
        };
        if (clientSecret !== undefined) {
            refreshParams.client_secret = clientSecret;
        }
        const query = new URLSearchParams(refreshParams);
        return tracingClient.withSpan("IdentityClient.refreshAccessToken", options, async (updatedOptions) => {
            try {
                const urlSuffix = getIdentityTokenEndpointSuffix(tenantId);
                const request = coreRestPipeline.createPipelineRequest({
                    url: `${this.authorityHost}/${tenantId}/${urlSuffix}`,
                    method: "POST",
                    body: query.toString(),
                    abortSignal: options.abortSignal,
                    headers: coreRestPipeline.createHttpHeaders({
                        Accept: "application/json",
                        "Content-Type": "application/x-www-form-urlencoded",
                    }),
                    tracingOptions: updatedOptions.tracingOptions,
                });
                const response = await this.sendTokenRequest(request);
                logger$n.info(`IdentityClient: refreshed token for client ID: ${clientId}`);
                return response;
            }
            catch (err) {
                if (err.name === AuthenticationErrorName &&
                    err.errorResponse.error === "interaction_required") {
                    // It's likely that the refresh token has expired, so
                    // return null so that the credential implementation will
                    // initiate the authentication flow again.
                    logger$n.info(`IdentityClient: interaction required for client ID: ${clientId}`);
                    return null;
                }
                else {
                    logger$n.warning(`IdentityClient: failed refreshing token for client ID: ${clientId}: ${err}`);
                    throw err;
                }
            }
        });
    }
    // Here is a custom layer that allows us to abort requests that go through MSAL,
    // since MSAL doesn't allow us to pass options all the way through.
    generateAbortSignal(correlationId) {
        const controller = new abortController.AbortController();
        const controllers = this.abortControllers.get(correlationId) || [];
        controllers.push(controller);
        this.abortControllers.set(correlationId, controllers);
        const existingOnAbort = controller.signal.onabort;
        controller.signal.onabort = (...params) => {
            this.abortControllers.set(correlationId, undefined);
            if (existingOnAbort) {
                existingOnAbort(...params);
            }
        };
        return controller.signal;
    }
    abortRequests(correlationId) {
        const key = correlationId || noCorrelationId;
        const controllers = [
            ...(this.abortControllers.get(key) || []),
            // MSAL passes no correlation ID to the get requests...
            ...(this.abortControllers.get(noCorrelationId) || []),
        ];
        if (!controllers.length) {
            return;
        }
        for (const controller of controllers) {
            controller.abort();
        }
        this.abortControllers.set(key, undefined);
    }
    getCorrelationId(options) {
        var _a;
        const parameter = (_a = options === null || options === void 0 ? void 0 : options.body) === null || _a === void 0 ? void 0 : _a.split("&").map((part) => part.split("=")).find(([key]) => key === "client-request-id");
        return parameter && parameter.length ? parameter[1] || noCorrelationId : noCorrelationId;
    }
    // The MSAL network module methods follow
    async sendGetRequestAsync(url, options) {
        const request = coreRestPipeline.createPipelineRequest({
            url,
            method: "GET",
            body: options === null || options === void 0 ? void 0 : options.body,
            headers: coreRestPipeline.createHttpHeaders(options === null || options === void 0 ? void 0 : options.headers),
            abortSignal: this.generateAbortSignal(noCorrelationId),
        });
        const response = await this.sendRequest(request);
        this.logIdentifiers(response);
        return {
            body: response.bodyAsText ? JSON.parse(response.bodyAsText) : undefined,
            headers: response.headers.toJSON(),
            status: response.status,
        };
    }
    async sendPostRequestAsync(url, options) {
        const request = coreRestPipeline.createPipelineRequest({
            url,
            method: "POST",
            body: options === null || options === void 0 ? void 0 : options.body,
            headers: coreRestPipeline.createHttpHeaders(options === null || options === void 0 ? void 0 : options.headers),
            // MSAL doesn't send the correlation ID on the get requests.
            abortSignal: this.generateAbortSignal(this.getCorrelationId(options)),
        });
        const response = await this.sendRequest(request);
        this.logIdentifiers(response);
        return {
            body: response.bodyAsText ? JSON.parse(response.bodyAsText) : undefined,
            headers: response.headers.toJSON(),
            status: response.status,
        };
    }
    /**
     *
     * @internal
     */
    getTokenCredentialOptions() {
        return this.tokenCredentialOptions;
    }
    /**
     * If allowLoggingAccountIdentifiers was set on the constructor options
     * we try to log the account identifiers by parsing the received access token.
     *
     * The account identifiers we try to log are:
     * - `appid`: The application or Client Identifier.
     * - `upn`: User Principal Name.
     *   - It might not be available in some authentication scenarios.
     *   - If it's not available, we put a placeholder: "No User Principal Name available".
     * - `tid`: Tenant Identifier.
     * - `oid`: Object Identifier of the authenticated user.
     */
    logIdentifiers(response) {
        if (!this.allowLoggingAccountIdentifiers || !response.bodyAsText) {
            return;
        }
        const unavailableUpn = "No User Principal Name available";
        try {
            const parsed = response.parsedBody || JSON.parse(response.bodyAsText);
            const accessToken = parsed.access_token;
            if (!accessToken) {
                // Without an access token allowLoggingAccountIdentifiers isn't useful.
                return;
            }
            const base64Metadata = accessToken.split(".")[1];
            const { appid, upn, tid, oid } = JSON.parse(Buffer.from(base64Metadata, "base64").toString("utf8"));
            logger$n.info(`[Authenticated account] Client ID: ${appid}. Tenant ID: ${tid}. User Principal Name: ${upn || unavailableUpn}. Object ID (user): ${oid}`);
        }
        catch (e) {
            logger$n.warning("allowLoggingAccountIdentifiers was set, but we couldn't log the account information. Error:", e.message);
        }
    }
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Helps specify a regional authority, or "AutoDiscoverRegion" to auto-detect the region.
 */
var RegionalAuthority;
(function (RegionalAuthority) {
    /** Instructs MSAL to attempt to discover the region */
    RegionalAuthority["AutoDiscoverRegion"] = "AutoDiscoverRegion";
    /** Uses the {@link RegionalAuthority} for the Azure 'westus' region. */
    RegionalAuthority["USWest"] = "westus";
    /** Uses the {@link RegionalAuthority} for the Azure 'westus2' region. */
    RegionalAuthority["USWest2"] = "westus2";
    /** Uses the {@link RegionalAuthority} for the Azure 'centralus' region. */
    RegionalAuthority["USCentral"] = "centralus";
    /** Uses the {@link RegionalAuthority} for the Azure 'eastus' region. */
    RegionalAuthority["USEast"] = "eastus";
    /** Uses the {@link RegionalAuthority} for the Azure 'eastus2' region. */
    RegionalAuthority["USEast2"] = "eastus2";
    /** Uses the {@link RegionalAuthority} for the Azure 'northcentralus' region. */
    RegionalAuthority["USNorthCentral"] = "northcentralus";
    /** Uses the {@link RegionalAuthority} for the Azure 'southcentralus' region. */
    RegionalAuthority["USSouthCentral"] = "southcentralus";
    /** Uses the {@link RegionalAuthority} for the Azure 'westcentralus' region. */
    RegionalAuthority["USWestCentral"] = "westcentralus";
    /** Uses the {@link RegionalAuthority} for the Azure 'canadacentral' region. */
    RegionalAuthority["CanadaCentral"] = "canadacentral";
    /** Uses the {@link RegionalAuthority} for the Azure 'canadaeast' region. */
    RegionalAuthority["CanadaEast"] = "canadaeast";
    /** Uses the {@link RegionalAuthority} for the Azure 'brazilsouth' region. */
    RegionalAuthority["BrazilSouth"] = "brazilsouth";
    /** Uses the {@link RegionalAuthority} for the Azure 'northeurope' region. */
    RegionalAuthority["EuropeNorth"] = "northeurope";
    /** Uses the {@link RegionalAuthority} for the Azure 'westeurope' region. */
    RegionalAuthority["EuropeWest"] = "westeurope";
    /** Uses the {@link RegionalAuthority} for the Azure 'uksouth' region. */
    RegionalAuthority["UKSouth"] = "uksouth";
    /** Uses the {@link RegionalAuthority} for the Azure 'ukwest' region. */
    RegionalAuthority["UKWest"] = "ukwest";
    /** Uses the {@link RegionalAuthority} for the Azure 'francecentral' region. */
    RegionalAuthority["FranceCentral"] = "francecentral";
    /** Uses the {@link RegionalAuthority} for the Azure 'francesouth' region. */
    RegionalAuthority["FranceSouth"] = "francesouth";
    /** Uses the {@link RegionalAuthority} for the Azure 'switzerlandnorth' region. */
    RegionalAuthority["SwitzerlandNorth"] = "switzerlandnorth";
    /** Uses the {@link RegionalAuthority} for the Azure 'switzerlandwest' region. */
    RegionalAuthority["SwitzerlandWest"] = "switzerlandwest";
    /** Uses the {@link RegionalAuthority} for the Azure 'germanynorth' region. */
    RegionalAuthority["GermanyNorth"] = "germanynorth";
    /** Uses the {@link RegionalAuthority} for the Azure 'germanywestcentral' region. */
    RegionalAuthority["GermanyWestCentral"] = "germanywestcentral";
    /** Uses the {@link RegionalAuthority} for the Azure 'norwaywest' region. */
    RegionalAuthority["NorwayWest"] = "norwaywest";
    /** Uses the {@link RegionalAuthority} for the Azure 'norwayeast' region. */
    RegionalAuthority["NorwayEast"] = "norwayeast";
    /** Uses the {@link RegionalAuthority} for the Azure 'eastasia' region. */
    RegionalAuthority["AsiaEast"] = "eastasia";
    /** Uses the {@link RegionalAuthority} for the Azure 'southeastasia' region. */
    RegionalAuthority["AsiaSouthEast"] = "southeastasia";
    /** Uses the {@link RegionalAuthority} for the Azure 'japaneast' region. */
    RegionalAuthority["JapanEast"] = "japaneast";
    /** Uses the {@link RegionalAuthority} for the Azure 'japanwest' region. */
    RegionalAuthority["JapanWest"] = "japanwest";
    /** Uses the {@link RegionalAuthority} for the Azure 'australiaeast' region. */
    RegionalAuthority["AustraliaEast"] = "australiaeast";
    /** Uses the {@link RegionalAuthority} for the Azure 'australiasoutheast' region. */
    RegionalAuthority["AustraliaSouthEast"] = "australiasoutheast";
    /** Uses the {@link RegionalAuthority} for the Azure 'australiacentral' region. */
    RegionalAuthority["AustraliaCentral"] = "australiacentral";
    /** Uses the {@link RegionalAuthority} for the Azure 'australiacentral2' region. */
    RegionalAuthority["AustraliaCentral2"] = "australiacentral2";
    /** Uses the {@link RegionalAuthority} for the Azure 'centralindia' region. */
    RegionalAuthority["IndiaCentral"] = "centralindia";
    /** Uses the {@link RegionalAuthority} for the Azure 'southindia' region. */
    RegionalAuthority["IndiaSouth"] = "southindia";
    /** Uses the {@link RegionalAuthority} for the Azure 'westindia' region. */
    RegionalAuthority["IndiaWest"] = "westindia";
    /** Uses the {@link RegionalAuthority} for the Azure 'koreasouth' region. */
    RegionalAuthority["KoreaSouth"] = "koreasouth";
    /** Uses the {@link RegionalAuthority} for the Azure 'koreacentral' region. */
    RegionalAuthority["KoreaCentral"] = "koreacentral";
    /** Uses the {@link RegionalAuthority} for the Azure 'uaecentral' region. */
    RegionalAuthority["UAECentral"] = "uaecentral";
    /** Uses the {@link RegionalAuthority} for the Azure 'uaenorth' region. */
    RegionalAuthority["UAENorth"] = "uaenorth";
    /** Uses the {@link RegionalAuthority} for the Azure 'southafricanorth' region. */
    RegionalAuthority["SouthAfricaNorth"] = "southafricanorth";
    /** Uses the {@link RegionalAuthority} for the Azure 'southafricawest' region. */
    RegionalAuthority["SouthAfricaWest"] = "southafricawest";
    /** Uses the {@link RegionalAuthority} for the Azure 'chinanorth' region. */
    RegionalAuthority["ChinaNorth"] = "chinanorth";
    /** Uses the {@link RegionalAuthority} for the Azure 'chinaeast' region. */
    RegionalAuthority["ChinaEast"] = "chinaeast";
    /** Uses the {@link RegionalAuthority} for the Azure 'chinanorth2' region. */
    RegionalAuthority["ChinaNorth2"] = "chinanorth2";
    /** Uses the {@link RegionalAuthority} for the Azure 'chinaeast2' region. */
    RegionalAuthority["ChinaEast2"] = "chinaeast2";
    /** Uses the {@link RegionalAuthority} for the Azure 'germanycentral' region. */
    RegionalAuthority["GermanyCentral"] = "germanycentral";
    /** Uses the {@link RegionalAuthority} for the Azure 'germanynortheast' region. */
    RegionalAuthority["GermanyNorthEast"] = "germanynortheast";
    /** Uses the {@link RegionalAuthority} for the Azure 'usgovvirginia' region. */
    RegionalAuthority["GovernmentUSVirginia"] = "usgovvirginia";
    /** Uses the {@link RegionalAuthority} for the Azure 'usgoviowa' region. */
    RegionalAuthority["GovernmentUSIowa"] = "usgoviowa";
    /** Uses the {@link RegionalAuthority} for the Azure 'usgovarizona' region. */
    RegionalAuthority["GovernmentUSArizona"] = "usgovarizona";
    /** Uses the {@link RegionalAuthority} for the Azure 'usgovtexas' region. */
    RegionalAuthority["GovernmentUSTexas"] = "usgovtexas";
    /** Uses the {@link RegionalAuthority} for the Azure 'usdodeast' region. */
    RegionalAuthority["GovernmentUSDodEast"] = "usdodeast";
    /** Uses the {@link RegionalAuthority} for the Azure 'usdodcentral' region. */
    RegionalAuthority["GovernmentUSDodCentral"] = "usdodcentral";
})(RegionalAuthority || (RegionalAuthority = {}));

// Copyright (c) Microsoft Corporation.
/**
 * The current persistence provider, undefined by default.
 * @internal
 */
let persistenceProvider = undefined;
/**
 * An object that allows setting the persistence provider.
 * @internal
 */
const msalNodeFlowCacheControl = {
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
class MsalNode extends MsalBaseUtilities {
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
                    logLevel: getMSALLogLevel(logger$o.getLogLevel()),
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
            this.caeApp.public = new msalNode__namespace.PublicClientApplication(this.msalConfig);
        }
        else {
            this.app.public = new msalNode__namespace.PublicClientApplication(this.msalConfig);
        }
        if (this.getAssertion) {
            this.msalConfig.auth.clientAssertion = await this.getAssertion();
        }
        // The confidential client requires either a secret, assertion or certificate.
        if (this.msalConfig.auth.clientSecret ||
            this.msalConfig.auth.clientAssertion ||
            this.msalConfig.auth.clientCertificate) {
            if (options === null || options === void 0 ? void 0 : options.enableCae) {
                this.caeApp.confidential = new msalNode__namespace.ConfidentialClientApplication(this.msalConfig);
            }
            else {
                this.app.confidential = new msalNode__namespace.ConfidentialClientApplication(this.msalConfig);
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

// Copyright (c) Microsoft Corporation.
const CommonTenantId = "common";
const AzureAccountClientId = "aebc6443-996d-45c2-90f0-388ff96faa56"; // VSC: 'aebc6443-996d-45c2-90f0-388ff96faa56'
const logger$m = credentialLogger("VisualStudioCodeCredential");
let findCredentials = undefined;
const vsCodeCredentialControl = {
    setVsCodeCredentialFinder(finder) {
        findCredentials = finder;
    },
};
// Map of unsupported Tenant IDs and the errors we will be throwing.
const unsupportedTenantIds = {
    adfs: "The VisualStudioCodeCredential does not support authentication with ADFS tenants.",
};
function checkUnsupportedTenant(tenantId) {
    // If the Tenant ID isn't supported, we throw.
    const unsupportedTenantError = unsupportedTenantIds[tenantId];
    if (unsupportedTenantError) {
        throw new CredentialUnavailableError(unsupportedTenantError);
    }
}
const mapVSCodeAuthorityHosts = {
    AzureCloud: exports.AzureAuthorityHosts.AzurePublicCloud,
    AzureChina: exports.AzureAuthorityHosts.AzureChina,
    AzureGermanCloud: exports.AzureAuthorityHosts.AzureGermany,
    AzureUSGovernment: exports.AzureAuthorityHosts.AzureGovernment,
};
/**
 * Attempts to load a specific property from the VSCode configurations of the current OS.
 * If it fails at any point, returns undefined.
 */
function getPropertyFromVSCode(property) {
    const settingsPath = ["User", "settings.json"];
    // Eventually we can add more folders for more versions of VSCode.
    const vsCodeFolder = "Code";
    const homedir = os__default["default"].homedir();
    function loadProperty(...pathSegments) {
        const fullPath = path__default["default"].join(...pathSegments, vsCodeFolder, ...settingsPath);
        const settings = JSON.parse(fs__default["default"].readFileSync(fullPath, { encoding: "utf8" }));
        return settings[property];
    }
    try {
        let appData;
        switch (process.platform) {
            case "win32":
                appData = process.env.APPDATA;
                return appData ? loadProperty(appData) : undefined;
            case "darwin":
                return loadProperty(homedir, "Library", "Application Support");
            case "linux":
                return loadProperty(homedir, ".config");
            default:
                return;
        }
    }
    catch (e) {
        logger$m.info(`Failed to load the Visual Studio Code configuration file. Error: ${e.message}`);
        return;
    }
}
/**
 * Connects to Azure using the credential provided by the VSCode extension 'Azure Account'.
 * Once the user has logged in via the extension, this credential can share the same refresh token
 * that is cached by the extension.
 *
 * It's a [known issue](https://github.com/Azure/azure-sdk-for-js/issues/20500) that this credential doesn't
 * work with [Azure Account extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.azure-account)
 * versions newer than **0.9.11**. A long-term fix to this problem is in progress. In the meantime, consider
 * authenticating with {@link AzureCliCredential}.
 */
class VisualStudioCodeCredential {
    /**
     * Creates an instance of VisualStudioCodeCredential to use for automatically authenticating via VSCode.
     *
     * **Note**: `VisualStudioCodeCredential` is provided by a plugin package:
     * `@azure/identity-vscode`. If this package is not installed and registered
     * using the plugin API (`useIdentityPlugin`), then authentication using
     * `VisualStudioCodeCredential` will not be available.
     *
     * @param options - Options for configuring the client which makes the authentication request.
     */
    constructor(options) {
        // We want to make sure we use the one assigned by the user on the VSCode settings.
        // Or just `AzureCloud` by default.
        this.cloudName = (getPropertyFromVSCode("azure.cloud") || "AzureCloud");
        // Picking an authority host based on the cloud name.
        const authorityHost = mapVSCodeAuthorityHosts[this.cloudName];
        this.identityClient = new IdentityClient(Object.assign({ authorityHost }, options));
        if (options && options.tenantId) {
            checkTenantId(logger$m, options.tenantId);
            this.tenantId = options.tenantId;
        }
        else {
            this.tenantId = CommonTenantId;
        }
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        checkUnsupportedTenant(this.tenantId);
    }
    /**
     * Runs preparations for any further getToken request.
     */
    async prepare() {
        // Attempts to load the tenant from the VSCode configuration file.
        const settingsTenant = getPropertyFromVSCode("azure.tenant");
        if (settingsTenant) {
            this.tenantId = settingsTenant;
        }
        checkUnsupportedTenant(this.tenantId);
    }
    /**
     * Runs preparations for any further getToken, but only once.
     */
    prepareOnce() {
        if (!this.preparePromise) {
            this.preparePromise = this.prepare();
        }
        return this.preparePromise;
    }
    /**
     * Returns the token found by searching VSCode's authentication cache or
     * returns null if no token could be found.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure any requests this
     *                `TokenCredential` implementation might make.
     */
    async getToken(scopes, options) {
        var _a, _b;
        await this.prepareOnce();
        const tenantId = processMultiTenantRequest(this.tenantId, options, this.additionallyAllowedTenantIds, logger$m) || this.tenantId;
        if (findCredentials === undefined) {
            throw new CredentialUnavailableError([
                "No implementation of `VisualStudioCodeCredential` is available.",
                "You must install the identity-vscode plugin package (`npm install --save-dev @azure/identity-vscode`)",
                "and enable it by importing `useIdentityPlugin` from `@azure/identity` and calling",
                "`useIdentityPlugin(vsCodePlugin)` before creating a `VisualStudioCodeCredential`.",
                "To troubleshoot, visit https://aka.ms/azsdk/js/identity/vscodecredential/troubleshoot.",
            ].join(" "));
        }
        let scopeString = typeof scopes === "string" ? scopes : scopes.join(" ");
        // Check to make sure the scope we get back is a valid scope
        if (!scopeString.match(/^[0-9a-zA-Z-.:/]+$/)) {
            const error = new Error("Invalid scope was specified by the user or calling client");
            logger$m.getToken.info(formatError(scopes, error));
            throw error;
        }
        if (scopeString.indexOf("offline_access") < 0) {
            scopeString += " offline_access";
        }
        // findCredentials returns an array similar to:
        // [
        //   {
        //     account: "",
        //     password: "",
        //   },
        //   /* ... */
        // ]
        const credentials = await findCredentials();
        // If we can't find the credential based on the name, we'll pick the first one available.
        const { password: refreshToken } = (_b = (_a = credentials.find(({ account }) => account === this.cloudName)) !== null && _a !== void 0 ? _a : credentials[0]) !== null && _b !== void 0 ? _b : {};
        if (refreshToken) {
            const tokenResponse = await this.identityClient.refreshAccessToken(tenantId, AzureAccountClientId, scopeString, refreshToken, undefined);
            if (tokenResponse) {
                logger$m.getToken.info(formatSuccess(scopes));
                return tokenResponse.accessToken;
            }
            else {
                const error = new CredentialUnavailableError("Could not retrieve the token associated with Visual Studio Code. Have you connected using the 'Azure Account' extension recently? To troubleshoot, visit https://aka.ms/azsdk/js/identity/vscodecredential/troubleshoot.");
                logger$m.getToken.info(formatError(scopes, error));
                throw error;
            }
        }
        else {
            const error = new CredentialUnavailableError("Could not retrieve the token associated with Visual Studio Code. Did you connect using the 'Azure Account' extension? To troubleshoot, visit https://aka.ms/azsdk/js/identity/vscodecredential/troubleshoot.");
            logger$m.getToken.info(formatError(scopes, error));
            throw error;
        }
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * The context passed to an Identity plugin. This contains objects that
 * plugins can use to set backend implementations.
 * @internal
 */
const pluginContext = {
    cachePluginControl: msalNodeFlowCacheControl,
    vsCodeCredentialControl: vsCodeCredentialControl,
};
/**
 * Extend Azure Identity with additional functionality. Pass a plugin from
 * a plugin package, such as:
 *
 * - `@azure/identity-cache-persistence`: provides persistent token caching
 * - `@azure/identity-vscode`: provides the dependencies of
 *   `VisualStudioCodeCredential` and enables it
 *
 * Example:
 *
 * ```javascript
 * import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
 *
 * import { useIdentityPlugin, DefaultAzureCredential } from "@azure/identity";
 * useIdentityPlugin(cachePersistencePlugin);
 *
 * // The plugin has the capability to extend `DefaultAzureCredential` and to
 * // add middleware to the underlying credentials, such as persistence.
 * const credential = new DefaultAzureCredential({
 *   tokenCachePersistenceOptions: {
 *     enabled: true
 *   }
 * });
 * ```
 *
 * @param plugin - the plugin to register
 */
function useIdentityPlugin(plugin) {
    plugin(pluginContext);
}

// Copyright (c) Microsoft Corporation.
const msiName$6 = "ManagedIdentityCredential - AppServiceMSI 2017";
const logger$l = credentialLogger(msiName$6);
/**
 * Generates the options used on the request for an access token.
 */
function prepareRequestOptions$5(scopes, clientId) {
    const resource = mapScopesToResource(scopes);
    if (!resource) {
        throw new Error(`${msiName$6}: Multiple scopes are not supported.`);
    }
    const queryParameters = {
        resource,
        "api-version": "2017-09-01",
    };
    if (clientId) {
        queryParameters.clientid = clientId;
    }
    const query = new URLSearchParams(queryParameters);
    // This error should not bubble up, since we verify that this environment variable is defined in the isAvailable() method defined below.
    if (!process.env.MSI_ENDPOINT) {
        throw new Error(`${msiName$6}: Missing environment variable: MSI_ENDPOINT`);
    }
    if (!process.env.MSI_SECRET) {
        throw new Error(`${msiName$6}: Missing environment variable: MSI_SECRET`);
    }
    return {
        url: `${process.env.MSI_ENDPOINT}?${query.toString()}`,
        method: "GET",
        headers: coreRestPipeline.createHttpHeaders({
            Accept: "application/json",
            secret: process.env.MSI_SECRET,
        }),
    };
}
/**
 * Defines how to determine whether the Azure App Service MSI is available, and also how to retrieve a token from the Azure App Service MSI.
 */
const appServiceMsi2017 = {
    name: "appServiceMsi2017",
    async isAvailable({ scopes }) {
        const resource = mapScopesToResource(scopes);
        if (!resource) {
            logger$l.info(`${msiName$6}: Unavailable. Multiple scopes are not supported.`);
            return false;
        }
        const env = process.env;
        const result = Boolean(env.MSI_ENDPOINT && env.MSI_SECRET);
        if (!result) {
            logger$l.info(`${msiName$6}: Unavailable. The environment variables needed are: MSI_ENDPOINT and MSI_SECRET.`);
        }
        return result;
    },
    async getToken(configuration, getTokenOptions = {}) {
        const { identityClient, scopes, clientId, resourceId } = configuration;
        if (resourceId) {
            logger$l.warning(`${msiName$6}: managed Identity by resource Id is not supported. Argument resourceId might be ignored by the service.`);
        }
        logger$l.info(`${msiName$6}: Using the endpoint and the secret coming form the environment variables: MSI_ENDPOINT=${process.env.MSI_ENDPOINT} and MSI_SECRET=[REDACTED].`);
        const request = coreRestPipeline.createPipelineRequest(Object.assign(Object.assign({ abortSignal: getTokenOptions.abortSignal }, prepareRequestOptions$5(scopes, clientId)), { 
            // Generally, MSI endpoints use the HTTP protocol, without transport layer security (TLS).
            allowInsecureConnection: true }));
        const tokenResponse = await identityClient.sendTokenRequest(request);
        return (tokenResponse && tokenResponse.accessToken) || null;
    },
};

// Copyright (c) Microsoft Corporation.
const msiName$5 = "ManagedIdentityCredential - CloudShellMSI";
const logger$k = credentialLogger(msiName$5);
/**
 * Generates the options used on the request for an access token.
 */
function prepareRequestOptions$4(scopes, clientId, resourceId) {
    const resource = mapScopesToResource(scopes);
    if (!resource) {
        throw new Error(`${msiName$5}: Multiple scopes are not supported.`);
    }
    const body = {
        resource,
    };
    if (clientId) {
        body.client_id = clientId;
    }
    if (resourceId) {
        body.msi_res_id = resourceId;
    }
    // This error should not bubble up, since we verify that this environment variable is defined in the isAvailable() method defined below.
    if (!process.env.MSI_ENDPOINT) {
        throw new Error(`${msiName$5}: Missing environment variable: MSI_ENDPOINT`);
    }
    const params = new URLSearchParams(body);
    return {
        url: process.env.MSI_ENDPOINT,
        method: "POST",
        body: params.toString(),
        headers: coreRestPipeline.createHttpHeaders({
            Accept: "application/json",
            Metadata: "true",
            "Content-Type": "application/x-www-form-urlencoded",
        }),
    };
}
/**
 * Defines how to determine whether the Azure Cloud Shell MSI is available, and also how to retrieve a token from the Azure Cloud Shell MSI.
 * Since Azure Managed Identities aren't available in the Azure Cloud Shell, we log a warning for users that try to access cloud shell using user assigned identity.
 */
const cloudShellMsi = {
    name: "cloudShellMsi",
    async isAvailable({ scopes }) {
        const resource = mapScopesToResource(scopes);
        if (!resource) {
            logger$k.info(`${msiName$5}: Unavailable. Multiple scopes are not supported.`);
            return false;
        }
        const result = Boolean(process.env.MSI_ENDPOINT);
        if (!result) {
            logger$k.info(`${msiName$5}: Unavailable. The environment variable MSI_ENDPOINT is needed.`);
        }
        return result;
    },
    async getToken(configuration, getTokenOptions = {}) {
        const { identityClient, scopes, clientId, resourceId } = configuration;
        if (clientId) {
            logger$k.warning(`${msiName$5}: user-assigned identities not supported. The argument clientId might be ignored by the service.`);
        }
        if (resourceId) {
            logger$k.warning(`${msiName$5}: user defined managed Identity by resource Id not supported. The argument resourceId might be ignored by the service.`);
        }
        logger$k.info(`${msiName$5}: Using the endpoint coming form the environment variable MSI_ENDPOINT = ${process.env.MSI_ENDPOINT}.`);
        const request = coreRestPipeline.createPipelineRequest(Object.assign(Object.assign({ abortSignal: getTokenOptions.abortSignal }, prepareRequestOptions$4(scopes, clientId, resourceId)), { 
            // Generally, MSI endpoints use the HTTP protocol, without transport layer security (TLS).
            allowInsecureConnection: true }));
        const tokenResponse = await identityClient.sendTokenRequest(request);
        return (tokenResponse && tokenResponse.accessToken) || null;
    },
};

// Copyright (c) Microsoft Corporation.
const msiName$4 = "ManagedIdentityCredential - IMDS";
const logger$j = credentialLogger(msiName$4);
/**
 * Generates the options used on the request for an access token.
 */
function prepareRequestOptions$3(scopes, clientId, resourceId, options) {
    var _a;
    const resource = mapScopesToResource(scopes);
    if (!resource) {
        throw new Error(`${msiName$4}: Multiple scopes are not supported.`);
    }
    const { skipQuery, skipMetadataHeader } = options || {};
    let query = "";
    // Pod Identity will try to process this request even if the Metadata header is missing.
    // We can exclude the request query to ensure no IMDS endpoint tries to process the ping request.
    if (!skipQuery) {
        const queryParameters = {
            resource,
            "api-version": imdsApiVersion,
        };
        if (clientId) {
            queryParameters.client_id = clientId;
        }
        if (resourceId) {
            queryParameters.msi_res_id = resourceId;
        }
        const params = new URLSearchParams(queryParameters);
        query = `?${params.toString()}`;
    }
    const url = new URL(imdsEndpointPath, (_a = process.env.AZURE_POD_IDENTITY_AUTHORITY_HOST) !== null && _a !== void 0 ? _a : imdsHost);
    const rawHeaders = {
        Accept: "application/json",
        Metadata: "true",
    };
    // Remove the Metadata header to invoke a request error from some IMDS endpoints.
    if (skipMetadataHeader) {
        delete rawHeaders.Metadata;
    }
    return {
        // In this case, the `?` should be added in the "query" variable `skipQuery` is not set.
        url: `${url}${query}`,
        method: "GET",
        headers: coreRestPipeline.createHttpHeaders(rawHeaders),
    };
}
// 800ms -> 1600ms -> 3200ms
const imdsMsiRetryConfig = {
    maxRetries: 3,
    startDelayInMs: 800,
    intervalIncrement: 2,
};
/**
 * Defines how to determine whether the Azure IMDS MSI is available, and also how to retrieve a token from the Azure IMDS MSI.
 */
const imdsMsi = {
    name: "imdsMsi",
    async isAvailable({ scopes, identityClient, clientId, resourceId, getTokenOptions = {}, }) {
        const resource = mapScopesToResource(scopes);
        if (!resource) {
            logger$j.info(`${msiName$4}: Unavailable. Multiple scopes are not supported.`);
            return false;
        }
        // if the PodIdentityEndpoint environment variable was set no need to probe the endpoint, it can be assumed to exist
        if (process.env.AZURE_POD_IDENTITY_AUTHORITY_HOST) {
            return true;
        }
        if (!identityClient) {
            throw new Error("Missing IdentityClient");
        }
        const requestOptions = prepareRequestOptions$3(resource, clientId, resourceId, {
            skipMetadataHeader: true,
            skipQuery: true,
        });
        return tracingClient.withSpan("ManagedIdentityCredential-pingImdsEndpoint", getTokenOptions, async (options) => {
            var _a;
            requestOptions.tracingOptions = options.tracingOptions;
            // Create a request with a timeout since we expect that
            // not having a "Metadata" header should cause an error to be
            // returned quickly from the endpoint, proving its availability.
            const request = coreRestPipeline.createPipelineRequest(requestOptions);
            // Default to 300 if the default of 0 is used.
            // Negative values can still be used to disable the timeout.
            request.timeout = ((_a = options.requestOptions) === null || _a === void 0 ? void 0 : _a.timeout) || 300;
            // This MSI uses the imdsEndpoint to get the token, which only uses http://
            request.allowInsecureConnection = true;
            try {
                logger$j.info(`${msiName$4}: Pinging the Azure IMDS endpoint`);
                await identityClient.sendRequest(request);
            }
            catch (err) {
                // If the request failed, or Node.js was unable to establish a connection,
                // or the host was down, we'll assume the IMDS endpoint isn't available.
                if (coreUtil.isError(err)) {
                    logger$j.verbose(`${msiName$4}: Caught error ${err.name}: ${err.message}`);
                }
                logger$j.info(`${msiName$4}: The Azure IMDS endpoint is unavailable`);
                return false;
            }
            // If we received any response, the endpoint is available
            logger$j.info(`${msiName$4}: The Azure IMDS endpoint is available`);
            return true;
        });
    },
    async getToken(configuration, getTokenOptions = {}) {
        const { identityClient, scopes, clientId, resourceId } = configuration;
        if (process.env.AZURE_POD_IDENTITY_AUTHORITY_HOST) {
            logger$j.info(`${msiName$4}: Using the Azure IMDS endpoint coming from the environment variable AZURE_POD_IDENTITY_AUTHORITY_HOST=${process.env.AZURE_POD_IDENTITY_AUTHORITY_HOST}.`);
        }
        else {
            logger$j.info(`${msiName$4}: Using the default Azure IMDS endpoint ${imdsHost}.`);
        }
        let nextDelayInMs = imdsMsiRetryConfig.startDelayInMs;
        for (let retries = 0; retries < imdsMsiRetryConfig.maxRetries; retries++) {
            try {
                const request = coreRestPipeline.createPipelineRequest(Object.assign(Object.assign({ abortSignal: getTokenOptions.abortSignal }, prepareRequestOptions$3(scopes, clientId, resourceId)), { allowInsecureConnection: true }));
                const tokenResponse = await identityClient.sendTokenRequest(request);
                return (tokenResponse && tokenResponse.accessToken) || null;
            }
            catch (error) {
                if (error.statusCode === 404) {
                    await coreUtil.delay(nextDelayInMs);
                    nextDelayInMs *= imdsMsiRetryConfig.intervalIncrement;
                    continue;
                }
                throw error;
            }
        }
        throw new AuthenticationError(404, `${msiName$4}: Failed to retrieve IMDS token after ${imdsMsiRetryConfig.maxRetries} retries.`);
    },
};

// Copyright (c) Microsoft Corporation.
const msiName$3 = "ManagedIdentityCredential - Azure Arc MSI";
const logger$i = credentialLogger(msiName$3);
/**
 * Generates the options used on the request for an access token.
 */
function prepareRequestOptions$2(scopes, clientId, resourceId) {
    const resource = mapScopesToResource(scopes);
    if (!resource) {
        throw new Error(`${msiName$3}: Multiple scopes are not supported.`);
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
        throw new Error(`${msiName$3}: Missing environment variable: IDENTITY_ENDPOINT`);
    }
    const query = new URLSearchParams(queryParameters);
    return coreRestPipeline.createPipelineRequest({
        // Should be similar to: http://localhost:40342/metadata/identity/oauth2/token
        url: `${process.env.IDENTITY_ENDPOINT}?${query.toString()}`,
        method: "GET",
        headers: coreRestPipeline.createHttpHeaders({
            Accept: "application/json",
            Metadata: "true",
        }),
    });
}
/**
 * Retrieves the file contents at the given path using promises.
 * Useful since `fs`'s readFileSync locks the thread, and to avoid extra dependencies.
 */
function readFileAsync$1(path, options) {
    return new Promise((resolve, reject) => fs.readFile(path, options, (err, data) => {
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
    const response = await identityClient.sendRequest(coreRestPipeline.createPipelineRequest(requestPrepareOptions));
    if (response.status !== 401) {
        let message = "";
        if (response.bodyAsText) {
            message = ` Response: ${response.bodyAsText}`;
        }
        throw new AuthenticationError(response.status, `${msiName$3}: To authenticate with Azure Arc MSI, status code 401 is expected on the first request. ${message}`);
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
const arcMsi = {
    name: "arc",
    async isAvailable({ scopes }) {
        const resource = mapScopesToResource(scopes);
        if (!resource) {
            logger$i.info(`${msiName$3}: Unavailable. Multiple scopes are not supported.`);
            return false;
        }
        const result = Boolean(process.env.IMDS_ENDPOINT && process.env.IDENTITY_ENDPOINT);
        if (!result) {
            logger$i.info(`${msiName$3}: The environment variables needed are: IMDS_ENDPOINT and IDENTITY_ENDPOINT`);
        }
        return result;
    },
    async getToken(configuration, getTokenOptions = {}) {
        var _a;
        const { identityClient, scopes, clientId, resourceId } = configuration;
        if (clientId) {
            logger$i.warning(`${msiName$3}: user-assigned identities not supported. The argument clientId might be ignored by the service.`);
        }
        if (resourceId) {
            logger$i.warning(`${msiName$3}: user defined managed Identity by resource Id is not supported. Argument resourceId will be ignored.`);
        }
        logger$i.info(`${msiName$3}: Authenticating.`);
        const requestOptions = Object.assign(Object.assign({ disableJsonStringifyOnBody: true, deserializationMapper: undefined, abortSignal: getTokenOptions.abortSignal }, prepareRequestOptions$2(scopes, clientId, resourceId)), { allowInsecureConnection: true });
        const filePath = await filePathRequest(identityClient, requestOptions);
        if (!filePath) {
            throw new Error(`${msiName$3}: Failed to find the token file.`);
        }
        const key = await readFileAsync$1(filePath, { encoding: "utf-8" });
        (_a = requestOptions.headers) === null || _a === void 0 ? void 0 : _a.set("Authorization", `Basic ${key}`);
        const request = coreRestPipeline.createPipelineRequest(Object.assign(Object.assign({}, requestOptions), { 
            // Generally, MSI endpoints use the HTTP protocol, without transport layer security (TLS).
            allowInsecureConnection: true }));
        const tokenResponse = await identityClient.sendTokenRequest(request);
        return (tokenResponse && tokenResponse.accessToken) || null;
    },
};

// Copyright (c) Microsoft Corporation.
/**
 * MSAL client assertion client. Calls to MSAL's confidential application's `acquireTokenByClientCredential` during `doGetToken`.
 * @internal
 */
class MsalClientAssertion extends MsalNode {
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
                err2 = coreUtil.isError(err) ? err : new Error(String(err));
            }
            throw this.handleError(scopes, err2, options);
        }
    }
}

// Copyright (c) Microsoft Corporation.
const logger$h = credentialLogger("ClientAssertionCredential");
/**
 * Authenticates a service principal with a JWT assertion.
 */
class ClientAssertionCredential {
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
        this.msalFlow = new MsalClientAssertion(Object.assign(Object.assign({}, options), { logger: logger$h, clientId: this.clientId, tenantId: this.tenantId, tokenCredentialOptions: this.options, getAssertion }));
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
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger$h);
            const arrayScopes = Array.isArray(scopes) ? scopes : [scopes];
            return this.msalFlow.getToken(arrayScopes, newOptions);
        });
    }
}

// Copyright (c) Microsoft Corporation.
const credentialName$3 = "WorkloadIdentityCredential";
/**
 * Contains the list of all supported environment variable names so that an
 * appropriate error message can be generated when no credentials can be
 * configured.
 *
 * @internal
 */
const SupportedWorkloadEnvironmentVariables = [
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_FEDERATED_TOKEN_FILE",
];
const logger$g = credentialLogger(credentialName$3);
/**
 * Workload Identity authentication is a feature in Azure that allows applications running on virtual machines (VMs)
 * to access other Azure resources without the need for a service principal or managed identity. With Workload Identity
 * authentication, applications authenticate themselves using their own identity, rather than using a shared service
 * principal or managed identity. Under the hood, Workload Identity authentication uses the concept of Service Account
 * Credentials (SACs), which are automatically created by Azure and stored securely in the VM. By using Workload
 * Identity authentication, you can avoid the need to manage and rotate service principals or managed identities for
 * each application on each VM. Additionally, because SACs are created automatically and managed by Azure, you don't
 * need to worry about storing and securing sensitive credentials themselves.
 * The WorkloadIdentityCredential supports Azure workload identity authentication on Azure Kubernetes and acquires
 * a token using the SACs available in the Azure Kubernetes environment.
 * Refer to <a href="https://learn.microsoft.com/azure/aks/workload-identity-overview">Azure Active Directory
 * Workload Identity</a> for more information.
 */
class WorkloadIdentityCredential {
    /**
     * WorkloadIdentityCredential supports Azure workload identity on Kubernetes.
     *
     * @param options - The identity client options to use for authentication.
     */
    constructor(options) {
        this.azureFederatedTokenFileContent = undefined;
        this.cacheDate = undefined;
        // Logging environment variables for error details
        const assignedEnv = processEnvVars(SupportedWorkloadEnvironmentVariables).assigned.join(", ");
        logger$g.info(`Found the following environment variables: ${assignedEnv}`);
        const workloadIdentityCredentialOptions = options !== null && options !== void 0 ? options : {};
        const tenantId = workloadIdentityCredentialOptions.tenantId || process.env.AZURE_TENANT_ID;
        const clientId = workloadIdentityCredentialOptions.clientId || process.env.AZURE_CLIENT_ID;
        this.federatedTokenFilePath =
            workloadIdentityCredentialOptions.tokenFilePath || process.env.AZURE_FEDERATED_TOKEN_FILE;
        if (tenantId) {
            checkTenantId(logger$g, tenantId);
        }
        if (clientId && tenantId && this.federatedTokenFilePath) {
            logger$g.info(`Invoking ClientAssertionCredential with tenant ID: ${tenantId}, clientId: ${workloadIdentityCredentialOptions.clientId} and federated token path: [REDACTED]`);
            this.client = new ClientAssertionCredential(tenantId, clientId, this.readFileContents.bind(this), options);
        }
    }
    /**
     * Authenticates with Azure Active Directory and returns an access token if successful.
     * If authentication fails, a {@link CredentialUnavailableError} will be thrown with the details of the failure.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure any requests this
     *                TokenCredential implementation might make.
     */
    async getToken(scopes, options) {
        if (!this.client) {
            const errorMessage = `${credentialName$3}: is unavailable. tenantId, clientId, and federatedTokenFilePath are required parameters. 
      In DefaultAzureCredential and ManagedIdentityCredential, these can be provided as environment variables - 
      "AZURE_TENANT_ID",
      "AZURE_CLIENT_ID",
      "AZURE_FEDERATED_TOKEN_FILE". See the troubleshooting guide for more information: https://aka.ms/azsdk/js/identity/workloadidentitycredential/troubleshoot  `;
            logger$g.info(errorMessage);
            throw new CredentialUnavailableError(errorMessage);
        }
        logger$g.info("Invoking getToken() of Client Assertion Credential");
        return this.client.getToken(scopes, options);
    }
    async readFileContents() {
        // Cached assertions expire after 5 minutes
        if (this.cacheDate !== undefined && Date.now() - this.cacheDate >= 1000 * 60 * 5) {
            this.azureFederatedTokenFileContent = undefined;
        }
        if (!this.federatedTokenFilePath) {
            throw new CredentialUnavailableError(`${credentialName$3}: is unavailable. Invalid file path provided ${this.federatedTokenFilePath}.`);
        }
        if (!this.azureFederatedTokenFileContent) {
            const file = await promises.readFile(this.federatedTokenFilePath, "utf8");
            const value = file.trim();
            if (!value) {
                throw new CredentialUnavailableError(`${credentialName$3}: is unavailable. No content on the file ${this.federatedTokenFilePath}.`);
            }
            else {
                this.azureFederatedTokenFileContent = value;
                this.cacheDate = Date.now();
            }
        }
        return this.azureFederatedTokenFileContent;
    }
}

// Copyright (c) Microsoft Corporation.
const msiName$2 = "ManagedIdentityCredential - Token Exchange";
const logger$f = credentialLogger(msiName$2);
/**
 * Defines how to determine whether the token exchange MSI is available, and also how to retrieve a token from the token exchange MSI.
 */
function tokenExchangeMsi() {
    return {
        name: "tokenExchangeMsi",
        async isAvailable({ clientId }) {
            const env = process.env;
            const result = Boolean((clientId || env.AZURE_CLIENT_ID) &&
                env.AZURE_TENANT_ID &&
                process.env.AZURE_FEDERATED_TOKEN_FILE);
            if (!result) {
                logger$f.info(`${msiName$2}: Unavailable. The environment variables needed are: AZURE_CLIENT_ID (or the client ID sent through the parameters), AZURE_TENANT_ID and AZURE_FEDERATED_TOKEN_FILE`);
            }
            return result;
        },
        async getToken(configuration, getTokenOptions = {}) {
            const { scopes, clientId } = configuration;
            const identityClientTokenCredentialOptions = {};
            const workloadIdentityCredential = new WorkloadIdentityCredential(Object.assign(Object.assign({ clientId, tenantId: process.env.AZURE_TENANT_ID, tokenFilePath: process.env.AZURE_FEDERATED_TOKEN_FILE }, identityClientTokenCredentialOptions), { disableInstanceDiscovery: true }));
            const token = await workloadIdentityCredential.getToken(scopes, getTokenOptions);
            return token;
        },
    };
}

// Copyright (c) Microsoft Corporation.
// This MSI can be easily tested by deploying a container to Azure Service Fabric with the Dockerfile:
//
//   FROM node:12
//   RUN wget https://host.any/path/bash.sh
//   CMD ["bash", "bash.sh"]
//
// Where the bash script contains:
//
//   curl --insecure $IDENTITY_ENDPOINT'?api-version=2019-07-01-preview&resource=https://vault.azure.net/' -H "Secret: $IDENTITY_HEADER"
//
const msiName$1 = "ManagedIdentityCredential - Fabric MSI";
const logger$e = credentialLogger(msiName$1);
/**
 * Generates the options used on the request for an access token.
 */
function prepareRequestOptions$1(scopes, clientId, resourceId) {
    const resource = mapScopesToResource(scopes);
    if (!resource) {
        throw new Error(`${msiName$1}: Multiple scopes are not supported.`);
    }
    const queryParameters = {
        resource,
        "api-version": azureFabricVersion,
    };
    if (clientId) {
        queryParameters.client_id = clientId;
    }
    if (resourceId) {
        queryParameters.msi_res_id = resourceId;
    }
    const query = new URLSearchParams(queryParameters);
    // This error should not bubble up, since we verify that this environment variable is defined in the isAvailable() method defined below.
    if (!process.env.IDENTITY_ENDPOINT) {
        throw new Error("Missing environment variable: IDENTITY_ENDPOINT");
    }
    if (!process.env.IDENTITY_HEADER) {
        throw new Error("Missing environment variable: IDENTITY_HEADER");
    }
    return {
        url: `${process.env.IDENTITY_ENDPOINT}?${query.toString()}`,
        method: "GET",
        headers: coreRestPipeline.createHttpHeaders({
            Accept: "application/json",
            secret: process.env.IDENTITY_HEADER,
        }),
    };
}
/**
 * Defines how to determine whether the Azure Service Fabric MSI is available, and also how to retrieve a token from the Azure Service Fabric MSI.
 */
const fabricMsi = {
    name: "fabricMsi",
    async isAvailable({ scopes }) {
        const resource = mapScopesToResource(scopes);
        if (!resource) {
            logger$e.info(`${msiName$1}: Unavailable. Multiple scopes are not supported.`);
            return false;
        }
        const env = process.env;
        const result = Boolean(env.IDENTITY_ENDPOINT && env.IDENTITY_HEADER && env.IDENTITY_SERVER_THUMBPRINT);
        if (!result) {
            logger$e.info(`${msiName$1}: Unavailable. The environment variables needed are: IDENTITY_ENDPOINT, IDENTITY_HEADER and IDENTITY_SERVER_THUMBPRINT`);
        }
        return result;
    },
    async getToken(configuration, getTokenOptions = {}) {
        const { scopes, identityClient, clientId, resourceId } = configuration;
        if (resourceId) {
            logger$e.warning(`${msiName$1}: user defined managed Identity by resource Id is not supported. Argument resourceId might be ignored by the service.`);
        }
        logger$e.info([
            `${msiName$1}:`,
            "Using the endpoint and the secret coming from the environment variables:",
            `IDENTITY_ENDPOINT=${process.env.IDENTITY_ENDPOINT},`,
            "IDENTITY_HEADER=[REDACTED] and",
            "IDENTITY_SERVER_THUMBPRINT=[REDACTED].",
        ].join(" "));
        const request = coreRestPipeline.createPipelineRequest(Object.assign({ abortSignal: getTokenOptions.abortSignal }, prepareRequestOptions$1(scopes, clientId, resourceId)));
        request.agent = new https__default["default"].Agent({
            // This is necessary because Service Fabric provides a self-signed certificate.
            // The alternative path is to verify the certificate using the IDENTITY_SERVER_THUMBPRINT env variable.
            rejectUnauthorized: false,
        });
        const tokenResponse = await identityClient.sendTokenRequest(request);
        return (tokenResponse && tokenResponse.accessToken) || null;
    },
};

// Copyright (c) Microsoft Corporation.
const msiName = "ManagedIdentityCredential - AppServiceMSI 2019";
const logger$d = credentialLogger(msiName);
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
        "api-version": "2019-08-01",
    };
    if (clientId) {
        queryParameters.client_id = clientId;
    }
    if (resourceId) {
        queryParameters.mi_res_id = resourceId;
    }
    const query = new URLSearchParams(queryParameters);
    // This error should not bubble up, since we verify that this environment variable is defined in the isAvailable() method defined below.
    if (!process.env.IDENTITY_ENDPOINT) {
        throw new Error(`${msiName}: Missing environment variable: IDENTITY_ENDPOINT`);
    }
    if (!process.env.IDENTITY_HEADER) {
        throw new Error(`${msiName}: Missing environment variable: IDENTITY_HEADER`);
    }
    return {
        url: `${process.env.IDENTITY_ENDPOINT}?${query.toString()}`,
        method: "GET",
        headers: coreRestPipeline.createHttpHeaders({
            Accept: "application/json",
            "X-IDENTITY-HEADER": process.env.IDENTITY_HEADER,
        }),
    };
}
/**
 * Defines how to determine whether the Azure App Service MSI is available, and also how to retrieve a token from the Azure App Service MSI.
 */
const appServiceMsi2019 = {
    name: "appServiceMsi2019",
    async isAvailable({ scopes }) {
        const resource = mapScopesToResource(scopes);
        if (!resource) {
            logger$d.info(`${msiName}: Unavailable. Multiple scopes are not supported.`);
            return false;
        }
        const env = process.env;
        const result = Boolean(env.IDENTITY_ENDPOINT && env.IDENTITY_HEADER);
        if (!result) {
            logger$d.info(`${msiName}: Unavailable. The environment variables needed are: IDENTITY_ENDPOINT and IDENTITY_HEADER.`);
        }
        return result;
    },
    async getToken(configuration, getTokenOptions = {}) {
        const { identityClient, scopes, clientId, resourceId } = configuration;
        logger$d.info(`${msiName}: Using the endpoint and the secret coming form the environment variables: IDENTITY_ENDPOINT=${process.env.IDENTITY_ENDPOINT} and IDENTITY_HEADER=[REDACTED].`);
        const request = coreRestPipeline.createPipelineRequest(Object.assign(Object.assign({ abortSignal: getTokenOptions.abortSignal }, prepareRequestOptions(scopes, clientId, resourceId)), { 
            // Generally, MSI endpoints use the HTTP protocol, without transport layer security (TLS).
            allowInsecureConnection: true }));
        const tokenResponse = await identityClient.sendTokenRequest(request);
        return (tokenResponse && tokenResponse.accessToken) || null;
    },
};

// Copyright (c) Microsoft Corporation.
const logger$c = credentialLogger("ManagedIdentityCredential");
/**
 * Attempts authentication using a managed identity available at the deployment environment.
 * This authentication type works in Azure VMs, App Service instances, Azure Functions applications,
 * Azure Kubernetes Services, Azure Service Fabric instances and inside of the Azure Cloud Shell.
 *
 * More information about configuring managed identities can be found here:
 * https://docs.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/overview
 */
class ManagedIdentityCredential {
    /**
     * @internal
     * @hidden
     */
    constructor(clientIdOrOptions, options) {
        var _a;
        this.isEndpointUnavailable = null;
        this.isAppTokenProviderInitialized = false;
        let _options;
        if (typeof clientIdOrOptions === "string") {
            this.clientId = clientIdOrOptions;
            _options = options;
        }
        else {
            this.clientId = clientIdOrOptions === null || clientIdOrOptions === void 0 ? void 0 : clientIdOrOptions.clientId;
            _options = clientIdOrOptions;
        }
        this.resourceId = _options === null || _options === void 0 ? void 0 : _options.resourceId;
        // For JavaScript users.
        if (this.clientId && this.resourceId) {
            throw new Error(`${ManagedIdentityCredential.name} - Client Id and Resource Id can't be provided at the same time.`);
        }
        this.identityClient = new IdentityClient(_options);
        this.isAvailableIdentityClient = new IdentityClient(Object.assign(Object.assign({}, _options), { retryOptions: {
                maxRetries: 0,
            } }));
        /**  authority host validation and metadata discovery to be skipped in managed identity
         * since this wasn't done previously before adding token cache support
         */
        this.confidentialApp = new msalNode.ConfidentialClientApplication({
            auth: {
                clientId: (_a = this.clientId) !== null && _a !== void 0 ? _a : DeveloperSignOnClientId,
                clientSecret: "dummy-secret",
                cloudDiscoveryMetadata: '{"tenant_discovery_endpoint":"https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration","api-version":"1.1","metadata":[{"preferred_network":"login.microsoftonline.com","preferred_cache":"login.windows.net","aliases":["login.microsoftonline.com","login.windows.net","login.microsoft.com","sts.windows.net"]},{"preferred_network":"login.partner.microsoftonline.cn","preferred_cache":"login.partner.microsoftonline.cn","aliases":["login.partner.microsoftonline.cn","login.chinacloudapi.cn"]},{"preferred_network":"login.microsoftonline.de","preferred_cache":"login.microsoftonline.de","aliases":["login.microsoftonline.de"]},{"preferred_network":"login.microsoftonline.us","preferred_cache":"login.microsoftonline.us","aliases":["login.microsoftonline.us","login.usgovcloudapi.net"]},{"preferred_network":"login-us.microsoftonline.com","preferred_cache":"login-us.microsoftonline.com","aliases":["login-us.microsoftonline.com"]}]}',
                authorityMetadata: '{"token_endpoint":"https://login.microsoftonline.com/common/oauth2/v2.0/token","token_endpoint_auth_methods_supported":["client_secret_post","private_key_jwt","client_secret_basic"],"jwks_uri":"https://login.microsoftonline.com/common/discovery/v2.0/keys","response_modes_supported":["query","fragment","form_post"],"subject_types_supported":["pairwise"],"id_token_signing_alg_values_supported":["RS256"],"response_types_supported":["code","id_token","code id_token","id_token token"],"scopes_supported":["openid","profile","email","offline_access"],"issuer":"https://login.microsoftonline.com/{tenantid}/v2.0","request_uri_parameter_supported":false,"userinfo_endpoint":"https://graph.microsoft.com/oidc/userinfo","authorization_endpoint":"https://login.microsoftonline.com/common/oauth2/v2.0/authorize","device_authorization_endpoint":"https://login.microsoftonline.com/common/oauth2/v2.0/devicecode","http_logout_supported":true,"frontchannel_logout_supported":true,"end_session_endpoint":"https://login.microsoftonline.com/common/oauth2/v2.0/logout","claims_supported":["sub","iss","cloud_instance_name","cloud_instance_host_name","cloud_graph_host_name","msgraph_host","aud","exp","iat","auth_time","acr","nonce","preferred_username","name","tid","ver","at_hash","c_hash","email"],"kerberos_endpoint":"https://login.microsoftonline.com/common/kerberos","tenant_region_scope":null,"cloud_instance_name":"microsoftonline.com","cloud_graph_host_name":"graph.windows.net","msgraph_host":"graph.microsoft.com","rbac_url":"https://pas.windows.net"}',
                clientCapabilities: [],
            },
            system: {
                loggerOptions: {
                    logLevel: getMSALLogLevel(logger$o.getLogLevel()),
                },
            },
        });
    }
    async cachedAvailableMSI(scopes, getTokenOptions) {
        if (this.cachedMSI) {
            return this.cachedMSI;
        }
        const MSIs = [
            arcMsi,
            fabricMsi,
            appServiceMsi2019,
            appServiceMsi2017,
            cloudShellMsi,
            tokenExchangeMsi(),
            imdsMsi,
        ];
        for (const msi of MSIs) {
            if (await msi.isAvailable({
                scopes,
                identityClient: this.isAvailableIdentityClient,
                clientId: this.clientId,
                resourceId: this.resourceId,
                getTokenOptions,
            })) {
                this.cachedMSI = msi;
                return msi;
            }
        }
        throw new CredentialUnavailableError(`${ManagedIdentityCredential.name} - No MSI credential available`);
    }
    async authenticateManagedIdentity(scopes, getTokenOptions) {
        const { span, updatedOptions } = tracingClient.startSpan(`${ManagedIdentityCredential.name}.authenticateManagedIdentity`, getTokenOptions);
        try {
            // Determining the available MSI, and avoiding checking for other MSIs while the program is running.
            const availableMSI = await this.cachedAvailableMSI(scopes, updatedOptions);
            return availableMSI.getToken({
                identityClient: this.identityClient,
                scopes,
                clientId: this.clientId,
                resourceId: this.resourceId,
            }, updatedOptions);
        }
        catch (err) {
            span.setStatus({
                status: "error",
                error: err,
            });
            throw err;
        }
        finally {
            span.end();
        }
    }
    /**
     * Authenticates with Azure Active Directory and returns an access token if successful.
     * If authentication fails, a {@link CredentialUnavailableError} will be thrown with the details of the failure.
     * If an unexpected error occurs, an {@link AuthenticationError} will be thrown with the details of the failure.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure any requests this
     *                TokenCredential implementation might make.
     */
    async getToken(scopes, options) {
        let result = null;
        const { span, updatedOptions } = tracingClient.startSpan(`${ManagedIdentityCredential.name}.getToken`, options);
        try {
            // isEndpointAvailable can be true, false, or null,
            // If it's null, it means we don't yet know whether
            // the endpoint is available and need to check for it.
            if (this.isEndpointUnavailable !== true) {
                const availableMSI = await this.cachedAvailableMSI(scopes, updatedOptions);
                if (availableMSI.name === "tokenExchangeMsi") {
                    result = await this.authenticateManagedIdentity(scopes, updatedOptions);
                }
                else {
                    const appTokenParameters = {
                        correlationId: this.identityClient.getCorrelationId(),
                        tenantId: (options === null || options === void 0 ? void 0 : options.tenantId) || "organizations",
                        scopes: Array.isArray(scopes) ? scopes : [scopes],
                        claims: options === null || options === void 0 ? void 0 : options.claims,
                    };
                    // Added a check to see if SetAppTokenProvider was already defined.
                    this.initializeSetAppTokenProvider();
                    const authenticationResult = await this.confidentialApp.acquireTokenByClientCredential(Object.assign({}, appTokenParameters));
                    result = this.handleResult(scopes, authenticationResult || undefined);
                }
                if (result === null) {
                    // If authenticateManagedIdentity returns null,
                    // it means no MSI endpoints are available.
                    // If so, we avoid trying to reach to them in future requests.
                    this.isEndpointUnavailable = true;
                    // It also means that the endpoint answered with either 200 or 201 (see the sendTokenRequest method),
                    // yet we had no access token. For this reason, we'll throw once with a specific message:
                    const error = new CredentialUnavailableError("The managed identity endpoint was reached, yet no tokens were received.");
                    logger$c.getToken.info(formatError(scopes, error));
                    throw error;
                }
                // Since `authenticateManagedIdentity` didn't throw, and the result was not null,
                // We will assume that this endpoint is reachable from this point forward,
                // and avoid pinging again to it.
                this.isEndpointUnavailable = false;
            }
            else {
                // We've previously determined that the endpoint was unavailable,
                // either because it was unreachable or permanently unable to authenticate.
                const error = new CredentialUnavailableError("The managed identity endpoint is not currently available");
                logger$c.getToken.info(formatError(scopes, error));
                throw error;
            }
            logger$c.getToken.info(formatSuccess(scopes));
            return result;
        }
        catch (err) {
            // CredentialUnavailable errors are expected to reach here.
            // We intend them to bubble up, so that DefaultAzureCredential can catch them.
            if (err.name === "AuthenticationRequiredError") {
                throw err;
            }
            // Expected errors to reach this point:
            // - Errors coming from a method unexpectedly breaking.
            // - When identityClient.sendTokenRequest throws, in which case
            //   if the status code was 400, it means that the endpoint is working,
            //   but no identity is available.
            span.setStatus({
                status: "error",
                error: err,
            });
            // If either the network is unreachable,
            // we can safely assume the credential is unavailable.
            if (err.code === "ENETUNREACH") {
                const error = new CredentialUnavailableError(`${ManagedIdentityCredential.name}: Unavailable. Network unreachable. Message: ${err.message}`);
                logger$c.getToken.info(formatError(scopes, error));
                throw error;
            }
            // If either the host was unreachable,
            // we can safely assume the credential is unavailable.
            if (err.code === "EHOSTUNREACH") {
                const error = new CredentialUnavailableError(`${ManagedIdentityCredential.name}: Unavailable. No managed identity endpoint found. Message: ${err.message}`);
                logger$c.getToken.info(formatError(scopes, error));
                throw error;
            }
            // If err.statusCode has a value of 400, it comes from sendTokenRequest,
            // and it means that the endpoint is working, but that no identity is available.
            if (err.statusCode === 400) {
                throw new CredentialUnavailableError(`${ManagedIdentityCredential.name}: The managed identity endpoint is indicating there's no available identity. Message: ${err.message}`);
            }
            // If the error has no status code, we can assume there was no available identity.
            // This will throw silently during any ChainedTokenCredential.
            if (err.statusCode === undefined) {
                throw new CredentialUnavailableError(`${ManagedIdentityCredential.name}: Authentication failed. Message ${err.message}`);
            }
            // Any other error should break the chain.
            throw new AuthenticationError(err.statusCode, {
                error: `${ManagedIdentityCredential.name} authentication failed.`,
                error_description: err.message,
            });
        }
        finally {
            // Finally is always called, both if we return and if we throw in the above try/catch.
            span.end();
        }
    }
    /**
     * Handles the MSAL authentication result.
     * If the result has an account, we update the local account reference.
     * If the token received is invalid, an error will be thrown depending on what's missing.
     */
    handleResult(scopes, result, getTokenOptions) {
        this.ensureValidMsalToken(scopes, result, getTokenOptions);
        logger$c.getToken.info(formatSuccess(scopes));
        return {
            token: result.accessToken,
            expiresOnTimestamp: result.expiresOn.getTime(),
        };
    }
    /**
     * Ensures the validity of the MSAL token
     * @internal
     */
    ensureValidMsalToken(scopes, msalToken, getTokenOptions) {
        const error = (message) => {
            logger$c.getToken.info(message);
            return new AuthenticationRequiredError({
                scopes: Array.isArray(scopes) ? scopes : [scopes],
                getTokenOptions,
                message,
            });
        };
        if (!msalToken) {
            throw error("No response");
        }
        if (!msalToken.expiresOn) {
            throw error(`Response had no "expiresOn" property.`);
        }
        if (!msalToken.accessToken) {
            throw error(`Response had no "accessToken" property.`);
        }
    }
    initializeSetAppTokenProvider() {
        if (!this.isAppTokenProviderInitialized) {
            this.confidentialApp.SetAppTokenProvider(async (appTokenProviderParameters) => {
                logger$c.info(`SetAppTokenProvider invoked with parameters- ${JSON.stringify(appTokenProviderParameters)}`);
                const getTokenOptions = Object.assign({}, appTokenProviderParameters);
                logger$c.info(`authenticateManagedIdentity invoked with scopes- ${JSON.stringify(appTokenProviderParameters.scopes)} and getTokenOptions - ${JSON.stringify(getTokenOptions)}`);
                const resultToken = await this.authenticateManagedIdentity(appTokenProviderParameters.scopes, getTokenOptions);
                if (resultToken) {
                    logger$c.info(`SetAppTokenProvider will save the token in cache`);
                    const expiresInSeconds = (resultToken === null || resultToken === void 0 ? void 0 : resultToken.expiresOnTimestamp)
                        ? Math.floor((resultToken.expiresOnTimestamp - Date.now()) / 1000)
                        : 0;
                    return {
                        accessToken: resultToken === null || resultToken === void 0 ? void 0 : resultToken.token,
                        expiresInSeconds,
                    };
                }
                else {
                    logger$c.info(`SetAppTokenProvider token has "no_access_token_returned" as the saved token`);
                    return {
                        accessToken: "no_access_token_returned",
                        expiresInSeconds: 0,
                    };
                }
            });
            this.isAppTokenProviderInitialized = true;
        }
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * Ensures the scopes value is an array.
 * @internal
 */
function ensureScopes(scopes) {
    return Array.isArray(scopes) ? scopes : [scopes];
}
/**
 * Throws if the received scope is not valid.
 * @internal
 */
function ensureValidScopeForDevTimeCreds(scope, logger) {
    if (!scope.match(/^[0-9a-zA-Z-.:/]+$/)) {
        const error = new Error("Invalid scope was specified by the user or calling client");
        logger.getToken.info(formatError(scope, error));
        throw error;
    }
}
/**
 * Returns the resource out of a scope.
 * @internal
 */
function getScopeResource(scope) {
    return scope.replace(/\/.default$/, "");
}

// Copyright (c) Microsoft Corporation.
/**
 * Mockable reference to the CLI credential cliCredentialFunctions
 * @internal
 */
const cliCredentialInternals = {
    /**
     * @internal
     */
    getSafeWorkingDir() {
        if (process.platform === "win32") {
            if (!process.env.SystemRoot) {
                throw new Error("Azure CLI credential expects a 'SystemRoot' environment variable");
            }
            return process.env.SystemRoot;
        }
        else {
            return "/bin";
        }
    },
    /**
     * Gets the access token from Azure CLI
     * @param resource - The resource to use when getting the token
     * @internal
     */
    async getAzureCliAccessToken(resource, tenantId, timeout) {
        let tenantSection = [];
        if (tenantId) {
            tenantSection = ["--tenant", tenantId];
        }
        return new Promise((resolve, reject) => {
            try {
                child_process__default["default"].execFile("az", [
                    "account",
                    "get-access-token",
                    "--output",
                    "json",
                    "--resource",
                    resource,
                    ...tenantSection,
                ], { cwd: cliCredentialInternals.getSafeWorkingDir(), shell: true, timeout }, (error, stdout, stderr) => {
                    resolve({ stdout: stdout, stderr: stderr, error });
                });
            }
            catch (err) {
                reject(err);
            }
        });
    },
};
const logger$b = credentialLogger("AzureCliCredential");
/**
 * This credential will use the currently logged-in user login information
 * via the Azure CLI ('az') commandline tool.
 * To do so, it will read the user access token and expire time
 * with Azure CLI command "az account get-access-token".
 */
class AzureCliCredential {
    /**
     * Creates an instance of the {@link AzureCliCredential}.
     *
     * To use this credential, ensure that you have already logged
     * in via the 'az' tool using the command "az login" from the commandline.
     *
     * @param options - Options, to optionally allow multi-tenant requests.
     */
    constructor(options) {
        this.tenantId = options === null || options === void 0 ? void 0 : options.tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        this.timeout = options === null || options === void 0 ? void 0 : options.processTimeoutInMs;
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
        const tenantId = processMultiTenantRequest(this.tenantId, options, this.additionallyAllowedTenantIds);
        const scope = typeof scopes === "string" ? scopes : scopes[0];
        logger$b.getToken.info(`Using the scope ${scope}`);
        return tracingClient.withSpan(`${this.constructor.name}.getToken`, options, async () => {
            var _a, _b, _c, _d;
            try {
                ensureValidScopeForDevTimeCreds(scope, logger$b);
                const resource = getScopeResource(scope);
                const obj = await cliCredentialInternals.getAzureCliAccessToken(resource, tenantId, this.timeout);
                const specificScope = (_a = obj.stderr) === null || _a === void 0 ? void 0 : _a.match("(.*)az login --scope(.*)");
                const isLoginError = ((_b = obj.stderr) === null || _b === void 0 ? void 0 : _b.match("(.*)az login(.*)")) && !specificScope;
                const isNotInstallError = ((_c = obj.stderr) === null || _c === void 0 ? void 0 : _c.match("az:(.*)not found")) || ((_d = obj.stderr) === null || _d === void 0 ? void 0 : _d.startsWith("'az' is not recognized"));
                if (isNotInstallError) {
                    const error = new CredentialUnavailableError("Azure CLI could not be found. Please visit https://aka.ms/azure-cli for installation instructions and then, once installed, authenticate to your Azure account using 'az login'.");
                    logger$b.getToken.info(formatError(scopes, error));
                    throw error;
                }
                if (isLoginError) {
                    const error = new CredentialUnavailableError("Please run 'az login' from a command prompt to authenticate before using this credential.");
                    logger$b.getToken.info(formatError(scopes, error));
                    throw error;
                }
                try {
                    const responseData = obj.stdout;
                    const response = JSON.parse(responseData);
                    logger$b.getToken.info(formatSuccess(scopes));
                    const returnValue = {
                        token: response.accessToken,
                        expiresOnTimestamp: new Date(response.expiresOn).getTime(),
                    };
                    return returnValue;
                }
                catch (e) {
                    if (obj.stderr) {
                        throw new CredentialUnavailableError(obj.stderr);
                    }
                    throw e;
                }
            }
            catch (err) {
                const error = err.name === "CredentialUnavailableError"
                    ? err
                    : new CredentialUnavailableError(err.message || "Unknown error while trying to retrieve the access token");
                logger$b.getToken.info(formatError(scopes, error));
                throw error;
            }
        });
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * Easy to mock childProcess utils.
 * @internal
 */
const processUtils = {
    /**
     * Promisifying childProcess.execFile
     * @internal
     */
    execFile(file, params, options) {
        return new Promise((resolve, reject) => {
            child_process__namespace.execFile(file, params, options, (error, stdout, stderr) => {
                if (Buffer.isBuffer(stdout)) {
                    stdout = stdout.toString("utf8");
                }
                if (Buffer.isBuffer(stderr)) {
                    stderr = stderr.toString("utf8");
                }
                if (stderr || error) {
                    reject(stderr ? new Error(stderr) : error);
                }
                else {
                    resolve(stdout);
                }
            });
        });
    },
};

// Copyright (c) Microsoft Corporation.
const logger$a = credentialLogger("AzurePowerShellCredential");
const isWindows = process.platform === "win32";
/**
 * Returns a platform-appropriate command name by appending ".exe" on Windows.
 *
 * @internal
 */
function formatCommand(commandName) {
    if (isWindows) {
        return `${commandName}.exe`;
    }
    else {
        return commandName;
    }
}
/**
 * Receives a list of commands to run, executes them, then returns the outputs.
 * If anything fails, an error is thrown.
 * @internal
 */
async function runCommands(commands, timeout) {
    const results = [];
    for (const command of commands) {
        const [file, ...parameters] = command;
        const result = (await processUtils.execFile(file, parameters, {
            encoding: "utf8",
            timeout,
        }));
        results.push(result);
    }
    return results;
}
/**
 * Known PowerShell errors
 * @internal
 */
const powerShellErrors = {
    login: "Run Connect-AzAccount to login",
    installed: "The specified module 'Az.Accounts' with version '2.2.0' was not loaded because no valid module file was found in any module directory",
};
/**
 * Messages to use when throwing in this credential.
 * @internal
 */
const powerShellPublicErrorMessages = {
    login: "Please run 'Connect-AzAccount' from PowerShell to authenticate before using this credential.",
    installed: `The 'Az.Account' module >= 2.2.0 is not installed. Install the Azure Az PowerShell module with: "Install-Module -Name Az -Scope CurrentUser -Repository PSGallery -Force".`,
    troubleshoot: `To troubleshoot, visit https://aka.ms/azsdk/js/identity/powershellcredential/troubleshoot.`,
};
// PowerShell Azure User not logged in error check.
const isLoginError = (err) => err.message.match(`(.*)${powerShellErrors.login}(.*)`);
// Az Module not Installed in Azure PowerShell check.
const isNotInstalledError = (err) => err.message.match(powerShellErrors.installed);
/**
 * The PowerShell commands to be tried, in order.
 *
 * @internal
 */
const commandStack = [formatCommand("pwsh")];
if (isWindows) {
    commandStack.push(formatCommand("powershell"));
}
/**
 * This credential will use the currently logged-in user information from the
 * Azure PowerShell module. To do so, it will read the user access token and
 * expire time with Azure PowerShell command `Get-AzAccessToken -ResourceUrl {ResourceScope}`
 */
class AzurePowerShellCredential {
    /**
     * Creates an instance of the {@link AzurePowerShellCredential}.
     *
     * To use this credential:
     * - Install the Azure Az PowerShell module with:
     *   `Install-Module -Name Az -Scope CurrentUser -Repository PSGallery -Force`.
     * - You have already logged in to Azure PowerShell using the command
     * `Connect-AzAccount` from the command line.
     *
     * @param options - Options, to optionally allow multi-tenant requests.
     */
    constructor(options) {
        this.tenantId = options === null || options === void 0 ? void 0 : options.tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        this.timeout = options === null || options === void 0 ? void 0 : options.processTimeoutInMs;
    }
    /**
     * Gets the access token from Azure PowerShell
     * @param resource - The resource to use when getting the token
     */
    async getAzurePowerShellAccessToken(resource, tenantId, timeout) {
        // Clone the stack to avoid mutating it while iterating
        for (const powerShellCommand of [...commandStack]) {
            try {
                await runCommands([[powerShellCommand, "/?"]], timeout);
            }
            catch (e) {
                // Remove this credential from the original stack so that we don't try it again.
                commandStack.shift();
                continue;
            }
            let tenantSection = "";
            if (tenantId) {
                tenantSection = `-TenantId "${tenantId}"`;
            }
            const results = await runCommands([
                [
                    powerShellCommand,
                    "-Command",
                    "Import-Module Az.Accounts -MinimumVersion 2.2.0 -PassThru",
                ],
                [
                    powerShellCommand,
                    "-Command",
                    `Get-AzAccessToken ${tenantSection} -ResourceUrl "${resource}" | ConvertTo-Json`,
                ],
            ]);
            const result = results[1];
            try {
                return JSON.parse(result);
            }
            catch (e) {
                throw new Error(`Unable to parse the output of PowerShell. Received output: ${result}`);
            }
        }
        throw new Error(`Unable to execute PowerShell. Ensure that it is installed in your system`);
    }
    /**
     * Authenticates with Azure Active Directory and returns an access token if successful.
     * If the authentication cannot be performed through PowerShell, a {@link CredentialUnavailableError} will be thrown.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure any requests this TokenCredential implementation might make.
     */
    async getToken(scopes, options = {}) {
        return tracingClient.withSpan(`${this.constructor.name}.getToken`, options, async () => {
            const tenantId = processMultiTenantRequest(this.tenantId, options, this.additionallyAllowedTenantIds);
            const scope = typeof scopes === "string" ? scopes : scopes[0];
            try {
                ensureValidScopeForDevTimeCreds(scope, logger$a);
                logger$a.getToken.info(`Using the scope ${scope}`);
                const resource = getScopeResource(scope);
                const response = await this.getAzurePowerShellAccessToken(resource, tenantId, this.timeout);
                logger$a.getToken.info(formatSuccess(scopes));
                return {
                    token: response.Token,
                    expiresOnTimestamp: new Date(response.ExpiresOn).getTime(),
                };
            }
            catch (err) {
                if (isNotInstalledError(err)) {
                    const error = new CredentialUnavailableError(powerShellPublicErrorMessages.installed);
                    logger$a.getToken.info(formatError(scope, error));
                    throw error;
                }
                else if (isLoginError(err)) {
                    const error = new CredentialUnavailableError(powerShellPublicErrorMessages.login);
                    logger$a.getToken.info(formatError(scope, error));
                    throw error;
                }
                const error = new CredentialUnavailableError(`${err}. ${powerShellPublicErrorMessages.troubleshoot}`);
                logger$a.getToken.info(formatError(scope, error));
                throw error;
            }
        });
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * @internal
 */
const logger$9 = credentialLogger("ChainedTokenCredential");
/**
 * Enables multiple `TokenCredential` implementations to be tried in order
 * until one of the getToken methods returns an access token.
 */
class ChainedTokenCredential {
    /**
     * Creates an instance of ChainedTokenCredential using the given credentials.
     *
     * @param sources - `TokenCredential` implementations to be tried in order.
     *
     * Example usage:
     * ```javascript
     * const firstCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
     * const secondCredential = new ClientSecretCredential(tenantId, anotherClientId, anotherSecret);
     * const credentialChain = new ChainedTokenCredential(firstCredential, secondCredential);
     * ```
     */
    constructor(...sources) {
        this._sources = [];
        this._sources = sources;
    }
    /**
     * Returns the first access token returned by one of the chained
     * `TokenCredential` implementations.  Throws an {@link AggregateAuthenticationError}
     * when one or more credentials throws an {@link AuthenticationError} and
     * no credentials have returned an access token.
     *
     * This method is called automatically by Azure SDK client libraries. You may call this method
     * directly, but you must also handle token caching and token refreshing.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure any requests this
     *                `TokenCredential` implementation might make.
     */
    async getToken(scopes, options = {}) {
        const { token } = await this.getTokenInternal(scopes, options);
        return token;
    }
    async getTokenInternal(scopes, options = {}) {
        let token = null;
        let successfulCredential;
        const errors = [];
        return tracingClient.withSpan("ChainedTokenCredential.getToken", options, async (updatedOptions) => {
            for (let i = 0; i < this._sources.length && token === null; i++) {
                try {
                    token = await this._sources[i].getToken(scopes, updatedOptions);
                    successfulCredential = this._sources[i];
                }
                catch (err) {
                    if (err.name === "CredentialUnavailableError" ||
                        err.name === "AuthenticationRequiredError") {
                        errors.push(err);
                    }
                    else {
                        logger$9.getToken.info(formatError(scopes, err));
                        throw err;
                    }
                }
            }
            if (!token && errors.length > 0) {
                const err = new AggregateAuthenticationError(errors, "ChainedTokenCredential authentication failed.");
                logger$9.getToken.info(formatError(scopes, err));
                throw err;
            }
            logger$9.getToken.info(`Result for ${successfulCredential.constructor.name}: ${formatSuccess(scopes)}`);
            if (token === null) {
                throw new CredentialUnavailableError("Failed to retrieve a valid token");
            }
            return { token, successfulCredential };
        });
    }
}

// Copyright (c) Microsoft Corporation.
const readFileAsync = util.promisify(fs.readFile);
/**
 * Tries to asynchronously load a certificate from the given path.
 *
 * @param configuration - Either the PEM value or the path to the certificate.
 * @param sendCertificateChain - Option to include x5c header for SubjectName and Issuer name authorization.
 * @returns - The certificate parts, or `undefined` if the certificate could not be loaded.
 * @internal
 */
async function parseCertificate(configuration, sendCertificateChain) {
    const certificateParts = {};
    const certificate = configuration
        .certificate;
    const certificatePath = configuration
        .certificatePath;
    certificateParts.certificateContents =
        certificate || (await readFileAsync(certificatePath, "utf8"));
    if (sendCertificateChain) {
        certificateParts.x5c = certificateParts.certificateContents;
    }
    const certificatePattern = /(-+BEGIN CERTIFICATE-+)(\n\r?|\r\n?)([A-Za-z0-9+/\n\r]+=*)(\n\r?|\r\n?)(-+END CERTIFICATE-+)/g;
    const publicKeys = [];
    // Match all possible certificates, in the order they are in the file. These will form the chain that is used for x5c
    let match;
    do {
        match = certificatePattern.exec(certificateParts.certificateContents);
        if (match) {
            publicKeys.push(match[3]);
        }
    } while (match);
    if (publicKeys.length === 0) {
        throw new Error("The file at the specified path does not contain a PEM-encoded certificate.");
    }
    certificateParts.thumbprint = crypto.createHash("sha1")
        .update(Buffer.from(publicKeys[0], "base64"))
        .digest("hex")
        .toUpperCase();
    return certificateParts;
}
/**
 * MSAL client certificate client. Calls to MSAL's confidential application's `acquireTokenByClientCredential` during `doGetToken`.
 * @internal
 */
class MsalClientCertificate extends MsalNode {
    constructor(options) {
        super(options);
        this.requiresConfidential = true;
        this.configuration = options.configuration;
        this.sendCertificateChain = options.sendCertificateChain;
    }
    // Changing the MSAL configuration asynchronously
    async init(options) {
        try {
            const parts = await parseCertificate(this.configuration, this.sendCertificateChain);
            let privateKey;
            if (this.configuration.certificatePassword !== undefined) {
                const privateKeyObject = crypto.createPrivateKey({
                    key: parts.certificateContents,
                    passphrase: this.configuration.certificatePassword,
                    format: "pem",
                });
                privateKey = privateKeyObject
                    .export({
                    format: "pem",
                    type: "pkcs8",
                })
                    .toString();
            }
            else {
                privateKey = parts.certificateContents;
            }
            this.msalConfig.auth.clientCertificate = {
                thumbprint: parts.thumbprint,
                privateKey: privateKey,
                x5c: parts.x5c,
            };
        }
        catch (error) {
            this.logger.info(formatError("", error));
            throw error;
        }
        return super.init(options);
    }
    async doGetToken(scopes, options = {}) {
        try {
            const clientCredReq = {
                scopes,
                correlationId: options.correlationId,
                azureRegion: this.azureRegion,
                authority: options.authority,
                claims: options.claims,
            };
            const result = await this.getApp("confidential", options.enableCae).acquireTokenByClientCredential(clientCredReq);
            // Even though we're providing the same default in memory persistence cache that we use for DeviceCodeCredential,
            // The Client Credential flow does not return the account information from the authentication service,
            // so each time getToken gets called, we will have to acquire a new token through the service.
            return this.handleResult(scopes, this.clientId, result || undefined);
        }
        catch (err) {
            throw this.handleError(scopes, err, options);
        }
    }
}

// Copyright (c) Microsoft Corporation.
const credentialName$2 = "ClientCertificateCredential";
const logger$8 = credentialLogger(credentialName$2);
/**
 * Enables authentication to Azure Active Directory using a PEM-encoded
 * certificate that is assigned to an App Registration. More information
 * on how to configure certificate authentication can be found here:
 *
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/active-directory-certificate-credentials#register-your-certificate-with-azure-ad
 *
 */
class ClientCertificateCredential {
    constructor(tenantId, clientId, certificatePathOrConfiguration, options = {}) {
        if (!tenantId || !clientId) {
            throw new Error(`${credentialName$2}: tenantId and clientId are required parameters.`);
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
            throw new Error(`${credentialName$2}: Provide either a PEM certificate in string form, or the path to that certificate in the filesystem. To troubleshoot, visit https://aka.ms/azsdk/js/identity/serviceprincipalauthentication/troubleshoot.`);
        }
        if (certificate && certificatePath) {
            throw new Error(`${credentialName$2}: To avoid unexpected behaviors, providing both the contents of a PEM certificate and the path to a PEM certificate is forbidden. To troubleshoot, visit https://aka.ms/azsdk/js/identity/serviceprincipalauthentication/troubleshoot.`);
        }
        this.msalFlow = new MsalClientCertificate(Object.assign(Object.assign({}, options), { configuration,
            logger: logger$8,
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
        return tracingClient.withSpan(`${credentialName$2}.getToken`, options, async (newOptions) => {
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger$8);
            const arrayScopes = Array.isArray(scopes) ? scopes : [scopes];
            return this.msalFlow.getToken(arrayScopes, newOptions);
        });
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * MSAL client secret client. Calls to MSAL's confidential application's `acquireTokenByClientCredential` during `doGetToken`.
 * @internal
 */
class MsalClientSecret extends MsalNode {
    constructor(options) {
        super(options);
        this.requiresConfidential = true;
        this.msalConfig.auth.clientSecret = options.clientSecret;
    }
    async doGetToken(scopes, options = {}) {
        try {
            const result = await this.getApp("confidential", options.enableCae).acquireTokenByClientCredential({
                scopes,
                correlationId: options.correlationId,
                azureRegion: this.azureRegion,
                authority: options.authority,
                claims: options.claims,
            });
            // The Client Credential flow does not return an account,
            // so each time getToken gets called, we will have to acquire a new token through the service.
            return this.handleResult(scopes, this.clientId, result || undefined);
        }
        catch (err) {
            throw this.handleError(scopes, err, options);
        }
    }
}

// Copyright (c) Microsoft Corporation.
const logger$7 = credentialLogger("ClientSecretCredential");
/**
 * Enables authentication to Azure Active Directory using a client secret
 * that was generated for an App Registration. More information on how
 * to configure a client secret can be found here:
 *
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-configure-app-access-web-apis#add-credentials-to-your-web-application
 *
 */
class ClientSecretCredential {
    /**
     * Creates an instance of the ClientSecretCredential with the details
     * needed to authenticate against Azure Active Directory with a client
     * secret.
     *
     * @param tenantId - The Azure Active Directory tenant (directory) ID.
     * @param clientId - The client (application) ID of an App Registration in the tenant.
     * @param clientSecret - A client secret that was generated for the App Registration.
     * @param options - Options for configuring the client which makes the authentication request.
     */
    constructor(tenantId, clientId, clientSecret, options = {}) {
        if (!tenantId || !clientId || !clientSecret) {
            throw new Error("ClientSecretCredential: tenantId, clientId, and clientSecret are required parameters. To troubleshoot, visit https://aka.ms/azsdk/js/identity/serviceprincipalauthentication/troubleshoot.");
        }
        this.tenantId = tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        this.msalFlow = new MsalClientSecret(Object.assign(Object.assign({}, options), { logger: logger$7,
            clientId,
            tenantId,
            clientSecret, tokenCredentialOptions: options }));
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
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger$7);
            const arrayScopes = ensureScopes(scopes);
            return this.msalFlow.getToken(arrayScopes, newOptions);
        });
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * MSAL username and password client. Calls to the MSAL's public application's `acquireTokenByUsernamePassword` during `doGetToken`.
 * @internal
 */
class MsalUsernamePassword extends MsalNode {
    constructor(options) {
        super(options);
        this.username = options.username;
        this.password = options.password;
    }
    async doGetToken(scopes, options) {
        try {
            const requestOptions = {
                scopes,
                username: this.username,
                password: this.password,
                correlationId: options === null || options === void 0 ? void 0 : options.correlationId,
                authority: options === null || options === void 0 ? void 0 : options.authority,
                claims: options === null || options === void 0 ? void 0 : options.claims,
            };
            const result = await this.getApp("public", options === null || options === void 0 ? void 0 : options.enableCae).acquireTokenByUsernamePassword(requestOptions);
            return this.handleResult(scopes, this.clientId, result || undefined);
        }
        catch (error) {
            throw this.handleError(scopes, error, options);
        }
    }
}

// Copyright (c) Microsoft Corporation.
const logger$6 = credentialLogger("UsernamePasswordCredential");
/**
 * Enables authentication to Azure Active Directory with a user's
 * username and password. This credential requires a high degree of
 * trust so you should only use it when other, more secure credential
 * types can't be used.
 */
class UsernamePasswordCredential {
    /**
     * Creates an instance of the UsernamePasswordCredential with the details
     * needed to authenticate against Azure Active Directory with a username
     * and password.
     *
     * @param tenantId - The Azure Active Directory tenant (directory).
     * @param clientId - The client (application) ID of an App Registration in the tenant.
     * @param username - The user account's e-mail address (user name).
     * @param password - The user account's account password
     * @param options - Options for configuring the client which makes the authentication request.
     */
    constructor(tenantId, clientId, username, password, options = {}) {
        if (!tenantId || !clientId || !username || !password) {
            throw new Error("UsernamePasswordCredential: tenantId, clientId, username and password are required parameters. To troubleshoot, visit https://aka.ms/azsdk/js/identity/usernamepasswordcredential/troubleshoot.");
        }
        this.tenantId = tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        this.msalFlow = new MsalUsernamePassword(Object.assign(Object.assign({}, options), { logger: logger$6,
            clientId,
            tenantId,
            username,
            password, tokenCredentialOptions: options || {} }));
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
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger$6);
            const arrayScopes = ensureScopes(scopes);
            return this.msalFlow.getToken(arrayScopes, newOptions);
        });
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * Contains the list of all supported environment variable names so that an
 * appropriate error message can be generated when no credentials can be
 * configured.
 *
 * @internal
 */
const AllSupportedEnvironmentVariables = [
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "AZURE_CLIENT_CERTIFICATE_PATH",
    "AZURE_CLIENT_CERTIFICATE_PASSWORD",
    "AZURE_USERNAME",
    "AZURE_PASSWORD",
    "AZURE_ADDITIONALLY_ALLOWED_TENANTS",
];
function getAdditionallyAllowedTenants() {
    var _a;
    const additionallyAllowedValues = (_a = process.env.AZURE_ADDITIONALLY_ALLOWED_TENANTS) !== null && _a !== void 0 ? _a : "";
    return additionallyAllowedValues.split(";");
}
const credentialName$1 = "EnvironmentCredential";
const logger$5 = credentialLogger(credentialName$1);
/**
 * Enables authentication to Azure Active Directory using a client secret or certificate, or as a user
 * with a username and password.
 */
class EnvironmentCredential {
    /**
     * Creates an instance of the EnvironmentCredential class and decides what credential to use depending on the available environment variables.
     *
     * Required environment variables:
     * - `AZURE_TENANT_ID`: The Azure Active Directory tenant (directory) ID.
     * - `AZURE_CLIENT_ID`: The client (application) ID of an App Registration in the tenant.
     *
     * If setting the AZURE_TENANT_ID, then you can also set the additionally allowed tenants
     * - `AZURE_ADDITIONALLY_ALLOWED_TENANTS`: For multi-tenant applications, specifies additional tenants for which the credential may acquire tokens with a single semicolon delimited string. Use * to allow all tenants.
     *
     * Environment variables used for client credential authentication:
     * - `AZURE_CLIENT_SECRET`: A client secret that was generated for the App Registration.
     * - `AZURE_CLIENT_CERTIFICATE_PATH`: The path to a PEM certificate to use during the authentication, instead of the client secret.
     * - `AZURE_CLIENT_CERTIFICATE_PASSWORD`: (optional) password for the certificate file.
     *
     * Alternatively, users can provide environment variables for username and password authentication:
     * - `AZURE_USERNAME`: Username to authenticate with.
     * - `AZURE_PASSWORD`: Password to authenticate with.
     *
     * If the environment variables required to perform the authentication are missing, a {@link CredentialUnavailableError} will be thrown.
     * If the authentication fails, or if there's an unknown error, an {@link AuthenticationError} will be thrown.
     *
     * @param options - Options for configuring the client which makes the authentication request.
     */
    constructor(options) {
        // Keep track of any missing environment variables for error details
        this._credential = undefined;
        const assigned = processEnvVars(AllSupportedEnvironmentVariables).assigned.join(", ");
        logger$5.info(`Found the following environment variables: ${assigned}`);
        const tenantId = process.env.AZURE_TENANT_ID, clientId = process.env.AZURE_CLIENT_ID, clientSecret = process.env.AZURE_CLIENT_SECRET;
        const additionallyAllowedTenantIds = getAdditionallyAllowedTenants();
        const newOptions = Object.assign(Object.assign({}, options), { additionallyAllowedTenantIds });
        if (tenantId) {
            checkTenantId(logger$5, tenantId);
        }
        if (tenantId && clientId && clientSecret) {
            logger$5.info(`Invoking ClientSecretCredential with tenant ID: ${tenantId}, clientId: ${clientId} and clientSecret: [REDACTED]`);
            this._credential = new ClientSecretCredential(tenantId, clientId, clientSecret, newOptions);
            return;
        }
        const certificatePath = process.env.AZURE_CLIENT_CERTIFICATE_PATH;
        const certificatePassword = process.env.AZURE_CLIENT_CERTIFICATE_PASSWORD;
        if (tenantId && clientId && certificatePath) {
            logger$5.info(`Invoking ClientCertificateCredential with tenant ID: ${tenantId}, clientId: ${clientId} and certificatePath: ${certificatePath}`);
            this._credential = new ClientCertificateCredential(tenantId, clientId, { certificatePath, certificatePassword }, newOptions);
            return;
        }
        const username = process.env.AZURE_USERNAME;
        const password = process.env.AZURE_PASSWORD;
        if (tenantId && clientId && username && password) {
            logger$5.info(`Invoking UsernamePasswordCredential with tenant ID: ${tenantId}, clientId: ${clientId} and username: ${username}`);
            this._credential = new UsernamePasswordCredential(tenantId, clientId, username, password, newOptions);
        }
    }
    /**
     * Authenticates with Azure Active Directory and returns an access token if successful.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - Optional parameters. See {@link GetTokenOptions}.
     */
    async getToken(scopes, options = {}) {
        return tracingClient.withSpan(`${credentialName$1}.getToken`, options, async (newOptions) => {
            if (this._credential) {
                try {
                    const result = await this._credential.getToken(scopes, newOptions);
                    logger$5.getToken.info(formatSuccess(scopes));
                    return result;
                }
                catch (err) {
                    const authenticationError = new AuthenticationError(400, {
                        error: `${credentialName$1} authentication failed. To troubleshoot, visit https://aka.ms/azsdk/js/identity/environmentcredential/troubleshoot.`,
                        error_description: err.message.toString().split("More details:").join(""),
                    });
                    logger$5.getToken.info(formatError(scopes, authenticationError));
                    throw authenticationError;
                }
            }
            throw new CredentialUnavailableError(`${credentialName$1} is unavailable. No underlying credential could be used. To troubleshoot, visit https://aka.ms/azsdk/js/identity/environmentcredential/troubleshoot.`);
        });
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * Mockable reference to the Developer CLI credential cliCredentialFunctions
 * @internal
 */
const developerCliCredentialInternals = {
    /**
     * @internal
     */
    getSafeWorkingDir() {
        if (process.platform === "win32") {
            if (!process.env.SystemRoot) {
                throw new Error("Azure Developer CLI credential expects a 'SystemRoot' environment variable");
            }
            return process.env.SystemRoot;
        }
        else {
            return "/bin";
        }
    },
    /**
     * Gets the access token from Azure Developer CLI
     * @param scopes - The scopes to use when getting the token
     * @internal
     */
    async getAzdAccessToken(scopes, tenantId, timeout) {
        let tenantSection = [];
        if (tenantId) {
            tenantSection = ["--tenant-id", tenantId];
        }
        return new Promise((resolve, reject) => {
            try {
                child_process__default["default"].execFile("azd", [
                    "auth",
                    "token",
                    "--output",
                    "json",
                    ...scopes.reduce((previous, current) => previous.concat("--scope", current), []),
                    ...tenantSection,
                ], {
                    cwd: developerCliCredentialInternals.getSafeWorkingDir(),
                    shell: true,
                    timeout,
                }, (error, stdout, stderr) => {
                    resolve({ stdout, stderr, error });
                });
            }
            catch (err) {
                reject(err);
            }
        });
    },
};
const logger$4 = credentialLogger("AzureDeveloperCliCredential");
/**
 * Azure Developer CLI is a command-line interface tool that allows developers to create, manage, and deploy
 * resources in Azure. It's built on top of the Azure CLI and provides additional functionality specific
 * to Azure developers. It allows users to authenticate as a user and/or a service principal against
 * <a href="https://learn.microsoft.com/azure/active-directory/fundamentals/">Azure Active Directory (Azure AD)
 * </a>. The AzureDeveloperCliCredential authenticates in a development environment and acquires a token on behalf of
 * the logged-in user or service principal in the Azure Developer CLI. It acts as the Azure Developer CLI logged in user or
 * service principal and executes an Azure CLI command underneath to authenticate the application against
 * Azure Active Directory.
 *
 * <h2> Configure AzureDeveloperCliCredential </h2>
 *
 * To use this credential, the developer needs to authenticate locally in Azure Developer CLI using one of the
 * commands below:
 *
 * <ol>
 *     <li>Run "azd auth login" in Azure Developer CLI to authenticate interactively as a user.</li>
 *     <li>Run "azd auth login --client-id clientID --client-secret clientSecret
 *     --tenant-id tenantID" to authenticate as a service principal.</li>
 * </ol>
 *
 * You may need to repeat this process after a certain time period, depending on the refresh token validity in your
 * organization. Generally, the refresh token validity period is a few weeks to a few months.
 * AzureDeveloperCliCredential will prompt you to sign in again.
 */
class AzureDeveloperCliCredential {
    /**
     * Creates an instance of the {@link AzureDeveloperCliCredential}.
     *
     * To use this credential, ensure that you have already logged
     * in via the 'azd' tool using the command "azd auth login" from the commandline.
     *
     * @param options - Options, to optionally allow multi-tenant requests.
     */
    constructor(options) {
        this.tenantId = options === null || options === void 0 ? void 0 : options.tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        this.timeout = options === null || options === void 0 ? void 0 : options.processTimeoutInMs;
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
        const tenantId = processMultiTenantRequest(this.tenantId, options, this.additionallyAllowedTenantIds);
        let scopeList;
        if (typeof scopes === "string") {
            scopeList = [scopes];
        }
        else {
            scopeList = scopes;
        }
        logger$4.getToken.info(`Using the scopes ${scopes}`);
        return tracingClient.withSpan(`${this.constructor.name}.getToken`, options, async () => {
            var _a, _b, _c, _d;
            try {
                const obj = await developerCliCredentialInternals.getAzdAccessToken(scopeList, tenantId, this.timeout);
                const isNotLoggedInError = ((_a = obj.stderr) === null || _a === void 0 ? void 0 : _a.match("not logged in, run `azd login` to login")) ||
                    ((_b = obj.stderr) === null || _b === void 0 ? void 0 : _b.match("not logged in, run `azd auth login` to login"));
                const isNotInstallError = ((_c = obj.stderr) === null || _c === void 0 ? void 0 : _c.match("azd:(.*)not found")) ||
                    ((_d = obj.stderr) === null || _d === void 0 ? void 0 : _d.startsWith("'azd' is not recognized"));
                if (isNotInstallError || (obj.error && obj.error.code === "ENOENT")) {
                    const error = new CredentialUnavailableError("Azure Developer CLI couldn't be found. To mitigate this issue, see the troubleshooting guidelines at https://aka.ms/azsdk/js/identity/azdevclicredential/troubleshoot.");
                    logger$4.getToken.info(formatError(scopes, error));
                    throw error;
                }
                if (isNotLoggedInError) {
                    const error = new CredentialUnavailableError("Please run 'azd auth login' from a command prompt to authenticate before using this credential. For more information, see the troubleshooting guidelines at https://aka.ms/azsdk/js/identity/azdevclicredential/troubleshoot.");
                    logger$4.getToken.info(formatError(scopes, error));
                    throw error;
                }
                try {
                    const resp = JSON.parse(obj.stdout);
                    logger$4.getToken.info(formatSuccess(scopes));
                    return {
                        token: resp.token,
                        expiresOnTimestamp: new Date(resp.expiresOn).getTime(),
                    };
                }
                catch (e) {
                    if (obj.stderr) {
                        throw new CredentialUnavailableError(obj.stderr);
                    }
                    throw e;
                }
            }
            catch (err) {
                const error = err.name === "CredentialUnavailableError"
                    ? err
                    : new CredentialUnavailableError(err.message || "Unknown error while trying to retrieve the access token");
                logger$4.getToken.info(formatError(scopes, error));
                throw error;
            }
        });
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * A shim around ManagedIdentityCredential that adapts it to accept
 * `DefaultAzureCredentialOptions`.
 *
 * @internal
 */
class DefaultManagedIdentityCredential extends ManagedIdentityCredential {
    // Constructor overload with just the other default options
    // Last constructor overload with Union of all options not required since the above two constructor overloads have optional properties
    constructor(options) {
        var _a, _b, _c;
        const managedIdentityClientId = (_a = options === null || options === void 0 ? void 0 : options.managedIdentityClientId) !== null && _a !== void 0 ? _a : process.env.AZURE_CLIENT_ID;
        const workloadIdentityClientId = (_b = options === null || options === void 0 ? void 0 : options.workloadIdentityClientId) !== null && _b !== void 0 ? _b : managedIdentityClientId;
        const managedResourceId = options === null || options === void 0 ? void 0 : options.managedIdentityResourceId;
        const workloadFile = process.env.AZURE_FEDERATED_TOKEN_FILE;
        const tenantId = (_c = options === null || options === void 0 ? void 0 : options.tenantId) !== null && _c !== void 0 ? _c : process.env.AZURE_TENANT_ID;
        // ManagedIdentityCredential throws if both the resourceId and the clientId are provided.
        if (managedResourceId) {
            const managedIdentityResourceIdOptions = Object.assign(Object.assign({}, options), { resourceId: managedResourceId });
            super(managedIdentityResourceIdOptions);
        }
        else if (workloadFile && workloadIdentityClientId) {
            const workloadIdentityCredentialOptions = Object.assign(Object.assign({}, options), { tenantId: tenantId });
            super(workloadIdentityClientId, workloadIdentityCredentialOptions);
        }
        else if (managedIdentityClientId) {
            const managedIdentityClientOptions = Object.assign(Object.assign({}, options), { clientId: managedIdentityClientId });
            super(managedIdentityClientOptions);
        }
        else {
            super(options);
        }
    }
}
/**
 * A shim around WorkloadIdentityCredential that adapts it to accept
 * `DefaultAzureCredentialOptions`.
 *
 * @internal
 */
class DefaultWorkloadIdentityCredential extends WorkloadIdentityCredential {
    // Constructor overload with just the other default options
    // Last constructor overload with Union of all options not required since the above two constructor overloads have optional properties
    constructor(options) {
        var _a, _b, _c;
        const managedIdentityClientId = (_a = options === null || options === void 0 ? void 0 : options.managedIdentityClientId) !== null && _a !== void 0 ? _a : process.env.AZURE_CLIENT_ID;
        const workloadIdentityClientId = (_b = options === null || options === void 0 ? void 0 : options.workloadIdentityClientId) !== null && _b !== void 0 ? _b : managedIdentityClientId;
        const workloadFile = process.env.AZURE_FEDERATED_TOKEN_FILE;
        const tenantId = (_c = options === null || options === void 0 ? void 0 : options.tenantId) !== null && _c !== void 0 ? _c : process.env.AZURE_TENANT_ID;
        if (workloadFile && workloadIdentityClientId) {
            const workloadIdentityCredentialOptions = Object.assign(Object.assign({}, options), { tenantId, clientId: workloadIdentityClientId, tokenFilePath: workloadFile });
            super(workloadIdentityCredentialOptions);
        }
        else if (tenantId) {
            const workloadIdentityClientTenantOptions = Object.assign(Object.assign({}, options), { tenantId });
            super(workloadIdentityClientTenantOptions);
        }
        else {
            super(options);
        }
    }
}
class DefaultAzureDeveloperCliCredential extends AzureDeveloperCliCredential {
    constructor(options) {
        super(Object.assign({ processTimeoutInMs: options === null || options === void 0 ? void 0 : options.processTimeoutInMs }, options));
    }
}
class DefaultAzureCliCredential extends AzureCliCredential {
    constructor(options) {
        super(Object.assign({ processTimeoutInMs: options === null || options === void 0 ? void 0 : options.processTimeoutInMs }, options));
    }
}
class DefaultAzurePowershellCredential extends AzurePowerShellCredential {
    constructor(options) {
        super(Object.assign({ processTimeoutInMs: options === null || options === void 0 ? void 0 : options.processTimeoutInMs }, options));
    }
}
const defaultCredentials = [
    EnvironmentCredential,
    DefaultWorkloadIdentityCredential,
    DefaultManagedIdentityCredential,
    DefaultAzureCliCredential,
    DefaultAzurePowershellCredential,
    DefaultAzureDeveloperCliCredential,
];
/**
 * Provides a default {@link ChainedTokenCredential} configuration that should
 * work for most applications that use the Azure SDK.
 */
class DefaultAzureCredential extends ChainedTokenCredential {
    constructor(options) {
        super(...defaultCredentials.map((ctor) => new ctor(options)));
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * A call to open(), but mockable
 * @internal
 */
const interactiveBrowserMockable = {
    open: open__default["default"],
};
/**
 * This MSAL client sets up a web server to listen for redirect callbacks, then calls to the MSAL's public application's `acquireTokenByDeviceCode` during `doGetToken`
 * to trigger the authentication flow, and then respond based on the values obtained from the redirect callback
 * @internal
 */
class MsalOpenBrowser extends MsalNode {
    constructor(options) {
        super(options);
        this.logger = credentialLogger("Node.js MSAL Open Browser");
        this.redirectUri = options.redirectUri;
        this.loginHint = options.loginHint;
        const url = new URL(this.redirectUri);
        this.port = parseInt(url.port);
        if (isNaN(this.port)) {
            this.port = 80;
        }
        this.hostname = url.hostname;
    }
    async acquireTokenByCode(request, enableCae) {
        return this.getApp("public", enableCae).acquireTokenByCode(request);
    }
    doGetToken(scopes, options) {
        return new Promise((resolve, reject) => {
            const socketToDestroy = [];
            const requestListener = (req, res) => {
                var _a;
                if (!req.url) {
                    reject(new Error(`Interactive Browser Authentication Error "Did not receive token with a valid expiration"`));
                    return;
                }
                let url;
                try {
                    url = new URL(req.url, this.redirectUri);
                }
                catch (e) {
                    reject(new Error(`Interactive Browser Authentication Error "Did not receive token with a valid expiration"`));
                    return;
                }
                const tokenRequest = {
                    code: url.searchParams.get("code"),
                    redirectUri: this.redirectUri,
                    scopes: scopes,
                    authority: options === null || options === void 0 ? void 0 : options.authority,
                    codeVerifier: (_a = this.pkceCodes) === null || _a === void 0 ? void 0 : _a.verifier,
                };
                this.acquireTokenByCode(tokenRequest, options === null || options === void 0 ? void 0 : options.enableCae)
                    .then((authResponse) => {
                    if (authResponse === null || authResponse === void 0 ? void 0 : authResponse.account) {
                        this.account = msalToPublic(this.clientId, authResponse.account);
                    }
                    const successMessage = `Authentication Complete. You can close the browser and return to the application.`;
                    if (authResponse && authResponse.expiresOn) {
                        const expiresOnTimestamp = authResponse === null || authResponse === void 0 ? void 0 : authResponse.expiresOn.valueOf();
                        res.writeHead(200);
                        res.end(successMessage);
                        this.logger.getToken.info(formatSuccess(scopes));
                        resolve({
                            expiresOnTimestamp,
                            token: authResponse.accessToken,
                        });
                    }
                    else {
                        const errorMessage = formatError(scopes, `${url.searchParams.get("error")}. ${url.searchParams.get("error_description")}`);
                        res.writeHead(500);
                        res.end(errorMessage);
                        this.logger.getToken.info(errorMessage);
                        reject(new Error(`Interactive Browser Authentication Error "Did not receive token with a valid expiration"`));
                    }
                    cleanup();
                    return;
                })
                    .catch(() => {
                    const errorMessage = formatError(scopes, `${url.searchParams.get("error")}. ${url.searchParams.get("error_description")}`);
                    res.writeHead(500);
                    res.end(errorMessage);
                    this.logger.getToken.info(errorMessage);
                    reject(new Error(`Interactive Browser Authentication Error "Did not receive token with a valid expiration"`));
                    cleanup();
                });
            };
            const app = http__default["default"].createServer(requestListener);
            const server = stoppable__default["default"](app);
            const listen = app.listen(this.port, this.hostname, () => this.logger.info(`InteractiveBrowserCredential listening on port ${this.port}!`));
            function cleanup() {
                if (listen) {
                    listen.close();
                }
                for (const socket of socketToDestroy) {
                    socket.destroy();
                }
                if (server) {
                    server.close();
                    server.stop();
                }
            }
            app.on("connection", (socket) => socketToDestroy.push(socket));
            app.on("error", (err) => {
                cleanup();
                const code = err.code;
                if (code === "EACCES" || code === "EADDRINUSE") {
                    reject(new CredentialUnavailableError([
                        `InteractiveBrowserCredential: Access denied to port ${this.port}.`,
                        `Try sending a redirect URI with a different port, as follows:`,
                        '`new InteractiveBrowserCredential({ redirectUri: "http://localhost:1337" })`',
                    ].join(" ")));
                }
                else {
                    reject(new CredentialUnavailableError(`InteractiveBrowserCredential: Failed to start the necessary web server. Error: ${err.message}`));
                }
            });
            app.on("listening", () => {
                const openPromise = this.openAuthCodeUrl(scopes, options);
                const abortSignal = options === null || options === void 0 ? void 0 : options.abortSignal;
                if (abortSignal) {
                    abortSignal.addEventListener("abort", () => {
                        cleanup();
                        reject(new Error("Aborted"));
                    });
                }
                openPromise.catch((e) => {
                    cleanup();
                    reject(e);
                });
            });
        });
    }
    async openAuthCodeUrl(scopeArray, options) {
        // Initialize CryptoProvider instance
        const cryptoProvider = new msalNode__namespace.CryptoProvider();
        // Generate PKCE Codes before starting the authorization flow
        this.pkceCodes = await cryptoProvider.generatePkceCodes();
        const authCodeUrlParameters = {
            scopes: scopeArray,
            correlationId: options === null || options === void 0 ? void 0 : options.correlationId,
            redirectUri: this.redirectUri,
            authority: options === null || options === void 0 ? void 0 : options.authority,
            claims: options === null || options === void 0 ? void 0 : options.claims,
            loginHint: this.loginHint,
            codeChallenge: this.pkceCodes.challenge,
            codeChallengeMethod: "S256", // Use SHA256 Algorithm
        };
        const response = await this.getApp("public", options === null || options === void 0 ? void 0 : options.enableCae).getAuthCodeUrl(authCodeUrlParameters);
        try {
            // A new instance on macOS only which allows it to not hang, does not fix the issue on linux
            await interactiveBrowserMockable.open(response, { wait: true, newInstance: true });
        }
        catch (e) {
            throw new CredentialUnavailableError(`InteractiveBrowserCredential: Could not open a browser window. Error: ${e.message}`);
        }
    }
}

// Copyright (c) Microsoft Corporation.
const logger$3 = credentialLogger("InteractiveBrowserCredential");
/**
 * Enables authentication to Azure Active Directory inside of the web browser
 * using the interactive login flow.
 */
class InteractiveBrowserCredential {
    /**
     * Creates an instance of InteractiveBrowserCredential with the details needed.
     *
     * This credential uses the [Authorization Code Flow](https://docs.microsoft.com/azure/active-directory/develop/v2-oauth2-auth-code-flow).
     * On Node.js, it will open a browser window while it listens for a redirect response from the authentication service.
     * On browsers, it authenticates via popups. The `loginStyle` optional parameter can be set to `redirect` to authenticate by redirecting the user to an Azure secure login page, which then will redirect the user back to the web application where the authentication started.
     *
     * For Node.js, if a `clientId` is provided, the Azure Active Directory application will need to be configured to have a "Mobile and desktop applications" redirect endpoint.
     * Follow our guide on [setting up Redirect URIs for Desktop apps that calls to web APIs](https://docs.microsoft.com/azure/active-directory/develop/scenario-desktop-app-registration#redirect-uris).
     *
     * @param options - Options for configuring the client which makes the authentication requests.
     */
    constructor(options = {}) {
        const redirectUri = typeof options.redirectUri === "function"
            ? options.redirectUri()
            : options.redirectUri || "http://localhost";
        this.tenantId = options === null || options === void 0 ? void 0 : options.tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        this.msalFlow = new MsalOpenBrowser(Object.assign(Object.assign({}, options), { tokenCredentialOptions: options, logger: logger$3,
            redirectUri }));
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
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger$3);
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
     * On Node.js, this credential has [Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636) enabled by default.
     * PKCE is a security feature that mitigates authentication code interception attacks.
     *
     * @param scopes - The list of scopes for which the token will have access.
     * @param options - The options used to configure any requests this
     *                  TokenCredential implementation might make.
     */
    async authenticate(scopes, options = {}) {
        return tracingClient.withSpan(`${this.constructor.name}.authenticate`, options, async (newOptions) => {
            const arrayScopes = ensureScopes(scopes);
            await this.msalFlow.getToken(arrayScopes, newOptions);
            return this.msalFlow.getActiveAccount();
        });
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * MSAL device code client. Calls to the MSAL's public application's `acquireTokenByDeviceCode` during `doGetToken`.
 * @internal
 */
class MsalDeviceCode extends MsalNode {
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

// Copyright (c) Microsoft Corporation.
const logger$2 = credentialLogger("DeviceCodeCredential");
/**
 * Method that logs the user code from the DeviceCodeCredential.
 * @param deviceCodeInfo - The device code.
 */
function defaultDeviceCodePromptCallback(deviceCodeInfo) {
    console.log(deviceCodeInfo.message);
}
/**
 * Enables authentication to Azure Active Directory using a device code
 * that the user can enter into https://microsoft.com/devicelogin.
 */
class DeviceCodeCredential {
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
        this.msalFlow = new MsalDeviceCode(Object.assign(Object.assign({}, options), { logger: logger$2, userPromptCallback: (options === null || options === void 0 ? void 0 : options.userPromptCallback) || defaultDeviceCodePromptCallback, tokenCredentialOptions: options || {} }));
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
            newOptions.tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds, logger$2);
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

// Copyright (c) Microsoft Corporation.
/**
 * This MSAL client sets up a web server to listen for redirect callbacks, then calls to the MSAL's public application's `acquireTokenByDeviceCode` during `doGetToken`
 * to trigger the authentication flow, and then respond based on the values obtained from the redirect callback
 * @internal
 */
class MsalAuthorizationCode extends MsalNode {
    constructor(options) {
        super(options);
        this.logger = credentialLogger("Node.js MSAL Authorization Code");
        this.redirectUri = options.redirectUri;
        this.authorizationCode = options.authorizationCode;
        if (options.clientSecret) {
            this.msalConfig.auth.clientSecret = options.clientSecret;
        }
    }
    async getAuthCodeUrl(options) {
        await this.init();
        return this.getApp("confidentialFirst", options.enableCae).getAuthCodeUrl({
            scopes: options.scopes,
            redirectUri: options.redirectUri,
        });
    }
    async doGetToken(scopes, options) {
        try {
            const result = await this.getApp("confidentialFirst", options === null || options === void 0 ? void 0 : options.enableCae).acquireTokenByCode({
                scopes,
                redirectUri: this.redirectUri,
                code: this.authorizationCode,
                correlationId: options === null || options === void 0 ? void 0 : options.correlationId,
                authority: options === null || options === void 0 ? void 0 : options.authority,
                claims: options === null || options === void 0 ? void 0 : options.claims,
            });
            // The Client Credential flow does not return an account,
            // so each time getToken gets called, we will have to acquire a new token through the service.
            return this.handleResult(scopes, this.clientId, result || undefined);
        }
        catch (err) {
            throw this.handleError(scopes, err, options);
        }
    }
}

// Copyright (c) Microsoft Corporation.
const logger$1 = credentialLogger("AuthorizationCodeCredential");
/**
 * Enables authentication to Azure Active Directory using an authorization code
 * that was obtained through the authorization code flow, described in more detail
 * in the Azure Active Directory documentation:
 *
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
 */
class AuthorizationCodeCredential {
    /**
     * @hidden
     * @internal
     */
    constructor(tenantId, clientId, clientSecretOrAuthorizationCode, authorizationCodeOrRedirectUri, redirectUriOrOptions, options) {
        checkTenantId(logger$1, tenantId);
        let clientSecret = clientSecretOrAuthorizationCode;
        if (typeof redirectUriOrOptions === "string") {
            // the clientId+clientSecret constructor
            this.authorizationCode = authorizationCodeOrRedirectUri;
            this.redirectUri = redirectUriOrOptions;
            // in this case, options are good as they come
        }
        else {
            // clientId only
            this.authorizationCode = clientSecretOrAuthorizationCode;
            this.redirectUri = authorizationCodeOrRedirectUri;
            clientSecret = undefined;
            options = redirectUriOrOptions;
        }
        // TODO: Validate tenant if provided
        this.tenantId = tenantId;
        this.additionallyAllowedTenantIds = resolveAddionallyAllowedTenantIds(options === null || options === void 0 ? void 0 : options.additionallyAllowedTenants);
        this.msalFlow = new MsalAuthorizationCode(Object.assign(Object.assign({}, options), { clientSecret,
            clientId,
            tenantId, tokenCredentialOptions: options || {}, logger: logger$1, redirectUri: this.redirectUri, authorizationCode: this.authorizationCode }));
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
            const tenantId = processMultiTenantRequest(this.tenantId, newOptions, this.additionallyAllowedTenantIds);
            newOptions.tenantId = tenantId;
            const arrayScopes = ensureScopes(scopes);
            return this.msalFlow.getToken(arrayScopes, Object.assign(Object.assign({}, newOptions), { disableAutomaticAuthentication: this.disableAutomaticAuthentication }));
        });
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * MSAL on behalf of flow. Calls to MSAL's confidential application's `acquireTokenOnBehalfOf` during `doGetToken`.
 * @internal
 */
class MsalOnBehalfOf extends MsalNode {
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

// Copyright (c) Microsoft Corporation.
const credentialName = "OnBehalfOfCredential";
const logger = credentialLogger(credentialName);
/**
 * Enables authentication to Azure Active Directory using the [On Behalf Of flow](https://docs.microsoft.com/azure/active-directory/develop/v2-oauth2-on-behalf-of-flow).
 */
class OnBehalfOfCredential {
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

// Copyright (c) Microsoft Corporation.
/**
 * Returns a new instance of the {@link DefaultAzureCredential}.
 */
function getDefaultAzureCredential() {
    return new DefaultAzureCredential();
}

exports.AggregateAuthenticationError = AggregateAuthenticationError;
exports.AggregateAuthenticationErrorName = AggregateAuthenticationErrorName;
exports.AuthenticationError = AuthenticationError;
exports.AuthenticationErrorName = AuthenticationErrorName;
exports.AuthenticationRequiredError = AuthenticationRequiredError;
exports.AuthorizationCodeCredential = AuthorizationCodeCredential;
exports.AzureCliCredential = AzureCliCredential;
exports.AzureDeveloperCliCredential = AzureDeveloperCliCredential;
exports.AzurePowerShellCredential = AzurePowerShellCredential;
exports.ChainedTokenCredential = ChainedTokenCredential;
exports.ClientAssertionCredential = ClientAssertionCredential;
exports.ClientCertificateCredential = ClientCertificateCredential;
exports.ClientSecretCredential = ClientSecretCredential;
exports.CredentialUnavailableError = CredentialUnavailableError;
exports.CredentialUnavailableErrorName = CredentialUnavailableErrorName;
exports.DefaultAzureCredential = DefaultAzureCredential;
exports.DeviceCodeCredential = DeviceCodeCredential;
exports.EnvironmentCredential = EnvironmentCredential;
exports.InteractiveBrowserCredential = InteractiveBrowserCredential;
exports.ManagedIdentityCredential = ManagedIdentityCredential;
exports.OnBehalfOfCredential = OnBehalfOfCredential;
exports.UsernamePasswordCredential = UsernamePasswordCredential;
exports.VisualStudioCodeCredential = VisualStudioCodeCredential;
exports.WorkloadIdentityCredential = WorkloadIdentityCredential;
exports.deserializeAuthenticationRecord = deserializeAuthenticationRecord;
exports.getDefaultAzureCredential = getDefaultAzureCredential;
exports.logger = logger$n;
exports.serializeAuthenticationRecord = serializeAuthenticationRecord;
exports.useIdentityPlugin = useIdentityPlugin;
//# sourceMappingURL=index.js.map
