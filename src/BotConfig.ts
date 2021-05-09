export interface BotConfig {
    port: number;
    host: string;
    path: string;

    token: string;
    client: string;
    pubKey: string;

    apiKey: string;
}

export function getConfig(): BotConfig {
    return require("../config.js") as BotConfig;
}
