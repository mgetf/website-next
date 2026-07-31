# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: season-god-path.spec.ts >> seed league, create home team, seed away + paid teams, open sessions
- Location: tests/e2e/season-god-path.spec.ts:117:1

# Error details

```
Test timeout of 300000ms exceeded.
```

```
Error: page.waitForURL: Target page, context or browser has been closed
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e5]:
    - navigation [ref=e6]:
        - generic [ref=e8]:
            - generic [ref=e9]:
                - link "MGE Logo MGE" [ref=e10] [cursor=pointer]:
                    - /url: /
                    - img "MGE Logo" [ref=e11]
                    - generic [ref=e12]: MGE
                - generic [ref=e13]:
                    - button "Leagues" [ref=e15]
                    - link "Tournaments" [ref=e18] [cursor=pointer]:
                        - /url: /tournaments
                    - link "Leaderboard new" [ref=e19] [cursor=pointer]:
                        - /url: /leaderboard
                        - text: Leaderboard
                        - generic [ref=e20]: new
                    - link "Users" [ref=e21] [cursor=pointer]:
                        - /url: /users
                    - link "Teams" [ref=e22] [cursor=pointer]:
                        - /url: /teams
                    - link "Maps" [ref=e23] [cursor=pointer]:
                        - /url: /maps
                    - link "Servers" [ref=e24] [cursor=pointer]:
                        - /url: /servers
                    - link "Logs" [ref=e25] [cursor=pointer]:
                        - /url: /logs
                    - link "Rules" [ref=e26] [cursor=pointer]:
                        - /url: /rulebook
            - generic [ref=e27]:
                - generic [ref=e28]:
                    - link "MGE on YouTube" [ref=e29] [cursor=pointer]:
                        - /url: https://www.youtube.com/channel/UCtVU1Zc_KiIjDAsH0GGRqww
                    - link "MGE Discord" [ref=e32] [cursor=pointer]:
                        - /url: https://mge.tf/discord
                - link "Sign Up" [ref=e35] [cursor=pointer]:
                    - /url: /signup
                - generic [ref=e36]:
                    - button "User menu" [ref=e38]:
                        - img "User Avatar" [ref=e39]
                        - generic [ref=e40]: Away Teammate
                    - button "Notifications" [ref=e44]
    - generic [ref=e48]:
        - generic [ref=e51]:
            - generic [ref=e52]: B
            - generic [ref=e55]:
                - heading "Bravo Unit" [level=1] [ref=e56]
                - paragraph [ref=e57]: BRA
                - generic [ref=e58]:
                    - generic [ref=e59]: Invite (E2E Region)
                    - generic [ref=e60]: Season 703088
                    - generic [ref=e61]:
                        - generic [ref=e62]: READY
                        - tooltip "Team has been approved and is active for the season"
                - generic [ref=e63]:
                    - generic [ref=e64]: 'Record: 0 - 0 (0.0%)'
                    - generic [ref=e65]: 'Points: 0 - 0'
                    - generic [ref=e66]: 'Created: 1/1/1970'
                - link "Join Team" [ref=e68] [cursor=pointer]:
                    - /url: /teams/1481704179/join
        - generic [ref=e70]:
            - generic [ref=e71]:
                - heading "Current Roster (0 / 3)" [level=2] [ref=e74]
                - generic [ref=e76]:
                    - heading "Past Roster" [level=2] [ref=e78]
                    - paragraph [ref=e80]: No past players in this team
            - generic [ref=e82]:
                - heading "Match History" [level=2] [ref=e84]
                - generic [ref=e86]:
                    - generic [ref=e87]: 🏆
                    - paragraph [ref=e88]: No match history yet
                    - paragraph [ref=e89]: This team hasn't participated in any seasons
```

# Test source

