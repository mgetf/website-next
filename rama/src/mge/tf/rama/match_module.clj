(ns mge.tf.rama.match-module
  "Match spike — JSON-map events for Rama REST (no Clojure HTTP).

  Depot *match-depot (hash-by matchId): create-match | ban-map | submit-score
  PStates: $$matches $$map-bans $$team-stats $$matches-by-team"
  (:use [com.rpl.rama]
        [com.rpl.rama.path]))

(defn match-id [event]
  (get event "matchId"))

(defn long-or-zero [v]
  (long (or v 0)))

(defn pool->set [pool]
  (set pool))

(defn ban-error [turn home away team-id remaining arena-id]
  (cond
    (nil? turn) "no-ban-state"
    (not= team-id (if (even? (long turn)) away home)) "not-your-turn"
    (not (contains? remaining arena-id)) "arena-not-in-pool"
    :else nil))

(defn score-error [status home-score away-score bo-games]
  (cond
    (nil? status) "match-not-found"
    (not= status "UNPLAYED") "already-played"
    (not (or (and (>= home-score bo-games) (> home-score away-score))
             (and (>= away-score bo-games) (> away-score home-score))))
    "incomplete-or-invalid-score"
    :else nil))

(defn pick-winner [home-id away-id home-score away-score]
  (if (> home-score away-score) home-id away-id))

(defn pick-loser [home-id away-id winner-id]
  (if (= winner-id home-id) away-id home-id))

