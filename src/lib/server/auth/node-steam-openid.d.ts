declare module 'node-steam-openid' {
	export default class SteamAuth {
		constructor(options: {
			realm: string;
			returnUrl: string;
			apiKey: string;
		});
		getRedirectUrl(): Promise<string>;
		authenticate(request: any): Promise<any>;
	}
}

