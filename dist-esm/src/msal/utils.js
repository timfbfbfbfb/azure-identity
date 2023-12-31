// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as msalCommon from "@azure/msal-common";
import { AuthenticationRequiredError, CredentialUnavailableError } from "../errors";
import { formatError, formatSuccess } from "../util/logging";
import { DefaultAuthorityHost, DefaultTenantId } from "../constants";
import { AbortError } from "@azure/abort-controller";
import { isNode } from "@azure/core-util";
import { v4 as uuidv4 } from "uuid";
/**
 * Latest AuthenticationRecord version
 * @internal
 */
const LatestAuthenticationRecordVersion = "1.0";
/**
 * Ensures the validity of the MSAL token
 * @internal
 */
export function ensureValidMsalToken(scopes, logger, msalToken, getTokenOptions) {
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
export function getAuthority(tenantId, host) {
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
export function getKnownAuthorities(tenantId, authorityHost, disableInstanceDiscovery) {
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
export const defaultLoggerCallback = (logger, platform = isNode ? "Node" : "Browser") => (level, message, containsPii) => {
    if (containsPii) {
        return;
    }
    switch (level) {
        case msalCommon.LogLevel.Error:
            logger.info(`MSAL ${platform} V2 error: ${message}`);
            return;
        case msalCommon.LogLevel.Info:
            logger.info(`MSAL ${platform} V2 info message: ${message}`);
            return;
        case msalCommon.LogLevel.Verbose:
            logger.info(`MSAL ${platform} V2 verbose message: ${message}`);
            return;
        case msalCommon.LogLevel.Warning:
            logger.info(`MSAL ${platform} V2 warning: ${message}`);
            return;
    }
};
/**
 * @internal
 */
export function getMSALLogLevel(logLevel) {
    switch (logLevel) {
        case "error":
            return msalCommon.LogLevel.Error;
        case "info":
            return msalCommon.LogLevel.Info;
        case "verbose":
            return msalCommon.LogLevel.Verbose;
        case "warning":
            return msalCommon.LogLevel.Warning;
        default:
            // default msal logging level should be Info
            return msalCommon.LogLevel.Info;
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
export class MsalBaseUtilities {
    constructor(options) {
        this.logger = options.logger;
        this.account = options.authenticationRecord;
    }
    /**
     * Generates a UUID
     */
    generateUuid() {
        return uuidv4();
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
                    return new AbortError("The authentication has been aborted by the caller.");
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
export function publicToMsal(account) {
    const [environment] = account.authority.match(/([a-z]*\.[a-z]*\.[a-z]*)/) || [""];
    return Object.assign(Object.assign({}, account), { localAccountId: account.homeAccountId, environment });
}
export function msalToPublic(clientId, account) {
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
export function serializeAuthenticationRecord(record) {
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
export function deserializeAuthenticationRecord(serializedRecord) {
    const parsed = JSON.parse(serializedRecord);
    if (parsed.version && parsed.version !== LatestAuthenticationRecordVersion) {
        throw Error("Unsupported AuthenticationRecord version");
    }
    return parsed;
}
//# sourceMappingURL=utils.js.map