```ts
  112 |
  113 | test.afterAll(async () => {
  114 |   await closeAll();
  115 | });
  116 |
  117 | test('seed league, create home team, seed away + paid teams, open sessions', async ({
  118 |   browser,
  119 | }) => {
  120 |   test.setTimeout(300_000);
  121 |   process.env.DATABASE_URL ??= 'postgresql://mgetf:mgetf@localhost:5432/mgetf_test';
  122 |
  123 |   await resetDatabase();
  124 |   await seedUsers();
  125 |   league = await seedLeagueInfrastructure();
  126 |
  127 |   awayTeamId = await seedReadyTeam({
  128 |     name: AWAY_TEAM_NAME,
  129 |     acronym: 'BRA',
  130 |     captainSteamId: E2E_USERS.awayCaptain.steamId,
  131 |     teammateSteamId: E2E_USERS.awayTeammate.steamId,
  132 |     regionId: league.regionId,
  133 |     divisionId: league.divisionId,
  134 |     seasonId: league.seasonId,
  135 |     joinPassword: JOIN_PASSWORD,
  136 |   });
  137 |
  138 |   paidTeamId = await seedReadyTeam({
  139 |     name: PAID_TEAM_NAME,
  140 |     acronym: 'CHC',
  141 |     captainSteamId: E2E_USERS.paidCaptain.steamId,
  142 |     teammateSteamId: E2E_USERS.paidTeammate.steamId,
  143 |     regionId: league.regionId,
  144 |     divisionId: league.paidDivisionId,
  145 |     seasonId: league.seasonId,
  146 |     joinPassword: JOIN_PASSWORD,
  147 |     paymentStatus: 0,
  148 |     status: 'UNREADY',
  149 |   });
  150 |
  151 |   admin = await loginAs(browser, {
  152 |     steamId: E2E_USERS.admin.steamId,
  153 |     username: E2E_USERS.admin.username,
  154 |     role: 'ADMIN',
  155 |     redirect: '/admin',
  156 |   });
  157 |   homeCaptain = await loginAs(browser, {
  158 |     steamId: E2E_USERS.homeCaptain.steamId,
  159 |     username: E2E_USERS.homeCaptain.username,
  160 |     redirect: '/signup/2v2/create',
  161 |   });
  162 |   homeTeammate = await loginAs(browser, {
  163 |     steamId: E2E_USERS.homeTeammate.steamId,
  164 |     username: E2E_USERS.homeTeammate.username,
  165 |   });
  166 |   homeInvitee = await loginAs(browser, {
  167 |     steamId: E2E_USERS.homeInvitee.steamId,
  168 |     username: E2E_USERS.homeInvitee.username,
  169 |   });
  170 |   homeDeclined = await loginAs(browser, {
  171 |     steamId: E2E_USERS.homeDeclined.steamId,
  172 |     username: E2E_USERS.homeDeclined.username,
  173 |   });
  174 |   homeLinkJoiner = await loginAs(browser, {
  175 |     steamId: E2E_USERS.homeLinkJoiner.steamId,
  176 |     username: E2E_USERS.homeLinkJoiner.username,
  177 |   });
  178 |   homeInviteDecliner = await loginAs(browser, {
  179 |     steamId: E2E_USERS.homeInviteDecliner.steamId,
  180 |     username: E2E_USERS.homeInviteDecliner.username,
  181 |   });
  182 |   awayCaptain = await loginAs(browser, {
  183 |     steamId: E2E_USERS.awayCaptain.steamId,
  184 |     username: E2E_USERS.awayCaptain.username,
  185 |     redirect: `/teams/${awayTeamId}`,
  186 |   });
  187 |   awayTeammate = await loginAs(browser, {
  188 |     steamId: E2E_USERS.awayTeammate.steamId,
  189 |     username: E2E_USERS.awayTeammate.username,
  190 |     redirect: `/teams/${awayTeamId}`,
  191 |   });
  192 |   solo1v1 = await loginAs(browser, {
  193 |     steamId: E2E_USERS.solo1v1.steamId,
  194 |     username: E2E_USERS.solo1v1.username,
  195 |   });
  196 |
  197 |   await expect(awayCaptain.page.getByRole('heading', { name: AWAY_TEAM_NAME })).toBeVisible();
  198 |
  199 |   // --- Home captain creates team via signup UI ---
  200 |   await expect(homeCaptain.page.getByRole('heading', { name: 'Create New Team' })).toBeVisible();
  201 |   await homeCaptain.page.locator('#name').fill(HOME_TEAM_NAME);
  202 |   await homeCaptain.page.locator('#acronym').fill('ALP');
  203 |   await homeCaptain.page.locator('#regionId').selectOption({ label: 'E2E Region' });
  204 |   await expect(
  205 |     homeCaptain.page.locator('#divisionId option').filter({ hasText: 'Invite' }),
  206 |   ).toHaveCount(1, { timeout: 10_000 });
  207 |   await homeCaptain.page.locator('#divisionId').selectOption(String(league.divisionId));
  208 |   await homeCaptain.page.locator('#joinPassword').fill(JOIN_PASSWORD);
  209 |   await homeCaptain.page.locator('input[name="rules"]').check();
  210 |
  211 |   await Promise.all([
> 212 |     homeCaptain.page.waitForURL(/\/teams\/\d+/),
      |                      ^ Error: page.waitForURL: Target page, context or browser has been closed
  213 |     homeCaptain.page.getByRole('button', { name: 'Create Team' }).click(),
  214 |   ]);
  215 |
  216 |   // Parse team ID from the redirect URL (/teams/:id) — no name index available in Rama.
  217 |   const teamUrl = homeCaptain.page.url();
  218 |   const teamUrlMatch = teamUrl.match(/\/teams\/(\d+)/);
  219 |   expect(teamUrlMatch).not.toBeNull();
  220 |   homeTeamId = parseInt(teamUrlMatch![1]!, 10);
  221 |   expect(homeTeamId).toBeGreaterThan(0);
  222 |   expect(await getTeamStatus(homeTeamId)).toBe('UNREADY');
  223 | });
  224 |
  225 | test('join approve ready; decline pending; invite/promote/remove; link join; decline/cancel invite', async () => {
  226 |   test.setTimeout(300_000);
  227 |
  228 |   // Password join
  229 |   await homeTeammate.page.goto(`/teams/${homeTeamId}/join`);
  230 |   await homeTeammate.page.locator('#password').fill(JOIN_PASSWORD);
  231 |   await Promise.all([
  232 |     homeTeammate.page.waitForURL(
  233 |       (url) =>
  234 |         url.pathname === `/teams/${homeTeamId}` &&
  235 |         url.searchParams.get('joined') === 'awaiting-admin',
  236 |     ),
  237 |     homeTeammate.page.getByRole('button', { name: 'Request to Join' }).click(),
  238 |   ]);
  239 |
  240 |   // Admin approves teammate
  241 |   await admin.page.goto('/admin/pending-players');
  242 |   await expect(admin.page.getByText(E2E_USERS.homeTeammate.username)).toBeVisible();
  243 |   await Promise.all([
  244 |     admin.page.waitForLoadState('networkidle'),
  245 |     admin.page.getByRole('button', { name: '✓ Approve' }).click(),
  246 |   ]);
  247 |   await expect(admin.page.getByText('No pending player requests')).toBeVisible({
  248 |     timeout: 15_000,
  249 |   });
  250 |
  251 |   // Decline path: password join → admin declines with reason
  252 |   await homeDeclined.page.goto(`/teams/${homeTeamId}/join`);
  253 |   await homeDeclined.page.locator('#password').fill(JOIN_PASSWORD);
  254 |   await Promise.all([
  255 |     homeDeclined.page.waitForURL(
  256 |       (url) =>
  257 |         url.pathname === `/teams/${homeTeamId}` &&
  258 |         url.searchParams.get('joined') === 'awaiting-admin',
  259 |     ),
  260 |     homeDeclined.page.getByRole('button', { name: 'Request to Join' }).click(),
  261 |   ]);
  262 |   await admin.page.goto('/admin/pending-players');
  263 |   await adminDeclinePendingPlayer(
  264 |     admin.page,
  265 |     E2E_USERS.homeDeclined.username,
  266 |     'E2E decline reason',
  267 |   );
  268 |   await expect(admin.page.getByText('No pending player requests')).toBeVisible({
  269 |     timeout: 15_000,
  270 |   });
  271 |
  272 |   // Ready Up → PENDING → admin READY
  273 |   await homeCaptain.page.goto(`/teams/${homeTeamId}`);
  274 |   await homeCaptain.page.getByRole('button', { name: 'Ready Up' }).click();
  275 |   await expect(homeCaptain.page.getByText('Mark Alpha Force as ready?')).toBeVisible();
  276 |   await Promise.all([
  277 |     homeCaptain.page.waitForLoadState('networkidle'),
  278 |     homeCaptain.page.getByRole('button', { name: 'Ready Up' }).nth(1).click(),
  279 |   ]);
  280 |   expect(await getTeamStatus(homeTeamId)).toBe('PENDING');
  281 |
  282 |   await admin.page.goto(`/teams/${homeTeamId}`);
  283 |   await admin.page.locator('#status').selectOption('READY');
  284 |   await Promise.all([
  285 |     admin.page.waitForLoadState('networkidle'),
  286 |     admin.page.getByRole('button', { name: 'Update Status' }).click(),
  287 |   ]);
  288 |   expect(await getTeamStatus(homeTeamId)).toBe('READY');
  289 |
  290 |   // Invite by Steam ID
  291 |   await homeCaptain.page.goto(`/teams/${homeTeamId}/edit`);
  292 |   await homeCaptain.page.getByRole('button', { name: 'Invite Players' }).click();
  293 |   await homeCaptain.page.locator('#steamId').fill(E2E_USERS.homeInvitee.steamId);
  294 |   await Promise.all([
  295 |     homeCaptain.page.waitForLoadState('networkidle'),
  296 |     homeCaptain.page.getByRole('button', { name: 'Send Invitation' }).click(),
  297 |   ]);
  298 |
  299 |   // Invitee accepts from /invitations
  300 |   await homeInvitee.page.goto('/invitations');
  301 |   await expect(homeInvitee.page.getByText(HOME_TEAM_NAME)).toBeVisible();
  302 |   await Promise.all([
  303 |     homeInvitee.page.waitForLoadState('networkidle'),
  304 |     homeInvitee.page.getByRole('button', { name: 'Accept' }).click(),
  305 |   ]);
  306 |
  307 |   // Admin approves invitee
  308 |   await admin.page.goto('/admin/pending-players');
  309 |   await expect(admin.page.getByText(E2E_USERS.homeInvitee.username)).toBeVisible({
  310 |     timeout: 15_000,
  311 |   });
  312 |   await Promise.all([
```
