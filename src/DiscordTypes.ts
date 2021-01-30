import exp = require("constants");

export interface ApplicationCommand {
    id: string;
    application_id: string;
    name: string;
    description: string;
    options?: ApplicationCommandOption[];
}

export interface ApplicationCommandOption {
    type: ApplicationCommandOptionType;
    name: string;
    description: string;
    required?: boolean;
    choices?: ApplicationCommandOptionChoice[];
    options?: ApplicationCommandOption[];
}

export interface ApplicationCommandOptionChoice {
    name: string;
    value: string | number;
}

///

export interface Interaction {
    id: string;
    type: InteractionType;
    data?: ApplicationCommandInteractionData;
    guild_id: string;
    channel_id: string;
    member: any;
    token: string;
    version: number;
}

export interface ApplicationCommandInteractionData {
    id: string;
    name: string;
    options?: ApplicationCommandInteractionDataOption[];
}

export interface ApplicationCommandInteractionDataOption {
    name: string;
    value?: string;
    options?: ApplicationCommandInteractionDataOption[];
}

///

export  interface InteractionResponse {
    type?: InteractionResponseType;
    data?: InteractionApplicationCommandCallbackData;
}

export interface InteractionApplicationCommandCallbackData {
    tts?: boolean;
    content: string;
    embeds?: Embed[];
    allowed_mentions?: any;
}

///

export interface Embed {
    title?: string;
    type: "rich";
    description?: string;
    url?: string;
    timestamp?: string;
    color?: number;
    image?: EmbedImage;
    thumbnail?: EmbedImage;
    footer?: EmbedFooter;
    author?: EmbedAuthor;
    fields?: EmbedField[];
}

export  interface EmbedAuthor {
    name?: string;
    url?: string;
    icon_url?: string;
}

export interface EmbedFooter {
    text: string;
}

export interface EmbedField {
    name: string;
    value: string;
    inline?: boolean;
}

export interface EmbedImage {
    url?: string;
    width?: number;
    height?: number;
}

export enum InteractionResponseType {
    Pong = 1,
    Acknowledge=2,
    ChannelMessage=3,
    ChannelMessageWithSource=4,
    AcknowledgeWithSource=5,
}

export enum InteractionType {
    Ping = 1,
    ApplicationCommand = 2,
}

export enum ApplicationCommandOptionType {
    SUB_COMMAND = 1,
    SUB_COMMAND_GROUP = 2,
    STRING = 3,
    INTEGER = 4,
    BOOLEAN = 5,
    USER = 6,
    CHANNEL = 7,
    ROLE = 8,
}
