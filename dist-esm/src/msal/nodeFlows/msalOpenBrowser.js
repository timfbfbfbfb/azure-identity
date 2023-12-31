// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as msalNode from "@azure/msal-node";
import { MsalNode } from "./msalNodeCommon";
import { credentialLogger, formatError, formatSuccess } from "../../util/logging";
import { CredentialUnavailableError } from "../../errors";
import http from "http";
import { msalToPublic } from "../utils";
import open from "open";
import stoppable from "stoppable";
/**
 * A call to open(), but mockable
 * @internal
 */
export const interactiveBrowserMockable = {
    open,
};
/**
 * This MSAL client sets up a web server to listen for redirect callbacks, then calls to the MSAL's public application's `acquireTokenByDeviceCode` during `doGetToken`
 * to trigger the authentication flow, and then respond based on the values obtained from the redirect callback
 * @internal
 */
export class MsalOpenBrowser extends MsalNode {
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
            const app = http.createServer(requestListener);
            const server = stoppable(app);
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
        const cryptoProvider = new msalNode.CryptoProvider();
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
//# sourceMappingURL=msalOpenBrowser.js.map