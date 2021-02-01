import * as Discord from "discord.js";
import * as express from "express";
import { Express, NextFunction, Request, Response } from "express";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { getConfig } from "./BotConfig";
import * as nacl from "tweetnacl";
import * as bodyParser from "body-parser";
import { ApplicationCommand, ApplicationCommandOptionType, Interaction, InteractionApplicationCommandCallbackData, InteractionResponse, InteractionResponseType, InteractionType } from "./DiscordTypes";
import { URL } from "url";
import { JobQueue } from "jobqu";

const config = getConfig();

type DiscordRequest = Request & { rawBody?: string; };

enum GenerateType {
    USER = "user",
    URL = "url",
}

enum SkinVariant {
    AUTO = "auto",
    CLASSIC = "classic",
    SLIM = "slim",
}

interface QueueItem {
    token: string;
    interaction: string;

    type: GenerateType;
    urlOrUser: string;
    variant: SkinVariant;
    name: string;
}

interface ErroredGenerateResponse {
    error?: string;
    errorCode?: string;
}

interface SuccessfulGenerateResponse {
    id: number;
    idStr: string;
    name?: string;
    variant: string;
    data: {
        uuid: string;
        texture: {
            value: string;
            signature: string;
            url: string;
        }
    }
    timestamp: number;
    duration: number;
    account: number;
    server: string;
    duplicate?: boolean;
    nextRequest?: number;
}

type GenerateResponse = (SuccessfulGenerateResponse | ErroredGenerateResponse) & { token?: string, interaction?: string, type?: string; };

function isErroredResponse(response: GenerateResponse): response is ErroredGenerateResponse {
    return (<ErroredGenerateResponse>response).error !== undefined;
}

function isSuccessfulResponse(response: GenerateResponse): response is SuccessfulGenerateResponse {
    return (<SuccessfulGenerateResponse>response).id !== undefined;
}

class MineSkinDiscordBot {

    protected static readonly discordAxiosInstance: AxiosInstance = axios.create({
        baseURL: `https://discord.com/api/v8`,
        headers: {
            "Authorization": `Bot ${ config.token }`,
            "User-Agent": "MineSkin-DiscordBot"
        },
        timeout: 10000
    });
    protected static readonly mineskinAxiosInstance: AxiosInstance = axios.create({
        baseURL: `https://api.mineskin.org`,
        headers: {
            "User-Agent": "MineSkin-DiscordBot"
        },
        timeout: 25000
    });

    protected static readonly discordQueue = new JobQueue<AxiosRequestConfig, AxiosResponse>(request => {
        return MineSkinDiscordBot.discordAxiosInstance.request(request);
    }, 200);
    protected static readonly mineskinQueue = new JobQueue<QueueItem, GenerateResponse>(item => {
        return MineSkinDiscordBot.doMineSkinRequest(item);
    }, 1000 * 20);

    protected static discordClient: Discord.Client;

    protected static async doMineSkinRequest(item: QueueItem): Promise<GenerateResponse> {
        const data = {};
        if (item.type === GenerateType.USER) {
            data["uuid"] = item.urlOrUser;
        } else if (item.type === GenerateType.URL) {
            data["url"] = item.urlOrUser;
        } else {
            throw new Error();
        }
        if (item.variant && item.variant !== SkinVariant.AUTO) {
            data["variant"] = item.variant;
        }
        if (item.name) {
            data["name"] = item.name;
        }

        try {
            const generateResponse = await this.mineskinAxiosInstance.request({
                method: "POST",
                url: `/generate/${ item.type }`,
                data: data
            });
            const res: GenerateResponse = generateResponse.data as GenerateResponse;
            res.token = item.token;
            res.interaction = item.interaction;
            res.type = item.type;
            return res;
        } catch (err) {
            console.warn(err);
            if (err.response) {
                const res = <GenerateResponse>{
                    error: err.response.data["error"],
                    errorCode: err.response.data["errorCode"]
                };
                res.token = item.token;
                res.interaction = item.interaction;
                res.type = item.type;
                return res;
            }
            throw err;
        }
    }

    static async registerCommands(): Promise<AxiosResponse> {
        return await this.discordAxiosInstance.request({
            method: "POST",
            url: `/applications/${ config.client }/commands`,
            data: <ApplicationCommand>{
                name: "mineskin",
                description: "Interact with the MineSkin.org API",
                options: [
                    {
                        name: "url-or-user",
                        description: "url or uuid",
                        required: true,
                        type: ApplicationCommandOptionType.STRING
                    },
                    {
                        name: "variant",
                        description: "skin variant to generate",
                        required: false,
                        type: ApplicationCommandOptionType.STRING,
                        choices: [
                            {
                                name: "auto",
                                value: "auto"
                            },
                            {
                                name: "classic",
                                value: "classic"
                            },
                            {
                                name: "slim",
                                value: "slim"
                            }
                        ]
                    },
                    {
                        name: "name",
                        description: "skin name",
                        required: false,
                        type: ApplicationCommandOptionType.STRING
                    }
                ]
            }
        })
    }

