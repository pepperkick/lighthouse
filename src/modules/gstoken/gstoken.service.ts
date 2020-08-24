import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import * as config from "../../../config.json"
import { InjectModel } from "@nestjs/mongoose";
import { GSToken } from "./gstoken.model";
import { Model } from "mongoose";

const STEAM_API = "https://api.steampowered.com/IGameServersService"

@Injectable()
export class GSTokenService {
	private readonly logger = new Logger(GSTokenService.name);

	constructor(@InjectModel(GSToken.name) private GSToken: Model<GSToken>) {}

	/**
	 * Reserve a token for use
	 */
	async reserve(): Promise<GSToken> {
		let token = await this.GSToken.findOne({ inUse: false });

		if (!token) {
			this.logger.warn(`No free tokens found, attempting to create new one`);

			try {
				token = await this.createToken();
			} catch (error) {
				this.logger.error("Failed to create new token for request", error)
				return;
			}
		}

		const res = await this.getStatus(token);
		
		if (res.is_banned) {
			this.logger.error(`Token ${token.login_token} has been banned, removing entry...`);
			await this.GSToken.deleteOne(token);
			return this.reserve();
		}

		token.inUse = true;
		await token.save();

		this.logger.log(`Marked token ${token.login_token} as in use`);

		return token;
	}

	/**
	 * Release a token
	 * 
	 * @param login_token Token string
	 */
	async release(login_token: string) {
		const token = await this.GSToken.findOne({ login_token });

		if (!token) {
			this.logger.error(`Could not find any gstoken with token ${login_token}`);
			return;
		}

		token.inUse = false;
		await token.save();

		this.logger.log(`Marked token ${token.login_token} as not in use`);

		return token;
	}

	/**
	 * Create a new token by calling steam api
	 */
	async createToken() {
		const res = await axios.post(`${STEAM_API}/CreateAccount/v1/`, {}, {
			params: {
				key: config.steamWebToken,
				appid: 440,
				memo: "Lighthouse"
			}
		});

		const token = new this.GSToken();
		token.login_token = res.data.response.login_token;
		token.steamid = res.data.response.steamid;
		token.inUse = false;
		await token.save(); 

		return token;
	}

	/**
	 * Get status of a token by calling steam api
	 * 
	 * @param token GSToken
	 */
	async getStatus(token: GSToken) {
		const res = await axios.get(`${STEAM_API}/QueryLoginToken/v1/`, {
			params: {
				key: config.steamWebToken,
				login_token: token.login_token
			}
		});

		return res.data.response;
	}
}