import {
  DefaultMJConfig,
  LoadingHandler,
  MJMessage,
  MJConfig,
  MJConfigParam,
} from "./interfaces";
import { CreateQueue } from "./queue";
import { sleep } from "./utls";

export class MidjourneyMessage {
  private magApiQueue = CreateQueue(1);
  public config: MJConfig;
  constructor(defaults: MJConfigParam) {
    const { SalaiToken } = defaults;
    if (!SalaiToken) {
      throw new Error("SalaiToken are required");
    }
    this.config = {
      ...DefaultMJConfig,
      ...defaults,
    };
    if (this.config.ProxyUrl && this.config.ProxyUrl !== "") {
    }
  }
  protected log(...args: any[]) {
    this.config.Debug && console.log(...args, new Date().toISOString());
  }
  async FilterMessages(
    timestamp: number,
    prompt: string,
    loading?: LoadingHandler,
    options?: string,
    index?: number
  ) {
    const seed = prompt.match(/--seed (\d+)/)?.[1];

    const data = await this.safeRetrieveMessages(this.config.Limit);
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (
        item.author.id === "936929561302675456" &&
        item.content.includes(`${seed}`)
      ) {
        this.log(JSON.stringify(item));
        // Upscaled or Variation
        if (item.timestamp < timestamp) {
          this.log("old message");
          continue;
        }
        if (
          options &&
          !(
            item.content.includes(options) ||
            (options === "Upscaled" && item.content.includes(`Image #${index}`))
          )
        ) {
          this.log("no options");
          continue;
        }
        if (item.attachments.length === 0) {
          this.log("no attachment");
          break;
        }
        const imageUrl = item.attachments[0].url;
        //waiting
        this.log(`waiting.content`, item.content);
        if (
          item.attachments[0].filename.startsWith("grid") ||
          item.components.length === 0
        ) {
          this.log(`content`, item.content);
          const regex = /\(([^)]+)\)/; // matches the value inside the first parenthesis
          const match = item.content.match(regex);
          let progress = "wait";
          if (match) {
            progress = match[1];
          } else {
            this.log("No match found");
          }
          loading?.(imageUrl, progress);
          break;
        }
        //finished
        const content = item.content.split("**")[1];
        const msg: MJMessage = {
          id: item.id,
          uri: imageUrl,
          hash: this.UriToHash(imageUrl),
          content: content,
          progress: "done",
        };
        return msg;
      }
    }
    return null;
  }
  UriToHash(uri: string) {
    return uri.split("_").pop()?.split(".")[0] ?? "";
  }
  async WaitMessage(prompt: string, loading?: LoadingHandler) {
    var timestamp = Date.now();
    for (let i = 0; i < this.config.MaxWait; i++) {
      const msg = await this.FilterMessages(timestamp, prompt, loading);
      if (msg !== null) {
        return msg;
      }
      this.log(i, "wait no message found");
      await sleep(1000 * 2);
    }
    return null;
  }

  async WaitOptionMessage(
    content: string,
    options: string,
    loading?: LoadingHandler
  ) {
    var timestamp = Date.now();

    for (let i = 0; i < this.config.MaxWait; i++) {
      const msg = await this.FilterMessages(
        timestamp,
        content,
        loading,
        options
      );
      if (msg !== null) {
        return msg;
      }
      this.log(i, content, "wait no message found");
      await sleep(1000 * 2);
    }
    return null;
  }
  async WaitUpscaledMessage(
    content: string,
    index: number,
    loading?: LoadingHandler
  ) {
    var timestamp = Date.now();
    for (let i = 0; i < this.config.MaxWait; i++) {
      const msg = await this.FilterMessages(
        timestamp,
        content,
        loading,
        "Upscaled",
        index
      );
      if (msg !== null) {
        return msg;
      }
      this.log(i, content, "wait no message found");
      await sleep(1000 * 2);
    }
    return null;
  }

  // limit the number of concurrent interactions
  protected async safeRetrieveMessages(limit = 50) {
    return this.magApiQueue.addTask(() => this.RetrieveMessages(limit));
  }
  async RetrieveMessages(limit = this.config.Limit) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: this.config.SalaiToken,
    };
    const response = await fetch(
      `${this.config.DiscordBaseUrl}/api/v10/channels/${this.config.ChannelId}/messages?limit=${limit}`,
      {
        headers,
      }
    );
    if (!response.ok) {
      this.log("error config", { config: this.config });
      this.log(`HTTP error! status: ${response.status}`);
    }
    const data: any = await response.json();
    return data;
  }
}