    static async editInitialResponse(interaction: string, token: string, response: InteractionApplicationCommandCallbackData): Promise<AxiosResponse> {
        return await this.discordQueue.add({
            method: "PATCH",
            url: `/webhooks/${ config.client }/${ token }/messages/@original`,
            data: response
        }).catch(err => {
            console.warn(err)
            throw err;
        });
    }

    static async sendFollowupMessage(interaction: string, token: string, response: InteractionApplicationCommandCallbackData): Promise<AxiosResponse> {
        return await this.discordQueue.add({
            method: "POST",
            url: `/webhooks/${ config.client }/${ token }`,
            data: response
        }).catch(err => {
            console.warn(err)
            throw err;
        });
    }

    static async handleGenerateResponse(response: GenerateResponse): Promise<void> {
        console.log(response);
        if (isErroredResponse(response)) {
            await this.editInitialResponse(response.interaction!, response.token!, {
                content: "Failed to generate. Please check your command & try again later."
            });
            return;
        }
        if (isSuccessfulResponse(response)) {
            await this.editInitialResponse(response.interaction!, response.token!, {
                content: `Successfully Generated!`,
                embeds: [
                    {
                        type: "rich",
                        title: `${ response.name || '#' + response.idStr }`,
                        url: `https://minesk.in/${ response.idStr }?utm_source=discord&utm_medium=embed&utm_campaign=mineskin_discord_bot`,
                        fields: [
                            {
                                name: "Type",
                                value: `${ response.type }`,
                                inline: true
                            },
                            {
                                name: "Variant",
                                value: `${ response.variant }`,
                                inline: true
                            }
                        ],
                        thumbnail: {
                            url: `https://api.mineskin.org/render/head?url=${ response.data.texture.url }`
                        },
                        timestamp: new Date(response.timestamp * 1000).toISOString(),
                        footer: {
                            text: `Generated in ${ response.duration }ms`
                        },
                        image: {
                            url: `${ response.data.texture.url }`,
                            width: 128
                        },
                        author: {
                            name: "MineSkin",
                            url: "https://mineskin.org?utm_source=discord&utm_medium=embed&utm_campaign=mineskin_discord_bot",
                            icon_url: "https://res.cloudinary.com/inventivetalent/image/upload/brand/mineskin/mineskin-x128.png"
                        }
                    }
                ]
            })
        }
    }

