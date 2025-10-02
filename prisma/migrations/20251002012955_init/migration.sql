-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('GUEST', 'USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "BanStatus" AS ENUM ('NONE', 'WARNING', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('WARNING', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('UNPLAYED', 'PLAYED', 'DISPUTE');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('DEAD', 'UNREADY', 'PENDING', 'READY', 'PLACEMENT');

-- CreateEnum
CREATE TYPE "DemoStatus" AS ENUM ('CLEAR', 'REVIEW', 'ACTION');

-- CreateEnum
CREATE TYPE "PlayerPermission" AS ENUM ('MEMBER', 'ADMIN', 'STATUS');

-- CreateEnum
CREATE TYPE "PendingStatus" AS ENUM ('TEAM', 'ADMIN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'PARTIAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MATCH_COMM', 'PENDING_PLAYER');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('BAN', 'PICK');

-- CreateTable
CREATE TABLE "users" (
    "steam_id" TEXT NOT NULL,
    "steam_username" TEXT NOT NULL,
    "steam_avatar" TEXT,
    "permission_level" "UserRole" NOT NULL DEFAULT 'GUEST',
    "ban_status" "BanStatus" NOT NULL DEFAULT 'NONE',
    "name_override" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("steam_id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "steam_id" TEXT,
    "steam_username" TEXT,
    "steam_avatar" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord" (
    "discord_id" TEXT NOT NULL,
    "discord_username" TEXT,
    "discord_avatar" TEXT,
    "player_steam_id" TEXT,

    CONSTRAINT "discord_pkey" PRIMARY KEY ("discord_id")
);

-- CreateTable
CREATE TABLE "punishment" (
    "id" SERIAL NOT NULL,
    "player_steam_id" TEXT,
    "punished_by" TEXT,
    "duration" INTEGER,
    "start_date_time" INTEGER,
    "status" INTEGER,
    "severity" INTEGER,
    "reason" TEXT,

    CONSTRAINT "punishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "categories" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bumped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner" TEXT,
    "hidden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "thread" INTEGER NOT NULL,
    "owner" TEXT,
    "hidden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" SERIAL NOT NULL,
    "thread_count" INTEGER NOT NULL,
    "post_count" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "owner" TEXT,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderators" (
    "steam_id" TEXT NOT NULL,
    "staff_type" INTEGER,
    "division_id" INTEGER,

    CONSTRAINT "moderators_pkey" PRIMARY KEY ("steam_id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "hidden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" SERIAL NOT NULL,
    "season_num" INTEGER NOT NULL,
    "num_weeks" INTEGER NOT NULL,
    "region_id" INTEGER NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "signup_cost" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "hidden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playoffs" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "num_rounds" INTEGER,
    "double_elim" INTEGER,
    "is_tournament" BOOLEAN NOT NULL,

    CONSTRAINT "playoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "acronym" TEXT,
    "avatar" TEXT,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "games_won" INTEGER NOT NULL DEFAULT 0,
    "games_lost" INTEGER NOT NULL DEFAULT 0,
    "points_scored" INTEGER NOT NULL DEFAULT 0,
    "points_scored_against" INTEGER NOT NULL DEFAULT 0,
    "division_id" INTEGER,
    "region_id" INTEGER,
    "season_id" INTEGER,
    "is_1v1" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "payment_status" INTEGER NOT NULL DEFAULT 0,
    "join_password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams_history" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "acronym" TEXT,
    "avatar" TEXT,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "games_won" INTEGER NOT NULL DEFAULT 0,
    "games_lost" INTEGER NOT NULL DEFAULT 0,
    "points_scored" INTEGER NOT NULL DEFAULT 0,
    "points_scored_against" INTEGER NOT NULL DEFAULT 0,
    "division_id" INTEGER,
    "region_id" INTEGER,
    "season_id" INTEGER NOT NULL,
    "is_1v1" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "payment_status" INTEGER NOT NULL DEFAULT 0,
    "join_password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players_in_teams" (
    "player_steam_id" TEXT NOT NULL,
    "team_id" INTEGER NOT NULL,
    "active" INTEGER NOT NULL DEFAULT 1,
    "permission_level" INTEGER NOT NULL DEFAULT 0,
    "payment_status" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TEXT NOT NULL DEFAULT '0',

    CONSTRAINT "players_in_teams_pkey" PRIMARY KEY ("player_steam_id","team_id")
);

-- CreateTable
CREATE TABLE "pending_players" (
    "player_steam_id" TEXT NOT NULL,
    "team_id" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pending_players_pkey" PRIMARY KEY ("player_steam_id","team_id")
);

-- CreateTable
CREATE TABLE "denied_players" (
    "player_steam_id" TEXT NOT NULL,
    "team_id" INTEGER NOT NULL,
    "reason" TEXT,
    "admin_id" TEXT,
    "denied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "denied_players_pkey" PRIMARY KEY ("player_steam_id","team_id")
);

-- CreateTable
CREATE TABLE "teamname_history" (
    "team_id" INTEGER NOT NULL,
    "name" TEXT,
    "change_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teamname_history_pkey" PRIMARY KEY ("team_id","change_date")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" SERIAL NOT NULL,
    "home_team_id" INTEGER NOT NULL,
    "away_team_id" INTEGER NOT NULL,
    "winner_id" INTEGER,
    "winner_score" INTEGER,
    "loser_score" INTEGER,
    "season_id" INTEGER NOT NULL,
    "season_no" INTEGER NOT NULL,
    "playoff_id" INTEGER,
    "playoff_round" INTEGER,
    "week_no" INTEGER,
    "bo_series" INTEGER,
    "bo_games" INTEGER,
    "match_date_time" TEXT,
    "status" INTEGER NOT NULL DEFAULT 0,
    "submitted_by" TEXT,
    "submitted_at" INTEGER,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER,
    "fight_night_matchups_id" INTEGER,
    "game_num" INTEGER NOT NULL,
    "home_team_score" INTEGER,
    "away_team_score" INTEGER,
    "arena_id" INTEGER,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_comms" (
    "id" SERIAL NOT NULL,
    "content" TEXT,
    "reschedule" TEXT,
    "reschedule_status" INTEGER,
    "created_At" INTEGER,
    "match_id" INTEGER NOT NULL,
    "owner" TEXT,

    CONSTRAINT "match_comms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arenas" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "playoff_map" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "arenas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_bans" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "playoff_map" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "map_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_ban_pools" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_ban_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maps_in_pool" (
    "pool_id" INTEGER NOT NULL,
    "arena_id" INTEGER NOT NULL,
    "order_num" INTEGER NOT NULL,

    CONSTRAINT "maps_in_pool_pkey" PRIMARY KEY ("pool_id","arena_id")
);

-- CreateTable
CREATE TABLE "match_map_bans" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER,
    "pool_id" INTEGER,
    "current_turn" INTEGER NOT NULL DEFAULT 0,
    "ban_phase_complete" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TEXT,

    CONSTRAINT "match_map_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_ban_actions" (
    "id" SERIAL NOT NULL,
    "match_map_ban_id" INTEGER,
    "team_id" INTEGER,
    "player_steam_id" TEXT,
    "arena_id" INTEGER,
    "action_type" TEXT NOT NULL,
    "action_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_ban_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "payment_id" TEXT NOT NULL,
    "purchased_for" TEXT NOT NULL,
    "purchased_by" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT,
    "purchase_date" TEXT NOT NULL,
    "description" TEXT,
    "team_id" INTEGER,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "payment_tracker" (
    "id" SERIAL NOT NULL,
    "player_steam_id" TEXT NOT NULL,
    "season_id" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "payment_tracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demos" (
    "id" SERIAL NOT NULL,
    "file" TEXT NOT NULL,
    "player_steam_id" TEXT,
    "submitted_by" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_id" INTEGER,
    "tournament_id" INTEGER,
    "fight_night_id" INTEGER,
    "title" TEXT,
    "description" TEXT,

    CONSTRAINT "demos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_report" (
    "id" SERIAL NOT NULL,
    "demo_id" INTEGER NOT NULL,
    "reported_by" TEXT,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "admin_id" TEXT,
    "admin_comments" TEXT,

    CONSTRAINT "demo_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bracket_link" TEXT,
    "avatar" TEXT,
    "started_at" TEXT,
    "winner1_steam_id" TEXT,
    "winner2_steam_id" TEXT,
    "second_place1_steam_id" TEXT,
    "second_place2_steam_id" TEXT,
    "third_place1_steam_id" TEXT,
    "third_place2_steam_id" TEXT,
    "is_team_tournament" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fight_night" (
    "id" SERIAL NOT NULL,
    "card" TEXT,
    "description" TEXT,
    "prizepool" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "started_at" TEXT,

    CONSTRAINT "fight_night_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fight_night_matchups" (
    "id" SERIAL NOT NULL,
    "fight_night_id" INTEGER,
    "player1_steam_id" TEXT,
    "player2_steam_id" TEXT,
    "order_num" INTEGER NOT NULL,
    "winner_id" TEXT,
    "winner_score" INTEGER,
    "loser_score" INTEGER,
    "bo_series" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "fight_night_matchups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TEXT,
    "winner" TEXT,
    "status" INTEGER NOT NULL DEFAULT 0,
    "avatar" TEXT,

    CONSTRAINT "championship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_participant" (
    "id" SERIAL NOT NULL,
    "championship_id" INTEGER,
    "steam_id" TEXT,
    "seed" INTEGER,
    "eliminated" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "championship_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_match" (
    "id" SERIAL NOT NULL,
    "championship_id" INTEGER,
    "player1_id" TEXT,
    "player2_id" TEXT,
    "winner_id" TEXT,
    "loser_id" TEXT,
    "winner_score" INTEGER,
    "loser_score" INTEGER,
    "bo_series" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "championship_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_game" (
    "id" SERIAL NOT NULL,
    "championship_match_id" INTEGER NOT NULL,
    "home_player_score" INTEGER,
    "away_player_score" INTEGER,
    "game_number" INTEGER NOT NULL,
    "arena_id" INTEGER,
    "played_at" TEXT,

    CONSTRAINT "championship_game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_steam_id" TEXT,
    "type" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global" (
    "id" SERIAL NOT NULL,
    "league_fees" INTEGER NOT NULL DEFAULT 0,
    "signup_closed" INTEGER NOT NULL DEFAULT 0,
    "roster_locked" INTEGER NOT NULL DEFAULT 0,
    "payment_required" INTEGER NOT NULL DEFAULT 0,
    "na_signup_season_id" INTEGER,
    "eu_signup_season_id" INTEGER,
    "aus_signup_season_id" INTEGER,
    "sa_signup_season_id" INTEGER,
    "asia_signup_season_id" INTEGER,

    CONSTRAINT "global_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_info" (
    "id" SERIAL NOT NULL,
    "intro" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "signups_dates" TEXT NOT NULL,
    "regular_season_dates" TEXT NOT NULL,
    "playoffs_dates" TEXT NOT NULL,
    "rosters_lock_date" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "match_times" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "playoffs_format" TEXT NOT NULL,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "visible" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_player_steam_id_key" ON "discord"("player_steam_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_tracker_player_steam_id_season_id_key" ON "payment_tracker"("player_steam_id", "season_id");

-- AddForeignKey
ALTER TABLE "discord" ADD CONSTRAINT "discord_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punishment" ADD CONSTRAINT "punishment_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punishment" ADD CONSTRAINT "punishment_punished_by_fkey" FOREIGN KEY ("punished_by") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_thread_fkey" FOREIGN KEY ("thread") REFERENCES "threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderators" ADD CONSTRAINT "moderators_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderators" ADD CONSTRAINT "moderators_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoffs" ADD CONSTRAINT "playoffs_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams_history" ADD CONSTRAINT "teams_history_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams_history" ADD CONSTRAINT "teams_history_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams_history" ADD CONSTRAINT "teams_history_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players_in_teams" ADD CONSTRAINT "players_in_teams_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players_in_teams" ADD CONSTRAINT "players_in_teams_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_players" ADD CONSTRAINT "pending_players_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_players" ADD CONSTRAINT "pending_players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denied_players" ADD CONSTRAINT "denied_players_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denied_players" ADD CONSTRAINT "denied_players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teamname_history" ADD CONSTRAINT "teamname_history_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_playoff_id_fkey" FOREIGN KEY ("playoff_id") REFERENCES "playoffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_fight_night_matchups_id_fkey" FOREIGN KEY ("fight_night_matchups_id") REFERENCES "fight_night_matchups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_arena_id_fkey" FOREIGN KEY ("arena_id") REFERENCES "arenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_comms" ADD CONSTRAINT "match_comms_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_comms" ADD CONSTRAINT "match_comms_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maps_in_pool" ADD CONSTRAINT "maps_in_pool_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "map_ban_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maps_in_pool" ADD CONSTRAINT "maps_in_pool_arena_id_fkey" FOREIGN KEY ("arena_id") REFERENCES "arenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_map_bans" ADD CONSTRAINT "match_map_bans_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_map_bans" ADD CONSTRAINT "match_map_bans_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "map_ban_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_ban_actions" ADD CONSTRAINT "map_ban_actions_match_map_ban_id_fkey" FOREIGN KEY ("match_map_ban_id") REFERENCES "match_map_bans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_ban_actions" ADD CONSTRAINT "map_ban_actions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_ban_actions" ADD CONSTRAINT "map_ban_actions_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_ban_actions" ADD CONSTRAINT "map_ban_actions_arena_id_fkey" FOREIGN KEY ("arena_id") REFERENCES "arenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchased_for_fkey" FOREIGN KEY ("purchased_for") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchased_by_fkey" FOREIGN KEY ("purchased_by") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_tracker" ADD CONSTRAINT "payment_tracker_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_tracker" ADD CONSTRAINT "payment_tracker_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_player_steam_id_fkey" FOREIGN KEY ("player_steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_fight_night_id_fkey" FOREIGN KEY ("fight_night_id") REFERENCES "fight_night_matchups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_report" ADD CONSTRAINT "demo_report_demo_id_fkey" FOREIGN KEY ("demo_id") REFERENCES "demos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_report" ADD CONSTRAINT "demo_report_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_report" ADD CONSTRAINT "demo_report_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_night_matchups" ADD CONSTRAINT "fight_night_matchups_fight_night_id_fkey" FOREIGN KEY ("fight_night_id") REFERENCES "fight_night"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_night_matchups" ADD CONSTRAINT "fight_night_matchups_player1_steam_id_fkey" FOREIGN KEY ("player1_steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_night_matchups" ADD CONSTRAINT "fight_night_matchups_player2_steam_id_fkey" FOREIGN KEY ("player2_steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_night_matchups" ADD CONSTRAINT "fight_night_matchups_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship" ADD CONSTRAINT "championship_winner_fkey" FOREIGN KEY ("winner") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_participant" ADD CONSTRAINT "championship_participant_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "championship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_participant" ADD CONSTRAINT "championship_participant_steam_id_fkey" FOREIGN KEY ("steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_match" ADD CONSTRAINT "championship_match_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "championship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_match" ADD CONSTRAINT "championship_match_player1_id_fkey" FOREIGN KEY ("player1_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_match" ADD CONSTRAINT "championship_match_player2_id_fkey" FOREIGN KEY ("player2_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_match" ADD CONSTRAINT "championship_match_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_match" ADD CONSTRAINT "championship_match_loser_id_fkey" FOREIGN KEY ("loser_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_game" ADD CONSTRAINT "championship_game_championship_match_id_fkey" FOREIGN KEY ("championship_match_id") REFERENCES "championship_match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_game" ADD CONSTRAINT "championship_game_arena_id_fkey" FOREIGN KEY ("arena_id") REFERENCES "arenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_steam_id_fkey" FOREIGN KEY ("user_steam_id") REFERENCES "users"("steam_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global" ADD CONSTRAINT "global_na_signup_season_id_fkey" FOREIGN KEY ("na_signup_season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global" ADD CONSTRAINT "global_eu_signup_season_id_fkey" FOREIGN KEY ("eu_signup_season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global" ADD CONSTRAINT "global_aus_signup_season_id_fkey" FOREIGN KEY ("aus_signup_season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global" ADD CONSTRAINT "global_sa_signup_season_id_fkey" FOREIGN KEY ("sa_signup_season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global" ADD CONSTRAINT "global_asia_signup_season_id_fkey" FOREIGN KEY ("asia_signup_season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
