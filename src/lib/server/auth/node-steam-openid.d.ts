declare module 'node-steam-openid' {
  export interface SteamOpenIdProfile {
    steamid: string;
    personaname: string;
    avatarfull: string;
  }

  export interface SteamOpenIdUser {
    _json: SteamOpenIdProfile;
  }

  export default class SteamAuth {
    constructor(options: { realm: string; returnUrl: string; apiKey: string });
    getRedirectUrl(): Promise<string>;
    authenticate(request: Request): Promise<SteamOpenIdUser>;
  }
}