    static async handleCommand(interaction: Interaction): Promise<InteractionResponse> {
        if (!interaction.data) {
            return {
                type: InteractionResponseType.Acknowledge
            }
        }
        if (interaction.data.name !== "mineskin") { // wth
            console.warn("got non-mineskin command");
            return {
                type: InteractionResponseType.Acknowledge
            };
        }

        let type = GenerateType.USER;
        let urlOrUser = "";
        let variant = SkinVariant.AUTO;
        let name = "";

        for (let option of interaction.data.options!) {
            switch (option.name) {
                case "url-or-user": {
                    if (!option.value?.startsWith("http")) {
                        if (option.value?.length! >= 32 && option.value?.length! <= 36) { // UUID
                            type = GenerateType.USER;
                            urlOrUser = option.value!.trim();
                        } else if (option.value?.length! <= 16) { // Username
                            const userResponse = await this.mineskinAxiosInstance.request({
                                method: "GET",
                                url: `/validate/name/${ option.value! }`,
                                timeout: 10000
                            }).catch(err => {
                                console.warn(err);
                                return { data: { valid: false } };
                            });
                            const userData = userResponse.data;
                            if (userData["valid"]) {
                                type = GenerateType.USER;
                                urlOrUser = userData["uuid"];
                            } else {
                                return {
                                    type: InteractionResponseType.ChannelMessageWithSource,
                                    data: {
                                        content: "Invalid user"
                                    }
                                }
                            }
                        }
                    } else { // URL
                        try {
                            let url = new URL(option.value!.trim());
                            if (url.protocol.startsWith("http") && url.hostname) {
                                type = GenerateType.URL;
                                urlOrUser = url.href;
                            }
                        } catch (ignored) {
                            return {
                                type: InteractionResponseType.ChannelMessageWithSource,
                                data: {
                                    content: "Invalid url"
                                }
                            }
                        }
                    }
                    break;
                }
                case "variant": {
                    if (option.value) {
                        variant = option.value as SkinVariant;
                    }
                    break;
                }
                case "name": {
                    if (option.value) {
                        name = option.value.substr(0, 20);
                    }
                    break;
                }
            }
        }

        console.log(`Type:      ${ type }`);
        console.log(`Value:     ${ urlOrUser }`);
        console.log(`Variant:   ${ variant }`);
        console.log(`Name:      "${ name }"`);

        if (!urlOrUser || !type || !variant) {
            return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: "That didn't work. Please check your command."
                }
            }
        }

        let msg = `Generating \`${ type }\` skin for \`${ urlOrUser }\` with \`${ variant }\` variant`;
        if (name) {
            msg += ` and name \`${ name }\``;
        }

        console.log(msg);

        this.mineskinQueue.add({
            interaction: interaction.id,
            token: interaction.token,
            type: type,
            urlOrUser: urlOrUser,
            variant: variant,
            name: name
        }).then(generateResponse => {
            this.handleGenerateResponse(generateResponse);
        })

        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: msg
            }
        }
    }

    static async startDiscordJs() {
        this.discordClient = new Discord.Client();
        this.discordClient.on("ready", () => {
            this.discordClient.user?.setPresence({
                status: "idle",
                activity: {
                    name: `out for requests`,
                    url: "https://mineskin.org",
                    type: "WATCHING"
                }
            });
            setInterval(() => {
                if (this.mineskinQueue.size > 0 && this.discordClient.user?.presence.status !== "online") {
                    this.discordClient.user?.setPresence({
                        status: "online",
                        activity: {
                            name: `${ this.mineskinQueue.size } Skin${ this.mineskinQueue.size === 1 ? "" : "s" } Generate`,
                            url: "https://mineskin.org",
                            type: "WATCHING"
                        }
                    });
                } else if (this.discordClient.user?.presence.status !== "idle") {
                    this.discordClient.user?.setPresence({
                        status: "idle",
                        activity: {
                            name: `out for requests`,
                            url: "https://mineskin.org",
                            type: "WATCHING"
                        }
                    });
                }
            }, 20 * 1000);
        })
        await this.discordClient.login(config.token);
    }

}

const app: Express = express();

const verifyDiscordSignature = async (req: DiscordRequest, res: Response, next: NextFunction) => {
    // https://discord.com/developers/docs/interactions/slash-commands#security-and-authorization

    const signature = req.get('X-Signature-Ed25519')!;
    const timestamp = req.get('X-Signature-Timestamp')!;
    const body = req.rawBody!; // rawBody is expected to be a string, not raw bytes

    const isVerified = nacl.sign.detached.verify(
        Buffer.from(`${ timestamp }${ body }`),
        Buffer.from(signature, 'hex'),
        Buffer.from(config.pubKey, 'hex')
    );

    if (!isVerified) {
        return res.status(401).end('invalid request signature');
    }

    next();
}

async function startExpress(): Promise<void> {

    const basePath = `${ config.path }/discord/command`;

    app.use(bodyParser.json({
        verify(req: DiscordRequest, res: Response, buf: Buffer, encoding: string) {
            req.rawBody = buf.toString("utf8");
        }
    }));

    app.get("/", async (req: Request, res: Response) => {
        console.warn("GET /");
    })

    app.get(basePath, verifyDiscordSignature, async (req: Request, res: Response) => {
        console.log("GET /discord/command");

    })

    app.post(basePath, verifyDiscordSignature, async (req: Request, res: Response) => {
        console.log("POST /discord/command");
        console.log(JSON.stringify(req.body, null, 2));

        if (req.body["type"] === InteractionType.Ping) { // PING
            res.status(200).json({
                type: InteractionResponseType.Pong
            });
            return;
        }

        if (req.body["type"] === InteractionType.ApplicationCommand) { // COMMAND
            const response = await MineSkinDiscordBot.handleCommand(req.body as Interaction);
            res.status(200).json(response);
            return;
        }

        res.status(400).end();
    })

    return new Promise(resolve => {
        app.listen(config.port, () => {
            console.log(`listening on port ${ config.port }`);
            resolve();
        })
    })
}


(async () => {
    console.log("Starting!");

    console.log("Registering commands...");
    await MineSkinDiscordBot.registerCommands();

    console.log("Starting discord.js client...");
    await MineSkinDiscordBot.startDiscordJs();

    console.log("Starting express...");
    await startExpress();

    console.log("Done!");
})();