(defmodule MatchModule
  [setup topologies]
  (declare-depot setup *match-depot (hash-by match-id))

  (let [s (stream-topology topologies "matches")]
    (declare-pstate
     s $$matches
     {String (fixed-keys-schema
              {"homeTeamId" String
               "awayTeamId" String
               "seasonId" String
               "status" String
               "homeScore" Long
               "awayScore" Long
               "winnerId" String
               "boGames" Long})})

    (declare-pstate
     s $$map-bans
     {String (fixed-keys-schema
              {"turn" Long
               "homeTeamId" String
               "awayTeamId" String
               "remaining" Object  ;; small set of arena ids
               "actions" Object})})  ;; vector of {teamId, arenaId}

    (declare-pstate
     s $$team-stats
     {String (fixed-keys-schema
              {"wins" Long
               "losses" Long
               "points" Long})})

    (declare-pstate
     s $$matches-by-team
     {String (map-schema String String {:subindex? true})})

    (<<sources s
      (source> *match-depot :> *event)
      (get *event "type" :> *type)
      (get *event "matchId" :> *match-id)

      (<<if (= *type "create-match")
        (get *event "homeTeamId" :> *home-id)
        (get *event "awayTeamId" :> *away-id)
        (get *event "seasonId" :> *season-id)
        (get *event "boGames" :> *bo-raw)
        (get *event "pool" :> *pool)
        (long-or-zero *bo-raw :> *bo-games)
        (pool->set *pool :> *pool-set)
        (local-select> (keypath *match-id) $$matches :> *existing)
        (<<if (nil? *existing)
          (local-transform> [(keypath *match-id "homeTeamId") (termval *home-id)] $$matches)
          (local-transform> [(keypath *match-id "awayTeamId") (termval *away-id)] $$matches)
          (local-transform> [(keypath *match-id "seasonId") (termval *season-id)] $$matches)
          (local-transform> [(keypath *match-id "status") (termval "UNPLAYED")] $$matches)
          (local-transform> [(keypath *match-id "homeScore") (termval 0)] $$matches)
          (local-transform> [(keypath *match-id "awayScore") (termval 0)] $$matches)
          (local-transform> [(keypath *match-id "boGames") (termval *bo-games)] $$matches)
          (local-transform> [(keypath *match-id "turn") (termval 0)] $$map-bans)
          (local-transform> [(keypath *match-id "homeTeamId") (termval *home-id)] $$map-bans)
          (local-transform> [(keypath *match-id "awayTeamId") (termval *away-id)] $$map-bans)
          (local-transform> [(keypath *match-id "remaining") (termval *pool-set)] $$map-bans)
          (local-transform> [(keypath *match-id "actions") (termval [])] $$map-bans)
          (|hash *home-id)
          (local-transform> [(keypath *home-id *match-id) (termval *season-id)] $$matches-by-team)
          (|hash *away-id)
          (local-transform> [(keypath *away-id *match-id) (termval *season-id)] $$matches-by-team)
          (ack-return> {"ok" true "matchId" *match-id})
         (else>)
          (ack-return> {"ok" false "error" "match-exists"})))

      (<<if (= *type "ban-map")
        (get *event "teamId" :> *team-id)
        (get *event "arenaId" :> *arena-id)
        (local-select> (keypath *match-id "turn") $$map-bans :> *turn)
        (local-select> (keypath *match-id "homeTeamId") $$map-bans :> *ban-home)
        (local-select> (keypath *match-id "awayTeamId") $$map-bans :> *ban-away)
        (local-select> (keypath *match-id "remaining") $$map-bans :> *remaining)
        (ban-error *turn *ban-home *ban-away *team-id *remaining *arena-id :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (disj *remaining *arena-id :> *next-remaining)
          (inc *turn :> *next-turn)
          (local-transform> [(keypath *match-id "remaining") (termval *next-remaining)] $$map-bans)
          (local-transform>
           [(keypath *match-id "actions") AFTER-ELEM
            (termval {"teamId" *team-id "arenaId" *arena-id})]
           $$map-bans)
          (local-transform> [(keypath *match-id "turn") (termval *next-turn)] $$map-bans)
          (ack-return> {"ok" true "matchId" *match-id "banned" *arena-id "turn" *next-turn})))

      (<<if (= *type "submit-score")
        (get *event "homeScore" :> *hs-raw)
        (get *event "awayScore" :> *as-raw)
        (long-or-zero *hs-raw :> *home-score)
        (long-or-zero *as-raw :> *away-score)
        (local-select> (keypath *match-id "status") $$matches :> *status)
        (local-select> (keypath *match-id "homeTeamId") $$matches :> *home-id)
        (local-select> (keypath *match-id "awayTeamId") $$matches :> *away-id)
        (local-select> (keypath *match-id "boGames") $$matches :> *bo-games)
        (score-error *status *home-score *away-score *bo-games :> *err)
        (<<if (some? *err)
          (ack-return> {"ok" false "error" *err})
         (else>)
          (pick-winner *home-id *away-id *home-score *away-score :> *winner-id)
          (pick-loser *home-id *away-id *winner-id :> *loser-id)
          (local-transform> [(keypath *match-id "status") (termval "PLAYED")] $$matches)
          (local-transform> [(keypath *match-id "homeScore") (termval *home-score)] $$matches)
          (local-transform> [(keypath *match-id "awayScore") (termval *away-score)] $$matches)
          (local-transform> [(keypath *match-id "winnerId") (termval *winner-id)] $$matches)
          (|hash *winner-id)
          (local-transform> [(keypath *winner-id "wins") (nil->val 0) (term inc)] $$team-stats)
          (local-transform> [(keypath *winner-id "points") (nil->val 0) (term inc)] $$team-stats)
          (local-transform> [(keypath *winner-id "losses") (nil->val 0) (term identity)] $$team-stats)
          (|hash *loser-id)
          (local-transform> [(keypath *loser-id "losses") (nil->val 0) (term inc)] $$team-stats)
          (local-transform> [(keypath *loser-id "wins") (nil->val 0) (term identity)] $$team-stats)
          (local-transform> [(keypath *loser-id "points") (nil->val 0) (term identity)] $$team-stats)
          (ack-return> {"ok" true
                       "matchId" *match-id
                       "winnerId" *winner-id
                       "homeScore" *home-score
                       "awayScore" *away-score})))

      (<<if (and> (not= *type "create-match")
                  (not= *type "ban-map")
                  (not= *type "submit-score"))
        (ack-return> {"ok" false "error" "unknown-type" "type" *type})))))
